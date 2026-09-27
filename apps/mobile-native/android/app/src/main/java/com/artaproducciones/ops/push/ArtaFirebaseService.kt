package com.artaproducciones.ops.push

import android.util.Log
import com.artaproducciones.ops.data.api.ApiClient
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Servicio FCM. El API manda a Android mensajes solo de datos con prioridad
 * alta, así que `onMessageReceived` corre siempre (app abierta, en segundo
 * plano o cerrada) y aquí se pinta el aviso.
 */
class ArtaFirebaseService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        val ctx = applicationContext
        PushRegistration.rememberToken(ctx, token)
        ApiClient.init(ctx)
        // Sin sesión queda pendiente: se registra justo después del login.
        if (ApiClient.hasSession()) PushRegistration.registerAsync(ctx, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        try {
            val data = message.data.toMutableMap()
            message.notification?.let { n ->
                if (data["title"].isNullOrBlank()) n.title?.let { data["title"] = it }
                if (data["body"].isNullOrBlank()) n.body?.let { data["body"] = it }
            }
            ArtaPushRenderer.render(applicationContext, PushPayload.from(data, message.sentTime))
        } catch (e: Exception) {
            Log.w("ArtaFirebaseService", "Push no mostrado: ${e.message}", e)
        }
    }
}
