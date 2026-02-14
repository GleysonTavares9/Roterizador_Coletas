package com.roterizacao.driver

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.*
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import android.graphics.drawable.GradientDrawable
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.content.res.ColorStateList
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ScrollView
import android.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.roterizacao.driver.data.api.RetrofitClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.webrtc.*
import com.google.android.material.bottomsheet.BottomSheetDialog
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.EditText
import android.widget.Toast
import android.app.Dialog
import android.view.Window
import com.roterizacao.driver.data.models.ChatMessage
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Chamada de Voz Nativa - Correção Completa
 */
class VoiceCallActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "VoiceCall"
        private const val PERMISSION_REQUEST = 1001
        private const val CALL_TIMEOUT = 45000L // 45s Timeout

        fun start(context: Context, routeId: String, callerName: String = "Base", autoStart: Boolean = false) {
            val intent = Intent(context, VoiceCallActivity::class.java).apply {
                putExtra("ROUTE_ID", routeId)
                putExtra("CALLER_NAME", callerName)
                putExtra("AUTO_START", autoStart)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            context.startActivity(intent)
        }
    }

    // UI
    private lateinit var statusText: TextView
    private var pulseAnimator: android.animation.ObjectAnimator? = null
    private var chatDialog: Dialog? = null
    private var chatMessagesLayout: LinearLayout? = null

    private lateinit var durationText: TextView
    private lateinit var muteButton: ImageButton
    private lateinit var endButton: ImageButton
    private lateinit var acceptButton: ImageButton
    private lateinit var rejectButton: ImageButton
    private lateinit var chatButton: ImageButton

    // WebRTC
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var localAudioTrack: AudioTrack? = null
    private var remoteAudioTrack: AudioTrack? = null
    private var audioSource: AudioSource? = null
    private var eglBase: EglBase? = null

    // State
    private var routeId: String = ""
    private var callerName: String = ""
    private var isMuted = false
    private var callDuration = 0
    private val handler = Handler(Looper.getMainLooper())
    private var timerRunnable: Runnable? = null
    
    private var currentCallId: String? = null
    private var pendingOffer: SessionDescription? = null
    
    // Audio
    private var audioManager: AudioManager? = null
    private var toneGenerator: android.media.ToneGenerator? = null
    private var vibrator: Vibrator? = null
    private var ringtone: android.media.Ringtone? = null
    private var isCallConnected = false
    
    // Timeout
    private val timeoutHandler = Handler(Looper.getMainLooper())
    private val timeoutRunnable = Runnable {
        if (!isCallConnected) {
            Log.d(TAG, "⏰ Chamada encerrou por Timeout (45s)")
            sendSystemMessage("📞 Chamada perdida (Não atendida)")
            endCall()
        }
    }

    enum class CallState {
        IDLE, CALLING, RINGING, CONNECTED, ENDED
    }
    private var currentState = CallState.IDLE
    
    // BroadcastReceiver para detectar quando a chamada é encerrada pela Central
    private val callEndedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val reason = intent?.getStringExtra("reason") ?: "unknown"
            Log.d(TAG, "📞 Broadcast recebido: Chamada encerrada pela central ($reason)")
            runOnUiThread {
                finishWithMessage("Chamada encerrada pela central")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Mantém tela ligada
        // Mantém tela ligada e mostra na lockscreen (se aberta pelo usuário)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
        
        // Cancela notificação de chamada
        (getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager)?.cancel(2001)
        
        setContentView(R.layout.activity_native_voice_call)

        // Get params
        routeId = intent.getStringExtra("ROUTE_ID") ?: run {
            finish()
            return
        }
        callerName = intent.getStringExtra("CALLER_NAME") ?: "Central"

        initUI()
        initAudioManager()
        checkPermissions()
        
        // Registra receiver para detectar quando a chamada é encerrada pela Central
        val filter = IntentFilter("com.roterizacao.driver.CALL_ENDED")
        registerReceiver(callEndedReceiver, filter, RECEIVER_NOT_EXPORTED)
        
        // Inicia timer de timeout se for uma chamada enviada (nós chamando)
        // Se for recebida, o timer começa quando tocamos em atender? Não, o timeout de recebimento é diferente.
        // Vamos assumir timeout geral de conexão.
        timeoutHandler.postDelayed(timeoutRunnable, CALL_TIMEOUT)
        
    }

    private fun initUI() {
        statusText = findViewById(R.id.statusText)
        durationText = findViewById(R.id.durationText)
        muteButton = findViewById(R.id.muteButton)
        endButton = findViewById(R.id.endCallButton)
        acceptButton = findViewById(R.id.acceptButton)
        rejectButton = findViewById(R.id.rejectButton)
        
        // Avatar icon - set to headset for Central
        val avatarIcon = findViewById<ImageView>(R.id.avatarIcon)
        avatarIcon?.setImageResource(R.mipmap.ic_launcher)

        chatButton = findViewById(R.id.chatButton)
        chatButton.setOnClickListener { showChatDialog() }

        muteButton.setOnClickListener { toggleMute() }
        endButton.setOnClickListener { endCall() }
        acceptButton.setOnClickListener { acceptCall() }
        rejectButton.setOnClickListener { rejectCall() }

        updateUI()
    }

    private fun initAudioManager() {
        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
    }

    private fun checkPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.MODIFY_AUDIO_SETTINGS
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
        }

        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), PERMISSION_REQUEST)
        } else {
            initializeWebRTC()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST) {
            if (grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                initializeWebRTC()
            } else {
                finishWithMessage("Permissões necessárias não concedidas")
            }
        }
    }

    private fun initializeWebRTC() {
        try {
            Log.d(TAG, "Inicializando WebRTC...")
            
            // Inicializa WebRTC
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(this)
                    .setEnableInternalTracer(true)
                    .setFieldTrials("WebRTC-H264HighProfile/Enabled/")
                    .createInitializationOptions()
            )
            
            // Cria factory com áudio otimizado
            eglBase = EglBase.create()
            
            val audioDeviceModule = org.webrtc.audio.JavaAudioDeviceModule.builder(this)
                .setUseHardwareAcousticEchoCanceler(true)
                .setUseHardwareNoiseSuppressor(true)
                .createAudioDeviceModule()

            val encoderFactory = DefaultVideoEncoderFactory(
                eglBase?.eglBaseContext,
                true,  // enableIntelVp8Encoder
                true   // enableH264HighProfile
            )
            
            val decoderFactory = DefaultVideoDecoderFactory(eglBase?.eglBaseContext)
            
            peerConnectionFactory = PeerConnectionFactory.builder()
                .setAudioDeviceModule(audioDeviceModule)
                .setVideoEncoderFactory(encoderFactory)
                .setVideoDecoderFactory(decoderFactory)
                .createPeerConnectionFactory()
            
            Log.d(TAG, "WebRTC Factory criado com sucesso")
            
            // Cria AudioTrack
            createLocalAudioTrack()
            
            // Inicia polling para chamadas recebidas
            startPollingForCalls()
            
            // Se for para iniciar chamada automaticamente
            if (intent.getBooleanExtra("AUTO_START", false)) {
                intent.removeExtra("AUTO_START") // Consome flag para evitar loop
                handler.postDelayed({ startOutgoingCall() }, 1000)
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Falha na inicialização do WebRTC", e)
            finishWithMessage("Erro ao inicializar chamadas de voz: ${e.message}")
        }
    }

    private fun createLocalAudioTrack() {
        try {
            Log.d(TAG, "Criando AudioTrack local...")
            
            val audioConstraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            }
            
            audioSource = peerConnectionFactory?.createAudioSource(audioConstraints)
            audioSource?.let {
                localAudioTrack = peerConnectionFactory?.createAudioTrack("LOCAL_AUDIO_TRACK", it)
                localAudioTrack?.setEnabled(true)
                Log.d(TAG, "AudioTrack local criado com sucesso")
            } ?: run {
                Log.e(TAG, "Falha ao criar AudioSource")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao criar AudioTrack", e)
        }
    }

    private fun startPollingForCalls() {
        handler.post(object : Runnable {
            override fun run() {
                if (currentState == CallState.IDLE || currentState == CallState.RINGING) {
                    checkForIncomingCalls()
                }
                handler.postDelayed(this, 3000) // Poll a cada 3 segundos
            }
        })
    }

    private fun checkForIncomingCalls() {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val response = RetrofitClient.apiService.getCalls(
                    routeIdQuery = "eq.$routeId",
                    statusQuery = "eq.calling",
                    limit = 1
                )
                
                if (response.isSuccessful) {
                    val calls = response.body()
                    if (!calls.isNullOrEmpty()) {
                        val call = calls.first()
                        val callId = call["id"] as? String
                        val fromUser = call["from_user"] as? String
                        val offer = call["offer"] as? Map<*, *>
                        
                        Log.d(TAG, "Chamada recebida - ID: $callId, De: $fromUser")
                        
                        // Aceita apenas chamadas da base/admin
                        if ((fromUser == "base" || fromUser == "admin") && 
                            callId != null && offer != null) {
                            
                            val sdp = offer["sdp"] as? String
                            val type = offer["type"] as? String
                            
                            if (sdp != null && type != null) {
                                handleIncomingCall(
                                    callId, 
                                    SessionDescription(
                                        SessionDescription.Type.fromCanonicalForm(type),
                                        sdp
                                    )
                                )
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao verificar chamadas", e)
            }
        }
    }

    private fun handleIncomingCall(callId: String, offer: SessionDescription) {
        Log.d(TAG, "Processando chamada recebida: $callId")
        
        runOnUiThread {
            try {
                // Evita processar a mesma chamada múltiplas vezes
                if (currentState != CallState.IDLE) return@runOnUiThread
                
                currentCallId = callId
                pendingOffer = offer
                
                // Configura UI para chamada recebida
                callerName = "Central"
                statusText.text = "Central Chamando..."
                
                // Muda para estado de ringing
                setState(CallState.RINGING)
                
                // Toca ringtone
                playRingtone()
                
                Log.d(TAG, "Chamada recebida configurada com sucesso")
                
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao processar chamada recebida", e)
            }
        }
    }

    private fun playRingtone() {
        try {
            stopRingtone()
            
            // 1. Vibrate
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 1000, 1000), 0)) // 0 = repeat
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(longArrayOf(0, 1000, 1000), 0)
            }
            this.vibrator = vibrator
            
            // 2. Play Ringtone
            val uri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE)
            ringtone = android.media.RingtoneManager.getRingtone(applicationContext, uri)
            ringtone?.play()
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao tocar ringtone", e)
        }
    }

    private fun stopRingtone() {
        try {
            vibrator?.cancel()
            vibrator = null
            
            ringtone?.stop()
            ringtone = null
            
            toneGenerator?.stopTone()
            toneGenerator?.release()
            toneGenerator = null
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao parar ringtone", e)
        }
    }

    private fun startOutgoingCall() {
        Log.d(TAG, "Iniciando chamada de saída...")
        
        if (currentState != CallState.IDLE) {
            Log.w(TAG, "Já existe uma chamada em andamento")
            return
        }
        
        runOnUiThread {
            try {
                setState(CallState.CALLING)
                statusText.text = "Chamando $callerName..."
                
                // Toca tom de discagem
                playDialTone()
                
                // Cria PeerConnection
                createPeerConnection()
                
                // Cria oferta
                createAndSendOffer()
                
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao iniciar chamada", e)
                finishWithMessage("Erro ao iniciar chamada: ${e.message}")
            }
        }
    }

    private fun createPeerConnection(): PeerConnection? {
        return try {
            Log.d(TAG, "Criando PeerConnection...")
            
            val iceServers = listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
                PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
                PeerConnection.IceServer.builder("stun:stun2.l.google.com:19302").createIceServer()
            )

            val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
                bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
                rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
                continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            }

            peerConnection = peerConnectionFactory?.createPeerConnection(
                rtcConfig,
                object : PeerConnection.Observer {
                    override fun onIceCandidate(candidate: IceCandidate?) {
                        Log.d(TAG, "Novo ICE Candidate: ${candidate?.sdpMid}")
                        // TODO: Enviar para o servidor via signaling
                    }

                    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                        Log.d(TAG, "Estado ICE mudou: $state")
                        when (state) {
                            PeerConnection.IceConnectionState.CONNECTED -> {
                                Log.d(TAG, "Conexão ICE estabelecida!")
                                runOnUiThread {
                                    setState(CallState.CONNECTED)
                                    stopRingtone()
                                }
                            }
                            PeerConnection.IceConnectionState.COMPLETED -> {
                                Log.d(TAG, "Gathering ICE completo")
                            }
                            PeerConnection.IceConnectionState.FAILED -> {
                                Log.e(TAG, "Falha na conexão ICE")
                                runOnUiThread { 
                                    finishWithMessage("Falha na conexão") 
                                }
                            }
                            PeerConnection.IceConnectionState.DISCONNECTED -> {
                                Log.w(TAG, "Conexão ICE desconectada")
                                runOnUiThread { endCall() }
                            }
                            else -> {
                                Log.d(TAG, "Estado ICE: $state")
                            }
                        }
                    }

                    override fun onAddStream(stream: MediaStream?) {
                        Log.d(TAG, "Stream remoto adicionado (onAddStream): ${stream?.id}")
                        stream?.audioTracks?.firstOrNull()?.let { track ->
                            remoteAudioTrack = track
                            track.setEnabled(true)
                            Log.d(TAG, "Áudio remoto ativado (onAddStream)")
                        }
                    }

                    override fun onSignalingChange(state: PeerConnection.SignalingState?) {
                        Log.d(TAG, "Signaling state: $state")
                        if (state == PeerConnection.SignalingState.STABLE) {
                            peerConnection?.receivers?.forEach { receiver ->
                                Log.d(TAG, "Receiver encontrado (STABLE): ${receiver.track()?.kind()} id=${receiver.track()?.id()}")
                                if (receiver.track()?.kind() == "audio") {
                                    val track = receiver.track() as? AudioTrack
                                    track?.let {
                                        it.setEnabled(true)
                                        it.setVolume(10.0) // Boost volume
                                        remoteAudioTrack = it
                                        Log.d(TAG, "Áudio remoto forçado via receivers list")
                                    }
                                }
                            }
                        }
                    }

                    override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                    override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
                    override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
                    override fun onRemoveStream(stream: MediaStream?) {}
                    override fun onDataChannel(channel: DataChannel?) {}
                    override fun onRenegotiationNeeded() {}
                    
                    override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
                        Log.d(TAG, "onAddTrack chamado. Kind: ${receiver?.track()?.kind()}")
                        if (receiver?.track()?.kind() == "audio") {
                            val track = receiver.track() as? AudioTrack
                            track?.let {
                                remoteAudioTrack = it
                                it.setEnabled(true)
                                Log.d(TAG, "Áudio remoto ativado (onAddTrack)")
                            }
                        }
                    }
                }
            )

            // Adiciona track de áudio local (Unified Plan - WebRTC moderno)
            if (peerConnection != null && localAudioTrack != null) {
                peerConnection?.addTrack(localAudioTrack, listOf("local_stream"))
                Log.d(TAG, "Audio track local adicionado ao PeerConnection")
            } else {
                Log.e(TAG, "PeerConnection ou AudioTrack local nulo")
            }

            peerConnection

        } catch (e: Exception) {
            Log.e(TAG, "Erro ao criar PeerConnection", e)
            null
        }
    }

    private fun createAndSendOffer() {
        Log.d(TAG, "Criando oferta SDP...")
        
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            optional.add(MediaConstraints.KeyValuePair("DtlsSrtpKeyAgreement", "true"))
        }

        peerConnection?.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                Log.d(TAG, "Oferta SDP criada: ${sdp?.type}")
                
                sdp?.let { description ->
                    // Configura descrição local
                    peerConnection?.setLocalDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            Log.d(TAG, "Local description configurada com sucesso")
                            
                            // Envia para o servidor
                            sendOfferToSupabase(description)
                        }

                        override fun onSetFailure(error: String?) {
                            Log.e(TAG, "Falha ao configurar local description: $error")
                            finishWithMessage("Erro na configuração local")
                        }

                        override fun onCreateSuccess(p0: SessionDescription?) {}
                        override fun onCreateFailure(p0: String?) {}
                    }, description)
                }
            }

            override fun onCreateFailure(error: String?) {
                Log.e(TAG, "Falha ao criar oferta: $error")
                finishWithMessage("Erro ao criar oferta")
            }

            override fun onSetSuccess() {}
            override fun onSetFailure(p0: String?) {}
        }, constraints)
    }

    private fun sendOfferToSupabase(offer: SessionDescription) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val callData = mapOf(
                    "route_id" to routeId,
                    "from_user" to "driver",
                    "to_user" to "base",
                    "offer" to mapOf(
                        "type" to offer.type.canonicalForm(),
                        "sdp" to offer.description
                    ),
                    "status" to "calling"
                )

                val response = RetrofitClient.apiService.createCall(callData)
                
                if (response.isSuccessful) {
                    val calls = response.body()
                    if (!calls.isNullOrEmpty()) {
                        currentCallId = calls.first()["id"] as? String
                        Log.d(TAG, "Chamada criada no servidor: $currentCallId")
                        
                        // Inicia polling para resposta
                        startPollingForAnswer()
                    }
                } else {
                    Log.e(TAG, "Erro HTTP: ${response.code()}")
                    runOnUiThread {
                        finishWithMessage("Erro ao criar chamada no servidor")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao enviar oferta", e)
                runOnUiThread {
                    finishWithMessage("Erro de conexão com servidor")
                }
            }
        }
    }

    private fun startPollingForAnswer() {
        handler.post(object : Runnable {
            override fun run() {
                if (currentState == CallState.CALLING || currentState == CallState.CONNECTED) {
                    checkCallAnswer()
                    handler.postDelayed(this, 1500) // Verifica a cada 1.5s
                }
            }
        })
    }

    private fun checkCallAnswer() {
        currentCallId?.let { callId ->
            lifecycleScope.launch(Dispatchers.IO) {
                try {
                    val response = RetrofitClient.apiService.getCallById("eq.$callId")
                    
                    if (response.isSuccessful) {
                        val call = response.body()?.firstOrNull()
                        val status = call?.get("status") as? String
                        val answer = call?.get("answer") as? Map<*, *>
                        
                        Log.d(TAG, "📞 Poll Answer: status=$status, hasAnswer=${answer != null}, state=$currentState")
                        
                        // Log answer details if present
                        if (answer != null) {
                            Log.d(TAG, "📞 Answer SDP type: ${answer["type"]}, sdp length: ${(answer["sdp"] as? String)?.length}")
                        }
                        
                        when (status) {
                            "answered" -> {
                                if (currentState == CallState.CALLING) {
                                    if (answer != null) {
                                        Log.d(TAG, "✅ Processando answer da central...")
                                        handleAnswer(answer)
                                    } else {
                                        Log.w(TAG, "⚠️ Status=answered mas answer é null!")
                                    }
                                }
                            }
                            "rejected", "ended", "canceled" -> {
                                Log.d(TAG, "❌ Chamada encerrada: $status")
                                runOnUiThread { 
                                    finishWithMessage("Chamada encerrada pela central") 
                                }
                            }
                        }
                    } else {
                        Log.e(TAG, "❌ Erro HTTP ao buscar chamada: ${response.code()}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "💥 Erro ao verificar resposta", e)
                }
            }
        }
    }

    private fun handleAnswer(answerMap: Map<*, *>) {
        try {
            val sdp = answerMap["sdp"] as? String
            val type = answerMap["type"] as? String
            
            if (sdp != null && type != null) {
                    val answer = SessionDescription(
                        SessionDescription.Type.fromCanonicalForm(type),
                        sdp
                    )
                    
                    Log.d(TAG, "Configurando answer remoto: ${answer.type}")
                    
                    peerConnection?.setRemoteDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            Log.d(TAG, "Answer remoto configurado - Chamada conectada!")
                            runOnUiThread {
                                setState(CallState.CONNECTED)
                                stopRingtone()
                            }
                        }

                        override fun onSetFailure(error: String?) {
                            Log.e(TAG, "Falha ao configurar answer remoto: $error")
                            runOnUiThread {
                                finishWithMessage("Erro na conexão")
                            }
                        }

                        override fun onCreateSuccess(p0: SessionDescription?) {}
                        override fun onCreateFailure(p0: String?) {}
                    }, answer)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar answer", e)
        }
    }

    private fun acceptCall() {
        Log.d(TAG, "Aceitando chamada...")
        
        runOnUiThread {
            try {
                // Para o ringtone
                stopRingtone()
                
                // Atualiza UI
                setState(CallState.CALLING)
                statusText.text = "Conectando..."
                
                // Cria PeerConnection
                createPeerConnection()
                
                // Configura oferta remota
                pendingOffer?.let { offer ->
                    peerConnection?.setRemoteDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            Log.d(TAG, "Remote description configurada")
                            createAndSendAnswer()
                        }

                        override fun onSetFailure(error: String?) {
                            Log.e(TAG, "Falha ao configurar remote description: $error")
                            finishWithMessage("Erro na configuração remota")
                        }

                        override fun onCreateSuccess(p0: SessionDescription?) {}
                        override fun onCreateFailure(p0: String?) {}
                    }, offer)
                } ?: run {
                    Log.e(TAG, "Nenhuma oferta pendente")
                    finishWithMessage("Erro: Chamada inválida")
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao aceitar chamada", e)
                finishWithMessage("Erro ao aceitar chamada")
            }
        }
    }

    private fun createAndSendAnswer() {
        Log.d(TAG, "Criando resposta SDP...")
        
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
        }

        peerConnection?.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                Log.d(TAG, "Resposta SDP criada: ${sdp?.type}")
                
                sdp?.let { answer ->
                    // Configura descrição local
                    peerConnection?.setLocalDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            Log.d(TAG, "Local description (answer) configurada")
                            
                            // Envia para o servidor
                            sendAnswerToSupabase(answer)
                        }

                        override fun onSetFailure(error: String?) {
                            Log.e(TAG, "Falha ao configurar local description: $error")
                        }

                        override fun onCreateSuccess(p0: SessionDescription?) {}
                        override fun onCreateFailure(p0: String?) {}
                    }, answer)
                }
            }

            override fun onCreateFailure(error: String?) {
                Log.e(TAG, "Falha ao criar resposta: $error")
            }

            override fun onSetSuccess() {}
            override fun onSetFailure(p0: String?) {}
        }, constraints)
    }

    private fun sendAnswerToSupabase(answer: SessionDescription) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val updateData = mapOf(
                    "answer" to mapOf(
                        "type" to answer.type.canonicalForm(),
                        "sdp" to answer.description
                    ),
                    "status" to "answered"
                )

                currentCallId?.let { callId ->
                    val response = RetrofitClient.apiService.updateCall("eq.$callId", updateData)
                    
                    if (response.isSuccessful) {
                        Log.d(TAG, "Resposta enviada para servidor")
                        runOnUiThread {
                            setState(CallState.CONNECTED)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao enviar resposta", e)
            }
        }
    }

    private fun rejectCall() {
        Log.d(TAG, "Rejeitando chamada...")
        
        // Marca como rejeitada no LocationService para evitar loop
        currentCallId?.let { callId ->
            LocationService.instance?.markCallAsRejected(callId)
        }
        
        endCallWithStatus("rejected")
    }

    private fun endCall() {
        Log.d(TAG, "Encerrando chamada...")
        timeoutHandler.removeCallbacks(timeoutRunnable)
        endCallWithStatus("ended")
    }

    private fun endCallWithStatus(status: String) {
        // Envia status para servidor usando GlobalScope para garantir que não seja cancelado
        currentCallId?.let { callId ->
            @OptIn(kotlinx.coroutines.DelicateCoroutinesApi::class)
            kotlinx.coroutines.GlobalScope.launch(Dispatchers.IO) {
                try {
                    val updateData = mapOf("status" to status)
                    
                    val response = RetrofitClient.apiService.updateCall("eq.$callId", updateData)
                    if (response.isSuccessful) {
                        Log.d(TAG, "✅ Status $status enviado com sucesso! Response: ${response.body()}")
                    } else {
                        Log.e(TAG, "❌ Falha ao enviar status $status. Code: ${response.code()}, Message: ${response.message()}, Body: ${response.errorBody()?.string()}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "💥 ERRO CRÍTICO ao atualizar status: ${e.message}", e)
                }
            }
        }
        
        // Limpa recursos
        cleanupCall()
        
        // Fecha activity
        handler.postDelayed({
            finish()
        }, 500)
    }

    private fun cleanupCall() {
        // Para sons
        stopRingtone()
        stopTimer()
        
        // Limpa WebRTC com segurança
        try {
            peerConnection?.close()
            peerConnection?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao limpar PeerConnection: ${e.message}")
        }
        peerConnection = null
        
        try {
            localAudioTrack?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao limpar localAudioTrack: ${e.message}")
        }
        localAudioTrack = null
        
        try {
            remoteAudioTrack?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao limpar remoteAudioTrack: ${e.message}")
        }
        remoteAudioTrack = null
        
        try {
            audioSource?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao limpar audioSource: ${e.message}")
        }
        audioSource = null
        
        // Restaura áudio
        configureAudio(false)
        
        // Atualiza estado
        setState(CallState.ENDED)
    }

    private fun playDialTone() {
        try {
            toneGenerator = android.media.ToneGenerator(
                AudioManager.STREAM_VOICE_CALL,
                50
            )
            toneGenerator?.startTone(android.media.ToneGenerator.TONE_SUP_DIAL)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao tocar tom de discagem", e)
        }
    }

    private fun toggleMute() {
        isMuted = !isMuted
        localAudioTrack?.setEnabled(!isMuted)
        
        runOnUiThread {
            muteButton.setImageResource(
                if (isMuted) R.drawable.ic_mic_off else R.drawable.ic_mic
            )
        }
        
        Log.d(TAG, "Microfone ${if (isMuted) "mutado" else "ativado"}")
    }

    private fun setState(state: CallState) {
        Log.d(TAG, "Mudando estado: $currentState -> $state")
        currentState = state
        
        when (state) {
            CallState.CONNECTED -> {
                configureAudio(true)
                startTimer()
            }
            CallState.CALLING, CallState.RINGING -> {
                configureAudio(false)
            }
            else -> {
                configureAudio(false)
                stopTimer()
            }
        }
        
        updateUI()
    }

    private fun configureAudio(active: Boolean) {
        audioManager?.let { am ->
            try {
                if (active) {
                    // Modo chamada
                    am.mode = AudioManager.MODE_IN_COMMUNICATION
                    am.isSpeakerphoneOn = true
                    am.isMicrophoneMute = false
                    
                    // Ajusta volume
                    val maxVolume = am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)
                    am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, maxVolume, 0)
                    
                    Log.d(TAG, "Áudio configurado para modo chamada")
                } else {
                    // Modo normal
                    am.mode = AudioManager.MODE_NORMAL
                    am.isSpeakerphoneOn = false
                    
                    Log.d(TAG, "Áudio configurado para modo normal")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao configurar áudio", e)
            }
        }
    }

    private fun startTimer() {
        isCallConnected = true
        timeoutHandler.removeCallbacks(timeoutRunnable) // Cancela Timeout
        sendSystemMessage("📞 Chamada conectada")
        
        callDuration = 0
        timerRunnable = object : Runnable {
            override fun run() {
                callDuration++
                val minutes = callDuration / 60
                val seconds = callDuration % 60
                durationText.text = String.format("%02d:%02d", minutes, seconds)
                handler.postDelayed(this, 1000)
            }
        }
        handler.post(timerRunnable!!)
    }

    private fun stopTimer() {
        timerRunnable?.let { handler.removeCallbacks(it) }
        timerRunnable = null
    }

    private fun updateUI() {
        Log.d(TAG, "Atualizando UI para estado: $currentState")
        runOnUiThread {
            when (currentState) {
                CallState.IDLE -> {
                    statusText.text = "Pronto"
                    acceptButton.visibility = View.GONE
                    rejectButton.visibility = View.GONE
                    muteButton.visibility = View.GONE
                    endButton.visibility = View.GONE
                    durationText.text = ""
                    stopPulseAnimation()
                }
                CallState.CALLING -> {
                    statusText.text = "Chamando $callerName..."
                    acceptButton.visibility = View.GONE
                    rejectButton.visibility = View.GONE
                    muteButton.visibility = View.GONE
                    endButton.visibility = View.VISIBLE
                    startPulseAnimation()
                }
                CallState.RINGING -> {
                    statusText.text = "$callerName Chamando..."
                    acceptButton.visibility = View.VISIBLE
                    rejectButton.visibility = View.VISIBLE
                    muteButton.visibility = View.GONE
                    endButton.visibility = View.GONE
                    startPulseAnimation()
                }
                CallState.CONNECTED -> {
                    statusText.text = "Em chamada"
                    acceptButton.visibility = View.GONE
                    rejectButton.visibility = View.GONE
                    muteButton.visibility = View.VISIBLE
                    endButton.visibility = View.VISIBLE
                    stopPulseAnimation()
                }
                CallState.ENDED -> {
                    statusText.text = "Chamada encerrada"
                    acceptButton.visibility = View.GONE
                    rejectButton.visibility = View.GONE
                    muteButton.visibility = View.GONE
                    endButton.visibility = View.GONE
                    stopPulseAnimation()
                }
            }
        }
    }

    private fun startPulseAnimation() {
        runOnUiThread {
            if (pulseAnimator == null) {
                val avatarIcon = findViewById<ImageView>(R.id.avatarIcon) ?: return@runOnUiThread
                pulseAnimator = android.animation.ObjectAnimator.ofPropertyValuesHolder(
                    avatarIcon,
                    android.animation.PropertyValuesHolder.ofFloat("scaleX", 1.2f),
                    android.animation.PropertyValuesHolder.ofFloat("scaleY", 1.2f)
                ).apply {
                    duration = 800
                    repeatCount = android.animation.ObjectAnimator.INFINITE
                    repeatMode = android.animation.ObjectAnimator.REVERSE
                    start()
                }
            } else if (!pulseAnimator!!.isRunning) {
                pulseAnimator!!.start()
            }
        }
    }

    private fun stopPulseAnimation() {
        runOnUiThread {
            pulseAnimator?.cancel()
            val avatarIcon = findViewById<ImageView>(R.id.avatarIcon)
            avatarIcon?.scaleX = 1f
            avatarIcon?.scaleY = 1f
        }
    }

    private fun finishWithMessage(message: String) {
        runOnUiThread {
            android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_LONG).show()
            handler.postDelayed({ finish() }, 2000)
        }
    }

    private fun showChatDialog() {
        chatDialog = Dialog(this)
        chatDialog?.requestWindowFeature(Window.FEATURE_NO_TITLE)
        chatDialog?.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))

        val container = LinearLayout(this)
        container.orientation = LinearLayout.VERTICAL
        container.background = createBg(Color.parseColor("#F8FAFC"), dp(24))

        // HEADER
        val header = LinearLayout(this)
        header.orientation = LinearLayout.HORIZONTAL
        header.setPadding(dp(20), dp(16), dp(20), dp(16))
        header.gravity = Gravity.CENTER_VERTICAL

        // Icone Central
        val headerIcon = ImageView(this)
        try { headerIcon.setImageResource(R.mipmap.ic_launcher_round) } 
        catch (e: Exception) { 
            try { headerIcon.setImageResource(R.mipmap.ic_launcher) } 
            catch(e2:Exception) { headerIcon.setImageResource(R.drawable.app_logo) }
        }
        val headerIconParams = LinearLayout.LayoutParams(dp(36), dp(36))
        headerIconParams.rightMargin = dp(12)
        headerIcon.layoutParams = headerIconParams
        header.addView(headerIcon)

        val headerTextLayout = LinearLayout(this)
        headerTextLayout.orientation = LinearLayout.VERTICAL
        val title = TextView(this); title.text = "Chat com Base"; title.textSize = 18f; title.setTypeface(null, android.graphics.Typeface.BOLD); title.setTextColor(Color.parseColor("#1E293B"))
        val subtitle = TextView(this); subtitle.text = "Mensagens em tempo real"; subtitle.textSize = 12f; subtitle.setTextColor(Color.parseColor("#64748B"))
        headerTextLayout.addView(title)
        headerTextLayout.addView(subtitle)
        header.addView(headerTextLayout)

        val spacer = View(this); spacer.layoutParams = LinearLayout.LayoutParams(0, 0, 1f); header.addView(spacer)

        val closeBtn = ImageView(this); closeBtn.setImageResource(R.drawable.ic_close); closeBtn.imageTintList = ColorStateList.valueOf(Color.GRAY); closeBtn.setPadding(dp(8), dp(8), dp(8), dp(8))
        closeBtn.layoutParams = LinearLayout.LayoutParams(dp(32), dp(32))
        closeBtn.setOnClickListener { chatDialog?.dismiss() }
        header.addView(closeBtn)
        container.addView(header)

        // MESSAGES
        val scroll = ScrollView(this)
        scroll.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        chatMessagesLayout = LinearLayout(this)
        chatMessagesLayout?.orientation = LinearLayout.VERTICAL
        chatMessagesLayout?.setPadding(dp(16), dp(16), dp(16), dp(16))
        scroll.addView(chatMessagesLayout)
        container.addView(scroll)

        // INPUT
        val inputArea = LinearLayout(this)
        inputArea.orientation = LinearLayout.HORIZONTAL
        inputArea.setPadding(dp(16), dp(12), dp(16), dp(16))
        
        val inputBg = GradientDrawable()
        inputBg.setColor(Color.WHITE)
        val r = dp(24).toFloat()
        inputBg.cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, r, r, r, r)
        inputArea.background = inputBg
        
        inputArea.gravity = Gravity.CENTER_VERTICAL
        
        val input = EditText(this); input.hint = "Digite sua mensagem..."; input.background = createBg(Color.parseColor("#F1F5F9"), dp(24)); input.setPadding(dp(16), dp(10), dp(16), dp(10)); input.textSize = 14f
        input.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)

        val sendBtn = ImageView(this); sendBtn.setImageResource(android.R.drawable.ic_menu_send); sendBtn.imageTintList = ColorStateList.valueOf(Color.WHITE); sendBtn.background = createBg(Color.parseColor("#2563EB"), dp(20)); sendBtn.setPadding(dp(10), dp(10), dp(10), dp(10))
        val sp = LinearLayout.LayoutParams(dp(40), dp(40)); sp.leftMargin = dp(8); sendBtn.layoutParams = sp
        
        sendBtn.setOnClickListener {
            val txt = input.text.toString().trim()
            if (txt.isNotEmpty()) {
                input.setText("")
                lifecycleScope.launch(Dispatchers.IO) {
                    try {
                        val body = mapOf("route_id" to routeId, "sender_type" to "driver", "message" to txt)
                        RetrofitClient.apiService.sendMessage(body)
                        loadMessages() // Reload
                    } catch (e: Exception) {}
                }
            }
        }
        
        inputArea.addView(input); inputArea.addView(sendBtn); container.addView(inputArea)

        val displayMetrics = resources.displayMetrics
        chatDialog?.setContentView(container, ViewGroup.LayoutParams((displayMetrics.widthPixels * 0.95).toInt(), (displayMetrics.heightPixels * 0.7).toInt()))
        chatDialog?.show()

        loadMessages()
    }

    private fun loadMessages() {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val response = RetrofitClient.apiService.getMessages("eq.$routeId", "created_at.asc")
                if (response.isSuccessful) {
                    val msgs = response.body() ?: emptyList()
                    withContext(Dispatchers.Main) { refreshChatList(msgs) }
                }
            } catch (e: Exception) {}
        }
    }

    private fun refreshChatList(msgs: List<ChatMessage>) {
        chatMessagesLayout?.removeAllViews()
        msgs.forEach { msg ->
            val isMe = msg.sender_type == "driver"
            val row = LinearLayout(this)
            row.orientation = LinearLayout.HORIZONTAL
            row.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            row.gravity = if (isMe) Gravity.END else Gravity.START
            row.setPadding(0, 0, 0, dp(8)) // Sem divisorias, apenas espaco

            if (!isMe) {
                // Avatar Central
                val iv = ImageView(this)
                try { 
                    iv.setImageResource(R.mipmap.ic_launcher_round) 
                } catch(e: Exception){ 
                    try { iv.setImageResource(R.mipmap.ic_launcher) } 
                    catch(e2:Exception) { iv.setImageResource(R.drawable.app_logo) }
                }
                val params = LinearLayout.LayoutParams(dp(32), dp(32)); params.gravity = Gravity.BOTTOM; params.rightMargin = dp(8)
                iv.layoutParams = params
                row.addView(iv)
            }

            val bubble = LinearLayout(this)
            bubble.orientation = LinearLayout.VERTICAL
            val bParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            if (!isMe) bParams.rightMargin = dp(40) else bParams.leftMargin = dp(40)
            bubble.layoutParams = bParams
            
            // Cores: Me = Azul, Central = Branco
            bubble.background = if (isMe) createBg(Color.parseColor("#2563EB"), dp(20)) else createBg(Color.WHITE, dp(20))
            bubble.setPadding(dp(12), dp(8), dp(12), dp(8))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) bubble.elevation = dp(2).toFloat()

            val text = TextView(this)
            text.text = msg.message
            text.setTextColor(if (isMe) Color.WHITE else Color.BLACK)
            text.textSize = 15f
            bubble.addView(text)
            
            // Allow Deletion
            bubble.setOnLongClickListener {
                deleteMessageConfirmation(msg.id)
                true
            }

            row.addView(bubble)
            chatMessagesLayout?.addView(row)
        }
         chatMessagesLayout?.post { (chatMessagesLayout?.parent as? ScrollView)?.fullScroll(View.FOCUS_DOWN) }
    }

    private fun deleteMessageConfirmation(msgId: String) {
        AlertDialog.Builder(this)
            .setTitle("Apagar mensagem")
            .setMessage("Deseja realmente apagar esta mensagem?")
            .setPositiveButton("Apagar") { _, _ ->
                lifecycleScope.launch(Dispatchers.IO) {
                    try {
                        RetrofitClient.apiService.deleteMessage("eq.$msgId")
                        loadMessages()
                    } catch (e: Exception) {
                        withContext(Dispatchers.Main) { Toast.makeText(this@VoiceCallActivity, "Erro ao apagar", Toast.LENGTH_SHORT).show() }
                    }
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Activity destruída")
        
        // Desregistra receiver
        try {
            unregisterReceiver(callEndedReceiver)
        } catch (e: Exception) {
            Log.w(TAG, "Receiver já estava desregistrado")
        }
        
        cleanupCall()
        
        // Libera handler
        handler.removeCallbacksAndMessages(null)
        
        // Libera factory
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
        
        eglBase?.release()
        eglBase = null
        
        Log.d(TAG, "Activity destruída")
    }

    private fun sendSystemMessage(text: String) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (routeId.isNotEmpty()) {
                    val body = mapOf(
                        "route_id" to routeId,
                        "sender_type" to "driver",
                        "message" to text
                    )
                    RetrofitClient.apiService.sendMessage(body)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao enviar log de chamada", e)
            }
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun createBg(color: Int, radius: Int): android.graphics.drawable.GradientDrawable {
        val d = android.graphics.drawable.GradientDrawable()
        d.setColor(color)
        d.cornerRadius = radius.toFloat()
        return d
    }
}