package com.roterizacao.driver

import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.roterizacao.driver.data.api.RetrofitClient
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Request location permissions
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            val permissions = arrayOf(
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                android.Manifest.permission.ACCESS_COARSE_LOCATION
            )
            
            // Check if permissions are already granted
            val needsPermission = permissions.any { 
                checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED 
            }
            
            if (needsPermission) {
                requestPermissions(permissions, 1001)
            }
        }
        
        // 1. CHECKSESSION
        val prefs = getSharedPreferences("driver_prefs", Context.MODE_PRIVATE)
        if (prefs.contains("DRIVER_ID")) {
            startActivity(Intent(this, RouteListActivity::class.java))
            finish()
            return
        }

        // 2. LAYOUT ROOT (Background Gray-Blue)
        val root = RelativeLayout(this)
        root.setBackgroundColor(Color.parseColor("#F1F5F9")) 
        root.gravity = Gravity.CENTER

        // 3. CARD CONTAINER (Content only)
        val card = LinearLayout(this)
        card.id = View.generateViewId()
        card.orientation = LinearLayout.VERTICAL
        card.background = createBg(Color.WHITE, dp(12))
        card.elevation = dp(10).toFloat()
        val cardParams = RelativeLayout.LayoutParams(dp(320), RelativeLayout.LayoutParams.WRAP_CONTENT)
        cardParams.addRule(RelativeLayout.CENTER_IN_PARENT)
        card.layoutParams = cardParams
        card.setPadding(dp(24), dp(48), dp(24), dp(32)) // Top padding increased for visual balance
        card.gravity = Gravity.CENTER_HORIZONTAL

        // Add Card to Root FIRST
        root.addView(card)

        // --- ICON (Floating Badge) ---
        val iconContainer = androidx.cardview.widget.CardView(this)
        val icLp = RelativeLayout.LayoutParams(dp(90), dp(90)) // Slightly larger for badge effect
        icLp.addRule(RelativeLayout.ALIGN_TOP, card.id)
        icLp.addRule(RelativeLayout.CENTER_HORIZONTAL)
        icLp.topMargin = -dp(45) // Half of height overlap
        iconContainer.layoutParams = icLp
        iconContainer.radius = dp(45).toFloat()
        iconContainer.cardElevation = dp(12).toFloat() // Higher elevation than card
        iconContainer.setCardBackgroundColor(Color.WHITE)

        val icon = ImageView(this)
        icon.setImageResource(R.mipmap.ic_launcher)
        icon.scaleType = ImageView.ScaleType.FIT_CENTER
        val ilp = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        icon.setPadding(0, 0, 0, 0) 
        icon.layoutParams = ilp
        iconContainer.addView(icon)
        
        // Add Icon to Root SECOND (On Top)
        root.addView(iconContainer)

        // --- TITLE ---
        val title = TextView(this)
        title.text = "Área do Motorista"
        title.textSize = 20f
        title.setTextColor(Color.parseColor("#172554")) // Blue 950
        title.setTypeface(null, android.graphics.Typeface.BOLD)
        title.gravity = Gravity.CENTER
        title.setPadding(0, dp(16), 0, 0) // Spacing from top (since icon is floating above)
        card.addView(title)

        val sub = TextView(this)
        sub.text = "Entre com seus dados para acessar suas rotas."
        sub.textSize = 12f
        sub.setTextColor(Color.parseColor("#64748B")) // Slate 500
        sub.gravity = Gravity.CENTER
        sub.setPadding(0, dp(8), 0, dp(24))
        card.addView(sub)

        // --- INPUTS ---
        
        // CPF LABEL
        card.addView(createLabel("CPF", R.drawable.ic_user))
        
        // CPF INPUT Style: White bg, Border
        val inputBg = createBg(Color.WHITE, dp(8), Color.parseColor("#334155"), dp(1))
        
        val cpfInput = EditText(this)
        cpfInput.background = inputBg
        cpfInput.setPadding(dp(16), dp(12), dp(16), dp(12))
        cpfInput.textSize = 16f
        cpfInput.inputType = InputType.TYPE_CLASS_NUMBER
        cpfInput.setTextColor(Color.BLACK)
        cpfInput.addTextChangedListener(MaskWatcher("###.###.###-##"))
        val lpInput = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48))
        lpInput.bottomMargin = dp(16)
        cpfInput.layoutParams = lpInput
        card.addView(cpfInput)

        // PASS LABEL
        card.addView(createLabel("Senha (6 primeiros dígitos)", R.drawable.ic_lock))

        // PASS INPUT
        val passInput = EditText(this)
        passInput.background = inputBg
        passInput.setPadding(dp(16), dp(12), dp(16), dp(12))
        passInput.textSize = 16f
        passInput.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        passInput.setTextColor(Color.BLACK)
        // passInput.transformationMethod = android.text.method.PasswordTransformationMethod.getInstance() // Dots styling
        passInput.layoutParams = lpInput
        card.addView(passInput)

        // --- BUTTON ---
        val btn = Button(this)
        btn.text = "Entrar na Rota"
        btn.setTextColor(Color.WHITE)
        btn.isAllCaps = false
        btn.textSize = 16f
        btn.typeface = android.graphics.Typeface.DEFAULT_BOLD
        btn.background = createBg(Color.parseColor("#172554"), dp(8)) // Blue 950
        val btnParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48))
        btnParams.topMargin = dp(24)
        btn.layoutParams = btnParams
        btn.stateListAnimator = null // Flat
        card.addView(btn)

        // --- ERR MSG ---
        val msg = TextView(this)
        msg.gravity = Gravity.CENTER
        msg.textSize = 14f
        msg.setTextColor(Color.RED)
        msg.setPadding(0, dp(16), 0, 0)
        card.addView(msg)

        setContentView(root)

        // LOGIC
        btn.setOnClickListener {
            val cpf = cpfInput.text.toString().replace(Regex("[^0-9]"), "")
            val pass = passInput.text.toString()

            msg.text = ""
            if (cpf.length != 11) { msg.text = "CPF Inválido"; return@setOnClickListener }
            if (pass.isEmpty()) { msg.text = "Digite a senha"; return@setOnClickListener }

            msg.text = "Verificando..."
            btn.isEnabled = false
            
            lifecycleScope.launch {
                try {
                    val res = RetrofitClient.apiService.getDriverByCpf("eq.$cpf")
                    if (res.isSuccessful && !res.body().isNullOrEmpty()) {
                        val driver = res.body()!![0]
                        if (driver.active != true) {
                            msg.text = "Motorista inativo."; btn.isEnabled = true
                            return@launch
                        }

                        // Validate Pass (First 6 digits of CPF or 'password' field logic)
                        // Web logic: password check (pass == cpf.substring(0,6) OR pass == driver.password)
                        val valid = pass == cpf.substring(0, 6)
                        
                        if (valid) {
                            // Save Session
                            val ed = getSharedPreferences("driver_prefs", Context.MODE_PRIVATE).edit()
                            ed.putString("DRIVER_ID", driver.id)
                            ed.putString("DRIVER_NAME", driver.name)
                            ed.putString("DRIVER_PHOTO", driver.photo_url)
                            ed.apply()
                            
                            // Start Service & Nav
                            startService(Intent(this@LoginActivity, LocationService::class.java))
                            
                            startActivity(Intent(this@LoginActivity, RouteListActivity::class.java))
                            finish()
                        } else {
                            msg.text = "Senha incorreta."; btn.isEnabled = true
                        }
                    } else {
                        msg.text = "Motorista não encontrado."; btn.isEnabled = true
                    }
                } catch (e: Exception) {
                    msg.text = "Erro: ${e.message}"; btn.isEnabled = true
                }
            }
        }
    }

    private fun createLabel(text: String, iconRes: Int): LinearLayout {
        val l = LinearLayout(this)
        l.orientation = LinearLayout.HORIZONTAL
        l.gravity = Gravity.CENTER_VERTICAL
        l.setPadding(0, 0, 0, dp(8))
        
        val iv = ImageView(this)
        iv.setImageResource(iconRes)
        iv.imageTintList = ColorStateList.valueOf(Color.parseColor("#64748B"))
        iv.layoutParams = LinearLayout.LayoutParams(dp(16), dp(16))
        
        val tv = TextView(this)
        tv.text = " $text"
        tv.textSize = 14f
        tv.setTextColor(Color.parseColor("#475569"))
        tv.setTypeface(null, android.graphics.Typeface.BOLD)
        
        l.addView(iv); l.addView(tv)
        return l
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun createBg(color: Int, radius: Int, strokeC: Int = 0, strokeW: Int = 0): GradientDrawable {
        val d = GradientDrawable()
        d.setColor(color)
        d.cornerRadius = radius.toFloat()
        if(strokeW>0) d.setStroke(strokeW, strokeC)
        return d
    }

    // --- MASK WATCHER ---
    class MaskWatcher(private val mask: String) : TextWatcher {
        private var isRunning = false
        private var isDeleting = false
        
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) { isDeleting = count > after }
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        override fun afterTextChanged(editable: Editable?) {
            if (isRunning || isDeleting) return
            isRunning = true

            val unmasked = editable.toString().replace(Regex("[^0-9]"), "")
            val sb = StringBuilder()
            var i = 0
            for (m in mask.toCharArray()) {
                if (m != '#' && i < unmasked.length) {
                    sb.append(m)
                    continue
                }
                if (i >= unmasked.length) break
                sb.append(unmasked[i])
                i++
            }
            
            editable?.replace(0, editable.length, sb.toString())
            isRunning = false
        }
    }
}
