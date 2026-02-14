package com.roterizacao.driver

import android.app.Dialog
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RelativeLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.roterizacao.driver.data.api.RetrofitClient
import com.roterizacao.driver.data.models.Route
import com.roterizacao.driver.data.models.RoutePoint
import com.roterizacao.driver.data.models.ChatMessage
import android.media.RingtoneManager
import android.app.AlertDialog
import com.squareup.picasso.Picasso
import com.google.android.material.imageview.ShapeableImageView
import com.google.android.material.shape.ShapeAppearanceModel
import com.google.android.material.shape.CornerFamily
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import me.leolin.shortcutbadger.ShortcutBadger
import android.util.Log
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.roterizacao.driver.utils.AppColors

class RouteDetailActivity : BaseActivity() {

    private var currentRouteId: String? = null
    private var lastRouteData: Route? = null
    private lateinit var headerContainer: LinearLayout
    private lateinit var contentContainer: LinearLayout
    
    // Chat Logic Variables
    private var lastMessageCount = 0
    private var chatDialog: Dialog? = null
    private var chatMessagesLayout: LinearLayout? = null
    private var chatBadge: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val routeId = intent.getStringExtra("ROUTE_ID")
        if (routeId == null) { finish(); return }
        currentRouteId = routeId
        
        // Notify LocationService of active route for background polling
        try {
            val serviceIntent = Intent(this, LocationService::class.java)
            serviceIntent.putExtra("ROUTE_ID", routeId)
            startService(serviceIntent)
        } catch (e: Exception) {
            Log.e("RouteDetail", "Erro ao atualizar LocationService", e)
        }
        
        val root = RelativeLayout(this)
        root.setBackgroundColor(AppColors.surface(this))

        // Create Notification Channel
        createNotificationChannel()

