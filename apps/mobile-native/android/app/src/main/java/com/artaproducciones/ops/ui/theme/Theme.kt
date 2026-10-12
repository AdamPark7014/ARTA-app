package com.artaproducciones.ops.ui.theme

import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ripple.RippleAlpha
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RippleConfiguration
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.ActiveEntity
import com.artaproducciones.ops.data.BizEntity

/**
 * Tokens del sistema visual aprobado (docs/diseno/SISTEMA-VISUAL.md). Opuestos: ARTA es papel y
 * tinta (claro, redondeado, sombras suaves); Auditorio es negro profundo con reflector y plata
 * (oscuro, esquinas rectas, líneas finas). Todo sale de aquí según la entidad activa.
 */
@Immutable
data class ArtaTokens(
    val entity: BizEntity,
    val isDark: Boolean,
    /** Fondo de pantalla. */
    val bg: Color,
    /** Brillo de reflector arriba (solo Auditorio; transparente en ARTA). */
    val glow: Color,
    /** Tarjetas, hojas y diálogos (sólido). */
    val surface: Color,
    /** Menús e inputs. */
    val surfaceSoft: Color,
    /** Relleno neutro: fondo del segmentado, esqueletos, chips de reacción. */
    val fill: Color,
    val text: Color,
    val secondary: Color,
    val tertiary: Color,
    val line: Color,
    val lineStrong: Color,
    /** Acento sólido: tinta en ARTA, plata en Auditorio. */
    val accent: Color,
    /** Acento con su degradado (plata metálica en Auditorio; sólido en ARTA). */
    val accentBrush: Brush,
    val onAccent: Color,
    /** Acento muy tenue: selección, menciones, resaltados. */
    val accentSoft: Color,
    val danger: Color,
    val ok: Color,
    val warn: Color,
    /** Mis burbujas del chat. */
    val mine: Color,
    val onMine: Color,
    val onMineSecondary: Color,
    /** Fondo de la tarjeta (degradado en Auditorio). */
    val cardBrush: Brush,
    val cardRadius: Dp,
    /** Radio de botones, chips y estados. Null = píldora. */
    val controlRadius: Dp?,
    /** Radio de ítems de menú e inputs. */
    val itemRadius: Dp,
    /** Sombra de tarjeta (0 en Auditorio: allí manda la línea). */
    val cardElevation: Dp,
    val shadow: Color,
) {
    val cardShape: CornerBasedShape get() = RoundedCornerShape(cardRadius)
    val controlShape: CornerBasedShape get() = controlRadius?.let { RoundedCornerShape(it) } ?: RoundedCornerShape(percent = 50)
    val itemShape: CornerBasedShape get() = RoundedCornerShape(itemRadius)
    val isPill: Boolean get() = controlRadius == null

    /**
     * Tokens para lo que va dentro de mi burbuja del chat: en ARTA la burbuja es tinta, así que
     * texto, metadatos, citas y adjuntos pasan a blanco; en Auditorio solo se aclara el relleno.
     */
    fun inMine(): ArtaTokens = if (isDark) {
        copy(fill = Color(0x17FFFFFF), surface = Color(0x0FFFFFFF), line = Color(0x1AFFFFFF))
    } else {
        copy(
            text = onMine,
            secondary = Color(0xB8FFFFFF),
            tertiary = Color(0x99FFFFFF),
            line = Color(0x29FFFFFF),
            lineStrong = Color(0x3DFFFFFF),
            accent = Color.White,
            accentBrush = SolidColor(Color.White),
            onAccent = mine,
            accentSoft = Color(0x24FFFFFF),
            fill = Color(0x1FFFFFFF),
            surface = Color(0x14FFFFFF),
            danger = Color(0xFFFDA29B),
            ok = Color(0xFF75E0A7),
            warn = Color(0xFFFEC84B),
        )
    }

    companion object {
        val ARTA = ArtaTokens(
            entity = BizEntity.ARTA,
            isDark = false,
            bg = Color(0xFFF7F6F3),
            glow = Color.Transparent,
            surface = Color(0xFFFFFFFF),
            surfaceSoft = Color(0xFFFCFBF9),
            fill = Color(0xFFEFEDE8),
            text = Color(0xFF0C0C0D),
            secondary = Color(0xFF55555C),
            // AA como la web: #8b8b92 daba 3.4:1 sobre blanco.
            tertiary = Color(0xFF6B6B73),
            line = Color(0x120C0C0D),
            lineStrong = Color(0x1F0C0C0D),
            accent = Color(0xFF0C0C0D),
            accentBrush = SolidColor(Color(0xFF0C0C0D)),
            onAccent = Color(0xFFFFFFFF),
            accentSoft = Color(0x0F0C0C0D),
            danger = Color(0xFFB42318),
            ok = Color(0xFF067647),
            warn = Color(0xFFB54708),
            mine = Color(0xFF0C0C0D),
            onMine = Color(0xFFFFFFFF),
            onMineSecondary = Color(0xA6FFFFFF),
            cardBrush = SolidColor(Color(0xFFFFFFFF)),
            cardRadius = 16.dp,
            controlRadius = null,
            itemRadius = 10.dp,
            cardElevation = 3.dp,
            shadow = Color(0x330C0C0D),
        )

        private val SILVER = Brush.linearGradient(
            0f to Color(0xFFF1F3F6),
            0.55f to Color(0xFFC7CCD4),
            1f to Color(0xFF9AA1AC),
            start = Offset.Zero,
            end = Offset.Infinite,
        )

        val AUDITORIO = ArtaTokens(
            entity = BizEntity.EXPLANADA,
            isDark = true,
            bg = Color(0xFF08080A),
            glow = Color(0x29C7CCD4),
            surface = Color(0xFF111114),
            surfaceSoft = Color(0xFF121215),
            fill = Color(0xFF1A1A1E),
            text = Color(0xFFF2F2F4),
            secondary = Color(0xFFA1A1AA),
            // AA como la web: bajo el reflector #85858e quedaba en 4.4:1.
            tertiary = Color(0xFF8A8A93),
            line = Color(0x12FFFFFF),
            lineStrong = Color(0x1FFFFFFF),
            accent = Color(0xFFC7CCD4),
            accentBrush = SILVER,
            onAccent = Color(0xFF0A0A0B),
            accentSoft = Color(0x24C7CCD4),
            danger = Color(0xFFF97066),
            ok = Color(0xFF47CD89),
            warn = Color(0xFFFDB022),
            mine = Color(0xFF24272D),
            onMine = Color(0xFFF2F2F4),
            onMineSecondary = Color(0xFFA1A1AA),
            cardBrush = Brush.verticalGradient(listOf(Color(0x08FFFFFF), Color(0x03FFFFFF))),
            cardRadius = 6.dp,
            controlRadius = 4.dp,
            itemRadius = 4.dp,
            cardElevation = 0.dp,
            shadow = Color.Transparent,
        )

        fun of(entity: BizEntity): ArtaTokens = if (entity == BizEntity.EXPLANADA) AUDITORIO else ARTA
    }
}

