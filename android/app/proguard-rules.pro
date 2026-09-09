# ProGuard / R8 Rules for Aristotle POS
-keepattributes JavascriptInterface
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes SourceFile,LineNumberTable

# Preserve all methods exposed to WebView JavaScript
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve our MainActivity and AndroidBridge classes completely
-keep class com.aristotle.pos.** { *; }
-keepclassmembers class com.aristotle.pos.** { *; }

# AndroidX AppCompat
-keep class androidx.appcompat.** { *; }
-dontwarn androidx.**
