package com.artaproducciones.ops.ui.theme

import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.artaproducciones.ops.data.ActiveEntity
import com.artaproducciones.ops.data.BizEntity

/** Acento de cada entidad (docs/entidades-arta-auditorio.md): dorado Arta, plateado Auditorio. */
data class EntityPalette(
    /** Acento principal: botones, indicadores, cifras. */
    val accent: Color,
    /** Variante oscura del acento (bordes y estados presionados). */
    val deep: Color,
    /** Fondo de mis burbujas del chat, teñido con el acento. */
    val mine: Color,
) {
    companion object {
        val ARTA = EntityPalette(accent = Color(0xFFC9A962), deep = Color(0xFFA88B47), mine = Color(0xFF2A2415))
        val AUDITORIO = EntityPalette(accent = Color(0xFFC7CCD4), deep = Color(0xFF9AA1AC), mine = Color(0xFF22252B))

        fun of(entity: BizEntity): EntityPalette = if (entity == BizEntity.EXPLANADA) AUDITORIO else ARTA
    }
}

object ArtaColors {
    val Bg = Color(0xFF09090B)
    val BgElev = Color(0xFF111113)
    val Surface2 = Color(0xFF1A1A1E)
    val Line = Color(0xFF27272A)
    val Text = Color(0xFFFAFAFA)
    val Muted = Color(0xFFA1A1AA)
    val Danger = Color(0xFFEF4444)
    val Read = Color(0xFF38BDF8)

    /** La paleta de la entidad activa. Leerla en una pantalla la recompone al cambiar de entidad. */
    val palette: EntityPalette get() = EntityPalette.of(ActiveEntity.current)

    /**
     * Acento de la entidad activa. Se llama `Gold` por historia (todas las pantallas lo usan):
     * en Arta es el dorado `#C9A962`, en Auditorio el plateado `#C7CCD4`.
     */
    val Gold: Color get() = palette.accent
    val GoldSoft: Color get() = palette.accent.copy(alpha = 0.2f)
    val AccentDeep: Color get() = palette.deep
    val Mine: Color get() = palette.mine
}

/** Entidad activa para las pantallas (la provee [ArtaTheme]). */
val LocalActiveEntity = staticCompositionLocalOf { BizEntity.ARTA }

private fun schemeFor(accent: Color) = darkColorScheme(
    primary = accent,
    onPrimary = ArtaColors.Bg,
    secondary = accent,
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
    val entity = ActiveEntity.current
    val accent = EntityPalette.of(entity).accent
    val scheme = remember(accent) { schemeFor(accent) }
    MaterialTheme(colorScheme = scheme, typography = Typography()) {
        // Las pantallas que no viven dentro de un Scaffold/Surface (detalle de tarea y de evento,
        // aprobaciones, eventos) heredaban el color de contenido por omisión de Material3, que es
        // negro: texto e íconos casi invisibles sobre el fondo oscuro.
        CompositionLocalProvider(
            LocalContentColor provides ArtaColors.Text,
            LocalActiveEntity provides entity,
            content = content,
        )
    }
}