/** Tokens de la entidad activa (los provee [ArtaTheme]). */
val LocalArtaTokens = staticCompositionLocalOf { ArtaTokens.ARTA }

/** Entidad activa para las pantallas (la provee [ArtaTheme]). */
val LocalActiveEntity = staticCompositionLocalOf { BizEntity.ARTA }

/**
 * Atajos a los tokens de la entidad activa. Los nombres viejos se conservan (todas las pantallas
 * los usan): `Gold` es el acento (tinta en ARTA, plata en Auditorio), `Muted` el texto secundario,
 * `BgElev` la superficie de tarjeta y `Surface2` el relleno neutro.
 */
object ArtaColors {
    val Bg: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.bg
    val BgElev: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.surface
    val SurfaceSoft: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.surfaceSoft
    val Surface2: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.fill
    val Line: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.line
    val LineStrong: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.lineStrong
    val Text: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.text
    val Muted: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.secondary
    val Tertiary: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.tertiary
    val Danger: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.danger
    val Ok: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.ok
    val Warn: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.warn

    /** Texto sobre un botón de peligro: blanco en ARTA, negro sobre el coral de Auditorio. */
    val OnDanger: Color @Composable @ReadOnlyComposable get() = if (LocalArtaTokens.current.isDark) Color(0xFF0A0A0B) else Color.White

    /** Estado «en curso / visto»: monocromo, el texto principal. */
    val Read: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.text

    /** Acento de la entidad activa (nombre histórico: antes era dorado). */
    val Gold: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.accent
    val OnAccent: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.onAccent
    val GoldSoft: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.accentSoft
    val Mine: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.mine
    val OnMine: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.onMine
    val OnMineSecondary: Color @Composable @ReadOnlyComposable get() = LocalArtaTokens.current.onMineSecondary
}

