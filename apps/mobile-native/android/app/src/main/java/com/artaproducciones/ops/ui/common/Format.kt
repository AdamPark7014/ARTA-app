package com.artaproducciones.ops.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artaproducciones.ops.ui.theme.ArtaColors
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

private val ES = Locale("es", "MX")
private val HM = DateTimeFormatter.ofPattern("HH:mm", ES)
private val SHORT_DATE = DateTimeFormatter.ofPattern("dd/MM/yy", ES)
private val LONG_DATE = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", ES)
private val WEEKDAY = DateTimeFormatter.ofPattern("EEEE", ES)

fun parseInstant(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** Hora de la lista de chats, como WhatsApp: hoy «14:05», ayer «Ayer», esta semana el día, luego la fecha. */
fun relativeTime(iso: String?): String {
    val instant = parseInstant(iso) ?: return ""
    val zone = ZoneId.systemDefault()
    val date = instant.atZone(zone).toLocalDate()
    val days = ChronoUnit.DAYS.between(date, LocalDate.now(zone))
    return when {
        days <= 0L -> HM.format(instant.atZone(zone))
        days == 1L -> "Ayer"
        days < 7L -> WEEKDAY.format(date).replaceFirstChar { it.titlecase(ES) }
        else -> SHORT_DATE.format(date)
    }
}

fun messageTime(iso: String?): String = parseInstant(iso)?.let { HM.format(it.atZone(ZoneId.systemDefault())) }.orEmpty()

fun dayKey(iso: String?): LocalDate? = parseInstant(iso)?.atZone(ZoneId.systemDefault())?.toLocalDate()

/** Separador de día en la conversación. */
fun dayLabel(date: LocalDate): String {
    val today = LocalDate.now()
    return when (date) {
        today -> "Hoy"
        today.minusDays(1) -> "Ayer"
        else -> LONG_DATE.format(date).replaceFirstChar { it.titlecase(ES) }
    }
}

private val MENTION = Regex("""\[@([^\]]{1,80})]\(user:([\w-]{1,64})\)""")

/** Texto de un mensaje con las menciones `[@Nombre](user:id)` como «@Nombre» en dorado. */
fun mentionText(body: String): AnnotatedString = buildAnnotatedString {
    var last = 0
    MENTION.findAll(body).forEach { m ->
        append(body.substring(last, m.range.first))
        withStyle(SpanStyle(color = ArtaColors.Gold, fontWeight = FontWeight.SemiBold)) { append("@" + m.groupValues[1]) }
        last = m.range.last + 1
    }
    append(body.substring(last))
}

/** Texto plano (vista previa, copiar): menciones como «@Nombre». */
fun plainText(body: String): String = MENTION.replace(body) { "@" + it.groupValues[1] }

fun mentionToken(name: String, userId: String) = "[@$name](user:$userId)"

fun initialsOf(name: String): String = name.trim().removePrefix("#")
    .split(Regex("\\s+"))
    .mapNotNull { w -> w.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar() }
    .take(2)
    .joinToString("")
    .ifBlank { "A" }

@Composable
fun Avatar(name: String, size: Dp = 44.dp, modifier: Modifier = Modifier, channel: Boolean = false) {
    Box(
        modifier = modifier
            .size(size)
            .background(if (channel) ArtaColors.Surface2 else ArtaColors.Gold, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (channel) "#" else initialsOf(name),
            color = if (channel) ArtaColors.Gold else ArtaColors.Bg,
            fontWeight = FontWeight.Bold,
            fontSize = (size.value * 0.38f).sp,
        )
    }
}

fun fileSize(bytes: Long?): String = when {
    bytes == null || bytes <= 0 -> ""
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    else -> String.format(ES, "%.1f MB", bytes / 1_048_576.0)
}
