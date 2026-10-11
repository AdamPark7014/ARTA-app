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
 * Nunito (Google Fonts, SIL OFL 1.1: `assets/licenses/Nunito-OFL.txt`): la letra redondeada y
 * amable de toda la app. Es variable (eje `wght` 200–1000); cada peso es una instancia del mismo
 * archivo, así el APK lleva solo dos fuentes (normal e itálica).
 */
private val WEIGHTS = listOf(300, 400, 500, 600, 700, 800, 900)

@OptIn(ExperimentalTextApi::class)
val Nunito: FontFamily = FontFamily(
    WEIGHTS.flatMap { w ->
        listOf(
            Font(R.font.nunito, FontWeight(w), FontStyle.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(w))),
            Font(R.font.nunito_italic, FontWeight(w), FontStyle.Italic, variationSettings = FontVariation.Settings(FontVariation.weight(w))),
        )
    },
)

/** Cifras tabulares (horas, montos, contadores): Nunito ya las trae del mismo ancho; se pide igual. */
const val TABULAR = "tnum"

private val base = Typography()

private fun TextStyle.nunito(weight: FontWeight? = null, spacing: Float? = null) = copy(
    fontFamily = Nunito,
    fontWeight = weight ?: fontWeight,
    letterSpacing = spacing?.sp ?: letterSpacing,
)

val ArtaTypography = Typography(
    displayLarge = base.displayLarge.nunito(FontWeight.Light),
    displayMedium = base.displayMedium.nunito(FontWeight.Light),
    displaySmall = base.displaySmall.nunito(FontWeight.Light),
    headlineLarge = base.headlineLarge.nunito(FontWeight.Light, -0.6f),
    headlineMedium = base.headlineMedium.nunito(FontWeight.Light, -0.5f),
    headlineSmall = base.headlineSmall.nunito(FontWeight.Normal, -0.3f),
    titleLarge = base.titleLarge.nunito(FontWeight.SemiBold, -0.2f),
    titleMedium = base.titleMedium.nunito(FontWeight.SemiBold, 0f),
    titleSmall = base.titleSmall.nunito(FontWeight.SemiBold, 0f),
    bodyLarge = base.bodyLarge.nunito(spacing = 0.1f),
    bodyMedium = base.bodyMedium.nunito(spacing = 0.1f),
    bodySmall = base.bodySmall.nunito(spacing = 0.15f),
    labelLarge = base.labelLarge.nunito(FontWeight.SemiBold, 0.1f),
    labelMedium = base.labelMedium.nunito(FontWeight.SemiBold, 0.2f),
    labelSmall = base.labelSmall.nunito(FontWeight.SemiBold, 0.3f),
)

/** Estilos propios del sistema visual (SISTEMA-VISUAL.md › Tipografía). */
object ArtaType {
    /** Etiqueta en MAYÚSCULAS (el texto se pasa ya en mayúsculas). */
    val Cap = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 1.6.sp)

    /** Saludo y título de pantalla: ligero; el nombre va en SemiBold. */
    val Greeting = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Light, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-0.8).sp)

    /** Título grande de pestaña («Tareas», «Avisos»). */
    val ScreenTitle = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Light, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.9).sp)

    /** Cifra de tarjeta: ligera y tabular. */
    val Kpi = TextStyle(
        fontFamily = Nunito,
        fontWeight = FontWeight.Light,
        fontSize = 30.sp,
        lineHeight = 34.sp,
        letterSpacing = (-1).sp,
        fontFeatureSettings = TABULAR,
    )

    /** Título de panel. */
    val PanelTitle = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp)

    /** Estado (píldora): MAYÚSCULAS 10.5. */
    val Status = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, lineHeight = 14.sp, letterSpacing = 0.6.sp)

    /** Horas y montos. */
    val Time = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp, fontFeatureSettings = TABULAR)
}
