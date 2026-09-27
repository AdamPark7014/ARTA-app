package com.artaproducciones.ops.push

import android.content.Context
import androidx.core.content.edit
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.artaproducciones.ops.api.ApiClient
import com.artaproducciones.ops.api.models.RegisterPushBody
import com.artaproducciones.ops.api.models.RemovePushBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object PushRegistration {

    private const val PREFS_NAME = "PushRegistrationPrefs"
    private const val PREF_KEY_FCM_TOKEN = "fcm_token"

    fun rememberToken(context: Context, token: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit {
            putString(PREF_KEY_FCM_TOKEN, token)
        }
    }

    suspend fun registerAsync(context: Context, token: String?) {
        if (BuildConfig.HAS_FIREBASE && FirebaseApp.initializeApp(context).isInitialized) {
            withContext(Dispatchers.IO) {
                val fcmToken = token ?: FirebaseMessaging.getInstance().token.await()
                ApiClient.api.registerPush(RegisterPushBody(fcmToken, "android", getDeviceName(context), getAppVersion()))
            }
        }
    }

    suspend fun unregister(context: Context) {
        val fcmToken = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_KEY_FCM_TOKEN, null)
        if (fcmToken != null) {
            withContext(Dispatchers.IO) {
                ApiClient.api.removePush(RemovePushBody(fcmToken))
            }
        }
    }

    private fun getDeviceName(context: Context): String {
        return context.resources.configuration.locales[0].displayName
    }

    private fun getAppVersion(context: Context): String {
        return context.packageManager.getPackageInfo(context.packageName, 0).versionName
    }
}