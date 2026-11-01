package com.artaproducciones.ops.data

import com.artaproducciones.ops.data.api.NotificationDto
import com.artaproducciones.ops.data.api.NotificationPrefsDto
import com.artaproducciones.ops.data.api.SentRecipientDto
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.roundToLong

/**
 * Cómo se presenta cada aviso según su tipo: la misma lógica que `apps/web/lib/notification-kinds.ts`.
 * Las categorías son las del push (`notification-push-meta.ts` del API) y las que se pueden apagar
 * en las preferencias (`notification-prefs.ts`), en el mismo orden.
 */
enum class NoticeChannel(val key: String, val label: String, val hint: String) {
    CHAT("chat", "Chat", "Mensajes, menciones y respuestas."),
    APPROVALS("approvals", "Aprobaciones", "Lo que espera tu visto bueno, tu firma o tu revisión."),
    TASKS("tasks", "Tareas", "Lo que te asignan, lo que vence y lo que te regresan."),
    FINANCE("finance", "Finanzas", "Órdenes de compra, anticipos y corrida."),
    EVENTS("events", "Eventos", "Cambios de fecha, cancelaciones y boletera."),
    DOCUMENTS("documents", "Documentos", "Archivos, carpetas y formatos ya resueltos."),
    GENERAL("general", "General", "Lo demás de tu cuenta y de la organización."),
}

/** Los grupos de la lista de avisos. */
enum class NoticeDay(val label: String) { TODAY("Hoy"), YESTERDAY("Ayer"), EARLIER("Antes") }

data class NoticeGroup<T>(val day: NoticeDay, val items: List<T>)

/** Filtros de la pantalla de Avisos. [unreadOnly]: se le pide al API solo lo no leído (`unread=1`). */
enum class NoticeFilter(val label: String, val unreadOnly: Boolean) {
    ALL("Todos", false),
    UNREAD("Sin leer", true),
    ACTION("Por atender", true),

    /** Lo que mandé y quién ya lo vio: es otra lista (`GET /notifications/sent`), no algo de la bandeja. */
    SENT("Enviados", false),
    ;

    fun matches(n: NotificationDto): Boolean = when (this) {
        ALL -> true
        UNREAD -> n.readAt == null
        ACTION -> n.readAt == null && NoticeKinds.needsAction(n.type)
        SENT -> false
    }
}

/** Una lista paginada de avisos, de lo más nuevo a lo más viejo. */
data class NoticeFeed(val items: List<NotificationDto> = emptyList(), val hasMore: Boolean = false) {
    /** La primera página recién pedida: reemplaza lo de arriba y conserva lo más viejo que ya estaba cargado. */
    fun withFirstPage(page: List<NotificationDto>, pageSize: Int): NoticeFeed {
        // Página incompleta: el servidor ya no tiene nada más viejo que estas.
        if (page.size < pageSize) return NoticeFeed(page, hasMore = false)
        val fresh = page.mapTo(HashSet()) { it.id }
        val floor = page.last().createdAt
        val older = items.filter { it.id !in fresh && it.createdAt < floor }
        return NoticeFeed(page + older, hasMore = if (older.isEmpty()) true else hasMore)
    }

    fun withNextPage(page: List<NotificationDto>, pageSize: Int): NoticeFeed {
        val known = items.mapTo(HashSet()) { it.id }
        return NoticeFeed(items + page.filter { it.id !in known }, hasMore = page.size >= pageSize)
    }

    /** Marca [id] como leído o, con null, todos los de la lista. */
    fun read(id: String?, at: String): NoticeFeed =
        copy(items = items.map { if ((id == null || it.id == id) && it.readAt == null) it.copy(readAt = at) else it })

    fun unread(id: String): NoticeFeed = copy(items = items.map { if (it.id == id) it.copy(readAt = null) else it })
}

object NoticeKinds {
    const val PAGE_SIZE = 30

