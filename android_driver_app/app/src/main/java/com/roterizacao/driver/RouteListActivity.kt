package com.roterizacao.driver

import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import com.roterizacao.driver.utils.AppColors
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.view.ViewGroup
import androidx.cardview.widget.CardView
import com.squareup.picasso.Picasso
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.roterizacao.driver.data.api.RetrofitClient
import com.roterizacao.driver.data.models.Route
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale

class RouteListActivity : BaseActivity() {

    private var allRoutes: List<Route> = emptyList()
    private var uniqueDates: List<String> = emptyList()
    private var selectedDate: String? = null
    private var driverName: String = "Motorista"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val prefs = getSharedPreferences("driver_prefs", Context.MODE_PRIVATE)
        driverName = prefs.getString("DRIVER_NAME", "Motorista") ?: "Motorista"

        fetchData()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun fetchData() {
        lifecycleScope.launch {
            try {
                val prefs = getSharedPreferences("driver_prefs", Context.MODE_PRIVATE)
                val driverId = prefs.getString("DRIVER_ID", null)
                
                if (driverId == null) {
                    showError("Erro: Motorista não identificado")
                    return@launch
                }
                
                val response = RetrofitClient.apiService.getRoutes("eq.$driverId")
                if (response.isSuccessful) {
                    allRoutes = response.body() ?: emptyList()
                    val dates = allRoutes.mapNotNull { it.route_date }.distinct().sorted().reversed()
                    uniqueDates = if (dates.isNotEmpty()) dates else listOf() 
                    render()
                } else {
                    showError("Erro: ${response.code()}")
                }
            } catch (e: Exception) {
                showError("Erro de conexão: ${e.message}")
            }
        }
    }

    private fun showError(msg: String) {
        val root = LinearLayout(this)
        root.gravity = Gravity.CENTER
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(Color.WHITE)
        val t = TextView(this); t.text=msg; t.setTextColor(Color.RED); root.addView(t)
        val b = android.widget.Button(this); b.text="Tentar"; b.setOnClickListener{fetchData()}; root.addView(b)
        setContentView(root)
    }

    private fun render() {
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(androidx.core.content.ContextCompat.getColor(this, R.color.surface))

        // 1. TOP HEADER (Blue)
        val header = LinearLayout(this)
        header.orientation = LinearLayout.HORIZONTAL
        header.setBackgroundColor(androidx.core.content.ContextCompat.getColor(this, R.color.primary))
        header.setPadding(dp(20), dp(20), dp(20), dp(20))
        header.gravity = Gravity.CENTER_VERTICAL
        
        // Apply Status Bar Insets
        ViewCompat.setOnApplyWindowInsetsListener(header) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(dp(20), dp(20) + bars.top, dp(20), dp(20))
            insets
        }
        
