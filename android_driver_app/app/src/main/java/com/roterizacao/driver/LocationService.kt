package com.roterizacao.driver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.leolin.shortcutbadger.ShortcutBadger
import com.roterizacao.driver.data.api.RetrofitClient
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class LocationService : Service(), LocationListener {

    private lateinit var locationManager: LocationManager
    private val BACKEND_URL = "https://dbhhsyeqsreyekevffsl.supabase.co/rest/v1/driver_telemetry"
    private val API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiaGhzeWVxc3JleWVrZXZmZnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDEzODgsImV4cCI6MjA4MTUxNzM4OH0.ABqjIN1Ehn-kCinD9P0Mfy7-AcssA_QLIzs5Z7knFWA"
    
    private var driverId: String? = null
    private var activeRouteId: String? = null
    private var pollingJob: Job? = null
    private var lastMessageCount = 0
    private var lastProcessedCallId: String? = null
    private var lastKnownCallStatus: String? = null // Track status changes
    private var lastSentLocation: Location? = null
    private var lastSentTime: Long = 0
    private val MIN_DISTANCE_METERS = 20f // Só envia se moveu 20m
    private val MIN_TIME_MS = 30000L // Ou se passou 30 segundos
    private val rejectedCallIds = mutableSetOf<String>() // Blacklist de chamadas rejeitadas

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        startForeground(1, createNotification())
        
        val prefs = getSharedPreferences("driver_prefs", Context.MODE_PRIVATE)
        driverId = prefs.getString("DRIVER_ID", null)
        Log.d("LocationService", "Iniciando serviço para Driver ID: $driverId")

        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        startLocationUpdates()
        startMessagePolling()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val routeId = intent?.getStringExtra("ROUTE_ID")
        if (routeId != null) {
            activeRouteId = routeId
            lastMessageCount = 0
            lastProcessedCallId = null
            lastKnownCallStatus = null // Reset status tracking
            Log.d("LocationService", "Atualizado Route ID ativo: $routeId")
        }
        return START_STICKY
    }

    private fun startLocationUpdates() {
        try {
            // Updated for high-frequency tracking (2s/2m)
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 2f, this)
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000L, 2f, this)
        } catch (e: SecurityException) {
            Log.e("LocationService", "Permissão de localização não garantida", e)
        }
    }

    private fun startMessagePolling() {
        pollingJob = CoroutineScope(Dispatchers.IO).launch {
            while (true) {
                if (activeRouteId != null) {
                    checkMessages()
                    checkIncomingCalls()
                }
                delay(1500) // 1.5s para resposta rápida (similar a Realtime)
            }
        }
    }

    private suspend fun checkMessages() {
        try {
            val response = RetrofitClient.apiService.getMessages("eq.$activeRouteId", "created_at.asc")
            if (response.isSuccessful) {
                val msgs = response.body() ?: emptyList()
                if (msgs.size > lastMessageCount) {
                    if (lastMessageCount > 0) {
                        val newCount = msgs.size - lastMessageCount
                        val last = msgs.lastOrNull()
                        // Only notify if message is NOT from me (driver)
                        if (last != null && last.sender_type != "driver") {
                            showChatNotification(newCount, last.message)
                        }
                    }
                    lastMessageCount = msgs.size
                }
            }
        } catch (e: Exception) {
            Log.e("LocationService", "Erro ao verificar mensagens", e)
        }
    }

    private suspend fun checkIncomingCalls() {
        try {
            // Busca TODAS as chamadas da rota (não só 'calling')
            val response = RetrofitClient.apiService.getCalls(
                routeIdQuery = "eq.$activeRouteId",
                statusQuery = null, // Busca TODOS os status
                limit = 1
            )
            
            if (response.isSuccessful) {
                val calls = response.body()
                
                if (!calls.isNullOrEmpty()) {
                    val call = calls.first()
                    val callId = call["id"] as? String
                    val status = call["status"] as? String
                    val fromUser = call["from_user"] as? String
                    val toUser = call["to_user"] as? String
                    
                    Log.d("LocationService", "Poll: id=$callId, status=$status, from=$fromUser, to=$toUser")
                    
                    // IGNORA chamadas rejeitadas localmente
                    if (callId != null && rejectedCallIds.contains(callId)) {
                        Log.d("LocationService", "⛔ Chamada $callId foi rejeitada - ignorando")
                        return
                    }
                    
                    // Se é uma NOVA chamada (ID diferente)
                    if (callId != lastProcessedCallId) {
                        // Chamada NOVA da central para o motorista
                        // Aceita to_user="driver" OU to_user=driverId (UUID)
                        val isForMe = toUser == "driver" || toUser == driverId
                        
                        if (status == "calling" && 
                            (fromUser == "base" || fromUser == "admin") && 
                            isForMe) {
                            
                            lastProcessedCallId = callId
                            lastKnownCallStatus = "calling"
                            Log.d("LocationService", "✅ Nova chamada! Abrindo tela...")
                            launchVoiceCallActivity()
                        }
                    } 
                    // Se é a MESMA chamada mas STATUS mudou
                    else if (callId == lastProcessedCallId && status != lastKnownCallStatus) {
                        Log.d("LocationService", "Status mudou: $lastKnownCallStatus -> $status")
                        lastKnownCallStatus = status
                        
                        // Se foi encerrada ou rejeitada, notifica a Activity para fechar
                        if (status == "ended" || status == "rejected" || status == "canceled") {
                            Log.d("LocationService", "Chamada encerrada. Notificando Activity...")
                            
                            // Envia broadcast para fechar a VoiceCallActivity
                            val intent = Intent("com.roterizacao.driver.CALL_ENDED")
                            intent.putExtra("reason", status)
                            sendBroadcast(intent)
                            
                            // Limpa o tracking
                            lastProcessedCallId = null
                            lastKnownCallStatus = null
                        }
                    }
                } else {
                    // Não há chamadas - limpa tracking
                    if (lastProcessedCallId != null) {
                        Log.d("LocationService", "Sem chamadas. Reset.")
                        lastProcessedCallId = null
                        lastKnownCallStatus = null
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("LocationService", "Erro ao verificar chamadas", e)
        }
    }

    private fun launchVoiceCallActivity() {
        try {
            // Intent para abrir a Activity ao clicar na notificação
            val intent = Intent(applicationContext, VoiceCallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("ROUTE_ID", activeRouteId)
                putExtra("CALLER_NAME", "Central")
            }
            
            // PendingIntent para a notificação
            val pendingIntent = PendingIntent.getActivity(
                this, 
                1001, 
                intent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Configurar canal de notificação para chamadas (Alta prioridade + Som)
            val channelId = "voice_calls"
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (notificationManager.getNotificationChannel(channelId) == null) {
                    val channel = NotificationChannel(
                        channelId,
                        "Chamadas de Voz",
                        NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Notificações de chamada recebida"
                        enableVibration(true)
                        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                        val audioAttributes = AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .build()
                        setSound(soundUri, audioAttributes)
                    }
                    notificationManager.createNotificationChannel(channel)
                }
            }

            // Construir a notificação
            val notificationBuilder = NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_call)
                .setLargeIcon(BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher))
                .setContentTitle("Chamada Recebida")
                .setContentText("Central está chamando... Toque para atender")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                // Som para versões antigas
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
                // Ação de Atender (Botão)
                .addAction(R.drawable.ic_call, "Atender", pendingIntent)
                
            // Exibir notificação (ID 2001 para chamadas)
            notificationManager.notify(2001, notificationBuilder.build())
            Log.d("LocationService", "Notificação de chamada disparada")

        } catch (e: Exception) {
            Log.e("LocationService", "Erro ao notificar chamada", e)
        }
    }
    
    // M\u00e9todo p\u00fablico para marcar chamada como rejeitada
    fun markCallAsRejected(callId: String) {
        rejectedCallIds.add(callId)
        Log.d("LocationService", "Chamada $callId adicionada \u00e0 blacklist")
    }
    
    companion object {
        var instance: LocationService? = null
    }

    private fun showChatNotification(newCount: Int, lastMsg: String) {
        try { 
            ShortcutBadger.applyCount(applicationContext, newCount) 
        } catch(e: Exception) {
            Log.e("LocationService", "Erro ao atualizar badge", e)
        }

        try {
            val resultIntent = Intent(this, RouteDetailActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                activeRouteId?.let { putExtra("ROUTE_ID", it) }
            }
            val pendingIntent = PendingIntent.getActivity(
                this, 0, resultIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Ensure channel exists
            createChatChannel()

            val builder = NotificationCompat.Builder(this, "DriverChatChannel")
                .setSmallIcon(R.drawable.ic_app_logo_mono)
                .setContentTitle(if(newCount > 1) "$newCount Novas Mensagens" else "Nova Mensagem")
                .setContentText(lastMsg)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setDefaults(NotificationCompat.DEFAULT_ALL)

            try {
                val rawBitmap = android.graphics.BitmapFactory.decodeResource(resources, R.drawable.app_logo)
                if (rawBitmap != null) {
                    val largeIcon = android.graphics.Bitmap.createScaledBitmap(rawBitmap, 128, 128, false)
                    builder.setLargeIcon(largeIcon)
                }
            } catch (e: Exception) {
                Log.e("LocationService", "Erro ao carregar ícone grande", e)
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(2002, builder.build())
            
        } catch (e: Exception) { 
            Log.e("LocationService", "Erro ao mostrar notificação", e)
        }
    }

    override fun onLocationChanged(location: Location) {
        val currentTime = System.currentTimeMillis()
        val distanceMoved = lastSentLocation?.distanceTo(location) ?: Float.MAX_VALUE
        
        // Só envia se: não houver envio anterior OU moveu > 20m OU passou > 30s
        if (lastSentLocation == null || distanceMoved >= MIN_DISTANCE_METERS || (currentTime - lastSentTime) >= MIN_TIME_MS) {
            Log.d("LocationService", "Enviando localização (Inteligente): distance=${distanceMoved}m, interval=${(currentTime-lastSentTime)/1000}s")
            lastSentLocation = location
            lastSentTime = currentTime
            sendLocationToBackend(location)
        } else {
            Log.d("LocationService", "Localização ignorada para economizar cota: distance=${distanceMoved}m, interval=${(currentTime-lastSentTime)/1000}s")
        }
    }

    private fun sendLocationToBackend(location: Location) {
        val currentDriverId = driverId
        if (currentDriverId == null) {
            Log.e("LocationService", "Driver ID missing. Cannot send telemetry.")
            return
        }
        
        Thread {
            try {
                val url = URL(BACKEND_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                conn.setRequestProperty("apikey", API_KEY)
                conn.setRequestProperty("Authorization", "Bearer $API_KEY")
                conn.setRequestProperty("Prefer", "return=minimal")
                conn.doOutput = true
                conn.connectTimeout = 10000

                val json = JSONObject()
                json.put("driver_id", currentDriverId)
                json.put("latitude", location.latitude)
                json.put("longitude", location.longitude)
                
                // Speed: Convert m/s -> km/h
                val speedKmh = if (location.hasSpeed()) location.speed * 3.6 else 0.0
                json.put("speed", speedKmh)
                
                json.put("heading", if (location.hasBearing()) location.bearing.toDouble() else 0.0)
                
                val deviceInfo = com.roterizacao.driver.utils.DeviceInfoHelper.getDeviceInfo(applicationContext)
                json.put("device_id", deviceInfo.deviceId)
                json.put("battery_level", deviceInfo.batteryLevel)
                json.put("is_charging", deviceInfo.isCharging)
                json.put("network_type", deviceInfo.networkType)
                json.put("network_operator", deviceInfo.networkOperator)
                
                val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                json.put("timestamp", sdf.format(java.util.Date()))

                Log.d("LocationService", "Sending telemetry: $json")

                val os = OutputStreamWriter(conn.outputStream)
                os.write(json.toString())
                os.flush()
                os.close()

                val responseCode = conn.responseCode
                Log.d("LocationService", "Response code: $responseCode")
                
                if (responseCode >= 400) {
                    val errorStream = conn.errorStream
                    val errorResponse = errorStream?.bufferedReader()?.readText()
                    Log.e("LocationService", "Error response: $errorResponse")
                }
                
                conn.disconnect()
            } catch (e: Exception) {
                Log.e("LocationService", "Erro ao enviar localização", e)
            }
        }.start()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                "DriverLocationChannel",
                "Monitoramento de Rota",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    private fun createChatChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val chatChannel = NotificationChannel(
                "DriverChatChannel",
                "Mensagens do Operador",
                NotificationManager.IMPORTANCE_HIGH
            )
            chatChannel.description = "Notificações de novas mensagens com som"
            chatChannel.enableVibration(true)
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(chatChannel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, "DriverLocationChannel")
            .setContentTitle("Roterização Driver")
            .setContentText("Monitorando localização em segundo plano...")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .build()
    }

    override fun onDestroy() {
        pollingJob?.cancel()
        super.onDestroy()
        locationManager.removeUpdates(this)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}
}
