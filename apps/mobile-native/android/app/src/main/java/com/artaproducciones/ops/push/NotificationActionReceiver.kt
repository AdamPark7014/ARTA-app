package com.artaproducciones.ops.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.PostMessageBody
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.util.UUID

/**
 * Acciones de la notificación de chat sin abrir la app: «Responder» manda el
 * mensaje al API y lo suma a la conversación como «Tú»; «Marcar como leído»
 * avisa al API (que quita el aviso en los demás dispositivos) y lo quita aquí.
 */
class NotificationActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val threadId = intent.getStringExtra(EXTRA_THREAD_ID).orEmpty()
        val channelId = intent.getStringExtra(EXTRA_CHANNEL_ID).orEmpty()
        if (threadId.isBlank() || channelId.isBlank()) return
        ApiClient.init(app)
        val pending = goAsync()
        scope.launch {
            try {
                when (intent.action) {
                    ACTION_REPLY -> reply(app, intent, threadId, channelId)
                    ACTION_MARK_READ -> markRead(app, threadId, channelId)
                }
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun reply(app: Context, intent: Intent, threadId: String, channelId: String) {
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_REPLY)?.toString()?.trim().orEmpty()
        if (text.isBlank()) return
        val ok = runCatching {
            withTimeout(TIMEOUT_MS) {
                ApiClient.api.post(channelId, PostMessageBody(body = text, clientId = "n-" + UUID.randomUUID()))
                // Quien responde ya leyó: el contador baja en todos lados.
                runCatching { ApiClient.api.markRead(channelId) }
            }
        }.onFailure { Log.w(TAG, "Respuesta no enviada: ${it.message}") }.isSuccess
        ArtaPushRenderer.appendMyReply(app, threadId, text, failed = !ok)
    }

    private suspend fun markRead(app: Context, threadId: String, channelId: String) {
        ArtaPushRenderer.dismissChat(app, threadId)
        runCatching { withTimeout(TIMEOUT_MS) { ApiClient.api.markRead(channelId) } }
            .onFailure { Log.w(TAG, "No se marcó como leído: ${it.message}") }
    }

    companion object {
        private const val TAG = "ArtaNotifAction"
        private const val TIMEOUT_MS = 9_000L
        const val ACTION_REPLY = "com.artaproducciones.ops.action.REPLY"
        const val ACTION_MARK_READ = "com.artaproducciones.ops.action.MARK_READ"
        const val EXTRA_THREAD_ID = "thread_id"
        const val EXTRA_CHANNEL_ID = "channel_id"
        const val KEY_REPLY = "reply_text"

        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}
