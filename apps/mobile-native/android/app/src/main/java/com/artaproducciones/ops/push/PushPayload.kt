package com.artaproducciones.ops.push

/**
 * Push de ARTA ya interpretado. El API manda a Android mensajes solo de datos
 * (sin bloque `notification`), así que la app siempre pinta el aviso.
 *
 * - `kind=chat`: mensaje de chat; se apila por conversación (`thread_id`).
 * - `silent=1`: no se muestra nada; p. ej. `chat.read` quita el aviso de una
 *   conversación que ya se leyó en otro dispositivo.
 * - lo demás: evento (orden de compra, formato, tarea, mención…).
 */
data class PushPayload(
    val raw: Map<String, String>,
    val kind: Kind,
    /** Id del canal Android (`ArtaNotifications.CHANNEL_*`). */
    val androidChannel: String,
    val title: String,
    val body: String,
    val url: String,
    val type: String,
    val tag: String,
    val notificationId: String,
    val senderId: String,
    val senderName: String,
    val threadId: String,
    val threadTitle: String,
    /** Id del canal de chat (conversación) en el API. */
    val chatChannelId: String,
    val messageId: String,
    val badge: Int?,
    val sentAtMillis: Long,
    val silent: Boolean,
) {
    enum class Kind { CHAT, EVENT }

    val isChat: Boolean get() = kind == Kind.CHAT

    /** Pide una decisión (autorizar o revisar): lleva la acción «Abrir» a aprobaciones. */
    val isApproval: Boolean get() = isApprovalType(type)

    companion object {
        private val APPROVAL_TYPES = setOf(
            "po.requested", "task.submitted", "checklist.submitted", "advance.requested", "advance.to_pay",
        )

        /** Mismo criterio que `notification-push-meta.ts` del API. */
        fun isApprovalType(type: String?): Boolean {
            val t = type?.trim()?.lowercase().orEmpty()
            return t in APPROVAL_TYPES || t.endsWith(".review")
        }

        fun from(data: Map<String, String>, fallbackSentAt: Long = 0L): PushPayload {
            fun v(key: String): String = data[key]?.trim().orEmpty()

            val chatChannelId = v("channel_id")
            // Menciones y avisos con `channel_id` se apilan con su conversación y permiten responder.
            val kind = if (v("kind").equals("chat", ignoreCase = true) || chatChannelId.isNotBlank()) Kind.CHAT else Kind.EVENT
            val threadId = v("thread_id").ifBlank { if (chatChannelId.isNotBlank()) "chat-$chatChannelId" else v("tag") }
            return PushPayload(
                raw = data,
                kind = kind,
                androidChannel = if (kind == Kind.CHAT) ArtaNotifications.CHANNEL_CHAT else ArtaNotifications.channelFor(v("channel")),
                title = v("title"),
                body = v("body"),
                url = v("url"),
                type = v("type"),
                tag = v("tag"),
                notificationId = v("notification_id"),
                senderId = v("sender_id"),
                senderName = v("sender_name"),
                threadId = threadId,
                threadTitle = v("thread_title"),
                chatChannelId = chatChannelId,
                messageId = v("message_id"),
                badge = v("badge").toIntOrNull(),
                sentAtMillis = parseIso(v("sent_at")) ?: fallbackSentAt.takeIf { it > 0L } ?: System.currentTimeMillis(),
                silent = v("silent") == "1",
            )
        }

        fun parseIso(raw: String): Long? {
            if (raw.isBlank()) return null
            raw.toLongOrNull()?.let { n -> return if (n < 100_000_000_000L) n * 1000L else n }
            return runCatching { java.time.Instant.parse(raw).toEpochMilli() }.getOrNull()
                ?: runCatching { java.time.OffsetDateTime.parse(raw).toInstant().toEpochMilli() }.getOrNull()
        }
    }
}
