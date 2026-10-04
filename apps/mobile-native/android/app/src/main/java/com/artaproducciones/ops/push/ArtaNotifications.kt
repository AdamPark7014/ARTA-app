package com.artaproducciones.ops.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationChannelGroup
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.provider.Settings
import android.util.Log

/**
 * Canales de notificación. Uno por proceso del API (`channel` del push) para
 * que cada quien apague lo que no le sirve sin perder los mensajes. Todos en
 * IMPORTANCE_HIGH: aviso emergente con sonido, como WhatsApp.
 */
object ArtaNotifications {
    const val CHANNEL_CHAT = "arta_chat"
    const val CHANNEL_APPROVALS = "arta_approvals"
    const val CHANNEL_TASKS = "arta_tasks"
    const val CHANNEL_FINANCE = "arta_finance"
    const val CHANNEL_EVENTS = "arta_events"
    const val CHANNEL_DOCUMENTS = "arta_documents"
    const val CHANNEL_GENERAL = "arta_general"

    private const val GROUP = "arta"

    /** Dorado de marca: acento de notificaciones y luz LED. */
    const val ACCENT_COLOR: Int = 0xFFC9A962.toInt()

    private val VIBRATION = longArrayOf(0L, 220L, 120L, 220L)

    /**
     * Clave `channel` del push (ver `notification-push-meta.ts` en el API) → canal Android.
     * Los ids `arta_*` ya están instalados en teléfonos: no se renombran, solo se agregan.
     */
    fun channelFor(routing: String?): String = when (routing?.trim()?.lowercase()) {
        "chat" -> CHANNEL_CHAT
        "approvals" -> CHANNEL_APPROVALS
        "tasks" -> CHANNEL_TASKS
        "finance" -> CHANNEL_FINANCE
        "events" -> CHANNEL_EVENTS
        "documents" -> CHANNEL_DOCUMENTS
        else -> CHANNEL_GENERAL
    }

    fun label(channelId: String): String = when (channelId) {
        CHANNEL_CHAT -> "Chat"
        CHANNEL_APPROVALS -> "Aprobaciones"
        CHANNEL_TASKS -> "Tareas"
        CHANNEL_FINANCE -> "Finanzas"
        CHANNEL_EVENTS -> "Eventos"
        CHANNEL_DOCUMENTS -> "Documentos"
        else -> "General"
    }

    @Volatile
    private var ready = false

    fun ensureChannels(context: Context) {
        if (ready) return
        synchronized(this) {
            if (ready) return
            try {
                val nm = context.applicationContext.getSystemService(NotificationManager::class.java) ?: return
                nm.createNotificationChannelGroup(NotificationChannelGroup(GROUP, "ARTA"))
                nm.createNotificationChannels(
                    listOf(
                        channel(CHANNEL_CHAT, label(CHANNEL_CHAT), "Mensajes directos, canales y menciones del chat"),
                        channel(CHANNEL_TASKS, label(CHANNEL_TASKS), "Tareas asignadas, rechazadas o por vencer"),
                        channel(CHANNEL_APPROVALS, label(CHANNEL_APPROVALS), "Órdenes de compra, tareas y formatos por revisar o autorizar"),
                        channel(CHANNEL_FINANCE, label(CHANNEL_FINANCE), "Órdenes de compra autorizadas, pagadas o rechazadas"),
                        channel(CHANNEL_EVENTS, label(CHANNEL_EVENTS), "Cambios en los eventos donde participas"),
                        channel(CHANNEL_DOCUMENTS, label(CHANNEL_DOCUMENTS), "Formatos, archivos y carpetas"),
                        channel(CHANNEL_GENERAL, label(CHANNEL_GENERAL), "Otros avisos de ARTA"),
                    ),
                )
                ready = true
            } catch (e: Exception) {
                Log.w("ArtaNotifications", "No se pudieron crear los canales: ${e.message}")
            }
        }
    }

    private fun channel(id: String, name: String, description: String) =
        NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
            this.description = description
            group = GROUP
            enableVibration(true)
            vibrationPattern = VIBRATION
            enableLights(true)
            lightColor = ACCENT_COLOR
            setShowBadge(true)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            setSound(
                Settings.System.DEFAULT_NOTIFICATION_URI,
                AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build(),
            )
        }
}
