package com.artaproducciones.ops.ui.theme

import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color

object ArtaColors {
    val Bg = Color(0xFF09090B)
    val BgElev = Color(0xFF111113)
    val Surface2 = Color(0xFF1A1A1E)
    val Line = Color(0xFF27272A)
    val Text = Color(0xFFFAFAFA)
    val Muted = Color(0xFFA1A1AA)
    val Gold = Color(0xFFC9A962)
    val GoldSoft = Color(0x33C9A962)
    val Danger = Color(0xFFEF4444)
    val Read = Color(0xFF38BDF8)
    val Mine = Color(0xFF2A2415)
}

private val scheme = darkColorScheme(
    primary = ArtaColors.Gold,
    onPrimary = ArtaColors.Bg,
    secondary = ArtaColors.Gold,
    onSecondary = ArtaColors.Bg,
    background = ArtaColors.Bg,
    onBackground = ArtaColors.Text,
    surface = ArtaColors.BgElev,
    onSurface = ArtaColors.Text,
    surfaceVariant = ArtaColors.Surface2,
    onSurfaceVariant = ArtaColors.Muted,
    outline = ArtaColors.Line,
    error = ArtaColors.Danger,
)

@Composable
fun ArtaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = Typography()) {
        // Las pantallas que no viven dentro de un Scaffold/Surface (detalle de tarea y de evento,
        // aprobaciones, eventos) heredaban el color de contenido por omisión de Material3, que es
        // negro: texto e íconos casi invisibles sobre el fondo oscuro.
        CompositionLocalProvider(LocalContentColor provides ArtaColors.Text, content = content)
    }
}
