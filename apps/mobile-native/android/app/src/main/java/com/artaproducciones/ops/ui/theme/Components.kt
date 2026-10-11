package com.artaproducciones.ops.ui.theme

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ButtonElevation
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.SelectableChipColors
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artaproducciones.ops.R
import com.artaproducciones.ops.data.BizEntity
import java.util.Locale

private val ES_MX: Locale = Locale("es", "MX")

// ─── Fondos ─────────────────────────────────────────────────────────────────

/**
 * Fondo de pantalla de la entidad: papel en ARTA; en Auditorio negro profundo con el brillo de
 * reflector arriba (radial plata al 16 %, SISTEMA-VISUAL.md › Tokens).
 */
fun Modifier.screenBackground(t: ArtaTokens): Modifier {
    val base = background(t.bg)
    if (t.glow.alpha == 0f) return base
    val glow = t.glow
    return base.drawBehind {
        val w = size.width
        val center = Offset(w * 0.5f, -w * 0.06f)
        scale(scaleX = 1f, scaleY = 0.72f, pivot = center) {
            drawRect(
                Brush.radialGradient(0f to glow, 0.55f to glow.copy(alpha = glow.alpha * 0.35f), 1f to Color.Transparent, center = center, radius = w * 0.78f),
            )
        }
    }
}

/** Superficie de tarjeta: blanca con sombra suave en ARTA, degradado tenue con línea en Auditorio. */
fun Modifier.cardSurface(t: ArtaTokens, shape: Shape = t.cardShape): Modifier {
    val lifted = if (t.cardElevation > 0.dp) {
        shadow(t.cardElevation, shape, clip = false, ambientColor = t.shadow, spotColor = t.shadow)
    } else {
        this
    }
    return lifted.clip(shape).background(t.cardBrush).border(1.dp, t.line, shape)
}

/** Tarjeta del sistema: panel con padding; si [onClick] no es null, toda la tarjeta es un botón. */
@Composable
fun ArtaCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onClickLabel: String? = null,
    contentPadding: PaddingValues = PaddingValues(14.dp),
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable ColumnScope.() -> Unit,
) {
    val t = LocalArtaTokens.current
    val click = if (onClick != null) Modifier.clickable(onClickLabel = onClickLabel, role = Role.Button, onClick = onClick) else Modifier
    Column(
        modifier.fillMaxWidth().cardSurface(t).then(click).padding(contentPadding),
        verticalArrangement = verticalArrangement,
        content = content,
    )
}

// ─── Botones (radios y acento de la entidad) ────────────────────────────────

/**
 * Botón principal: acento con su texto. En ARTA píldora tinta; en Auditorio 4 px y plata
 * metálica (degradado). Mismo contrato que el de Material3; [colors] explícitos ganan.
 */
@Composable
fun Button(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = LocalArtaTokens.current.controlShape,
    colors: ButtonColors? = null,
    elevation: ButtonElevation? = null,
    border: BorderStroke? = null,
    contentPadding: PaddingValues = ButtonDefaults.ContentPadding,
    interactionSource: MutableInteractionSource? = null,
    content: @Composable RowScope.() -> Unit,
) {
    val t = LocalArtaTokens.current
    if (colors == null && t.accentBrush !is SolidColor) {
        Surface(
            onClick = onClick,
            modifier = modifier.semantics { role = Role.Button },
            enabled = enabled,
            shape = shape,
            color = Color.Transparent,
            contentColor = if (enabled) t.onAccent else t.text.copy(alpha = 0.38f),
            border = border,
            interactionSource = interactionSource,
        ) {
            ProvideTextStyle(MaterialTheme.typography.labelLarge) {
                Row(
                    Modifier
                        .background(if (enabled) t.accentBrush else SolidColor(t.text.copy(alpha = 0.12f)))
                        .defaultMinSize(ButtonDefaults.MinWidth, ButtonDefaults.MinHeight)
                        .padding(contentPadding),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                    content = content,
                )
            }
        }
    } else {
        androidx.compose.material3.Button(
            onClick = onClick,
            modifier = modifier,
            enabled = enabled,
            shape = shape,
            colors = colors ?: ButtonDefaults.buttonColors(),
            elevation = elevation,
            border = border,
            contentPadding = contentPadding,
            interactionSource = interactionSource,
            content = content,
        )
    }
}