    private val ES_MX: Locale = Locale.forLanguageTag("es-MX")
    private val DAY_MONTH = DateTimeFormatter.ofPattern("d MMM", ES_MX)
    private val DAY_MONTH_YEAR = DateTimeFormatter.ofPattern("d MMM yyyy", ES_MX)

    private val APPROVAL_TYPES = setOf(
        "advance.requested",
        "po.requested",
        "po.updated",
        "task.submitted",
        "checklist.submitted",
        "checklist.signature_needed",
    )
    private val PENDING_TYPES = setOf("checklist.returned", "checklist.signature_backlog", "po.aging")
    private val URGENT_TASK_TYPES = setOf(
        "task.assigned",
        "task.reassigned",
        "task.rejected",
        "task.blocked",
        "task.reopened",
        "task.due_soon",
        "task.overdue",
    )
    private val URGENT_FINANCE_TYPES = setOf("advance.to_pay", "advance.rejected", "po.to_pay")
    private val DOCUMENT_TYPES = Regex("^(checklist|document|file|folder|slot)\\.")

    fun channelOf(type: String?): NoticeChannel {
        val t = type.orEmpty().lowercase(Locale.ROOT)
        return when {
            t.startsWith("chat.") -> NoticeChannel.CHAT
            t in APPROVAL_TYPES || t in PENDING_TYPES || t.endsWith(".review") -> NoticeChannel.APPROVALS
            t.startsWith("task.") -> NoticeChannel.TASKS
            t.startsWith("po.") || t.startsWith("finance.") || t.startsWith("advance.") || t.endsWith(".paid") -> NoticeChannel.FINANCE
            t.startsWith("campaign.") || t.startsWith("convenios.") -> NoticeChannel.APPROVALS
            DOCUMENT_TYPES.containsMatchIn(t) -> NoticeChannel.DOCUMENTS
            t.startsWith("event.") || t.startsWith("ticketing.") -> NoticeChannel.EVENTS
            else -> NoticeChannel.GENERAL
        }
    }

    /** ¿Espera algo de quien lo lee? En la lista va con el ícono lleno y entra a «Por atender». */
    fun needsAction(type: String?): Boolean {
        val t = type.orEmpty().lowercase(Locale.ROOT)
        return t in APPROVAL_TYPES ||
            t in PENDING_TYPES ||
            t in URGENT_TASK_TYPES ||
            t in URGENT_FINANCE_TYPES ||
            t.endsWith(".review") ||
            t == "chat.mention"
    }

    /** «ahora», «hace 5 min», «hace 3 h»; de días pasados, la fecha. */
    fun age(iso: String?, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
        val at = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return ""
        val minutes = ((now.toEpochMilli() - at.toEpochMilli()) / 60_000.0).roundToLong()
        if (minutes < 1) return "ahora"
        if (minutes < 60) return "hace $minutes min"
        val hours = (minutes / 60.0).roundToLong()
        if (hours < 24) return "hace $hours h"
        val date = at.atZone(zone).toLocalDate()
        val sameYear = date.year == now.atZone(zone).year
        return (if (sameYear) DAY_MONTH else DAY_MONTH_YEAR).format(date).replace(".", "")
    }

    /** Días de calendario, no 24 horas: lo de anoche es «Ayer» aunque haya sido hace 3 horas. */
    fun dayOf(iso: String?, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): NoticeDay {
        val at = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return NoticeDay.EARLIER
        val diff = ChronoUnit.DAYS.between(at.atZone(zone).toLocalDate(), now.atZone(zone).toLocalDate())
        return when {
            diff <= 0L -> NoticeDay.TODAY
            diff == 1L -> NoticeDay.YESTERDAY
            else -> NoticeDay.EARLIER
        }
    }

    fun <T> group(
        items: List<T>,
        createdAt: (T) -> String?,
        now: Instant = Instant.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): List<NoticeGroup<T>> {
        val groups = mutableListOf<NoticeGroup<T>>()
        for (item in items) {
            val day = dayOf(createdAt(item), now, zone)
            val last = groups.lastOrNull()
            if (last?.day == day) groups[groups.lastIndex] = last.copy(items = last.items + item) else groups += NoticeGroup(day, listOf(item))
        }
        return groups
    }