        // Apply Status Bar Insets
        ViewCompat.setOnApplyWindowInsetsListener(header) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(dp(20), dp(20) + bars.top, dp(20), dp(20))
            insets
        }
        
        // Avatar
        val avatarContainer = CardView(this)
        avatarContainer.radius = dp(32).toFloat()
        avatarContainer.cardElevation = 0f
        avatarContainer.setCardBackgroundColor(AppColors.accentLight(this))
        val avParams = LinearLayout.LayoutParams(dp(64), dp(64))
        avParams.rightMargin = dp(16)
        avatarContainer.layoutParams = avParams

        val prefs = getSharedPreferences("driver_prefs", Context.MODE_PRIVATE)
        val photoUrl = prefs.getString("DRIVER_PHOTO", null)

        if (!photoUrl.isNullOrEmpty()) {
            val iv = ImageView(this)
            iv.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            iv.scaleType = ImageView.ScaleType.CENTER_CROP
            Picasso.get().load(photoUrl).noFade().into(iv)
            avatarContainer.addView(iv)
        } else {
            val avatar = TextView(this)
            avatar.text = driverName.firstOrNull()?.toString()?.uppercase() ?: "M"
            avatar.textSize = 24f
            avatar.setTextColor(Color.WHITE)
            avatar.setTypeface(null, android.graphics.Typeface.BOLD)
            avatar.gravity = Gravity.CENTER
            avatar.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            avatarContainer.addView(avatar)
        }
        
        header.addView(avatarContainer)
        
        // Texts
        val txtCol = LinearLayout(this)
        txtCol.orientation = LinearLayout.VERTICAL
        val t1 = TextView(this); t1.text = "Seja bem vindo(a),"; t1.setTextColor(AppColors.whiteAlpha(220)); t1.textSize = 14f
        val t2 = TextView(this); t2.text = driverName.split(" ").firstOrNull()?.uppercase() ?: "MOTORISTA"; t2.setTextColor(Color.WHITE); t2.textSize = 24f; t2.setTypeface(null, android.graphics.Typeface.BOLD)
        txtCol.addView(t1); txtCol.addView(t2)
        header.addView(txtCol)
        
        val spacer = View(this); spacer.layoutParams = LinearLayout.LayoutParams(0, 0, 1f); header.addView(spacer)
        
        val logoutBtn = ImageView(this)
        logoutBtn.setImageResource(R.drawable.ic_logout)
        logoutBtn.imageTintList = ColorStateList.valueOf(Color.WHITE)
        logoutBtn.layoutParams = LinearLayout.LayoutParams(dp(28), dp(28))
        logoutBtn.setOnClickListener { 
            getSharedPreferences("driver_prefs", Context.MODE_PRIVATE).edit().clear().apply()
            val i = Intent(this, LoginActivity::class.java); i.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK; startActivity(i)
        }
        header.addView(logoutBtn)
        
        root.addView(header)

        // 2. CONTENT
        val contentScroll = ScrollView(this)
        val scrollParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        contentScroll.layoutParams = scrollParams
        
        val content = LinearLayout(this)
        content.orientation = LinearLayout.VERTICAL
        content.setPadding(dp(16), dp(16), dp(16), dp(24))
        contentScroll.addView(content)
        
        if (selectedDate == null) {
            // SELECT DATE
            val title = TextView(this)
            title.text = "SELECIONE UMA DATA"
            title.textSize = 14f
            title.setTextColor(AppColors.textSecondary(this))
            title.setTypeface(null, android.graphics.Typeface.BOLD)
            title.setPadding(0, 0, 0, dp(16))
            content.addView(title)
            
            if (uniqueDates.isEmpty()) {
                val empty = TextView(this); empty.text = "Nenhuma rota encontrada."; empty.gravity = Gravity.CENTER; empty.setPadding(0,dp(40),0,0); content.addView(empty)
            } else {
                uniqueDates.forEach { addDateCard(content, it) }
            }
        } else {
            // SELECT ROUTE
            val headerRow = LinearLayout(this)
            headerRow.orientation = LinearLayout.HORIZONTAL
            headerRow.gravity = Gravity.CENTER_VERTICAL
            headerRow.setPadding(0, 0, 0, dp(16))
            
            val ht = TextView(this)
            ht.text = "Rotas de ${formatDate(selectedDate!!)}"
            ht.textSize = 20f
            ht.setTextColor(AppColors.textPrimary(this))
            ht.setTypeface(null, android.graphics.Typeface.BOLD)
            headerRow.addView(ht)
            
            content.addView(headerRow)
            
            val dayRoutes = allRoutes.filter { it.route_date == selectedDate }
            dayRoutes.forEach { addRouteCard(content, it) }
        }
        root.addView(contentScroll)
        
        setContentView(root)
    }

    private fun addDateCard(container: LinearLayout, date: String) {
        // ... (Same as before, minimal changes if any needed)
        val card = LinearLayout(this)
        card.orientation = LinearLayout.HORIZONTAL
        card.background = createBg(Color.WHITE, dp(8))
        card.elevation = dp(2).toFloat()
        val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        params.bottomMargin = dp(16)
        card.layoutParams = params
        card.setPadding(dp(16), dp(24), dp(16), dp(24))
        card.gravity = Gravity.CENTER_VERTICAL
        card.setOnClickListener { selectedDate = date; render() }
        
        val iconContainer = LinearLayout(this)
        iconContainer.gravity = Gravity.CENTER
        iconContainer.background = createBg(AppColors.whiteAlpha(25), dp(25))
        val icp = LinearLayout.LayoutParams(dp(50), dp(50)); icp.rightMargin=dp(16); iconContainer.layoutParams = icp
        val iv = ImageView(this); iv.setImageResource(R.drawable.ic_calendar); iv.imageTintList = ColorStateList.valueOf(AppColors.primary(this)); iv.layoutParams = LinearLayout.LayoutParams(dp(24), dp(24))
        iconContainer.addView(iv)
        card.addView(iconContainer)
        
        val texts = LinearLayout(this); texts.orientation = LinearLayout.VERTICAL; texts.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        val dText = TextView(this); dText.text = formatDate(date); dText.textSize = 18f; dText.setTypeface(null, android.graphics.Typeface.BOLD); dText.setTextColor(AppColors.textPrimary(this))
        val sub = TextView(this); sub.text = "Toque para ver rotas"; sub.textSize = 13f; sub.setTextColor(AppColors.textSecondary(this))
        texts.addView(dText); texts.addView(sub); card.addView(texts)
        
        val chev = ImageView(this); chev.setImageResource(R.drawable.ic_chevron_right); chev.imageTintList = ColorStateList.valueOf(AppColors.gray(this)); chev.layoutParams = LinearLayout.LayoutParams(dp(20), dp(20)); card.addView(chev)
        container.addView(card)
    }

    private fun addRouteCard(container: LinearLayout, route: Route) {
        val card = LinearLayout(this)
        card.orientation = LinearLayout.VERTICAL
        val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        params.bottomMargin = dp(24)
        card.layoutParams = params
        card.elevation = dp(4).toFloat()
        
        val wrapper = android.widget.FrameLayout(this)
        wrapper.background = createBg(Color.WHITE, dp(12))
        wrapper.elevation = dp(4).toFloat()
        wrapper.layoutParams = params
        wrapper.clipToOutline = true
        
        val inner = LinearLayout(this)
        inner.orientation = LinearLayout.VERTICAL
        
        // BLUE HEADER
        val blue = LinearLayout(this)
        blue.orientation = LinearLayout.VERTICAL
        blue.setBackgroundColor(androidx.core.content.ContextCompat.getColor(this, R.color.primary_dark))
        blue.setPadding(dp(24), dp(24), dp(24), dp(24))
        
        // Row 1: Truck + Plate + Badge
        val r1 = LinearLayout(this); r1.orientation=LinearLayout.HORIZONTAL; r1.gravity=Gravity.CENTER_VERTICAL
        val trk = ImageView(this); trk.setImageResource(R.drawable.ic_truck); trk.imageTintList=ColorStateList.valueOf(Color.WHITE); 
        val tp=LinearLayout.LayoutParams(dp(28),dp(28)); tp.rightMargin=dp(12); trk.layoutParams=tp
        val plate = TextView(this); plate.text=route.vehicle_plate ?: "SEM PLACA"; plate.textSize=22f; plate.setTextColor(Color.WHITE); plate.setTypeface(null, android.graphics.Typeface.BOLD)
        r1.addView(trk); r1.addView(plate);
        
        val sp = View(this); sp.layoutParams=LinearLayout.LayoutParams(0,0,1f); r1.addView(sp)
        
        val badge = TextView(this)
        val st = route.status ?: "planned"
        when (st) {
            "completed" -> {
                badge.text = "CONCLUÍDA"
                badge.background = createBg(AppColors.success(this), dp(4))
                badge.setTextColor(Color.WHITE)
            }
            "in_progress" -> {
                badge.text = "EM EXECUÇÃO"
                badge.background = createBg(AppColors.info(this), dp(4))
                badge.setTextColor(Color.WHITE)
                // Add blink animation
                val blinkAnim = android.view.animation.AnimationUtils.loadAnimation(this, R.anim.blink_animation)
                badge.startAnimation(blinkAnim)
            }
            "planned" -> {
                badge.text = "CRIADA"
                badge.background = createBg(Color.parseColor("#818CF8"), dp(4)) // Indigo 400
                badge.setTextColor(Color.WHITE)
            }
            else -> {
                badge.text = "PENDENTE"
                badge.background = createBg(AppColors.gray(this), dp(4))
                badge.setTextColor(Color.WHITE)
            }
        }
        badge.textSize = 11f
        badge.setTypeface(null, android.graphics.Typeface.BOLD)
        badge.setPadding(dp(12), dp(6), dp(12), dp(6))
        r1.addView(badge)
        blue.addView(r1)
        
        // Driver Name
        val motLabel = TextView(this); motLabel.text="Motorista: $driverName"; motLabel.setTextColor(Color.WHITE); motLabel.textSize=14f; motLabel.setTypeface(null, android.graphics.Typeface.BOLD)
        val mp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        mp.topMargin = dp(8)
        mp.leftMargin = dp(40) // Align with text start of plate approx
        motLabel.layoutParams = mp
        blue.addView(motLabel)
        
        // STATS GRID
        val grid = LinearLayout(this)
        grid.orientation = LinearLayout.HORIZONTAL
        grid.background = createBg(AppColors.whiteAlpha(26), dp(8), AppColors.whiteAlpha(51), dp(1))
        grid.setPadding(0, dp(16), 0, dp(16))
        val gp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        gp.topMargin = dp(24)
        grid.layoutParams = gp
        
        val pts = route.route_points?.size ?: route.total_points ?: 0
        val dist = route.total_distance_km ?: 0
        val time = route.total_time ?: 0
        val w = route.total_weight ?: 0
        
        addStat(grid, R.drawable.ic_map_pin, "PTS", "$pts", false) // First: no divider left
        addStat(grid, R.drawable.ic_navigation, "DIST", "$dist", true, "km")
        addStat(grid, R.drawable.ic_clock, "TEMPO", "${time/60}h${time%60}", true)
        addStat(grid, R.drawable.ic_scale, "CARGA", "${w.toInt()}", true, "kg")
        
        blue.addView(grid)
        inner.addView(blue)
        
        // FOOTER
        val foot = LinearLayout(this)
        foot.orientation = LinearLayout.HORIZONTAL
        foot.setBackgroundColor(Color.WHITE)
        foot.setPadding(dp(24), dp(20), dp(24), dp(20))
        foot.gravity = Gravity.CENTER_VERTICAL
        val call = TextView(this); call.text="ACESSAR ROTA"; call.textSize=13f; call.setTypeface(null, android.graphics.Typeface.BOLD); call.setTextColor(Color.GRAY); call.letterSpacing = 0.1f
        val sp2 = View(this); sp2.layoutParams=LinearLayout.LayoutParams(0,0,1f)
        val circ = LinearLayout(this); circ.gravity=Gravity.CENTER; circ.background=createBg(Color.WHITE, dp(24), Color.LTGRAY, dp(1)); val cp = LinearLayout.LayoutParams(dp(40),dp(40)); circ.layoutParams=cp
        val arr = ImageView(this); arr.setImageResource(R.drawable.ic_chevron_right); arr.imageTintList=ColorStateList.valueOf(AppColors.primary(this)); arr.layoutParams=LinearLayout.LayoutParams(dp(24),dp(24))
        circ.addView(arr)
        foot.addView(call); foot.addView(sp2); foot.addView(circ)
        inner.addView(foot)
        
        wrapper.setOnClickListener {
            val i = Intent(this, RouteDetailActivity::class.java)
            i.putExtra("ROUTE_ID", route.id)
            startActivity(i)
        }
        wrapper.addView(inner)
        container.addView(wrapper)
    }

    private fun addStat(parent: LinearLayout, iconRes: Int, label: String, value: String, divider: Boolean, unit: String = "") {
        if(divider) {
            val d = View(this)
            d.setBackgroundColor(AppColors.whiteAlpha(51))
            d.layoutParams = LinearLayout.LayoutParams(dp(1), dp(40))
            parent.addView(d)
        }
        
        val l = LinearLayout(this)
        l.orientation = LinearLayout.VERTICAL
        l.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        l.gravity = Gravity.CENTER
        
        val h = LinearLayout(this); h.orientation=LinearLayout.HORIZONTAL; h.gravity=Gravity.CENTER
        val i = ImageView(this); i.setImageResource(iconRes); i.imageTintList=ColorStateList.valueOf(AppColors.whiteAlpha(191)); i.layoutParams=LinearLayout.LayoutParams(dp(14),dp(14))
        val lb = TextView(this); lb.text=" $label"; lb.textSize=10f; lb.setTextColor(AppColors.whiteAlpha(191)); lb.setTypeface(null, android.graphics.Typeface.BOLD)
        h.addView(i); h.addView(lb); l.addView(h)
        
        val vRow = LinearLayout(this); vRow.orientation=LinearLayout.HORIZONTAL; vRow.gravity=Gravity.CENTER
        val v = TextView(this); v.text=value; v.textSize=16f; v.setTextColor(Color.WHITE); v.setTypeface(null, android.graphics.Typeface.BOLD)
        vRow.addView(v)
        if(unit.isNotEmpty()) {
             val u = TextView(this); u.text=" $unit"; u.textSize=11f; u.setTextColor(AppColors.whiteAlpha(222)); u.setTypeface(null, android.graphics.Typeface.BOLD); u.setPadding(0,dp(2),0,0)
             vRow.addView(u)
        }
        l.addView(vRow)
        parent.addView(l)
    }

    private fun formatDate(date: String): String {
        return try {
            val p = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val d = p.parse(date)
            val f = SimpleDateFormat("dd /MM/yyyy", Locale.US)
            f.format(d)
        } catch(e: Exception) { date }
    }

    private fun createBg(color: Int, radius: Int, strokeC: Int = 0, strokeW: Int = 0): GradientDrawable {
        val d = GradientDrawable()
        d.setColor(color)
        d.cornerRadius = radius.toFloat()
        if(strokeW>0) d.setStroke(strokeW, strokeC)
        return d
    }
}
