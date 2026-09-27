package com.artaproducciones.ops.push

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.artaproducciones.ops.BuildConfig
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.RegisterPushBody
import com.artaproducciones.ops.data.api.RemovePushBody
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Alta del teléfono para push (`POST /devices/push`, upsert en el API) tras el
 * login y en cada arranque; baja (`DELETE /devices/push`) al cerrar sesión para
 * que los avisos de esta cuenta no le lleguen a quien use el teléfono después.
 */
object PushRegistration {
    private const val TAG = "PushRegistration"
    private const val PREFS = "arta_push"
    private const val KEY_TOKEN = "fcm_token"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val available: Boolean
        get() = BuildConfig.HAS_FIREBASE

    fun rememberToken(context: Context, token: String) {
        if (token.isBlank()) return
        prefs(context).edit().putString(KEY_TOKEN, token).apply()
    }

    fun registerAsync(context: Context, known: String? = null) {
        if (!available) return
        val app = context.applicationContext
        scope.launch {
            runCatching {
                if (!ApiClient.hasSession()) return@runCatching
                val token = known?.takeIf { it.isNotBlank() } ?: currentToken(app) ?: return@runCatching
                ApiClient.api.registerPush(
                    RegisterPushBody(token = token, platform = "android", deviceName = deviceName(app), appVersion = BuildConfig.VERSION_NAME),
                )
                rememberToken(app, token)
                Log.d(TAG, "Token FCM registrado …${token.takeLast(8)}")
            }.onFailure { Log.w(TAG, "No se registró el token: ${it.message}") }
        }
    }

    suspend fun unregister(context: Context) {
        if (!available) return
        val token = prefs(context).getString(KEY_TOKEN, null) ?: return
        runCatching { ApiClient.api.removePush(RemovePushBody(token)) }
            .onFailure { Log.w(TAG, "No se dio de baja el token: ${it.message}") }
        // Token nuevo para la siguiente cuenta: el viejo ya no sirve aunque la baja fallara.
        runCatching { FirebaseMessaging.getInstance().deleteToken().await() }
        prefs(context).edit().remove(KEY_TOKEN).apply()
    }

    private suspend fun currentToken(app: Context): String? {
        val fresh = runCatching {
            if (FirebaseApp.getApps(app).isEmpty()) return@runCatching null
            withTimeoutOrNull(15_000L) { FirebaseMessaging.getInstance().token.await() }
        }.getOrNull()
        return fresh?.takeIf { it.isNotBlank() } ?: prefs(app).getString(KEY_TOKEN, null)
    }

    /** Nombre con el que la persona reconoce su teléfono (Ajustes → Acerca del teléfono). */
    private fun deviceName(app: Context): String =
        runCatching { Settings.Global.getString(app.contentResolver, Settings.Global.DEVICE_NAME) }.getOrNull()
            ?.takeIf { it.isNotBlank() }
            ?: listOf(Build.MANUFACTURER, Build.MODEL).filter { !it.isNullOrBlank() }.joinToString(" ")

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
