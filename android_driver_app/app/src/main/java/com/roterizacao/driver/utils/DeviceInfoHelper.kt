package com.roterizacao.driver.utils

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.telephony.TelephonyManager

object DeviceInfoHelper {

    data class DeviceInfo(
        val deviceId: String, // Android ID (único por app + dispositivo) - GOOGLE PLAY COMPLIANT
        val batteryLevel: Int,
        val isCharging: Boolean,
        val networkType: String,
        val networkOperator: String
    )

    fun getDeviceInfo(context: Context): DeviceInfo {
        return DeviceInfo(
            deviceId = getDeviceId(context),
            batteryLevel = getBatteryLevel(context),
            isCharging = isDeviceCharging(context),
            networkType = getNetworkType(context),
            networkOperator = getNetworkOperator(context)
        )
    }

    @SuppressLint("HardwareIds")
    private fun getDeviceId(context: Context): String {
        // ✅ GOOGLE PLAY COMPLIANT: Usando apenas ANDROID_ID
        // Único por app + dispositivo, aprovado pelo Google Play
        // NÃO usa IMEI (proibido desde Android 10)
        return try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "Unknown"
        } catch (e: Exception) {
            "Unknown"
        }
    }

    private fun getBatteryLevel(context: Context): Int {
        return try {
            val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { ifilter ->
                context.registerReceiver(null, ifilter)
            }
            val level: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level != -1 && scale != -1) {
                (level * 100 / scale.toFloat()).toInt()
            } else {
                -1
            }
        } catch (e: Exception) {
            -1
        }
    }

    private fun isDeviceCharging(context: Context): Boolean {
        return try {
            val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { ifilter ->
                context.registerReceiver(null, ifilter)
            }
            val status: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        } catch (e: Exception) {
            false
        }
    }

    private fun getNetworkType(context: Context): String {
        try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val network = connectivityManager.activeNetwork ?: return "No Network"
                val activeNetwork = connectivityManager.getNetworkCapabilities(network) ?: return "No Network"
                
                return when {
                    activeNetwork.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
                    activeNetwork.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile Data"
                    activeNetwork.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                    else -> "Other"
                }
            } else {
                @Suppress("DEPRECATION")
                val networkInfo = connectivityManager.activeNetworkInfo ?: return "No Network"
                return when (networkInfo.type) {
                    ConnectivityManager.TYPE_WIFI -> "WiFi"
                    ConnectivityManager.TYPE_MOBILE -> "Mobile Data"
                    else -> "Other"
                }
            }
        } catch (e: Exception) {
            return "Unknown"
        }
    }

    private fun getNetworkOperator(context: Context): String {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            // ✅ APROVADO: networkOperatorName NÃO requer READ_PHONE_STATE
            val operatorName = telephonyManager.networkOperatorName
            if (operatorName.isNullOrBlank()) "Unknown" else operatorName
        } catch (e: Exception) {
            "Unknown"
        }
    }
}