/** Botón secundario: superficie con borde de línea fuerte y texto principal. */
@Composable
fun OutlinedButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = LocalArtaTokens.current.controlShape,
    colors: ButtonColors = ButtonDefaults.outlinedButtonColors(contentColor = LocalArtaTokens.current.text),
    elevation: ButtonElevation? = null,
    border: BorderStroke? = BorderStroke(1.dp, if (enabled) LocalArtaTokens.current.lineStrong else LocalArtaTokens.current.line),
    contentPadding: PaddingValues = ButtonDefaults.ContentPadding,
    interactionSource: MutableInteractionSource? = null,
    content: @Composable RowScope.() -> Unit,
) = androidx.compose.material3.OutlinedButton(
    onClick = onClick,
    modifier = modifier,
    enabled = enabled,
    shape = shape,
    colors = colors,
    elevation = elevation,
    border = border,
    contentPadding = contentPadding,
    interactionSource = interactionSource,
    content = content,
)

/** Botón de texto con el radio de la entidad. */
@Composable
fun TextButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = LocalArtaTokens.current.controlShape,
    colors: ButtonColors = ButtonDefaults.textButtonColors(),
    elevation: ButtonElevation? = null,
    border: BorderStroke? = null,
    contentPadding: PaddingValues = ButtonDefaults.TextButtonContentPadding,
    interactionSource: MutableInteractionSource? = null,
    content: @Composable RowScope.() -> Unit,
) = androidx.compose.material3.TextButton(
    onClick = onClick,
    modifier = modifier,
    enabled = enabled,
    shape = shape,
    colors = colors,
    elevation = elevation,
    border = border,
    contentPadding = contentPadding,
    interactionSource = interactionSource,
    content = content,
)

// ─── Estados ────────────────────────────────────────────────────────────────

/** Relleno = requiere acción; contorno = informativo. Los semánticos solo en errores y alertas reales. */
enum class Tone { Action, Info, Strong, Danger, Ok, Warn }

@Composable
fun StatusPill(text: String, tone: Tone, modifier: Modifier = Modifier) {
    val t = LocalArtaTokens.current
    val shape = if (t.isPill) RoundedCornerShape(percent = 50) else RoundedCornerShape(3.dp)
    val (fg, border) = when (tone) {
        Tone.Action -> t.onAccent to Color.Transparent
        Tone.Info -> t.secondary to (if (t.isDark) Color(0x2EFFFFFF) else Color(0x330C0C0D))
        Tone.Strong -> t.text to t.text.copy(alpha = 0.45f)
        Tone.Danger -> t.danger to t.danger.copy(alpha = 0.5f)
        Tone.Ok -> t.ok to t.ok.copy(alpha = 0.5f)
        Tone.Warn -> t.warn to t.warn.copy(alpha = 0.5f)
    }
    val base = modifier.clip(shape)
    val painted = if (tone == Tone.Action) base.background(t.accentBrush) else base.border(1.dp, border, shape)
    Box(painted.padding(horizontal = 8.dp, vertical = 3.dp)) {
        Text(text.uppercase(ES_MX), color = fg, style = ArtaType.Status, maxLines = 1)
    }
}

// ─── Chips de filtro ────────────────────────────────────────────────────────

