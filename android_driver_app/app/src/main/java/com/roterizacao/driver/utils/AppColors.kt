package com.roterizacao.driver.utils

import android.content.Context
import android.graphics.Color
import androidx.core.content.ContextCompat
import com.roterizacao.driver.R

/**
 * Cores do sistema - compatível com o design web
 * Todas as cores devem usar estas constantes para manter consistência
 */
object AppColors {
    
    // Cores principais
    fun primary(context: Context) = ContextCompat.getColor(context, R.color.primary)
    fun primaryDark(context: Context) = ContextCompat.getColor(context, R.color.primary_dark)
    fun primaryLight(context: Context) = ContextCompat.getColor(context, R.color.primary_light)
    
    // Cores de acento
    fun accent(context: Context) = ContextCompat.getColor(context, R.color.accent)
    fun accentLight(context: Context) = ContextCompat.getColor(context, R.color.accent_light)
    
    // Cores de fundo
    fun background(context: Context) = ContextCompat.getColor(context, R.color.background)
    fun backgroundDark(context: Context) = ContextCompat.getColor(context, R.color.background_dark)
    fun surface(context: Context) = ContextCompat.getColor(context, R.color.surface)
    
    // Cores de texto
    fun textPrimary(context: Context) = ContextCompat.getColor(context, R.color.text_primary)
    fun textSecondary(context: Context) = ContextCompat.getColor(context, R.color.text_secondary)
    fun textOnPrimary(context: Context) = ContextCompat.getColor(context, R.color.text_on_primary)
    
    // Cores de status
    fun success(context: Context) = ContextCompat.getColor(context, R.color.success)
    fun warning(context: Context) = ContextCompat.getColor(context, R.color.warning)
    fun error(context: Context) = ContextCompat.getColor(context, R.color.error)
    fun info(context: Context) = ContextCompat.getColor(context, R.color.info)
    
    // Cores básicas
    fun white(context: Context) = ContextCompat.getColor(context, R.color.white)
    fun black(context: Context) = ContextCompat.getColor(context, R.color.black)
    fun gray(context: Context) = ContextCompat.getColor(context, R.color.gray)
    fun grayLight(context: Context) = ContextCompat.getColor(context, R.color.gray_light)
    
    // Cores com transparência (para overlays, etc)
    fun primaryAlpha(alpha: Int) = Color.argb(alpha, 0x0c, 0x37, 0x73)
    fun whiteAlpha(alpha: Int) = Color.argb(alpha, 0xFF, 0xFF, 0xFF)
    fun blackAlpha(alpha: Int) = Color.argb(alpha, 0x00, 0x00, 0x00)
}