private fun schemeFor(t: ArtaTokens): ColorScheme = if (t.isDark) {
    darkColorScheme(
        primary = t.accent,
        onPrimary = t.onAccent,
        primaryContainer = Color(0xFF26282D),
        onPrimaryContainer = t.text,
        inversePrimary = Color(0xFF55555C),
        secondary = t.accent,
        onSecondary = t.onAccent,
        secondaryContainer = Color(0xFF222226),
        onSecondaryContainer = t.text,
        tertiary = t.accent,
        onTertiary = t.onAccent,
        tertiaryContainer = Color(0xFF222226),
        onTertiaryContainer = t.text,
        background = t.bg,
        onBackground = t.text,
        surface = t.surface,
        onSurface = t.text,
        surfaceVariant = t.fill,
        onSurfaceVariant = t.secondary,
        surfaceTint = Color.Transparent,
        inverseSurface = t.accent,
        inverseOnSurface = t.onAccent,
        error = t.danger,
        onError = t.onAccent,
        errorContainer = Color(0xFF3A1714),
        onErrorContainer = Color(0xFFFECDCA),
        outline = t.lineStrong,
        outlineVariant = t.line,
        scrim = Color.Black,
        surfaceBright = Color(0xFF1E1E22),
        surfaceDim = t.bg,
        surfaceContainerLowest = Color(0xFF0C0C0E),
        surfaceContainerLow = t.surface,
        surfaceContainer = Color(0xFF141417),
        surfaceContainerHigh = Color(0xFF17171A),
        surfaceContainerHighest = Color(0xFF1C1C20),
    )
} else {
    lightColorScheme(
        primary = t.accent,
        onPrimary = t.onAccent,
        primaryContainer = t.fill,
        onPrimaryContainer = t.text,
        inversePrimary = Color(0xFFC7CCD4),
        secondary = t.accent,
        onSecondary = t.onAccent,
        secondaryContainer = t.fill,
        onSecondaryContainer = t.text,
        tertiary = t.accent,
        onTertiary = t.onAccent,
        tertiaryContainer = t.fill,
        onTertiaryContainer = t.text,
        background = t.bg,
        onBackground = t.text,
        surface = t.surface,
        onSurface = t.text,
        surfaceVariant = t.fill,
        onSurfaceVariant = t.secondary,
        surfaceTint = Color.Transparent,
        inverseSurface = t.accent,
        inverseOnSurface = t.onAccent,
        error = t.danger,
        onError = Color.White,
        errorContainer = Color(0xFFFEE4E2),
        onErrorContainer = Color(0xFF7A271A),
        outline = t.lineStrong,
        outlineVariant = t.line,
        scrim = Color.Black,
        surfaceBright = t.surface,
        surfaceDim = t.fill,
        surfaceContainerLowest = t.surface,
        surfaceContainerLow = t.surfaceSoft,
        surfaceContainer = t.surface,
        surfaceContainerHigh = t.surface,
        surfaceContainerHighest = t.fill,
    )
}

private fun shapesFor(t: ArtaTokens): Shapes = if (t.isDark) {
    Shapes(
        extraSmall = RoundedCornerShape(4.dp),
        small = RoundedCornerShape(4.dp),
        medium = RoundedCornerShape(6.dp),
        large = RoundedCornerShape(6.dp),
        extraLarge = RoundedCornerShape(8.dp),
    )
} else {
    Shapes(
        extraSmall = RoundedCornerShape(10.dp),
        small = RoundedCornerShape(percent = 50),
        medium = RoundedCornerShape(16.dp),
        large = RoundedCornerShape(20.dp),
        extraLarge = RoundedCornerShape(24.dp),
    )
}

/**
 * Ripple por entidad: sobre el papel de ARTA un velo de tinta muy tenue (el de Material se ve
 * sucio); sobre el negro del Auditorio un brillo un punto más presente para que se note.
 */
private val RIPPLE_ARTA = RippleAlpha(draggedAlpha = 0.10f, focusedAlpha = 0.10f, hoveredAlpha = 0.05f, pressedAlpha = 0.07f)
private val RIPPLE_AUDITORIO = RippleAlpha(draggedAlpha = 0.16f, focusedAlpha = 0.14f, hoveredAlpha = 0.08f, pressedAlpha = 0.13f)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtaTheme(content: @Composable () -> Unit) {
    val entity = ActiveEntity.current
    val tokens = ArtaTokens.of(entity)
    val scheme = remember(entity) { schemeFor(tokens) }
    val shapes = remember(entity) { shapesFor(tokens) }
    val ripple = remember(entity) { RippleConfiguration(rippleAlpha = if (tokens.isDark) RIPPLE_AUDITORIO else RIPPLE_ARTA) }
    MaterialTheme(colorScheme = scheme, typography = ArtaTypography, shapes = shapes) {
        // Las pantallas que no viven dentro de un Scaffold/Surface (detalle de tarea y de evento,
        // aprobaciones, eventos) heredaban el color de contenido por omisión de Material3: se fija
        // el texto de la entidad para que nada salga con el contraste del otro modo.
        CompositionLocalProvider(
            LocalArtaTokens provides tokens,
            LocalContentColor provides tokens.text,
            LocalActiveEntity provides entity,
            LocalRippleConfiguration provides ripple,
            content = content,
        )
    }
}
