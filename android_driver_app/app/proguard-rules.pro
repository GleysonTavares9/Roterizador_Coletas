# Proteger TODO o código do projeto para evitar erros de ClassNotFoundError
-keep class com.roterizacao.driver.** { *; }
-keep interface com.roterizacao.driver.** { *; }
-keep enum com.roterizacao.driver.** { *; }

# WebRTC (Native Code)
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# Kotlin Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.coroutines.android.HandlerContext {
    java.lang.String name;
}

# Keep original source file names for better stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Optimization
-optimizationpasses 5
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-verbose
