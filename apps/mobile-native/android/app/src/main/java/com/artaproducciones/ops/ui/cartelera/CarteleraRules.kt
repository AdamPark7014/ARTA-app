package com.artaproducciones.ops.ui.cartelera

import com.artaproducciones.ops.data.api.PublicShowDto
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Las mismas reglas que el sitio (`apps/web/lib/site-format.ts`), para que app y web digan lo mismo. */
object CarteleraRules {
    private val MX = ZoneId.of("America/Mexico_City")
    private val ES = Locale("es", "MX")
    private val STATUS = mapOf(
        "venta" to "A la venta",
        "pronto" to "Próximamente",
        "agotado" to "Agotado",
        "pospuesto" to "Pospuesto",
        "cancelado" to "Cancelado",
    )

    fun today(): LocalDate = LocalDate.now(MX)

    /** La API guarda la fecha a mediodía UTC: se lee en UTC para no correrla de día. */
    fun date(show: PublicShowDto): LocalDate? =
        runCatching { Instant.parse(show.eventDate.orEmpty()).atZone(ZoneOffset.UTC).toLocalDate() }.getOrNull()

    fun status(show: PublicShowDto): String =
        show.showStatus?.takeIf { it in STATUS } ?: if (show.ctaHref.isNullOrBlank()) "pronto" else "venta"

    fun statusLabel(show: PublicShowDto): String = STATUS[status(show)].orEmpty()

    /** Solo se vende si el estado lo permite y el enlace es seguro. */
    fun ticketUrl(show: PublicShowDto): String? =
        show.ctaHref?.takeIf { status(show) == "venta" && it.startsWith("https://") }

    fun daysUntil(show: PublicShowDto, today: LocalDate = today()): Long? =
        date(show)?.let { ChronoUnit.DAYS.between(today, it) }

    fun isPast(show: PublicShowDto, today: LocalDate = today()): Boolean = (daysUntil(show, today) ?: 0) < 0

    fun countdown(show: PublicShowDto, today: LocalDate = today()): String? {
        val days = daysUntil(show, today) ?: return null
        return when {
            days < 0 -> null
            days == 0L -> "Es hoy"
            days == 1L -> "Es mañana"
            else -> "Faltan $days días"
        }
    }

    /** «4 de noviembre», con el año solo si no es este. */
    fun dayMonth(show: PublicShowDto, today: LocalDate = today()): String? {
        val day = date(show) ?: return null
        val pattern = if (day.year == today.year) "d 'de' MMMM" else "d 'de' MMMM 'de' yyyy"
        return day.format(DateTimeFormatter.ofPattern(pattern, ES))
    }

    fun longDate(show: PublicShowDto): String? = date(show)
        ?.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM 'de' yyyy", ES))
        ?.replaceFirstChar { it.titlecase(ES) }

    /** 21:30 → 9:30 p. m. */
    fun timeLabel(show: PublicShowDto): String? {
        val match = Regex("""^(\d{2}):(\d{2})$""").find(show.eventTime.orEmpty()) ?: return null
        val hours = match.groupValues[1].toInt()
        val twelve = if (hours % 12 == 0) 12 else hours % 12
        return "$twelve:${match.groupValues[2]} ${if (hours < 12) "a. m." else "p. m."}"
    }

    fun place(show: PublicShowDto): String? =
        listOfNotNull(show.venue, show.city).filter { it.isNotBlank() }.joinToString(", ").ifEmpty { null }

    fun siteUrl(show: PublicShowDto): String = "https://artaproducciones.com/p/arta/cartelera/${show.slug}"

    /** Inicio y fin para el calendario, en milisegundos. Sin hora: todo el día. */
    fun calendarSpan(show: PublicShowDto): CalendarSpan? {
        val day = date(show) ?: return null
        val match = Regex("""^(\d{2}):(\d{2})$""").find(show.eventTime.orEmpty())
            ?: return CalendarSpan(
                day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
                day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
                allDay = true,
            )
        val start = day.atTime(match.groupValues[1].toInt(), match.groupValues[2].toInt()).atZone(MX)
        // Tres horas: lo que suele durar una función.
        return CalendarSpan(start.toInstant().toEpochMilli(), start.plusHours(3).toInstant().toEpochMilli(), allDay = false)
    }

    data class CalendarSpan(val startMillis: Long, val endMillis: Long, val allDay: Boolean)
}