/** Chip de filtro: activo = acento con su texto (relleno); inactivo = contorno de línea fuerte. */
@Composable
fun artaFilterChipColors(): SelectableChipColors {
    val t = LocalArtaTokens.current
    return FilterChipDefaults.filterChipColors(
        containerColor = Color.Transparent,
        labelColor = t.secondary,
        iconColor = t.secondary,
        selectedContainerColor = t.accent,
        selectedLabelColor = t.onAccent,
        selectedLeadingIconColor = t.onAccent,
        selectedTrailingIconColor = t.onAccent,
    )
}

@Composable
fun artaFilterChipBorder(selected: Boolean): BorderStroke =
    FilterChipDefaults.filterChipBorder(
        enabled = true,
        selected = selected,
        borderColor = LocalArtaTokens.current.lineStrong,
        selectedBorderColor = Color.Transparent,
    )

// ─── Segmentado ─────────────────────────────────────────────────────────────

/**
 * Selector segmentado del sistema: en ARTA fondo `#efede8` y la opción activa blanca con sombra;
 * en Auditorio fondo tenue con línea y la activa en plata con texto negro.
 */
@Composable
fun SegmentedControl(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val t = LocalArtaTokens.current
    val outer = if (t.isPill) RoundedCornerShape(12.dp) else RoundedCornerShape(5.dp)
    val inner = if (t.isPill) RoundedCornerShape(9.dp) else RoundedCornerShape(3.dp)
    val track = if (t.isDark) Color(0x09FFFFFF) else t.fill
    Row(
        modifier
            .fillMaxWidth()
            .clip(outer)
            .background(track)
            .then(if (t.isDark) Modifier.border(1.dp, Color(0x0FFFFFFF), outer) else Modifier)
            .padding(3.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        options.forEachIndexed { i, label ->
            val on = i == selected
            val chosen = when {
                !on -> Modifier
                t.isDark -> Modifier.background(t.accentBrush, inner)
                else -> Modifier.shadow(2.dp, inner, ambientColor = t.shadow, spotColor = t.shadow).background(t.surface, inner)
            }
            Box(
                Modifier
                    .weight(1f)
                    .then(chosen)
                    .clip(inner)
                    .selectable(selected = on, role = Role.RadioButton, onClick = { onSelect(i) })
                    .padding(vertical = 8.dp, horizontal = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = when {
                        !on -> t.tertiary
                        t.isDark -> t.onAccent
                        else -> t.text
                    },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

// ─── Marca ──────────────────────────────────────────────────────────────────

/** Logo del encabezado: «arta» en tinta o «EXPLANADA» en plata. */
@Composable
fun BrandMark(entity: BizEntity, modifier: Modifier = Modifier) {
    val t = LocalArtaTokens.current
    if (entity == BizEntity.EXPLANADA) {
        Text(
            "EXPLANADA",
            modifier = modifier.semantics { contentDescription = entity.brand },
            style = TextStyle(
                brush = Brush.linearGradient(listOf(Color(0xFFFFFFFF), Color(0xFFC7CCD4), Color(0xFF8E95A0))),
                fontFamily = Nunito,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 21.sp,
                letterSpacing = 1.4.sp,
            ),
            maxLines = 1,
        )
    } else {
        Image(
            painter = painterResource(R.drawable.arta_wordmark),
            contentDescription = entity.brand,
            colorFilter = ColorFilter.tint(t.text),
            modifier = modifier.height(27.dp),
        )
    }
}

/** Aviso «Ahora en …» al cambiar de entidad: píldora tinta en ARTA, plata con texto negro en Auditorio. */
@Composable
fun EntitySwitchBanner(message: String, modifier: Modifier = Modifier) {
    val t = LocalArtaTokens.current
    val shape = if (t.isPill) RoundedCornerShape(percent = 50) else RoundedCornerShape(6.dp)
    Row(
        modifier
            .fillMaxWidth()
            .shadow(10.dp, shape, ambientColor = Color.Black, spotColor = Color.Black)
            .clip(shape)
            .background(t.accentBrush)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.SwapHoriz, contentDescription = null, tint = t.onAccent, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(10.dp))
        Text(message, color = t.onAccent, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
    }
}