        // Request Permission for Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
            }
        }
        
        
        // 2. HEADER (Fixo Topo)
        headerContainer = LinearLayout(this)
        headerContainer.id = View.generateViewId()
        headerContainer.orientation = LinearLayout.VERTICAL
        headerContainer.setBackgroundColor(AppColors.primaryDark(this))
        val headerParams = RelativeLayout.LayoutParams(RelativeLayout.LayoutParams.MATCH_PARENT, RelativeLayout.LayoutParams.WRAP_CONTENT)
        headerParams.addRule(RelativeLayout.ALIGN_PARENT_TOP)
        headerContainer.layoutParams = headerParams
        root.addView(headerContainer)

        // Apply Status Bar Insets
        ViewCompat.setOnApplyWindowInsetsListener(headerContainer) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(0, bars.top, 0, 0)
            insets
        }
        
        // 3. SCROLL VIEW (Meio)
        val scrollView = ScrollView(this)
        scrollView.isFillViewport = true
        val scrollParams = RelativeLayout.LayoutParams(RelativeLayout.LayoutParams.MATCH_PARENT, RelativeLayout.LayoutParams.MATCH_PARENT)
        scrollParams.addRule(RelativeLayout.BELOW, headerContainer.id) // Below Header
        // Footer removed - now using Bottom Navigation from BaseActivity
        scrollView.layoutParams = scrollParams
        
        contentContainer = LinearLayout(this)
        contentContainer.orientation = LinearLayout.VERTICAL
        contentContainer.setPadding(0, 0, 0, dp(96)) // Extra padding for Bottom Navigation (72dp + 24dp)
        scrollView.addView(contentContainer)
        root.addView(scrollView)
        
        // 4. CHAT BUTTON Removed (Moved to Footer)
        // chatBtn removed from here
        
        startChatPolling(routeId)

        setContentView(root)
        
        val load = TextView(this); load.text = "Carregando..."; load.gravity = Gravity.CENTER; load.setPadding(0, dp(50), 0, 0)
        contentContainer.addView(load)
        
        fetchDetails(routeId)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun fetchDetails(routeId: String) {
        lifecycleScope.launch {
            try {
                val queryId = "eq.$routeId"
                val response = RetrofitClient.apiService.getRouteDetails(queryId)
                contentContainer.removeAllViews()
                // Don't clear headerContainer yet to avoid blink if possible, but for simplicity clearer to rewrite
                
                if (response.isSuccessful) {
                    val routes = response.body() ?: emptyList()
                    val route = routes.firstOrNull()
                    if (route != null) {
                        lastRouteData = route
                        renderUI(route)
                    } else showError("Rota não encontrada.")
                } else showError("Erro: ${response.code()}")
            } catch (e: Exception) { contentContainer.removeAllViews(); showError("Erro de conexão") }
        }
    }

    private fun showError(msg: String) { 
        val t = TextView(this); t.text=msg; t.setTextColor(Color.RED); t.gravity=Gravity.CENTER; t.setPadding(0,dp(40),0,0); 
        contentContainer.addView(t) 
    }

    private fun renderUI(route: Route) {
        // 1. Update Header (Fixed)
        headerContainer.removeAllViews()
        addHeader(headerContainer, route)
        
        // 2. Update Content (Scrollable)
        contentContainer.removeAllViews()
        val points = route.route_points?.sortedBy { it.sequence ?: 0 } ?: emptyList()
        val isStarted = route.status == "in_progress" || route.status == "completed"
        
        if (!isStarted) { 
            addStartButton(contentContainer, route)
            return 
        }
        
        val listContainer = LinearLayout(this); listContainer.orientation = LinearLayout.VERTICAL; listContainer.setPadding(dp(16), dp(16), dp(16), 0); 
        contentContainer.addView(listContainer)
        
        // Render Points
        val activePointExists = points.any { it.status == "en_route" || it.status == "arrived" }
        val nextPendingIndex = if (activePointExists) -1 else points.indexOfFirst { it.status == "pending" }
        
        points.forEachIndexed { index, point -> 
            addTimelineCard(listContainer, point, route.id, index, points.size, contentContainer, index == nextPendingIndex) 
        }
        
        // Bottom Widgets
        if (route.status == "completed") {
            addCompletionBanner(listContainer, "${route.final_km ?: 0}")
        } else {
             val allDone = points.isNotEmpty() && points.all { it.status == "collected" || it.status == "failed" }
             if (allDone) {
                 addSuccessMessage(listContainer)
                 addFinalizeButtonComplete(listContainer, route.id, contentContainer)
             }
        }
    }
    
    private fun createFooterView(routeId: String, container: LinearLayout? = null): View {
        val footer = LinearLayout(this)
        footer.id = View.generateViewId()
        footer.orientation = LinearLayout.HORIZONTAL
        footer.setBackgroundColor(AppColors.primaryDark(this))
        footer.elevation = dp(16).toFloat()
        // Compact padding, items centered
        footer.setPadding(0, dp(16), 0, dp(16))
        
        // VOLTAR button (Vertical Stack)
        val voltarBtn = LinearLayout(this)
        voltarBtn.orientation = LinearLayout.VERTICAL
        voltarBtn.gravity = Gravity.CENTER
        voltarBtn.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        // Add ripple/background if possible, here using click listener with no visual bg for clean look
        voltarBtn.setOnClickListener { finish() }
        
        val voltarIcon = ImageView(this)
        voltarIcon.setImageResource(R.drawable.ic_home)
        voltarIcon.imageTintList = ColorStateList.valueOf(Color.WHITE)
        voltarIcon.layoutParams = LinearLayout.LayoutParams(dp(32), dp(32))
        
        val voltarText = TextView(this)
        voltarText.text = "VOLTAR"
        voltarText.textSize = 13f
        voltarText.setTextColor(Color.WHITE)
        voltarText.setTypeface(null, android.graphics.Typeface.BOLD)
        voltarText.setPadding(0, dp(4), 0, 0)
        
        voltarBtn.addView(voltarIcon)
        voltarBtn.addView(voltarText)
        
        // DIVIDER
        val divider = View(this)
        divider.setBackgroundColor(Color.parseColor("#E2E8F0"))
        divider.layoutParams = LinearLayout.LayoutParams(dp(1), dp(40))
        
        // ATUALIZAR button (Vertical Stack)
        val atualizarBtn = LinearLayout(this)
        atualizarBtn.orientation = LinearLayout.VERTICAL
        atualizarBtn.gravity = Gravity.CENTER
        atualizarBtn.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        atualizarBtn.setOnClickListener { 
             atualizarBtn.alpha = 0.5f
             android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ atualizarBtn.alpha = 1f }, 200)
             fetchDetails(routeId) 
        }
        
        val refreshIcon = ImageView(this)
        refreshIcon.setImageResource(R.drawable.ic_refresh)
        refreshIcon.imageTintList = ColorStateList.valueOf(Color.WHITE)
        val rParams = LinearLayout.LayoutParams(dp(32), dp(32))
        refreshIcon.layoutParams = rParams
        
        val atualizarText = TextView(this)
        atualizarText.text = "ATUALIZAR"
        atualizarText.textSize = 13f
        atualizarText.setTextColor(Color.WHITE)
        atualizarText.setTypeface(null, android.graphics.Typeface.BOLD)
        atualizarText.setPadding(0, dp(4), 0, 0)
        
        atualizarBtn.addView(refreshIcon)
        atualizarBtn.addView(atualizarText)

        footer.addView(voltarBtn)
        // Add divider (centered vertically?)
        // To center divider vertically in horizontal layout, use gravity or layout params
        // But footer is WRAP_CONTENT/padding.
        val divContainer = LinearLayout(this)
        divContainer.gravity = Gravity.CENTER
        divContainer.layoutParams = LinearLayout.LayoutParams(dp(1), LinearLayout.LayoutParams.MATCH_PARENT)
        divContainer.addView(divider)
        
        footer.addView(divContainer)
        footer.addView(atualizarBtn)
        
        if (container != null) {
            container.addView(footer)
            return footer
        }
        return footer
    }
    
    private fun addStartButton(container: LinearLayout, route: Route) {
        val card = LinearLayout(this)
        card.orientation = LinearLayout.VERTICAL
        card.background = createBg(Color.WHITE, dp(12))
        card.elevation = dp(4).toFloat()
        val cardParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        cardParams.setMargins(dp(16), dp(16), dp(16), dp(16))
        card.layoutParams = cardParams
        card.setPadding(dp(20), dp(20), dp(20), dp(20))
        
        val btn = LinearLayout(this)
        btn.orientation = LinearLayout.HORIZONTAL
        btn.gravity = Gravity.CENTER
        btn.setBackgroundResource(R.drawable.gradient_primary)
        btn.setPadding(dp(20), dp(16), dp(20), dp(16))
        btn.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56))
        btn.setOnClickListener {
            // Ask for Initial KM before starting
            showKmModal(route.id, container, true)
        }
        
        val btnText = TextView(this)
        btnText.text = "INICIAR ROTA"
        btnText.textSize = 16f
        btnText.setTextColor(Color.WHITE)
        btnText.setTypeface(null, android.graphics.Typeface.BOLD)
        btnText.letterSpacing = 0.05f
        
        btn.addView(btnText)
        card.addView(btn)
        container.addView(card)
    }
    
    private fun addHeader(container: LinearLayout, route: Route) {
        val header = LinearLayout(this)
        header.orientation = LinearLayout.VERTICAL
        header.setBackgroundColor(AppColors.primaryDark(this))
        header.setPadding(dp(20), dp(20), dp(20), dp(20))
        
        // Row 1: Back + Plate + Badge
        val row1 = LinearLayout(this)
        row1.orientation = LinearLayout.HORIZONTAL
        row1.gravity = Gravity.CENTER_VERTICAL
        
        val back = ImageView(this)
        back.setImageResource(R.drawable.ic_arrow_left)
        back.imageTintList = ColorStateList.valueOf(Color.WHITE)
        val backParams = LinearLayout.LayoutParams(dp(24), dp(24))
        backParams.rightMargin = dp(12)
        back.layoutParams = backParams
        back.setOnClickListener { finish() }
        row1.addView(back)
        
        val truckIcon = ImageView(this)
        truckIcon.setImageResource(R.drawable.ic_truck)
        truckIcon.imageTintList = ColorStateList.valueOf(Color.WHITE)
        val truckParams = LinearLayout.LayoutParams(dp(28), dp(28))
        truckParams.rightMargin = dp(12)
        truckIcon.layoutParams = truckParams
        row1.addView(truckIcon)
        
        val plate = TextView(this)
        plate.text = route.vehicle_plate ?: "SEM PLACA"
        plate.textSize = 24f
        plate.setTextColor(Color.WHITE)
        plate.setTypeface(null, android.graphics.Typeface.BOLD)
        row1.addView(plate)
        
        val spacer = View(this)
        spacer.layoutParams = LinearLayout.LayoutParams(0, 0, 1f)
        row1.addView(spacer)
        
        // Right Column for Badge + Bell
        val rightCol = LinearLayout(this)
        rightCol.orientation = LinearLayout.VERTICAL
        rightCol.gravity = Gravity.END

        // Status Badge with animation
        val badge = TextView(this)
        val st = route.status ?: "planned"
        when (st) {
            "completed" -> {
                badge.text = "COMPLETED"
                badge.background = createBg(Color.parseColor("#10B981"), dp(4))
            }
            "in_progress" -> {
                badge.text = "EM ANDAMENTO"
                badge.background = createBg(Color.parseColor("#818CF8"), dp(4))
                try {
                    val blinkAnim = android.view.animation.AnimationUtils.loadAnimation(this, R.anim.blink_animation)
                    badge.startAnimation(blinkAnim)
                } catch (e: Exception) {}
            }
            else -> {
                badge.text = "PLANNED"
                badge.background = createBg(Color.parseColor("#64748B"), dp(4))
            }
        }
        badge.textSize = 11f
        badge.setTypeface(null, android.graphics.Typeface.BOLD)
        badge.setTextColor(Color.WHITE)
        badge.setPadding(dp(12), dp(6), dp(12), dp(6))
        rightCol.addView(badge)

        // Bell Icon
        val bellLayout = LinearLayout(this)
        bellLayout.orientation = LinearLayout.HORIZONTAL
        bellLayout.gravity = Gravity.END
        bellLayout.setPadding(0, dp(8), 0, 0)

        val bell = ImageView(this)
        bell.setImageResource(android.R.drawable.ic_lock_idle_alarm)
        bell.imageTintList = ColorStateList.valueOf(Color.parseColor("#FEF08A")) // Yellow tint
        bell.layoutParams = LinearLayout.LayoutParams(dp(18), dp(18))
        
        bellLayout.addView(bell)
        bellLayout.setOnClickListener {
             android.widget.Toast.makeText(this, "Som das mensagens ativo", android.widget.Toast.LENGTH_SHORT).show()
        }
        rightCol.addView(bellLayout)

        row1.addView(rightCol)
        header.addView(row1)
        
        // Motorista
        val motLabel = TextView(this)
        motLabel.text = "Motorista: VOCÊ"
        motLabel.setTextColor(Color.WHITE)
        motLabel.textSize = 14f
        motLabel.setTypeface(null, android.graphics.Typeface.BOLD)
        val motParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        motParams.topMargin = dp(8)
        motParams.leftMargin = dp(64)
        motLabel.layoutParams = motParams
        header.addView(motLabel)
        
        // Stats Grid
        val grid = LinearLayout(this)
        grid.orientation = LinearLayout.HORIZONTAL
        grid.background = createBg(Color.parseColor("#1AFFFFFF"), dp(8), Color.parseColor("#33FFFFFF"), dp(1))
        grid.setPadding(0, dp(16), 0, dp(16))
        val gp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        gp.topMargin = dp(20)
        grid.layoutParams = gp
        
        val points = route.route_points ?: emptyList()
        val completedPoints = points.count { it.status == "collected" || it.status == "failed" }
        val totalPoints = if (points.isNotEmpty()) points.size else (route.total_points ?: route.points_count ?: 0)
        val dist = if (route.status == "completed" && (route.final_km ?: 0.0) > 0.0) route.final_km ?: 0.0 else (route.total_distance_km ?: 0.0)
        val time = route.total_time ?: 0
        val weight = route.total_weight ?: 0.0
        
        addStatColumn(grid, R.drawable.ic_map_pin, "PTS", "$completedPoints/$totalPoints", "", false)
        addStatColumn(grid, R.drawable.ic_navigation, "DIST", "${dist.toInt()}", "km", true)
        addStatColumn(grid, R.drawable.ic_clock, "TEMPO", "${time/60}h${time%60}", "", true)
        addStatColumn(grid, R.drawable.ic_scale, "CARGA", "${weight.toInt()}", "kg", true)
        header.addView(grid)
        
        // Progress Bar
        if (totalPoints > 0) {
            val progressContainer = LinearLayout(this)
            progressContainer.orientation = LinearLayout.VERTICAL
            val progressParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            progressParams.topMargin = dp(12)
            progressContainer.layoutParams = progressParams
            
            // Percentage label
            val percentage = ((completedPoints.toFloat() / totalPoints.toFloat()) * 100).toInt()
            val percentLabel = TextView(this)
            percentLabel.text = "$percentage% Concluído"
            percentLabel.textSize = 11f
            percentLabel.setTextColor(Color.WHITE)
            percentLabel.setTypeface(null, android.graphics.Typeface.BOLD)
            percentLabel.gravity = Gravity.CENTER
            val labelParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            labelParams.bottomMargin = dp(6)
            percentLabel.layoutParams = labelParams
            progressContainer.addView(percentLabel)
            
            val progressBarFrame = android.widget.FrameLayout(this)
            progressBarFrame.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(12))
            
            val progressBg = View(this)
            progressBg.setBackgroundColor(Color.parseColor("#1AFFFFFF"))
            progressBg.layoutParams = android.widget.FrameLayout.LayoutParams(android.widget.FrameLayout.LayoutParams.MATCH_PARENT, dp(12))
            
            val progressFill = View(this)
            progressFill.setBackgroundColor(Color.parseColor("#10B981"))
            val fillParams = android.widget.FrameLayout.LayoutParams(android.widget.FrameLayout.LayoutParams.MATCH_PARENT, dp(12))
            fillParams.width = (resources.displayMetrics.widthPixels * (completedPoints.toFloat() / totalPoints.toFloat()) * 0.9).toInt()
            progressFill.layoutParams = fillParams
            
            progressBarFrame.addView(progressBg)
            progressBarFrame.addView(progressFill)
            progressContainer.addView(progressBarFrame)
            header.addView(progressContainer)
        }
        
        container.addView(header)
    }
    
    // --- COMPLETION WIDGETS ---
    private fun addCompletionBanner(container: LinearLayout, km: String) {
        val card = LinearLayout(this)
        card.orientation = LinearLayout.VERTICAL
        val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        params.topMargin = dp(24)
        params.bottomMargin = dp(24)
        card.layoutParams = params
        card.background = createBg(Color.parseColor("#DCFCE7"), dp(12), Color.parseColor("#16A34A"), dp(1)) // Green Light bg, Stronger Stroke
        card.setPadding(dp(20), dp(20), dp(20), dp(20))
        card.gravity = Gravity.CENTER

        val t1 = TextView(this)
        t1.text = "Rota Concluída!"
        t1.textSize = 18f
        t1.setTextColor(Color.parseColor("#15803D")) // Green 700
        t1.setTypeface(null, android.graphics.Typeface.BOLD)
        
        val t2 = TextView(this)
        t2.text = "KM Final: $km"
        t2.textSize = 14f
        t2.setTextColor(Color.parseColor("#166534")) // Green 800
        t2.setPadding(0, dp(8), 0, 0)
        
        card.addView(t1); card.addView(t2)
        container.addView(card)
    }

    private fun addSuccessMessage(container: LinearLayout) {
        val msgCard = LinearLayout(this)
        msgCard.orientation = LinearLayout.VERTICAL
        msgCard.gravity = Gravity.CENTER
        val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        params.topMargin = dp(24)
        params.bottomMargin = dp(16)
        msgCard.layoutParams = params
        msgCard.setPadding(dp(20), dp(24), dp(20), dp(24))
        
        // Check icon
        val checkIcon = ImageView(this)
        checkIcon.setImageResource(R.drawable.ic_check_circle)
        checkIcon.imageTintList = ColorStateList.valueOf(Color.parseColor("#10B981"))
        val iconParams = LinearLayout.LayoutParams(dp(64), dp(64))
        iconParams.bottomMargin = dp(16)
        checkIcon.layoutParams = iconParams
        msgCard.addView(checkIcon)
        
        // Text
        val txt = TextView(this)
        txt.text = "Todos os pontos finalizados!"
        txt.textSize = 18f
        txt.setTextColor(Color.parseColor("#1E293B"))
        txt.setTypeface(null, android.graphics.Typeface.BOLD)
        txt.gravity = Gravity.CENTER
        msgCard.addView(txt)
        
        container.addView(msgCard)
    }

    private fun addFinalizeButtonComplete(container: LinearLayout, routeId: String, mainContainer: LinearLayout) {
        val btn = LinearLayout(this)
        btn.orientation = LinearLayout.HORIZONTAL
        btn.gravity = Gravity.CENTER
        btn.background = createBg(AppColors.primary(this), dp(8))
        btn.setPadding(dp(16), dp(16), dp(16), dp(16))
        val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56))
        params.topMargin = dp(8)
        params.bottomMargin = dp(24)
        params.leftMargin = dp(16)
        params.rightMargin = dp(16)
        btn.layoutParams = params
        btn.setOnClickListener {
            // Show KM modal
            showKmModal(routeId, mainContainer)
        }
        
        val btnText = TextView(this)
        btnText.text = "ENCERRAR ROTA & VOLTAR"
        btnText.textSize = 15f
        btnText.setTextColor(Color.WHITE)
        btnText.setTypeface(null, android.graphics.Typeface.BOLD)
        btnText.letterSpacing = 0.05f
        
        btn.addView(btnText)
        container.addView(btn)
    }

    private fun addFinalizeButton(container: LinearLayout, routeId: String, mainContainer: LinearLayout) {
        val btn = Button(this)
        btn.text = "FINALIZAR ROTA"
        btn.setBackgroundColor(Color.parseColor("#15803D")) // Green
        btn.setTextColor(Color.WHITE)
        val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48))
        params.topMargin = dp(24)
        params.bottomMargin = dp(24)
        btn.layoutParams = params
        btn.setOnClickListener {
             // Ask KM using the standard modal
             showKmModal(routeId, mainContainer)
        }
        container.addView(btn)
    }

    
    private fun addStatColumn(parent: LinearLayout, iconRes: Int, label: String, value: String, unit: String="", divider: Boolean) {
        if(divider){
            val d=View(this)
            d.setBackgroundColor(Color.parseColor("#33FFFFFF"))
            d.layoutParams=LinearLayout.LayoutParams(dp(1),dp(40))
            parent.addView(d)
        }
        val l=LinearLayout(this); l.orientation=LinearLayout.VERTICAL; l.layoutParams=LinearLayout.LayoutParams(0,LinearLayout.LayoutParams.WRAP_CONTENT,1f); l.gravity=Gravity.CENTER
        
        val h=LinearLayout(this); h.orientation=LinearLayout.HORIZONTAL; h.gravity=Gravity.CENTER
        val i=ImageView(this); i.setImageResource(iconRes); i.imageTintList=ColorStateList.valueOf(Color.parseColor("#BFDBFE")); i.layoutParams=LinearLayout.LayoutParams(dp(14),dp(14))
        val lb=TextView(this); lb.text=" $label"; lb.textSize=10f; lb.setTextColor(Color.parseColor("#BFDBFE")); lb.setTypeface(null,android.graphics.Typeface.BOLD)
        h.addView(i); h.addView(lb); l.addView(h)
        
        val vRow=LinearLayout(this); vRow.orientation=LinearLayout.HORIZONTAL; vRow.gravity=Gravity.CENTER
        val v=TextView(this); v.text=value; v.textSize=16f; v.setTextColor(Color.WHITE); v.setTypeface(null,android.graphics.Typeface.BOLD)
        vRow.addView(v)
        
        if(unit.isNotEmpty()){
            val u=TextView(this); u.text=" $unit"; u.textSize=11f; u.setTextColor(Color.parseColor("#DBEAFE")); u.setTypeface(null,android.graphics.Typeface.BOLD); u.setPadding(0,dp(2),0,0)
            vRow.addView(u)
        }
        l.addView(vRow)
        parent.addView(l)
    }

    private fun addTimelineCard(container: LinearLayout, point: RoutePoint, routeId: String, index: Int, total: Int, mainContainer: LinearLayout, isNextPending: Boolean) {
        val row = LinearLayout(this)
        row.orientation = LinearLayout.HORIZONTAL
        row.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        
        // LEFT: Timeline (Segmented lines + circle)
        val left = FrameLayout(this)
        left.layoutParams = LinearLayout.LayoutParams(dp(50), ViewGroup.LayoutParams.MATCH_PARENT)
        
        val st = point.status ?: "pending"
        val color = when (st) {
            "collected" -> Color.parseColor("#10B981")
            "failed" -> Color.parseColor("#EF4444")
            "arrived", "en_route" -> AppColors.primary(this)
            else -> if(isNextPending) AppColors.primary(this) else Color.parseColor("#E5E7EB")
        }
        
        // 1. Lines Container (Split into Top and Bottom)
        val linesContainer = LinearLayout(this)
        linesContainer.orientation = LinearLayout.VERTICAL
        linesContainer.gravity = Gravity.CENTER_HORIZONTAL
        linesContainer.layoutParams = FrameLayout.LayoutParams(dp(6), ViewGroup.LayoutParams.MATCH_PARENT).apply {
             gravity = Gravity.CENTER_HORIZONTAL
        }
        
        // Top Line (Invisible for first item)
        val topLine = View(this)
        topLine.layoutParams = LinearLayout.LayoutParams(dp(6), 0, 1f)
        topLine.setBackgroundColor(color)
        if (index == 0) topLine.visibility = View.INVISIBLE
        linesContainer.addView(topLine)
        
        // Bottom Line (Invisible for last item)
        val bottomLine = View(this)
        bottomLine.layoutParams = LinearLayout.LayoutParams(dp(6), 0, 1f)
        bottomLine.setBackgroundColor(color)
        if (index == total - 1) bottomLine.visibility = View.INVISIBLE
        linesContainer.addView(bottomLine)
        
        left.addView(linesContainer)
        
        // 2. Halo (Pulse for Next Pending)
        if (isNextPending) {
             val halo = View(this)
             halo.layoutParams = FrameLayout.LayoutParams(dp(48), dp(48)).apply { gravity = Gravity.CENTER }
             halo.background = createBg(AppColors.primary(this), dp(24)) // Halo always Blue
             halo.startAnimation(android.view.animation.AnimationUtils.loadAnimation(this, R.anim.pulse_animation))
             left.addView(halo)
        }
        
        // 3. Numbered Circle
        val circle = TextView(this)
        circle.text = "${index + 1}"
        circle.gravity = Gravity.CENTER
        circle.includeFontPadding = false
        circle.setTextColor(Color.WHITE)
        circle.textSize = 16f
        circle.setTypeface(null, android.graphics.Typeface.BOLD)
        // 40dp circle to match web (w-10 h-10)
        circle.background = createBg(color, dp(20)) 
        circle.layoutParams = FrameLayout.LayoutParams(dp(40), dp(40)).apply { gravity = Gravity.CENTER }
        
        left.addView(circle)
        row.addView(left)
        
        // RIGHT: Card
        val card = LinearLayout(this)
        card.orientation = LinearLayout.VERTICAL
        val cp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        cp.setMargins(0, 0, 0, dp(16))
        card.layoutParams = cp
        card.background = createBg(Color.WHITE, dp(12))
        card.elevation = dp(4).toFloat()
        
        // Colored left border (4dp to match web border-l-4)
        val cardRow = LinearLayout(this)
        cardRow.orientation = LinearLayout.HORIZONTAL
        
        val bar = View(this)
        bar.layoutParams = LinearLayout.LayoutParams(dp(4), LinearLayout.LayoutParams.MATCH_PARENT)
        bar.setBackgroundColor(color)
        cardRow.addView(bar)
        
        // Content
        val content = LinearLayout(this)
        content.orientation = LinearLayout.VERTICAL
        content.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        content.setPadding(dp(16), dp(14), dp(16), dp(14))
        
        // Header row: Recorrente badge + Client name + Status badge
        val hRow = LinearLayout(this)
        hRow.orientation = LinearLayout.HORIZONTAL
        hRow.gravity = Gravity.CENTER_VERTICAL
        
        // Recorrente badge (if applicable)
        if (point.is_recurring == true) {
            val recTag = LinearLayout(this)
            recTag.orientation = LinearLayout.HORIZONTAL
            recTag.gravity = Gravity.CENTER
            recTag.background = createBg(Color.parseColor("#EFF6FF"), dp(4))
            recTag.setPadding(dp(8), dp(4), dp(8), dp(4))
            
            val ri = ImageView(this)
            ri.setImageResource(R.drawable.ic_repeat)
            ri.imageTintList = ColorStateList.valueOf(AppColors.primary(this))
            ri.layoutParams = LinearLayout.LayoutParams(dp(12), dp(12))
            
            val rt = TextView(this)
            rt.text = " REC"
            rt.textSize = 9f
            rt.setTextColor(AppColors.primaryDark(this))
            rt.setTypeface(null, android.graphics.Typeface.BOLD)
            
            recTag.addView(ri)
            recTag.addView(rt)
            hRow.addView(recTag)
            
            // Spacer
            val spacer = View(this)
            spacer.layoutParams = LinearLayout.LayoutParams(dp(8), 1)
            hRow.addView(spacer)
        }
        
        // Client name
        val cn = TextView(this)
        cn.text = point.client_name ?: point.cost_vector_name ?: point.address?.take(30) ?: "Ponto ${point.sequence}"
        cn.textSize = 16f
        cn.setTextColor(Color.parseColor("#1E293B"))
        cn.setTypeface(null, android.graphics.Typeface.BOLD)
        cn.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        hRow.addView(cn)
        
        // Status badge
        val statusBadge = TextView(this)
        when (st) {
            "failed" -> {
                statusBadge.text = "FALHA"
                statusBadge.setTextColor(Color.parseColor("#B91C1C"))
                statusBadge.background = createBg(Color.parseColor("#FEE2E2"), dp(4))
            }
            "collected" -> {
                statusBadge.text = "COLETADO"
                statusBadge.setTextColor(Color.parseColor("#15803D"))
                statusBadge.background = createBg(Color.parseColor("#DCFCE7"), dp(4))
            }
            "arrived" -> {
                statusBadge.text = "NO LOCAL"
                statusBadge.setTextColor(Color.WHITE)
                statusBadge.background = createBg(Color.parseColor("#F59E0B"), dp(4))
            }
            "en_route" -> {
                statusBadge.text = "EM ROTA"
                statusBadge.setTextColor(Color.WHITE)
                statusBadge.background = createBg(AppColors.primary(this), dp(4))
            }
        }
        if (st != "pending") {
            statusBadge.textSize = 10f
            statusBadge.setTypeface(null, android.graphics.Typeface.BOLD)
            statusBadge.setPadding(dp(8), dp(4), dp(8), dp(4))
            hRow.addView(statusBadge)
        }
        
        content.addView(hRow)
        
        // Address row
        val ar = LinearLayout(this)
        ar.orientation = LinearLayout.HORIZONTAL
        ar.gravity = Gravity.CENTER_VERTICAL
        ar.setPadding(0, dp(10), 0, dp(12))
        
        val pin = ImageView(this)
        pin.setImageResource(R.drawable.ic_map_pin)
        pin.imageTintList = ColorStateList.valueOf(Color.parseColor("#64748B"))
        pin.layoutParams = LinearLayout.LayoutParams(dp(14), dp(14))
        
        val ad = TextView(this)
        ad.text = " ${point.address}"
        ad.textSize = 13f
        ad.setTextColor(Color.parseColor("#64748B"))
        
        ar.addView(pin)
        ar.addView(ad)
        content.addView(ar)
        
        // Weight boxes
        val wbox = LinearLayout(this)
        wbox.orientation = LinearLayout.HORIZONTAL
        
        // Peso Programado
        val b1 = LinearLayout(this)
        b1.orientation = LinearLayout.VERTICAL
        b1.background = createBg(Color.parseColor("#F8FAFC"), dp(8))
        b1.setPadding(dp(14), dp(10), dp(14), dp(10))
        b1.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        b1.gravity = Gravity.CENTER
        
        val l1 = TextView(this)
        l1.text = "PESO PROGRAMADO"
        l1.textSize = 9f
        l1.setTextColor(Color.parseColor("#94A3B8"))
        l1.setTypeface(null, android.graphics.Typeface.BOLD)
        l1.gravity = Gravity.CENTER
        
        val v1 = TextView(this)
        v1.text = "${point.weight ?: 0} kg"
        v1.textSize = 16f
        v1.setTextColor(Color.parseColor("#1E293B"))
        v1.setTypeface(null, android.graphics.Typeface.BOLD)
        v1.gravity = Gravity.CENTER
        
        b1.addView(l1)
        b1.addView(v1)
        
        // Peso Coletado
        val b2 = LinearLayout(this)
        b2.orientation = LinearLayout.VERTICAL
        b2.background = createBg(
            if (st == "collected") Color.parseColor("#F0FDF4") else Color.parseColor("#F8FAFC"),
            dp(8)
        )
        b2.setPadding(dp(14), dp(10), dp(14), dp(10))
        b2.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        b2.gravity = Gravity.CENTER
        
        val l2 = TextView(this)
        l2.text = if (st == "failed") "A COLETAR" else "PESO COLETADO"
        l2.textSize = 9f
        l2.setTextColor(if (st == "collected") Color.parseColor("#16A34A") else Color.parseColor("#94A3B8"))
        l2.setTypeface(null, android.graphics.Typeface.BOLD)
        l2.gravity = Gravity.CENTER
        
        val v2 = TextView(this)
        v2.text = if (st == "collected") "${point.actual_weight ?: 0} kg" else "--"
        v2.textSize = 16f
        v2.setTextColor(if (st == "collected") Color.parseColor("#15803D") else Color.parseColor("#1E293B"))
        v2.setTypeface(null, android.graphics.Typeface.BOLD)
        v2.gravity = Gravity.CENTER
        
        b2.addView(l2)
        b2.addView(v2)
        
        wbox.addView(b1)
        
        // Spacer between boxes
        val spacer = View(this)
        spacer.layoutParams = LinearLayout.LayoutParams(dp(12), 1)
        wbox.addView(spacer)
        
        wbox.addView(b2)
        content.addView(wbox)
        
        // Action buttons
        // Only show actions if it is the NEXT pending point, or if it is already started/arrived
        if ((st == "pending" && isNextPending) || st == "en_route" || st == "arrived") {
            val acts = createActionButtons(st, point, routeId, mainContainer)
            acts.setPadding(0, dp(14), 0, 0)
            content.addView(acts)
        }
        
        cardRow.addView(content)
        card.addView(cardRow)
        row.addView(card)
        container.addView(row)
    }
    
    // createActionButtons... createFooter... reused
    private fun createActionButtons(st: String, point: RoutePoint, routeId: String, container: LinearLayout): LinearLayout {
        val l = LinearLayout(this); l.orientation=LinearLayout.VERTICAL
        
        if(st=="pending") {
            // Blue button with navigation icon
            val btn = LinearLayout(this)
            btn.orientation = LinearLayout.HORIZONTAL
            btn.gravity = Gravity.CENTER
            btn.background = createBg(AppColors.primary(this), dp(8))
            btn.setPadding(dp(16), dp(14), dp(16), dp(14))
            btn.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48))
            btn.setOnClickListener { 
                // Direct update without confirmation dialog
                updatePointStatus(point.id, "en_route", routeId, container, emptyMap()) 
            }
            
            val icon = ImageView(this)
            icon.setImageResource(R.drawable.ic_send_nav)
            icon.imageTintList = ColorStateList.valueOf(Color.WHITE)
            icon.layoutParams = LinearLayout.LayoutParams(dp(20), dp(20))
            
            val txt = TextView(this)
            txt.text = " INICIAR DESLOCAMENTO"
            txt.textSize = 14f
            txt.setTextColor(Color.WHITE)
            txt.setTypeface(null, android.graphics.Typeface.BOLD)
            
            btn.addView(icon); btn.addView(txt)
            l.addView(btn)
            
        } else if(st=="en_route") {
            // Navigation buttons row
            val navRow = LinearLayout(this)
            navRow.orientation = LinearLayout.HORIZONTAL
            navRow.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            
            // Google Maps button
            val mapsBtn = LinearLayout(this)
            mapsBtn.orientation = LinearLayout.HORIZONTAL
            mapsBtn.gravity = Gravity.CENTER
            mapsBtn.background = createBg(Color.WHITE, dp(8), Color.parseColor("#cbd5e1"), dp(2)) // Slate-300 border
            mapsBtn.setPadding(dp(12), dp(12), dp(12), dp(12))
            val mapsParams = LinearLayout.LayoutParams(0, dp(48), 1f)
            mapsParams.rightMargin = dp(8)
            mapsBtn.layoutParams = mapsParams
            mapsBtn.setOnClickListener { openMaps(point.address?:"", "google") }
            
            val mapsIcon = ImageView(this)
            mapsIcon.setImageResource(R.drawable.ic_google_maps)
            mapsIcon.imageTintList = ColorStateList.valueOf(Color.parseColor("#1E293B"))
            mapsIcon.layoutParams = LinearLayout.LayoutParams(dp(20), dp(20))
            
            val mapsTxt = TextView(this)
            mapsTxt.text = " Google Maps"
            mapsTxt.textSize = 13f
            mapsTxt.setTextColor(Color.parseColor("#1E293B"))
            mapsTxt.setTypeface(null, android.graphics.Typeface.BOLD)
            
            mapsBtn.addView(mapsIcon); mapsBtn.addView(mapsTxt)
            
            // Waze button
            val wazeBtn = LinearLayout(this)
            wazeBtn.orientation = LinearLayout.HORIZONTAL
            wazeBtn.gravity = Gravity.CENTER
            wazeBtn.background = createBg(Color.parseColor("#ECFEFF"), dp(8), Color.parseColor("#06B6D4"), dp(2))
            wazeBtn.setPadding(dp(12), dp(12), dp(12), dp(12))
            val wazeParams = LinearLayout.LayoutParams(0, dp(48), 1f)
            wazeParams.leftMargin = dp(8)
            wazeBtn.layoutParams = wazeParams
            wazeBtn.setOnClickListener { openMaps(point.address?:"", "waze") }
            
            val wazeIcon = ImageView(this)
            wazeIcon.setImageResource(R.drawable.ic_waze)
            wazeIcon.imageTintList = ColorStateList.valueOf(Color.parseColor("#0891B2"))
            wazeIcon.layoutParams = LinearLayout.LayoutParams(dp(20), dp(20))
            
            val wazeTxt = TextView(this)
            wazeTxt.text = " Waze"
            wazeTxt.textSize = 13f
            wazeTxt.setTextColor(Color.parseColor("#0891B2"))
            wazeTxt.setTypeface(null, android.graphics.Typeface.BOLD)
            
            wazeBtn.addView(wazeIcon); wazeBtn.addView(wazeTxt)
            
            navRow.addView(mapsBtn); navRow.addView(wazeBtn)
            l.addView(navRow)
            
            // Confirmar Chegada button (golden)
            val arriveBtn = LinearLayout(this)
            arriveBtn.orientation = LinearLayout.HORIZONTAL
            arriveBtn.gravity = Gravity.CENTER
            arriveBtn.background = createBg(Color.parseColor("#CA8A04"), dp(8)) // Darker Gold
            arriveBtn.setPadding(dp(16), dp(14), dp(16), dp(14))
            val arriveParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48))
            arriveParams.topMargin = dp(12)
            arriveBtn.layoutParams = arriveParams
            arriveBtn.setOnClickListener { 
                // Direct update for arrival - seamless transition to ARRIVED state
                updatePointStatus(point.id, "arrived", routeId, container, emptyMap()) 
            }
            
            val arriveIcon = ImageView(this)
            arriveIcon.setImageResource(R.drawable.ic_map_pin)
            arriveIcon.imageTintList = ColorStateList.valueOf(Color.WHITE)
            arriveIcon.layoutParams = LinearLayout.LayoutParams(dp(20), dp(20))
            
            val arriveTxt = TextView(this)
            arriveTxt.text = " CONFIRMAR CHEGADA"
            arriveTxt.textSize = 14f
            arriveTxt.setTextColor(Color.WHITE)
            arriveTxt.setTypeface(null, android.graphics.Typeface.BOLD)
            
            arriveBtn.addView(arriveIcon); arriveBtn.addView(arriveTxt)
            l.addView(arriveBtn)
            
        } else if(st=="arrived") {
            // Yellow instruction box
            val instructionBox = LinearLayout(this)
            instructionBox.orientation = LinearLayout.VERTICAL
            instructionBox.background = createBg(Color.parseColor("#FEF3C7"), dp(8), Color.parseColor("#FCD34D"), dp(1))
            instructionBox.setPadding(dp(16), dp(12), dp(16), dp(12))
            val boxParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            boxParams.bottomMargin = dp(12)
            instructionBox.layoutParams = boxParams
            
            val instrTitle = TextView(this)
            instrTitle.text = "Instruções:"
            instrTitle.textSize = 13f
            instrTitle.setTextColor(Color.parseColor("#92400E"))
            instrTitle.setTypeface(null, android.graphics.Typeface.BOLD)
            instructionBox.addView(instrTitle)
            
            val instructions = listOf(
                "• Verifique a nota fiscal.",
                "• Confira a carga.",
                "• Colete a assinatura."
            )
            
            instructions.forEach { instruction ->
                val instrText = TextView(this)
                instrText.text = instruction
                instrText.textSize = 12f
                instrText.setTextColor(Color.parseColor("#92400E"))
                instrText.setPadding(0, dp(2), 0, 0)
                instructionBox.addView(instrText)
            }
            
            l.addView(instructionBox)
            
            // Buttons row
            val btnRow = LinearLayout(this)
            btnRow.orientation = LinearLayout.HORIZONTAL
            btnRow.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            
            // DAR BAIXA button (green, larger)
            val baixaBtn = LinearLayout(this)
            baixaBtn.orientation = LinearLayout.HORIZONTAL
            baixaBtn.gravity = Gravity.CENTER
            baixaBtn.background = createBg(Color.parseColor("#16A34A"), dp(8))
            baixaBtn.setPadding(dp(16), dp(14), dp(16), dp(14))
            val baixaParams = LinearLayout.LayoutParams(0, dp(52), 3f)
            baixaParams.rightMargin = dp(8)
            baixaBtn.layoutParams = baixaParams
            baixaBtn.setOnClickListener { showCustomInputModal("Confirmar Coleta", "Peso Coletado (KG)", true, point.id, "collected", routeId, container, false, point.weight) }
            
            val baixaIcon = ImageView(this)
            baixaIcon.setImageResource(R.drawable.ic_check_circle)
            baixaIcon.imageTintList = ColorStateList.valueOf(Color.WHITE)
            baixaIcon.layoutParams = LinearLayout.LayoutParams(dp(20), dp(20))
            
            val baixaText = TextView(this)
            baixaText.text = " DAR BAIXA"
            baixaText.textSize = 14f
            baixaText.setTextColor(Color.WHITE)
            baixaText.setTypeface(null, android.graphics.Typeface.BOLD)
            
            baixaBtn.addView(baixaIcon)
            baixaBtn.addView(baixaText)
            
            // Failure button (red, smaller, icon only)
            val failBtn = LinearLayout(this)
            failBtn.orientation = LinearLayout.HORIZONTAL
            failBtn.gravity = Gravity.CENTER
            failBtn.background = createBg(Color.parseColor("#EF4444"), dp(8))
            failBtn.setPadding(dp(12), dp(14), dp(12), dp(14))
            val failParams = LinearLayout.LayoutParams(dp(52), dp(52))
            failBtn.layoutParams = failParams
            failBtn.setOnClickListener { showCustomInputModal("Reportar Problema", "Motivo da não coleta", false, point.id, "failed", routeId, container, false) }
            
            val failIcon = ImageView(this)
            failIcon.setImageResource(R.drawable.ic_x_circle)
            failIcon.imageTintList = ColorStateList.valueOf(Color.WHITE)
            failIcon.layoutParams = LinearLayout.LayoutParams(dp(24), dp(24))
            
            failBtn.addView(failIcon)
            
            btnRow.addView(baixaBtn)
            btnRow.addView(failBtn)
            l.addView(btnRow)
        }
        return l
    }
    private fun createFooterView(routeId: String): LinearLayout {
        val footer = LinearLayout(this)
        footer.orientation = LinearLayout.HORIZONTAL
        footer.setBackgroundColor(Color.parseColor("#FFFFFF"))
        footer.elevation = dp(12).toFloat()
        footer.gravity = Gravity.CENTER
        footer.setPadding(dp(8), dp(8), dp(8), dp(8))
        
        // Add subtle shadow
        footer.outlineProvider = android.view.ViewOutlineProvider.BOUNDS
        footer.clipToOutline = false

        // 1. VOLTAR (Home icon)
        footer.addView(createModernFooterButton(
            text = "Início",
            iconRes = R.drawable.ic_home,
            color = Color.parseColor("#64748B"),
            onClick = { finish() }
        ))

        // 2. CHAT (With Badge)
        val chatFrame = FrameLayout(this)
        val chatParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        chatParams.gravity = Gravity.CENTER
        chatFrame.layoutParams = chatParams
        
        val chatBtn = createModernFooterButtonLayout(
            text = "Chat",
            iconRes = R.drawable.ic_chat,
            color = Color.parseColor("#3B82F6")
        )
        chatFrame.addView(chatBtn)
        
        // Badge
        chatBadge = TextView(this)
        chatBadge?.text = "0"
        chatBadge?.textSize = 10f
        chatBadge?.setTextColor(Color.WHITE)
        chatBadge?.setTypeface(null, android.graphics.Typeface.BOLD)
        chatBadge?.gravity = Gravity.CENTER
        val badgeBg = android.graphics.drawable.GradientDrawable()
        badgeBg.shape = android.graphics.drawable.GradientDrawable.OVAL
        badgeBg.setColor(Color.parseColor("#EF4444"))
        chatBadge?.background = badgeBg
        val bp = FrameLayout.LayoutParams(dp(18), dp(18))
        bp.gravity = Gravity.TOP or Gravity.END
        bp.topMargin = dp(2)
        bp.rightMargin = dp(16)
        chatBadge?.layoutParams = bp
        chatBadge?.visibility = View.GONE
        chatFrame.addView(chatBadge)
        
        chatFrame.setOnClickListener { 
            animateButtonPress(chatBtn)
            showChatDialog(routeId)
        }
        footer.addView(chatFrame)

        // 3. LIGAR (Call icon - destacado mas alinhado)
        val callFrame = FrameLayout(this)
        val callParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        callParams.gravity = Gravity.CENTER
        callFrame.layoutParams = callParams
        
        val callButton = LinearLayout(this)
        callButton.orientation = LinearLayout.VERTICAL
        callButton.gravity = Gravity.CENTER
        callButton.setPadding(dp(8), 0, dp(8), 0)
        
        // Circle background (um pouco maior mas não muito)
        val callCircle = LinearLayout(this)
        callCircle.orientation = LinearLayout.VERTICAL
        callCircle.gravity = Gravity.CENTER
        val circleBg = android.graphics.drawable.GradientDrawable()
        circleBg.shape = android.graphics.drawable.GradientDrawable.OVAL
        circleBg.setColor(Color.parseColor("#10B981"))
        callCircle.background = circleBg
        callCircle.layoutParams = LinearLayout.LayoutParams(dp(48), dp(48))
        callCircle.elevation = dp(4).toFloat()
        
        val callIcon = ImageView(this)
        callIcon.setImageResource(android.R.drawable.ic_menu_call)
        callIcon.imageTintList = ColorStateList.valueOf(Color.WHITE)
        callIcon.layoutParams = LinearLayout.LayoutParams(dp(24), dp(24))
        callCircle.addView(callIcon)
        
        val callText = TextView(this)
        callText.text = "Ligar"
        callText.textSize = 11f
        callText.setTextColor(Color.parseColor("#10B981"))
        callText.setTypeface(null, android.graphics.Typeface.BOLD)
        callText.setPadding(0, dp(4), 0, 0)
        
        callButton.addView(callCircle)
        callButton.addView(callText)
        callFrame.addView(callButton)
        
        callFrame.setOnClickListener { 
            animateButtonPress(callCircle)
            startWebCall(routeId)
        }
        footer.addView(callFrame)

        // 4. ATUALIZAR (Refresh icon)
        footer.addView(createModernFooterButton(
            text = "Atualizar",
            iconRes = R.drawable.ic_refresh,
            color = Color.parseColor("#8B5CF6"),
            onClick = { 
                val btn = footer.getChildAt(footer.childCount - 1)
                animateRefresh(btn)
                fetchDetails(routeId)
            }
        ))
        
        return footer
    }

    private fun createModernFooterButton(
        text: String,
        iconRes: Int,
        color: Int,
        onClick: () -> Unit
    ): LinearLayout {
        val btn = createModernFooterButtonLayout(text, iconRes, color)
        btn.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        btn.setOnClickListener { 
            animateButtonPress(btn)
            onClick()
        }
        return btn
    }

    private fun createModernFooterButtonLayout(
        text: String,
        iconRes: Int,
        color: Int
    ): LinearLayout {
        val btn = LinearLayout(this)
        btn.orientation = LinearLayout.VERTICAL
        btn.gravity = Gravity.CENTER
        btn.setPadding(dp(8), dp(8), dp(8), dp(8))
        
        // Ripple effect background
        val ripple = android.graphics.drawable.RippleDrawable(
            ColorStateList.valueOf(Color.parseColor("#1A000000")),
            null,
            android.graphics.drawable.ColorDrawable(Color.WHITE)
        )
        btn.background = ripple
        
        val icon = ImageView(this)
        icon.setImageResource(iconRes)
        icon.imageTintList = ColorStateList.valueOf(color)
        icon.layoutParams = LinearLayout.LayoutParams(dp(24), dp(24))
        
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 11f
        tv.setTextColor(color)
        tv.setTypeface(null, android.graphics.Typeface.BOLD)
        tv.setPadding(0, dp(4), 0, 0)
        
        btn.addView(icon)
        btn.addView(tv)
        return btn
    }

    private fun createFooterDivider(): View {
        val d = View(this)
        d.setBackgroundColor(Color.parseColor("#E5E7EB")) 
        d.layoutParams = LinearLayout.LayoutParams(dp(1), dp(40))
        return d
    }

    private fun animateButtonPress(view: View) {
        view.animate()
            .scaleX(0.9f)
            .scaleY(0.9f)
            .setDuration(100)
            .withEndAction {
                view.animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(100)
                    .start()
            }
            .start()
    }

    private fun animateRefresh(view: View) {
        view.animate()
            .rotation(360f)
            .setDuration(500)
            .withEndAction {
                view.rotation = 0f
            }
            .start()
    }

    private fun startWebCall(routeId: String) {
        // Chamada NATIVA WebRTC - Igual WhatsApp!
        VoiceCallActivity.start(this, routeId, "Base")
    }


    private fun showCustomInputModal(title: String, label: String, isNum: Boolean, pid: String, st: String, rid: String, cont: LinearLayout, isFinalizeRoute: Boolean, weight: Double? = null) {
        val dialog = Dialog(this)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        
        val card = LinearLayout(this)
        card.orientation = LinearLayout.VERTICAL
        card.background = createBg(Color.WHITE, dp(12))
        card.setPadding(dp(24), dp(24), dp(24), dp(24))
        
        // Header with title and close button
        val header = RelativeLayout(this)
        val headerParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        headerParams.bottomMargin = dp(20)
        header.layoutParams = headerParams
        
        val titleText = TextView(this)
        titleText.text = title
        titleText.textSize = 18f
        titleText.setTypeface(null, android.graphics.Typeface.BOLD)
        titleText.setTextColor(Color.parseColor("#1E293B"))
        val titleParams = RelativeLayout.LayoutParams(RelativeLayout.LayoutParams.WRAP_CONTENT, RelativeLayout.LayoutParams.WRAP_CONTENT)
        titleParams.addRule(RelativeLayout.CENTER_VERTICAL)
        titleText.layoutParams = titleParams
        header.addView(titleText)
        
        // Close button
        val closeBtn = ImageView(this)
        closeBtn.setImageResource(R.drawable.ic_close)
        closeBtn.imageTintList = ColorStateList.valueOf(Color.parseColor("#64748B"))
        val closeParams = RelativeLayout.LayoutParams(dp(24), dp(24))
        closeParams.addRule(RelativeLayout.ALIGN_PARENT_RIGHT)
        closeParams.addRule(RelativeLayout.CENTER_VERTICAL)
        closeBtn.layoutParams = closeParams
        closeBtn.setOnClickListener { dialog.dismiss() }
        header.addView(closeBtn)
        
        card.addView(header)
        
        // Label
        val labelText = TextView(this)
        labelText.text = label
        labelText.textSize = 14f
        labelText.setTextColor(Color.parseColor("#475569"))
        labelText.setTypeface(null, android.graphics.Typeface.BOLD)
        val labelParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        labelParams.bottomMargin = dp(8)
        labelText.layoutParams = labelParams
        card.addView(labelText)
        
        // Input field
        val input = EditText(this)
        input.background = createBg(Color.WHITE, dp(8), AppColors.primary(this), dp(2))
        input.setPadding(dp(16), dp(14), dp(16), dp(14))
        input.textSize = 16f
        input.setTextColor(Color.parseColor("#1E293B"))
        
        if (isNum) {
            input.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            // Pre-fill with programmed weight if available
            if (weight != null && weight > 0) {
                input.setText(weight.toString())
            }
            input.selectAll() // Select all text for easy editing
            input.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        } else {
            // Failure report - larger text area
            input.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            input.minLines = 4
            input.maxLines = 6
            input.gravity = Gravity.TOP or Gravity.START
            input.hint = "Ex: Estabelecimento fechado, Cliente recusou..."
            input.setHintTextColor(Color.parseColor("#94A3B8"))
            val inputParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(120))
            input.layoutParams = inputParams
        }
        
        val inputMarginParams = input.layoutParams as LinearLayout.LayoutParams
        inputMarginParams.bottomMargin = dp(20)
        input.layoutParams = inputMarginParams
        card.addView(input)
        
        // Confirm button
        val confirmBtn = LinearLayout(this)
        confirmBtn.orientation = LinearLayout.HORIZONTAL
        confirmBtn.gravity = Gravity.CENTER
        
        // Different colors for collect vs failure
        val colorInt = if (isNum) AppColors.primary(this) else Color.parseColor("#EF4444") // Primary for collect, Red for failure
        confirmBtn.background = createBg(colorInt, dp(8))
        confirmBtn.setPadding(dp(16), dp(14), dp(16), dp(14))
        confirmBtn.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48))
        confirmBtn.setOnClickListener {
            val valStr = input.text.toString()
            if (isFinalizeRoute) {
                updateRouteStatus(pid, st, cont)
            } else {
                val extra = if (isNum) {
                    mapOf("actual_weight" to (valStr.toDoubleOrNull() ?: 0.0))
                } else {
                    mapOf("observation" to valStr)
                }
                updatePointStatus(pid, st, rid, cont, extra)
            }
            dialog.dismiss()
        }
        
        val btnText = TextView(this)
        btnText.text = if (isNum) "Confirmar Coleta" else "Registrar Falha"
        btnText.textSize = 15f
        btnText.setTextColor(Color.WHITE)
        btnText.setTypeface(null, android.graphics.Typeface.BOLD)
        
        confirmBtn.addView(btnText)
        card.addView(confirmBtn)
        
        dialog.setContentView(card, ViewGroup.LayoutParams(dp(340), ViewGroup.LayoutParams.WRAP_CONTENT))
        dialog.show()
    }
    
    private fun showKmModal(routeId: String, mainContainer: LinearLayout, isStart: Boolean = false) {
        val dialog = Dialog(this)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        
        val card = LinearLayout(this)
        card.orientation = LinearLayout.VERTICAL
        card.background = createBg(Color.WHITE, dp(12))
        card.setPadding(dp(24), dp(24), dp(24), dp(24))
        
        // Header with title and close button
        val header = RelativeLayout(this)
        val headerParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        headerParams.bottomMargin = dp(20)
        header.layoutParams = headerParams
        
        val titleText = TextView(this)
        titleText.text = if (isStart) "Iniciar Rota" else "Encerrar Rota"
        titleText.textSize = 18f
        titleText.setTypeface(null, android.graphics.Typeface.BOLD)
        titleText.setTextColor(Color.parseColor("#1E293B"))
        val titleParams = RelativeLayout.LayoutParams(RelativeLayout.LayoutParams.WRAP_CONTENT, RelativeLayout.LayoutParams.WRAP_CONTENT)
        titleParams.addRule(RelativeLayout.CENTER_VERTICAL)
        titleText.layoutParams = titleParams
        header.addView(titleText)
        
        val closeBtn = ImageView(this)
        closeBtn.setImageResource(R.drawable.ic_close)
        closeBtn.imageTintList = ColorStateList.valueOf(Color.parseColor("#64748B"))
        val closeParams = RelativeLayout.LayoutParams(dp(24), dp(24))
        closeParams.addRule(RelativeLayout.ALIGN_PARENT_RIGHT)
        closeParams.addRule(RelativeLayout.CENTER_VERTICAL)
        closeBtn.layoutParams = closeParams
        closeBtn.setOnClickListener { dialog.dismiss() }
        header.addView(closeBtn)
        card.addView(header)
        
        // Label
        val labelText = TextView(this)
        labelText.text = if (isStart) "Informe KM Inicial" else "Informe o Odômetro (KM)"
        labelText.textSize = 14f
        labelText.setTextColor(Color.parseColor("#475569"))
        labelText.setTypeface(null, android.graphics.Typeface.BOLD)
        val labelParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        labelParams.bottomMargin = dp(8)
        labelText.layoutParams = labelParams
        card.addView(labelText)
        
        // Input field
        val input = EditText(this)
        input.background = createBg(Color.WHITE, dp(8), AppColors.primary(this), dp(2))
        input.setPadding(dp(16), dp(14), dp(16), dp(14))
        input.textSize = 16f
        input.setTextColor(Color.parseColor("#1E293B"))
        input.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        input.hint = "Ex: 15400"
        input.setHintTextColor(Color.parseColor("#94A3B8"))
        val inputTextParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        inputTextParams.bottomMargin = dp(20)
        input.layoutParams = inputTextParams
        card.addView(input)
        
        // Confirm button
        val confirmBtn = LinearLayout(this)
        confirmBtn.orientation = LinearLayout.HORIZONTAL
        confirmBtn.gravity = Gravity.CENTER
        confirmBtn.background = createBg(if (isStart) AppColors.primary(this) else Color.parseColor("#15803D"), dp(8))
        confirmBtn.setPadding(dp(16), dp(14), dp(16), dp(14))
        confirmBtn.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48))
        confirmBtn.setOnClickListener {
            val kmValue = input.text.toString()
            if (kmValue.isNotEmpty()) {
                lifecycleScope.launch {
                    try {
                        val timestamp = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(java.util.Date())
                        val kmDouble = kmValue.toDoubleOrNull() ?: 0.0
                        val finalValue: Number = if (kmDouble % 1 == 0.0) kmDouble.toInt() else kmDouble

                        val updateData = if (isStart) {
                            mapOf(
                                "status" to "in_progress",
                                "initial_km" to finalValue,
                                "started_at" to timestamp
                            )
                        } else {
                            mapOf(
                                "status" to "completed",
                                "final_km" to finalValue,
                                "finished_at" to timestamp
                            )
                        }
                        
                        val response = RetrofitClient.apiService.updateRouteStatus("eq.$routeId", updateData)
                        if (response.isSuccessful) {
                           dialog.dismiss()
                           if (!isStart) finish() else fetchDetails(routeId) 
                        } else {
                           val errBody = response.errorBody()?.string() ?: "Unknown Error"
                           android.widget.Toast.makeText(this@RouteDetailActivity, "Erro API: ${response.code()} - $errBody", android.widget.Toast.LENGTH_LONG).show()
                           android.util.Log.e("RouteDetail", "Failed to update route: ${response.code()} - $errBody")
                        }
                    } catch (e: Exception) {
                        android.widget.Toast.makeText(this@RouteDetailActivity, "Erro: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
        
        val btnT = TextView(this)
        btnT.text = "CONFIRMAR"
        btnT.textSize = 15f
        btnT.setTextColor(Color.WHITE)
        btnT.setTypeface(null, android.graphics.Typeface.BOLD)
        confirmBtn.addView(btnT)
        card.addView(confirmBtn)
        
        dialog.setContentView(card, ViewGroup.LayoutParams(dp(340), ViewGroup.LayoutParams.WRAP_CONTENT))
        dialog.show()
    }
    
    private fun updatePointStatus(pid:String,st:String,rid:String,cont:LinearLayout,extras:Map<String,Any>){ 
        // 1. Optimistic Update
        val cleanPid = pid.trim()
        if(lastRouteData != null) {
            val updatedPoints = lastRouteData!!.route_points?.map { p ->
                if(p.id == cleanPid) {
                    var np = p.copy(status = st)
                    if(extras.containsKey("actual_weight")) np = np.copy(actual_weight = (extras["actual_weight"] as? Number)?.toDouble())
                    if(extras.containsKey("observation")) np = np.copy(observation = extras["observation"] as? String)
                    np
                } else p
            }
            val optimisticRoute = lastRouteData!!.copy(route_points = updatedPoints)
            lastRouteData = optimisticRoute // Persist optimistic state locally
            renderUI(optimisticRoute)
        }
        
        // 2. Server Update
        lifecycleScope.launch { 
            try { 
                val payload = mutableMapOf<String,Any>("status" to st)
                payload.putAll(extras)
                // Convert weight to Int if it has no decimals to satisfy picky backends
                if (payload.containsKey("actual_weight")) {
                    val w = (payload["actual_weight"] as? Number)?.toDouble()
                    if (w != null && w % 1 == 0.0) {
                        payload["actual_weight"] = w.toInt()
                    }
                }

                val response = RetrofitClient.apiService.updatePointStatus("eq.$cleanPid", payload)
                
                if (response.isSuccessful) {
                    val updatedList = response.body()
                    if (updatedList.isNullOrEmpty()) {
                         android.widget.Toast.makeText(this@RouteDetailActivity, "Aviso: Servidor não salvou (ID não encontrado)", android.widget.Toast.LENGTH_LONG).show()
                    }
                } else {
                    val err = response.errorBody()?.string() ?: "Unknown"
                    android.widget.Toast.makeText(this@RouteDetailActivity, "Erro Sinc ${response.code()}: $err", android.widget.Toast.LENGTH_LONG).show()
                }
            } catch(e:Exception){
                android.util.Log.e("RouteDetail", "Error updating point: ${e.message}")
                android.widget.Toast.makeText(this@RouteDetailActivity, "Erro Conexão: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            } 
        } 
    }
    
    private fun updateRouteStatus(rid:String,st:String,cont:LinearLayout){ 
        lifecycleScope.launch{ 
            try{ 
                android.util.Log.d("RouteDetail", "Updating route $rid to status $st")
                val response = RetrofitClient.apiService.updateRouteStatus("eq.$rid",mapOf("status" to st))
                android.util.Log.d("RouteDetail", "Response: ${response.code()}")
                if (response.isSuccessful) {
                    android.util.Log.d("RouteDetail", "Route updated successfully")
                    fetchDetails(rid)
                } else {
                    android.util.Log.e("RouteDetail", "Failed to update route: ${response.code()}")
                    android.widget.Toast.makeText(this@RouteDetailActivity, "Erro ao iniciar rota", android.widget.Toast.LENGTH_SHORT).show()
                }
            }catch(e:Exception){
                android.util.Log.e("RouteDetail", "Error updating route: ${e.message}", e)
                android.widget.Toast.makeText(this@RouteDetailActivity, "Erro: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            } 
        } 
    }
    private fun confirmAction(msg:String,pid:String,st:String,rid:String,cont:LinearLayout,extras:Map<String,Any>?){ val d=Dialog(this); d.requestWindowFeature(Window.FEATURE_NO_TITLE); d.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT)); val c=LinearLayout(this); c.orientation=LinearLayout.VERTICAL; c.background=createBg(Color.WHITE,dp(12)); c.setPadding(dp(20),dp(20),dp(20),dp(20)); val t=TextView(this); t.text="Confirmar"; t.textSize=18f; t.setTypeface(null,android.graphics.Typeface.BOLD); t.setTextColor(Color.BLACK); c.addView(t); val b=Button(this); b.text="SIM"; b.setBackgroundColor(Color.BLUE); b.setTextColor(Color.WHITE); b.setOnClickListener{ if(pid.isNotEmpty()) updatePointStatus(pid,st,rid,cont,extras?:emptyMap()) else updateRouteStatus(rid,st,cont); d.dismiss() }; c.addView(b); d.setContentView(c,ViewGroup.LayoutParams(dp(300),ViewGroup.LayoutParams.WRAP_CONTENT)); d.show() }
    private fun openMaps(address: String, app: String) {
        val q = Uri.encode(address)
        try {
            if (app == "waze") {
                val uri = "waze://?q=$q&navigate=yes"
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
                intent.setPackage("com.waze")
                startActivity(intent)
            } else {
                val uri = "geo:0,0?q=$q"
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
                intent.setPackage("com.google.android.apps.maps")
                startActivity(intent)
            }
        } catch (e: Exception) {
            // Fallback: Open in browser
            val webUri = "https://www.google.com/maps/search/?api=1&query=$q"
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webUri)))
        }
    }
    private fun createBg(color:Int,radius:Int,strokeC:Int=0,strokeW:Int=0):android.graphics.drawable.GradientDrawable{ val d=android.graphics.drawable.GradientDrawable(); d.setColor(color); d.cornerRadius=radius.toFloat(); if(strokeW>0)d.setStroke(strokeW,strokeC); return d }

    // --- CALL IMPLEMENTATION ---
    
    private fun startCallPolling(routeId: String) {
        val prefs = getSharedPreferences("call_prefs", Context.MODE_PRIVATE)
        
        lifecycleScope.launch {
            while (isActive) {
                try {
                     // Poll only for CALLING status using correct PostgREST syntax
                     val response = RetrofitClient.apiService.getCalls("eq.$routeId", "eq.calling")
                     if (response.isSuccessful) {
                         val calls = response.body() ?: emptyList()
                         // Find call from base
                         val incomingCall = calls.find { 
                             val from = it["from_user"] as? String
                             it["status"] == "calling" && (from == "base" || from == "admin") 
                         }
                         
                         if (incomingCall != null) {
                             val callId = incomingCall["id"] as? String
                             val lastHandled = prefs.getString("last_handled_call", "")
                             
                             // Só abre se for uma chamada nova que ainda não processamos
                             if (callId != null && callId != lastHandled) {
                                 // Save as handled immediately
                                 prefs.edit().putString("last_handled_call", callId).apply()
                                 
                                 // Found incoming call! Launch Voice Activity
                                 startVoiceCallInbound(routeId)
                                 // Delay to prevent double launch
                                 delay(5000) 
                             }
                         }
                     }
                } catch (e: Exception) { 
                    android.util.Log.e("RouteDetail", "Call Poll Err: ${e.message}") 
                }
                delay(2000)
            }
        }
    }

    private fun startVoiceCallInbound(routeId: String) {
        // Prevent opening if already top activity? 
        // For now just launch. It's better to open twice than not open.
        // But intent flags help.
        val intent = Intent(this, VoiceCallActivity::class.java)
        intent.putExtra("ROUTE_ID", routeId)
        intent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK // Avoid stack dupes
        startActivity(intent)
    }

    // --- CHAT IMPLEMENTATION ---
    private fun startChatPolling(routeId: String) {
        startCallPolling(routeId) // Hook call polling here or in onCreate
        lifecycleScope.launch {
            while (isActive) {
                checkMessages(routeId)
                delay(5000)
            }
        }
    }

    private fun checkMessages(routeId: String, forceRefresh: Boolean = false) {
        lifecycleScope.launch {
             try {
                 val response = RetrofitClient.apiService.getMessages("eq.$routeId", "created_at.asc")
                 if (response.isSuccessful) {
                     val msgs = response.body() ?: emptyList()
                     if (msgs.size > lastMessageCount) {
                          if (lastMessageCount > 0) {
                              // Logic: If chat is closed, show System Notification (plays its own sound).
                              // If chat is open, just play a sound.
                              val last = msgs.lastOrNull()
                              if (last != null && last.sender_type != "driver") {
                                  if (chatDialog?.isShowing != true) {
                                      val msgPreview = last.message ?: "Nova mensagem"
                                      showNotification(msgs.size - lastMessageCount, msgPreview)
                                      
                                      // Mostrar Prévia na Tela (Toast)
                                      runOnUiThread {
                                          android.widget.Toast.makeText(this@RouteDetailActivity, "Mensagem da Central:\n$msgPreview", android.widget.Toast.LENGTH_LONG).show()
                                      }
                                  } else {
                                      playNotificationSound()
                                  }
                              }
                              
                              chatBadge?.visibility = View.VISIBLE
                              chatBadge?.text = "${msgs.size - lastMessageCount}"
                          }
                          lastMessageCount = msgs.size
                         if (chatDialog?.isShowing == true) {
                             refreshChatList(msgs) 
                         }
                     } else if (forceRefresh && chatDialog?.isShowing == true) {
                         // Force update (e.g. opening dialog)
                         lastMessageCount = msgs.size // Sync count
                         refreshChatList(msgs)
                     }
                 }
             } catch (e: Exception) { e.printStackTrace() }
        }
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Mensagens do Operador"
            val descriptionText = "Notificações de novas mensagens com som"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel("DriverChatChannel", name, importance).apply {
                description = descriptionText
                setShowBadge(true)
                enableVibration(true)
            }
            val notificationManager: NotificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun showNotification(newCount: Int, lastMsg: String) {
        // 1. Update Badge on Icon (Robust)
        try { ShortcutBadger.applyCount(applicationContext, newCount) } catch(e:Exception){ e.printStackTrace() }

        // 2. Show Notification
        try {
            val intent = Intent(this, RouteDetailActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("ROUTE_ID", currentRouteId)
            }
            val pendingIntent: PendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

            // Base Builder with App Logo (Monochrome)
            val builder = NotificationCompat.Builder(this, "DriverChatChannel")
                .setSmallIcon(R.drawable.ic_app_logo_mono)
                .setContentTitle(if(newCount > 1) "$newCount Novas Mensagens" else "Nova Mensagem")
                .setContentText(lastMsg)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setNumber(newCount) 
                .setBadgeIconType(NotificationCompat.BADGE_ICON_LARGE)
                .setDefaults(NotificationCompat.DEFAULT_ALL)

            // Try to set Large Icon (Logo) Safely
            try {
                 val rawBitmap = android.graphics.BitmapFactory.decodeResource(resources, R.drawable.app_logo)
                 if (rawBitmap != null) {
                     val largeIcon = android.graphics.Bitmap.createScaledBitmap(rawBitmap, 128, 128, false)
                     builder.setLargeIcon(largeIcon)
                 }
            } catch (e: Exception) {
                 e.printStackTrace()
                 // Continue without large icon
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(1001, builder.build())
            
        } catch (e: Exception) { 
            e.printStackTrace()
        }
    }

    private fun playNotificationSound() {
        try {
            val notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val r = RingtoneManager.getRingtone(applicationContext, notification)
            r.play()
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun showChatDialogOld(routeId: String) {
        chatBadge?.visibility = View.GONE
        ShortcutBadger.removeCount(applicationContext) // Clear Badge
        
        chatDialog = Dialog(this)
        chatDialog?.requestWindowFeature(Window.FEATURE_NO_TITLE)
        chatDialog?.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        
        val container = LinearLayout(this)
        container.orientation = LinearLayout.VERTICAL
        // Rounded corners (24dp) + Primary Blue Border (2dp)
        container.background = createBg(Color.parseColor("#F8FAFC"), dp(24), AppColors.primary(this), dp(2))
        
        // --- HEADER PREMIUM ---
        val header = LinearLayout(this)
        header.orientation = LinearLayout.HORIZONTAL
        header.setPadding(dp(20), dp(16), dp(20), dp(16))
        header.gravity = Gravity.CENTER_VERTICAL
        
        val headerTextLayout = LinearLayout(this)
        headerTextLayout.orientation = LinearLayout.VERTICAL
        headerTextLayout.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        
        // Icon
        val headerIcon = ImageView(this)
        try { headerIcon.setImageResource(R.mipmap.ic_launcher_round) } 
        catch(e:Exception) { 
            try { headerIcon.setImageResource(R.mipmap.ic_launcher) } 
            catch(e2:Exception) { headerIcon.setImageResource(R.drawable.app_logo) }
        }
        val iconParams = LinearLayout.LayoutParams(dp(40), dp(40))
        iconParams.rightMargin = dp(12)
        headerIcon.layoutParams = iconParams
        header.addView(headerIcon, 0) // Add at index 0
        
        val title = TextView(this)
        title.text = "Chat com Base"
        title.textSize = 16f
        title.setTextColor(Color.parseColor("#0F172A")) // Slate 900
        title.setTypeface(null, android.graphics.Typeface.BOLD)
        
        val subtitle = TextView(this)
        subtitle.text = "Canal direto com a central"
        subtitle.textSize = 12f
        subtitle.setTextColor(Color.parseColor("#64748B")) // Slate 500
        
        headerTextLayout.addView(title)
        headerTextLayout.addView(subtitle)
        header.addView(headerTextLayout)
        
        // Close Button (Rounded Gray)
        val closeBtn = FrameLayout(this)
        closeBtn.layoutParams = LinearLayout.LayoutParams(dp(28), dp(28))
        closeBtn.background = createBg(Color.parseColor("#F1F5F9"), dp(14)) // Circle
        
        val closeIcon = ImageView(this)
        closeIcon.setImageResource(android.R.drawable.ic_menu_close_clear_cancel) // Standard clean X
        closeIcon.imageTintList = ColorStateList.valueOf(Color.parseColor("#94A3B8"))
        closeIcon.setPadding(dp(6), dp(6), dp(6), dp(6))
        closeIcon.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        
        closeBtn.addView(closeIcon)
        closeBtn.setOnClickListener { chatDialog?.dismiss() }
        header.addView(closeBtn)
        
        container.addView(header)
        
        // Divider
        val divider = View(this)
        divider.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
        divider.setBackgroundColor(Color.parseColor("#E2E8F0"))
        container.addView(divider)
        
        // --- MESSAGES LIST ---
        val scroll = ScrollView(this)
        scroll.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        chatMessagesLayout = LinearLayout(this)
        chatMessagesLayout?.orientation = LinearLayout.VERTICAL
        chatMessagesLayout?.setPadding(dp(16), dp(16), dp(16), dp(16))
        scroll.addView(chatMessagesLayout)
        container.addView(scroll)
        
        // --- INPUT AREA PREMIUM ---
        val inputArea = LinearLayout(this)
        inputArea.orientation = LinearLayout.HORIZONTAL
        inputArea.setPadding(dp(16), dp(12), dp(16), dp(16))
        
        val inputBg = GradientDrawable()
        inputBg.setColor(Color.WHITE)
        val r = dp(24).toFloat()
        inputBg.cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, r, r, r, r)
        inputArea.background = inputBg
        
        inputArea.gravity = Gravity.CENTER_VERTICAL
        inputArea.elevation = dp(4).toFloat() // Subtle shadow for input area
        
        // Input Container (Rounded Gray)
        val inputContainer = LinearLayout(this)
        inputContainer.orientation = LinearLayout.HORIZONTAL
        inputContainer.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        inputContainer.background = createBg(Color.parseColor("#F1F5F9"), dp(24)) // Pill shape
        inputContainer.gravity = Gravity.CENTER_VERTICAL
        inputContainer.setPadding(dp(16), dp(2), dp(8), dp(2))
        
        val input = EditText(this)
        input.hint = "Digite sua mensagem..."
        input.background = null // Remove default line
        input.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        input.setPadding(0, dp(10), 0, dp(10))
        input.textSize = 14f
        input.setTextColor(Color.parseColor("#334155"))
        input.setHintTextColor(Color.parseColor("#94A3B8"))
        inputContainer.addView(input)
        
        // Send Button within Input Container (or separate? Web has it inside or next)
        // Let's keep separate for clear hit area but styled
        
        inputArea.addView(inputContainer)
        
        // Send Button (Blue Circle)
        val sendBtn = FrameLayout(this)
        val sp = LinearLayout.LayoutParams(dp(40), dp(40))
        sp.leftMargin = dp(8)
        sendBtn.layoutParams = sp
        sendBtn.background = createBg(AppColors.primary(this), dp(20))
        
        val sendIcon = ImageView(this)
        sendIcon.setImageResource(android.R.drawable.ic_menu_send) // Standard Send
        sendIcon.imageTintList = ColorStateList.valueOf(Color.WHITE)
        sendIcon.setPadding(dp(10), dp(10), dp(10), dp(10))
        sendIcon.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        sendIcon.rotation = -45f // Adjust standard icon if needed, or leave as is
        
        sendBtn.addView(sendIcon)
        sendBtn.setOnClickListener {
            val txt = input.text.toString().trim()
            if (txt.isNotEmpty()) {
                input.setText("")
                lifecycleScope.launch {
                    val body = mapOf("route_id" to routeId, "sender_type" to "driver", "message" to txt)
                    RetrofitClient.apiService.sendMessage(body)
                    checkMessages(routeId, true) 
                }
            }
        }
        
        inputArea.addView(sendBtn)
        container.addView(inputArea)
        
        // Increased size: Width 90% of screen, Height considerably larger
        val displayMetrics = resources.displayMetrics
        val width = (displayMetrics.widthPixels * 0.95).toInt()
        val height = (displayMetrics.heightPixels * 0.85).toInt()
        chatDialog?.setContentView(container, ViewGroup.LayoutParams(width, height))
        chatDialog?.show()
        
        checkMessages(routeId, true) // Force Load
    }

    private fun refreshChatList(msgs: List<ChatMessage>) {
        chatMessagesLayout?.removeAllViews()
        var lastSender = ""
        
        msgs.forEachIndexed { index, msg ->
            val isMe = msg.sender_type == "driver"
            val showAvatar = !isMe && (index == 0 || msgs[index-1].sender_type == "driver") 
            // Better logic: Always show avatar for Base? Or grouped? 
            // User asked for "icone da central". Let's show it for every message from base or group appropriately.
            // Existing logic showed it for every message. Let's keep it simple: Show for every message from Base.
            
            val row = LinearLayout(this)
            row.orientation = LinearLayout.HORIZONTAL
            row.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            row.gravity = if (isMe) Gravity.END else Gravity.START
            row.setPadding(0, dp(4), 0, dp(4)) // Spacing between messages

            // -- AVATAR LOGIC (Left) for Base --
            if (!isMe) {
                 // We always show the container for alignment, but maybe invisible if grouped?
                 // For now, consistent icon is better for "Central" feel.
                 row.addView(createAvatarView(false))
            }

            // -- BUBBLE LOGIC --
            val bubbleLayout = LinearLayout(this)
            bubbleLayout.orientation = LinearLayout.VERTICAL
            val bubbleParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            bubbleParams.weight = 0f
            
            // Adjust margins relative to avatar
            if (!isMe) bubbleParams.leftMargin = dp(8) 
            // For user, just a small margin from right screen edge
            else bubbleParams.rightMargin = dp(8)
            
            bubbleLayout.layoutParams = bubbleParams
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                bubbleLayout.elevation = dp(1).toFloat()
            }
            
            val bg = if (isMe) createBg(AppColors.primary(this), dp(20)) 
                     else createBg(Color.WHITE, dp(20)) 
            bubbleLayout.background = bg
            bubbleLayout.setPadding(dp(12), dp(8), dp(12), dp(8)) 
            
            // Text
            val text = TextView(this)
            text.text = msg.message
            text.textSize = 15f 
            text.setTextColor(if (isMe) Color.WHITE else Color.parseColor("#1E293B"))
            text.maxWidth = dp(260)
            bubbleLayout.addView(text)
            
            // Timestamp
            val time = TextView(this)
            var timeStr = ""
            try { if (msg.created_at.length >= 16) timeStr = msg.created_at.substring(11, 16) } catch (e: Exception) {}
            time.text = timeStr
            time.textSize = 10f
            time.setTextColor(if (isMe) Color.parseColor("#DBEAFE") else Color.parseColor("#94A3B8"))
            time.gravity = Gravity.END
            time.setPadding(0, dp(2), 0, 0)
            bubbleLayout.addView(time)

            // Long Click also works
            bubbleLayout.setOnLongClickListener {
                deleteMessageConfirmation(msg.id)
                true
            }

            row.addView(bubbleLayout)
             
            chatMessagesLayout?.addView(row)
        }
        chatMessagesLayout?.post { 
             (chatMessagesLayout?.parent as? ScrollView)?.fullScroll(View.FOCUS_DOWN)
        }
    }

    private fun createAvatarView(isMe: Boolean): View {
         val iv = ShapeableImageView(this)
         iv.shapeAppearanceModel = ShapeAppearanceModel.builder().setAllCornerSizes(ShapeAppearanceModel.PILL).build()
         val params = LinearLayout.LayoutParams(dp(32), dp(32))
         params.gravity = Gravity.BOTTOM
         if(isMe) params.leftMargin = dp(8) else params.rightMargin = dp(8)
         iv.layoutParams = params
         iv.scaleType = ImageView.ScaleType.CENTER_CROP
         
         if (isMe) {
             val photoUrl = lastRouteData?.driver?.photo_url
             if (!photoUrl.isNullOrEmpty()) {
                 Picasso.get().load(photoUrl).placeholder(R.drawable.ic_truck).error(R.drawable.ic_truck).into(iv)
             } else {
                 iv.setImageResource(R.drawable.ic_truck)
                 iv.setBackgroundColor(Color.parseColor("#059669"))
                 val p = dp(6)
                 iv.setPadding(p,p,p,p)
             }
         } else {
             // Base / Admin - Use App Icon (Launcher)
             try {
                iv.setImageResource(R.mipmap.ic_launcher_round)
             } catch(e:Exception) {
                try { iv.setImageResource(R.mipmap.ic_launcher) }
                catch(e2:Exception) { iv.setImageResource(R.drawable.app_logo) }
             }
         }
         return iv
    }

    private fun deleteMessageConfirmation(msgId: String) {
        val builder = AlertDialog.Builder(this)
        builder.setTitle("Excluir mensagem")
        builder.setMessage("Deseja apagar esta mensagem?")
        builder.setPositiveButton("Sim") { _, _ ->
            lifecycleScope.launch {
                try {
                    val q = "eq.$msgId"
                    RetrofitClient.apiService.deleteMessage(q)
                    if (currentRouteId != null) checkMessages(currentRouteId!!, true) // Force update on delete
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        builder.setNegativeButton("Não", null)
        builder.show()
    }

    // Métodos públicos para serem chamados pelo Bottom Navigation
    fun openChatDialog() {
        currentRouteId?.let { routeId ->
            showChatDialog(routeId)
        } ?: run {
            android.widget.Toast.makeText(this, "Rota não encontrada", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    private fun showChatDialog(routeId: String) {
        chatBadge?.visibility = View.GONE
        ShortcutBadger.removeCount(applicationContext)

        chatDialog = Dialog(this)
        chatDialog?.requestWindowFeature(Window.FEATURE_NO_TITLE)
        chatDialog?.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))

        val container = LinearLayout(this)
        container.orientation = LinearLayout.VERTICAL
        container.background = createBg(Color.parseColor("#F8FAFC"), dp(24), AppColors.primary(this), dp(2))

        // HEADER
        val header = LinearLayout(this)
        header.orientation = LinearLayout.HORIZONTAL
        header.setPadding(dp(20), dp(16), dp(20), dp(16))
        header.gravity = Gravity.CENTER_VERTICAL

        // Icone da Central
        val headerIcon = ImageView(this)
        try {
            headerIcon.setImageResource(R.drawable.app_logo)
        } catch (e: Exception) {
            headerIcon.setImageResource(R.drawable.ic_truck)
        }
        val headerIconParams = LinearLayout.LayoutParams(dp(36), dp(36))
        headerIconParams.rightMargin = dp(12)
        headerIcon.layoutParams = headerIconParams
        header.addView(headerIcon)

        val headerTextLayout = LinearLayout(this)
        headerTextLayout.orientation = LinearLayout.VERTICAL

        val title = TextView(this)
        title.text = "Chat com Base"
        title.textSize = 18f
        title.setTypeface(null, android.graphics.Typeface.BOLD)
        title.setTextColor(Color.parseColor("#1E293B"))

        val subtitle = TextView(this)
        subtitle.text = "Mensagens em tempo real"
        subtitle.textSize = 12f
        subtitle.setTextColor(Color.parseColor("#64748B"))

        headerTextLayout.addView(title)
        headerTextLayout.addView(subtitle)
        header.addView(headerTextLayout)

        val spacer = View(this)
        spacer.layoutParams = LinearLayout.LayoutParams(0, 0, 1f)
        header.addView(spacer)

        val closeBtn = FrameLayout(this)
        closeBtn.layoutParams = LinearLayout.LayoutParams(dp(28), dp(28))
        closeBtn.background = createBg(Color.parseColor("#F1F5F9"), dp(14))

        val closeIcon = ImageView(this)
        closeIcon.setImageResource(R.drawable.ic_close)
        closeIcon.imageTintList = ColorStateList.valueOf(Color.parseColor("#94A3B8"))
        closeIcon.setPadding(dp(6), dp(6), dp(6), dp(6))
        closeIcon.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)

        closeBtn.addView(closeIcon)
        closeBtn.setOnClickListener { chatDialog?.dismiss() }
        header.addView(closeBtn)

        container.addView(header)

        // Divider
        val divider = View(this)
        divider.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
        divider.setBackgroundColor(Color.parseColor("#E2E8F0"))
        container.addView(divider)

        // MESSAGES LIST
        val scroll = ScrollView(this)
        scroll.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        chatMessagesLayout = LinearLayout(this)
        chatMessagesLayout?.orientation = LinearLayout.VERTICAL
        chatMessagesLayout?.setPadding(dp(16), dp(16), dp(16), dp(16))
        scroll.addView(chatMessagesLayout)
        container.addView(scroll)

        // INPUT AREA
        val inputArea = LinearLayout(this)
        inputArea.orientation = LinearLayout.HORIZONTAL
        inputArea.setPadding(dp(16), dp(12), dp(16), dp(16))
        inputArea.setBackgroundColor(Color.WHITE)
        inputArea.gravity = Gravity.CENTER_VERTICAL
        inputArea.elevation = dp(4).toFloat()

        val inputContainer = LinearLayout(this)
        inputContainer.orientation = LinearLayout.HORIZONTAL
        inputContainer.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        inputContainer.background = createBg(Color.parseColor("#F1F5F9"), dp(24))
        inputContainer.gravity = Gravity.CENTER_VERTICAL
        inputContainer.setPadding(dp(16), dp(2), dp(8), dp(2))

        val input = EditText(this)
        input.hint = "Digite sua mensagem..."
        input.background = null
        input.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        input.setPadding(0, dp(10), 0, dp(10))
        input.textSize = 14f
        input.setTextColor(Color.parseColor("#334155"))
        input.setHintTextColor(Color.parseColor("#94A3B8"))
        inputContainer.addView(input)

        inputArea.addView(inputContainer)

        // Send Button
        val sendBtn = FrameLayout(this)
        val sp = LinearLayout.LayoutParams(dp(40), dp(40))
        sp.leftMargin = dp(8)
        sendBtn.layoutParams = sp
        sendBtn.background = createBg(AppColors.primary(this), dp(20))

        val sendIcon = ImageView(this)
        sendIcon.setImageResource(R.drawable.ic_send_nav)
        sendIcon.imageTintList = ColorStateList.valueOf(Color.WHITE)
        sendIcon.setPadding(dp(10), dp(10), dp(10), dp(10))
        sendIcon.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)

        sendBtn.addView(sendIcon)
        sendBtn.setOnClickListener {
            val txt = input.text.toString().trim()
            if (txt.isNotEmpty()) {
                input.setText("")
                lifecycleScope.launch {
                    val body = mapOf("route_id" to routeId, "sender_type" to "driver", "message" to txt)
                    RetrofitClient.apiService.sendMessage(body)
                    checkMessages(routeId, true)
                }
            }
        }

        inputArea.addView(sendBtn)
        container.addView(inputArea)

        val displayMetrics = resources.displayMetrics
        val width = (displayMetrics.widthPixels * 0.95).toInt()
        val height = (displayMetrics.heightPixels * 0.85).toInt()
        chatDialog?.setContentView(container, ViewGroup.LayoutParams(width, height))
        chatDialog?.show()

        checkMessages(routeId, true)
    }

    fun startVoiceCall() {
        currentRouteId?.let { routeId ->
            try {
                val intent = Intent(this, VoiceCallActivity::class.java)
                intent.putExtra("ROUTE_ID", routeId)
                intent.putExtra("AUTO_START", true) // Inicia a chamada automaticamente
                startActivity(intent)
            } catch (e: Exception) {
                android.widget.Toast.makeText(this, "Erro ao iniciar chamada: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            }
        } ?: run {
            android.widget.Toast.makeText(this, "Rota não encontrada", android.widget.Toast.LENGTH_SHORT).show()
        }
    }
}
