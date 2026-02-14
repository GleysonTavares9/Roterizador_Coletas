package com.roterizacao.driver

import android.content.Intent
import android.os.Bundle
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.bottomnavigation.BottomNavigationView

abstract class BaseActivity : AppCompatActivity() {

    private lateinit var bottomNavigation: BottomNavigationView

    override fun setContentView(layoutResID: Int) {
        super.setContentView(R.layout.activity_base)
        
        val contentContainer = findViewById<ViewGroup>(R.id.content_container)
        layoutInflater.inflate(layoutResID, contentContainer, true)
        
        setupBottomNavigation()
    }

    override fun setContentView(view: android.view.View) {
        super.setContentView(R.layout.activity_base)
        
        val contentContainer = findViewById<ViewGroup>(R.id.content_container)
        contentContainer.addView(view)
        
        setupBottomNavigation()
    }

    private fun setupBottomNavigation() {
        bottomNavigation = findViewById(R.id.bottom_navigation)

        // Adjust padding for Gesture Navigation
        ViewCompat.setOnApplyWindowInsetsListener(bottomNavigation) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(v.paddingLeft, v.paddingTop, v.paddingRight, bars.bottom)
            insets
        }
        
        // Marca o item atual baseado na Activity
        bottomNavigation.selectedItemId = getSelectedNavigationItemId()
        
        bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.navigation_home -> {
                    if (this !is RouteListActivity) {
                        startActivity(Intent(this, RouteListActivity::class.java))
                        finish()
                    }
                    true
                }
                R.id.navigation_chat -> {
                    // Se estiver em RouteDetailActivity, abre o chat
                    if (this is RouteDetailActivity) {
                        // Chama método para abrir chat (será implementado na RouteDetailActivity)
                        try {
                            val method = this::class.java.getDeclaredMethod("openChatDialog")
                            method.isAccessible = true
                            method.invoke(this)
                        } catch (e: Exception) {
                            android.widget.Toast.makeText(this, "Chat disponível apenas durante execução de rota", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        android.widget.Toast.makeText(this, "Chat disponível apenas durante execução de rota", android.widget.Toast.LENGTH_SHORT).show()
                    }
                    true
                }
                R.id.navigation_call -> {
                    // Se estiver em RouteDetailActivity, abre chamada
                    if (this is RouteDetailActivity) {
                        try {
                            val method = this::class.java.getDeclaredMethod("startVoiceCall")
                            method.isAccessible = true
                            method.invoke(this)
                        } catch (e: Exception) {
                            android.widget.Toast.makeText(this, "Chamada disponível apenas durante execução de rota", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        android.widget.Toast.makeText(this, "Chamada disponível apenas durante execução de rota", android.widget.Toast.LENGTH_SHORT).show()
                    }
                    true
                }
                R.id.navigation_refresh -> {
                    // Recarrega a tela atual
                    recreate()
                    true
                }
                else -> false
            }
        }
    }

    // Cada Activity deve sobrescrever este método para indicar qual item deve estar selecionado
    protected open fun getSelectedNavigationItemId(): Int {
        return R.id.navigation_home
    }
}