    // ─── Acuse de visto (docs/AVISOS.md) ─────────────────────────────────────

    /** Tope de ids en una llamada a `POST /notifications/seen` (`SeenDto` del API). */
    private const val SEEN_BATCH = 200

    /** «Beto S. ya vio tu aviso»: no pide nada, así que va en contorno y con el ojo. */
    fun isSeenReceipt(type: String?): Boolean = type.orEmpty().lowercase(Locale.ROOT) == "notice.seen"

    /**
     * Lo que falta por reportar de [onScreen], en tandas que caben en una llamada: sin lo que ya se
     * vio o se leyó (el servidor ya lo sabe) ni lo que ya se mandó en esta sesión ([alreadySent]).
     */
    fun seenBatches(onScreen: List<NotificationDto>, alreadySent: Set<String>): List<List<String>> =
        onScreen.filter { it.seenAt == null && it.readAt == null && it.id !in alreadySent }
            .map { it.id }
            .distinct()
            .chunked(SEEN_BATCH)

    /** La fila cuenta como a la vista con al menos la mitad dentro de la lista: la que apenas asoma, no. */
    fun isOnScreen(offset: Int, size: Int, viewportStart: Int, viewportEnd: Int): Boolean =
        size > 0 && (minOf(offset + size, viewportEnd) - maxOf(offset, viewportStart)) * 2 >= size

    fun wasSeen(r: SentRecipientDto): Boolean = r.seenAt != null || r.readAt != null

    /** La píldora de una fila de Enviados. Igual que `summary` de `SentNotices.tsx`. */
    fun sentSummary(recipients: List<SentRecipientDto>): String {
        val seen = recipients.count { wasSeen(it) }
        return when {
            recipients.size == 1 -> if (seen == 1) "Visto" else "Sin ver"
            recipients.isNotEmpty() && seen == recipients.size -> "Visto por todos"
            seen > 0 -> "Visto por $seen de ${recipients.size}"
            else -> "Nadie lo ha visto"
        }
    }

    /** «Visto hace 5 min», «Visto el 20 oct» o «Sin ver». */
    fun recipientStatus(r: SentRecipientDto, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String =
        if (wasSeen(r)) stamped("Visto", r.seenAt ?: r.readAt, now, zone) else "Sin ver"

    /** «Mandado hace 3 h» o «Mandado el 20 oct». */
    fun sentAge(iso: String?, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String =
        stamped("Mandado", iso, now, zone)

    private fun stamped(label: String, iso: String?, now: Instant, zone: ZoneId): String {
        val ago = age(iso, now, zone)
        return when {
            ago.isEmpty() -> label
            ago == "ahora" || ago.startsWith("hace") -> "$label $ago"
            else -> "$label el $ago"
        }
    }

    // ─── Preferencias ───────────────────────────────────────────────────────

    /** Apaga o prende una categoría, siempre en el orden del API y sin repetirla. */
    fun withChannel(prefs: NotificationPrefsDto, channel: NoticeChannel, on: Boolean): NotificationPrefsDto {
        val muted = prefs.muted.toSet().let { if (on) it - channel.key else it + channel.key }
        return prefs.copy(muted = NoticeChannel.entries.map { it.key }.filter { it in muted })
    }

    /** «22:00» → 22 y 0; lo que no se entienda cae en [fallback] (el API ya valida, esto es por si acaso). */
    fun parseHhMm(value: String, fallback: Pair<Int, Int> = 22 to 0): Pair<Int, Int> {
        val parts = value.split(':')
        val hour = parts.getOrNull(0)?.toIntOrNull()?.takeIf { it in 0..23 }
        val minute = parts.getOrNull(1)?.toIntOrNull()?.takeIf { it in 0..59 }
        return if (hour != null && minute != null) hour to minute else fallback
    }

    fun hhMm(hour: Int, minute: Int): String = "%02d:%02d".format(Locale.ROOT, hour, minute)
}
