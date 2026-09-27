package com.artaproducciones.ops.ui.common

import androidx.compose.material.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun relativeTime(iso: String): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.getDefault())
    val date = formatter.parse(iso) ?: return "Invalid Date"
    val now = Date()
    val diff = (now.time - date.time) / 1000
    return when {
        diff < 3600 -> "Hoy"
        diff < 86400 -> "Ayer"
        diff < 604800 -> SimpleDateFormat("EEEE", Locale.getDefault()).format(date)
        else -> SimpleDateFormat("dd/MM/yy", Locale.getDefault()).format(date)
    }
}

@Composable
fun messageTime(iso: String): String {
    val formatter = SimpleDateFormat("HH:mm", Locale.getDefault())
    return formatter.format(Date(iso.toLong()))
}

@Composable
fun dayLabel(iso: String): String {
    val formatter = SimpleDateFormat("dd/MM/yy", Locale.getDefault())
    val date = Date(iso.toLong())
    val now = Date()
    return if (date.time == now.time) "Hoy" else if (date.time == Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -1) }.time) "Ayer" else formatter.format(date)
}

@Composable
fun mentionText(body: String): AnnotatedString {
    return buildAnnotatedString {
        val regex = Regex("@(\\w+):(\\d+)")
        var lastIndex = 0
        body.split(regex).forEach { part ->
            if (lastIndex < body.length) {
                append(body.substring(lastIndex, lastIndex + part.length))
                lastIndex += part.length
            }
            if (regex.matchEntire(part) != null) {
                val (name, id) = regex.matchEntire(part)!!.destructured
                withStyle(MaterialTheme.typography.body1.copy(fontWeight = FontWeight.Bold, color = Color.Yellow)) {
                    append("@$name")
                }
            }
        }
    }
}

@Composable
fun Avatar(name: String, size: Int) {
    // Composable implementation for Avatar with gold circle initials
    // ...
}