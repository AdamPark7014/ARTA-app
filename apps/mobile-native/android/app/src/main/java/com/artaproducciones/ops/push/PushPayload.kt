package com.artaproducciones.ops.push

import com.artaproducciones.ops.data.BizEntity

/**
 * Push de ARTA ya interpretado. El API manda a Android mensajes solo de datos
 * (sin bloque `notification`), así que la app siempre pinta el aviso.
 *
 * - `kind=chat`: mensaje de chat; se apila por conversación (`thread_id`).
 * - `silent=1`: no se muestra nada; p. ej. `chat.read` quita el aviso de una
 *   conversación que ya se leyó en otro dispositivo.
 * - `passive=1`: entra a la bandeja sin sonar ni encender la pantalla (solo para enterarse, o una
 *   tarjeta de ráfaga que se actualiza en su lugar).
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
    /** Arta o Auditorio; null = de la cuenta o de un directo. */
    val entity: BizEntity? = null,
    val passive: Boolean = false,
) {
    enum class Kind { CHAT, EVENT }

    val isChat: Boolean get() = kind == Kind.CHAT

    /** Pide una decisión (autorizar o revisar): lleva la acción «Abrir» a aprobaciones. */
    val isApproval: Boolean get() = isApprovalType(type)

    /** «Abrir» lleva a Aprobaciones solo si ahí se decide: los formatos se revisan en su propia pantalla. */
    val opensApprovals: Boolean get() = isApproval && !type.trim().lowercase().startsWith("checklist.")

    /**
     * Qué identifica a este aviso para descartar la re-entrega de FCM. En un aviso de proceso cuenta
     * también el texto: una ráfaga llega con el mismo id y texto nuevo («3 archivos»), y esa sí se pinta.
     */
    val dedupeKey: String?
        get() = when {
            silent -> null
            messageId.isNotBlank() -> "m:$messageId"
            notificationId.isNotBlank() -> "n:$notificationId:$title:$body"
            else -> null
        }

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
                entity = BizEntity.of(v("entity")),
                passive = v("passive") == "1",
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

/**
 * Cómo se apilan los avisos de proceso en la barra: los de una misma pantalla (`thread_id`) van
 * juntos con una tarjeta resumen; los sueltos, por categoría. Sin Android: se prueba en la JVM.
 */
object PushGrouping {
    /** Prefijo de los grupos de la app (también los identifica al limpiarlos). */
    const val PREFIX = "arta_"
    private const val THREAD_PREFIX = "arta_t_"
    private const val SEGMENT = " · "
    private const val MAX_SUBJECT = 42

    /** `thread_id` igual a la etiqueta = no pertenece a nada más (el API cae ahí si el aviso no trae liga). */
    fun groupFor(p: PushPayload): String =
        if (p.threadId.isBlank() || p.threadId == p.tag) PREFIX + p.androidChannel.removePrefix(PREFIX) else THREAD_PREFIX + p.threadId

    /**
     * De qué se trata un grupo de avisos: el título del hilo o, si no viene, el final común de los
     * textos («Anticipo de hospedaje · $8,400 · Noche de Boleros» y «Rider · Noche de Boleros»).
     * Null si los textos no comparten nada: entonces el resumen solo cuenta.
     */
    fun subject(threadTitle: String, bodies: List<String>): String? {
        threadTitle.trim().takeIf { it.isNotEmpty() }?.let { return it }
        if (bodies.size < 2) return null
        val parts = bodies.map { body -> body.split(SEGMENT).map { it.trim() }.filter { it.isNotEmpty() }.reversed() }
        val shortest = parts.minOf { it.size }
        // Siempre deja al menos un trozo propio: un texto idéntico no dice de qué evento es.
        if (shortest < 2) return null
        var common = 0
        while (common < shortest - 1 && parts.all { it[common] == parts[0][common] }) common++
        if (common == 0) return null
        return parts[0].take(common).reversed().joinToString(SEGMENT).takeIf { it.length <= MAX_SUBJECT }
    }

    fun summaryTitle(count: Int, subject: String?): String =
        if (subject != null) "$count avisos de $subject" else "$count avisos"
}
