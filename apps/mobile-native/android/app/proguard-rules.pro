# ARTA Android — reglas R8/ProGuard del build de release.
# Stack: Retrofit + OkHttp + Moshi reflexivo (no Gson), Coil, Socket.IO,
# Firebase Messaging, androidx.security.crypto (Tink) y Media3.
# Basadas en las de NEXARA, que ya están probadas en Play.

# ---------------------------------------------------------------------------
# General / Kotlin
# ---------------------------------------------------------------------------
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepattributes *Annotation*

# Play Console desofusca los crashes con el mapping.txt que va dentro del AAB,
# pero sin fichero + línea el stack trace llega sin números y no sirve.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

-keep class kotlin.Metadata { *; }
-keepclassmembers class kotlin.Metadata { *; }
-keepclassmembers class **$WhenMappings { <fields>; }

-dontwarn org.jetbrains.annotations.**
-dontwarn kotlin.Unit
-dontwarn kotlin.jvm.internal.**

# KotlinJsonAdapterFactory lee los constructores con kotlin-reflect y usa el
# constructor sintético (DefaultConstructorMarker) cuando el DTO tiene valores
# por defecto. Si R8 recorta kotlin-reflect, los DTO salen vacíos solo en release.
-keep class kotlin.jvm.internal.DefaultConstructorMarker { *; }
-keep class kotlin.reflect.jvm.internal.** { *; }
-dontwarn kotlin.reflect.jvm.internal.**

# Enums (Moshi los serializa por nombre), Parcelable, Serializable y nativos.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
    **[] $VALUES;
    public *;
}
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
-keepclasseswithmembernames class * {
    native <methods>;
}

# ---------------------------------------------------------------------------
# Retrofit + OkHttp
# ---------------------------------------------------------------------------
-dontwarn retrofit2.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.**

-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response

-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Retrofit crea las interfaces con Proxy: si R8 las ve sin implementación, las
# vacía y cada llamada al API revienta en release.
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>

# ---------------------------------------------------------------------------
# Moshi — CRÍTICO
#
# La app usa Moshi con KotlinJsonAdapterFactory (REFLEXIVO, sin KSP). Las claves
# JSON salen de los nombres de propiedad. Si R8 renombra un DTO o sus campos, no
# falla al compilar ni al arrancar: devuelve listas vacías o campos nulos, solo
# en release. Por eso se conservan los paquetes de datos completos y, además,
# cualquier tipo con forma de payload, viva donde viva.
# ---------------------------------------------------------------------------
-dontwarn com.squareup.moshi.**

-keep @com.squareup.moshi.JsonQualifier interface *
-keep @com.squareup.moshi.JsonClass class * { *; }
-keepclasseswithmembers class * {
    @com.squareup.moshi.* <methods>;
}
-keepclassmembers class * {
    @com.squareup.moshi.Json <fields>;
}

# DTO y API (ArtaApi, ArtaModulesApi) + eventos del socket.
-keep class com.artaproducciones.ops.data.api.** { *; }
-keep class com.artaproducciones.ops.data.realtime.** { *; }

# Red de seguridad estructural: DTO futuros en paquetes nuevos sin tocar esto.
-keep class com.artaproducciones.ops.**Dto { *; }
-keep class com.artaproducciones.ops.**Request { *; }
-keep class com.artaproducciones.ops.**Response { *; }
-keep class com.artaproducciones.ops.**Body { *; }

# ---------------------------------------------------------------------------
# Coil
# ---------------------------------------------------------------------------
-keep class coil.** { *; }
-dontwarn coil.**

# ---------------------------------------------------------------------------
# Socket.IO (org.json lo pone Android; se excluye la dependencia en Gradle)
# ---------------------------------------------------------------------------
-keep class io.socket.** { *; }
-keep class io.socket.engineio.** { *; }
-dontwarn io.socket.**
-dontwarn org.json.**

# ---------------------------------------------------------------------------
# Firebase Messaging / Google Play services
# ---------------------------------------------------------------------------
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ---------------------------------------------------------------------------
# androidx.security.crypto + Tink — CRÍTICO
#
# PersistentCookieJar guarda la sesión en EncryptedSharedPreferences. Tink
# resuelve sus primitivas por reflexión sobre protobuf: si R8 recorta ahí, la
# app revienta AL ARRANCAR, solo en release (le pasó a NEXARA).
# ---------------------------------------------------------------------------
-keep class androidx.security.crypto.** { *; }
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-dontwarn com.google.protobuf.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn com.google.api.client.**
-dontwarn org.joda.time.**

# ---------------------------------------------------------------------------
# Gson: no es dependencia directa; Socket.IO puede referenciarla.
# ---------------------------------------------------------------------------
-dontwarn com.google.gson.**
