package com.artaproducciones.ops.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.PostMessageBody
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.util.UUID

/**
 * Acciones de la notificación sin abrir la app: «Responder» manda el mensaje al
 * API y lo suma a la conversación como «Tú»; «Marcar como leído» (chat y avisos
 * de proceso) avisa al API, que lo quita en los demás dispositivos, y lo quita aquí;
 * «Entregar» y «Aprobar» actúan sobre la tarea del aviso (docs/AVISOS.md § Casos).
 */
class NotificationActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val threadId = intent.getStringExtra(EXTRA_THREAD_ID).orEmpty()
        val channelId = intent.getStringExtra(EXTRA_CHANNEL_ID).orEmpty()
        val noticeId = intent.getStringExtra(EXTRA_NOTICE_ID).orEmpty()
        val taskId = intent.getStringExtra(EXTRA_TASK_ID).orEmpty()
        val incomplete = when (intent.action) {
            ACTION_MARK_NOTICE_READ -> noticeId.isBlank()
            ACTION_TASK_DELIVER, ACTION_TASK_APPROVE -> taskId.isBlank()
            else -> threadId.isBlank() || channelId.isBlank()
        }
        if (incomplete) return
        ApiClient.init(app)
        val pending = goAsync()
        scope.launch {
            try {
                when (intent.action) {
                    ACTION_REPLY -> reply(app, intent, threadId, channelId)
                    ACTION_MARK_READ -> markRead(app, threadId, channelId)
                    ACTION_MARK_NOTICE_READ -> markNoticeRead(app, intent, noticeId)
                    ACTION_TASK_DELIVER -> deliverTask(app, intent, taskId, noticeId)
                    ACTION_TASK_APPROVE -> approveTask(app, intent, taskId, noticeId)
                }
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun reply(app: Context, intent: Intent, threadId: String, channelId: String) {
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_REPLY)?.toString()?.trim().orEmpty()
        if (text.isBlank()) return
        val notices = ChatNotificationStore.get(app, threadId)?.noticeIds.orEmpty()
        val ok = runCatching {
            withTimeout(TIMEOUT_MS) {
                ApiClient.api.post(channelId, PostMessageBody(body = text, clientId = "n-" + UUID.randomUUID()))
                // Quien responde ya leyó: el contador baja en todos lados.
                runCatching { ApiClient.api.markRead(channelId) }
                notices.forEach { id -> runCatching { ApiClient.api.notificationRead(id) } }
            }
        }.onFailure { Log.w(TAG, "Respuesta no enviada: ${it.message}") }.isSuccess
        ArtaPushRenderer.appendMyReply(app, threadId, text, failed = !ok)
    }

    private suspend fun markRead(app: Context, threadId: String, channelId: String) {
        val notices = ChatNotificationStore.get(app, threadId)?.noticeIds.orEmpty()
        ArtaPushRenderer.dismissChat(app, threadId)
        runCatching {
            withTimeout(TIMEOUT_MS) {
                ApiClient.api.markRead(channelId)
                notices.forEach { id -> runCatching { ApiClient.api.notificationRead(id) } }
            }
        }.onFailure { Log.w(TAG, "No se marcó como leído: ${it.message}") }
    }

    /** Se quita al instante; el API avisa a los demás dispositivos con el `notification.read` silencioso. */
    private suspend fun markNoticeRead(app: Context, intent: Intent, noticeId: String) {
        ArtaPushRenderer.dismissEvent(app, intent.getIntExtra(EXTRA_ANDROID_ID, 0))
        runCatching { withTimeout(TIMEOUT_MS) { ApiClient.api.notificationRead(noticeId) } }
            .onFailure { Log.w(TAG, "Aviso no marcado como leído: ${it.message}") }
    }

    /** Sin nota no se manda: el API pide nota o evidencia, y eso se hace en la tarea. */
    private suspend fun deliverTask(app: Context, intent: Intent, taskId: String, noticeId: String) {
        val note = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_NOTE)?.toString()?.trim().orEmpty()
        taskAction(app, intent, taskId, noticeId, failedTitle = "No se pudo entregar") {
            check(note.isNotBlank()) { "Sin nota" }
            ModulesClient.api.submitTask(taskId, mapOf("completionNote" to note))
        }
    }

    private suspend fun approveTask(app: Context, intent: Intent, taskId: String, noticeId: String) =
        taskAction(app, intent, taskId, noticeId, failedTitle = "No se pudo aprobar") { ModulesClient.api.approveTask(taskId) }

    /** Si salió, se quita y queda leído en todos lados; si no, el aviso invita a abrir la tarea. */
    private suspend fun taskAction(
        app: Context,
        intent: Intent,
        taskId: String,
        noticeId: String,
        failedTitle: String,
        call: suspend () -> Unit,
    ) {
        val androidId = intent.getIntExtra(EXTRA_ANDROID_ID, 0)
        val ok = runCatching { withTimeout(TASK_TIMEOUT_MS) { call() } }
            .onFailure { Log.w(TAG, "Acción de la tarea sin completar: ${it.message}") }
            .isSuccess
        if (!ok) {
            ArtaPushRenderer.taskActionFailed(app, androidId, taskId, failedTitle)
            return
        }
        ArtaPushRenderer.dismissEvent(app, androidId)
        // Ya salió: si marcar leído tarda o falla, no se avisa de un error que no hubo.
        if (noticeId.isNotBlank()) {
            runCatching { withTimeout(READ_TIMEOUT_MS) { ApiClient.api.notificationRead(noticeId) } }
                .onFailure { Log.w(TAG, "Aviso no marcado como leído: ${it.message}") }
        }
    }

    companion object {
        private const val TAG = "ArtaNotifAction"
        private const val TIMEOUT_MS = 9_000L

        /** Juntos no pasan de los 9 s: el sistema no deja a un receptor mucho más. */
        private const val TASK_TIMEOUT_MS = 7_000L
        private const val READ_TIMEOUT_MS = 2_000L
        const val ACTION_REPLY = "com.artaproducciones.ops.action.REPLY"
        const val ACTION_MARK_READ = "com.artaproducciones.ops.action.MARK_READ"
        const val ACTION_MARK_NOTICE_READ = "com.artaproducciones.ops.action.MARK_NOTICE_READ"
        const val ACTION_TASK_DELIVER = "com.artaproducciones.ops.action.TASK_DELIVER"
        const val ACTION_TASK_APPROVE = "com.artaproducciones.ops.action.TASK_APPROVE"
        const val EXTRA_THREAD_ID = "thread_id"
        const val EXTRA_CHANNEL_ID = "channel_id"
        const val EXTRA_NOTICE_ID = "notice_id"
        const val EXTRA_ANDROID_ID = "android_id"
        const val EXTRA_TASK_ID = "task_id"
        const val KEY_REPLY = "reply_text"
        const val KEY_NOTE = "task_note"

        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}
