package com.artaproducciones.ops.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.artaproducciones.ops.R

/**
 * Inter para leer e Inter Tight para titulares y cifras (SIL OFL 1.1: `assets/licenses/Inter-OFL.txt`),
 * la misma letra del sitio y del panel desde el rediseño del 02-11-2026. Son variables (eje `wght`): cada
 * peso es una instancia del mismo archivo. La itálica la sintetiza Compose.
 */
private val WEIGHTS = listOf(300, 400, 500, 600, 700, 800, 900)

@OptIn(ExperimentalTextApi::class)
private fun variable(file: Int): FontFamily = FontFamily(
    WEIGHTS.map { w ->
        Font(file, FontWeight(w), FontStyle.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(w)))
    },
)

val Inter: FontFamily = variable(R.font.inter)
val InterTight: FontFamily = variable(R.font.inter_tight)

/** Cifras tabulares (horas, montos, contadores). */
const val TABULAR = "tnum"

private val base = Typography()

private fun TextStyle.inter(weight: FontWeight? = null, spacing: Float? = null) = copy(
    fontFamily = Inter,
    fontWeight = weight ?: fontWeight,
    letterSpacing = spacing?.sp ?: letterSpacing,
)

private fun TextStyle.tight(spacing: Float) = copy(
    fontFamily = InterTight,
    fontWeight = FontWeight.SemiBold,
    letterSpacing = spacing.sp,
)

val ArtaTypography = Typography(
    displayLarge = base.displayLarge.tight(-1f),
    displayMedium = base.displayMedium.tight(-0.9f),
    displaySmall = base.displaySmall.tight(-0.8f),
    headlineLarge = base.headlineLarge.tight(-0.7f),
    headlineMedium = base.headlineMedium.tight(-0.6f),
    headlineSmall = base.headlineSmall.tight(-0.4f),
    titleLarge = base.titleLarge.inter(FontWeight.SemiBold, -0.3f),
    titleMedium = base.titleMedium.inter(FontWeight.SemiBold, -0.1f),
    titleSmall = base.titleSmall.inter(FontWeight.SemiBold, 0f),
    bodyLarge = base.bodyLarge.inter(spacing = -0.1f),
    bodyMedium = base.bodyMedium.inter(spacing = -0.05f),
    bodySmall = base.bodySmall.inter(spacing = 0f),
    labelLarge = base.labelLarge.inter(FontWeight.Medium, -0.05f),
    labelMedium = base.labelMedium.inter(FontWeight.Medium, 0f),
    labelSmall = base.labelSmall.inter(FontWeight.Medium, 0f),
)

/** Estilos propios del sistema visual (SISTEMA-VISUAL.md › Tipografía). */
object ArtaType {
    /** Etiqueta: se lee como frase, sin mayúsculas forzadas. */
    val Cap = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = 12.5.sp, lineHeight = 16.sp)

    /** Saludo y título de pantalla. */
    val Greeting = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-0.7).sp)

    /** Título grande de pestaña («Tareas», «Avisos»). */
    val ScreenTitle = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.8).sp)

    /** Cifra de tarjeta: con peso y tabular. */
    val Kpi = TextStyle(
        fontFamily = InterTight,
        fontWeight = FontWeight.SemiBold,
        fontSize = 30.sp,
        lineHeight = 34.sp,
        letterSpacing = (-1).sp,
        fontFeatureSettings = TABULAR,
    )

    /** Título de panel. */
    val PanelTitle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp, letterSpacing = (-0.2).sp)

    /** Estado (píldora): chico, pero en frase. */
    val Status = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = 11.5.sp, lineHeight = 14.sp)

    /** Horas y montos. */
    val Time = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp, fontFeatureSettings = TABULAR)
}
