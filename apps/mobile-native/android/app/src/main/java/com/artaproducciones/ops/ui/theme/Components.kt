package com.artaproducciones.ops.ui.theme

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.ScrollableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalDensity
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

/**
 * Al apretar, la pieza se hunde un poco (como el `ArtaPressStyle` de iOS) además del ripple.
 * Devuelve el modificador de escala; [interaction] es el mismo que recibe el `clickable`.
 */
@Composable
fun Modifier.pressScale(interaction: MutableInteractionSource, pressed: Float = 0.985f): Modifier {
    val isPressed by interaction.collectIsPressedAsState()
    val scale = animateFloatAsState(if (isPressed) pressed else 1f, spring(stiffness = Spring.StiffnessMediumLow), label = "pressScale")
    return graphicsLayer {
        scaleX = scale.value
        scaleY = scale.value
    }
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
    val interaction = remember { MutableInteractionSource() }
    val press = if (onClick != null) Modifier.pressScale(interaction) else Modifier
    val click = if (onClick != null) {
        Modifier.clickable(interactionSource = interaction, indication = LocalIndication.current, onClickLabel = onClickLabel, role = Role.Button, onClick = onClick)
    } else {
        Modifier
    }
    Column(
        modifier.fillMaxWidth().then(press).cardSurface(t).then(click).padding(contentPadding),
        verticalArrangement = verticalArrangement,
        content = content,
    )
}

// ─── Bordes que se desvanecen ───────────────────────────────────────────────

/**
 * Desvanece lo que se va por un borde de la lista en vez de cortarlo en seco: arriba bajo la barra
 * de estado o bajo los filtros, a la derecha de una fila de chips. Solo aparece cuando de verdad
 * hay más contenido de ese lado ([state]); en reposo, arriba del todo, no toca nada.
 */
@Composable
fun Modifier.fadingEdges(
    state: ScrollableState,
    horizontal: Boolean = false,
    start: Dp = 0.dp,
    end: Dp = 0.dp,
): Modifier {
    val startAlpha = animateFloatAsState(if (start > 0.dp && state.canScrollBackward) 1f else 0f, tween(160), label = "fadeStart")
    val endAlpha = animateFloatAsState(if (end > 0.dp && state.canScrollForward) 1f else 0f, tween(160), label = "fadeEnd")
    return this
        .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
        .drawWithContent {
            drawContent()
            val s = start.toPx()
            val e = end.toPx()
            val a = startAlpha.value
            val b = endAlpha.value
            if (a > 0f && s > 0f) {
                val faded = Color.Black.copy(alpha = 1f - a)
                if (horizontal) {
                    drawRect(Brush.horizontalGradient(listOf(faded, Color.Black), startX = 0f, endX = s), size = Size(s, size.height), blendMode = BlendMode.DstIn)
                } else {
                    drawRect(Brush.verticalGradient(listOf(faded, Color.Black), startY = 0f, endY = s), size = Size(size.width, s), blendMode = BlendMode.DstIn)
                }
            }
            if (b > 0f && e > 0f) {
                val faded = Color.Black.copy(alpha = 1f - b)
                if (horizontal) {
                    val x = size.width - e
                    drawRect(
                        Brush.horizontalGradient(listOf(Color.Black, faded), startX = x, endX = size.width),
                        topLeft = Offset(x, 0f),
                        size = Size(e, size.height),
                        blendMode = BlendMode.DstIn,
                    )
                } else {
                    val y = size.height - e
                    drawRect(
                        Brush.verticalGradient(listOf(Color.Black, faded), startY = y, endY = size.height),
                        topLeft = Offset(0f, y),
                        size = Size(size.width, e),
                        blendMode = BlendMode.DstIn,
                    )
                }
            }
        }
}

/** Fila de chips o filtros: margen de 16 dp en los dos extremos y bordes desvanecidos, nunca un chip cortado en seco. */
@Composable
fun ChipRow(modifier: Modifier = Modifier, content: LazyListScope.() -> Unit) {
    val state = rememberLazyListState()
    LazyRow(
        modifier.fillMaxWidth().fadingEdges(state, horizontal = true, start = 20.dp, end = 36.dp),
        state = state,
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

// ─── Esqueletos ─────────────────────────────────────────────────────────────

/**
 * Relleno de esqueleto con brillo que pasa (shimmer): papel un punto más hondo con brillo cálido
 * en ARTA; grafito con brillo plata tenue en Auditorio.
 */
@Composable
fun Modifier.skeleton(shape: Shape): Modifier {
    val t = LocalArtaTokens.current
    val base = if (t.isDark) Color(0xFF1B1B20) else Color(0xFFECEAE4)
    val glint = if (t.isDark) Color(0xFF2A2B31) else Color(0xFFF7F6F2)
    val progress = rememberInfiniteTransition(label = "shimmer").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing)),
        label = "shimmerX",
    )
    return clip(shape).drawBehind {
        val band = maxOf(size.width * 0.55f, 96.dp.toPx())
        val x = -band + (size.width + band * 2) * progress.value
        drawRect(base)
        drawRect(Brush.horizontalGradient(listOf(base, glint, base), startX = x, endX = x + band))
    }
}

// ─── Buscador ───────────────────────────────────────────────────────────────

/**
 * Buscador de las listas: superficie suave con línea fuerte, píldora en ARTA y 4 dp en Auditorio.
 * [compactPlaceholder] se usa con la letra del sistema agrandada, para que la ayuda no se corte.
 */
@Composable
fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector = Icons.Outlined.Search,
    compactPlaceholder: String? = null,
) {
    val t = LocalArtaTokens.current
    val hint = if (compactPlaceholder != null && LocalDensity.current.fontScale > 1.15f) compactPlaceholder else placeholder
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = { Text(hint, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingIcon = { Icon(leadingIcon, contentDescription = null, tint = t.secondary) },
        trailingIcon = {
            if (value.isNotEmpty()) IconButton(onClick = { onValueChange("") }) { Icon(Icons.Outlined.Close, contentDescription = "Limpiar") }
        },
        singleLine = true,
        shape = t.controlShape,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = t.text.copy(alpha = 0.45f),
            unfocusedBorderColor = t.lineStrong,
            focusedContainerColor = t.surfaceSoft,
            unfocusedContainerColor = t.surfaceSoft,
            cursorColor = t.text,
            unfocusedPlaceholderColor = t.tertiary,
            focusedPlaceholderColor = t.tertiary,
        ),
        modifier = modifier,
    )
}

/** Contador en píldora (aprobaciones, pendientes): acento con su texto y cifras tabulares. */
@Composable
fun CountBadge(count: Int, modifier: Modifier = Modifier, inverted: Boolean = false, small: Boolean = false) {
    val t = LocalArtaTokens.current
    val shape = if (t.isPill) RoundedCornerShape(percent = 50) else RoundedCornerShape(3.dp)
    val bg = if (inverted) SolidColor(t.onAccent) else t.accentBrush
    Box(
        modifier
            .defaultMinSize(minWidth = if (small) 17.dp else 22.dp)
            .clip(shape)
            .background(bg)
            // Pequeño y encima de un ícono: un aro del color de la tarjeta lo despega del dibujo.
            .then(if (small) Modifier.border(1.5.dp, t.surface, shape) else Modifier)
            .padding(horizontal = if (small) 4.dp else 7.dp, vertical = if (small) 0.dp else 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (count > 99) "99+" else "$count",
            color = if (inverted) t.accent else t.onAccent,
            style = ArtaType.Status.copy(fontSize = if (small) 10.sp else 11.sp, lineHeight = if (small) 15.sp else 14.sp, letterSpacing = 0.sp, fontFeatureSettings = TABULAR),
            maxLines = 1,
        )
    }
}

/**
 * Contador discreto de los encabezados de sección y filas de menú: relleno neutro y texto
 * secundario, para no competir con los estados «llenos», que sí piden acción.
 */
@Composable
fun QuietCount(count: Int, modifier: Modifier = Modifier) {
    val t = LocalArtaTokens.current
    val shape = if (t.isPill) RoundedCornerShape(percent = 50) else RoundedCornerShape(3.dp)
    Box(
        modifier
            .defaultMinSize(minWidth = 20.dp, minHeight = 18.dp)
            .clip(shape)
            .background(t.fill)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (count > 99) "99+" else "$count",
            color = t.secondary,
            style = ArtaType.Status.copy(letterSpacing = 0.sp, fontFeatureSettings = TABULAR),
            maxLines = 1,
        )
    }
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
    // Apagado a propósito (no un negro o una plata deslavados): relleno neutro y texto terciario.
    if (colors == null && t.accentBrush !is SolidColor) {
        Surface(
            onClick = onClick,
            modifier = modifier.semantics { role = Role.Button },
            enabled = enabled,
            shape = shape,
            color = Color.Transparent,
            contentColor = if (enabled) t.onAccent else t.tertiary,
            border = border,
            interactionSource = interactionSource,
        ) {
            ProvideTextStyle(MaterialTheme.typography.labelLarge) {
                Row(
                    Modifier
                        .background(if (enabled) t.accentBrush else SolidColor(t.fill))
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
            colors = colors ?: ButtonDefaults.buttonColors(disabledContainerColor = t.fill, disabledContentColor = t.tertiary),
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
    // «Hecho», «pagado» o «activo» no son alertas: van en monocromo, como en iOS. El rojo queda
    // solo para lo que de verdad falla (rechazada, bloqueada, cancelada).
    val (fg, border) = when (tone) {
        Tone.Action -> t.onAccent to Color.Transparent
        Tone.Info, Tone.Ok -> t.secondary to (if (t.isDark) Color(0x2EFFFFFF) else Color(0x330C0C0D))
        Tone.Strong, Tone.Warn -> t.text to t.text.copy(alpha = 0.45f)
        Tone.Danger -> t.danger to t.danger.copy(alpha = 0.5f)
    }
    val base = modifier.clip(shape)
    val painted = if (tone == Tone.Action) base.background(t.accentBrush) else base.border(1.dp, border, shape)
    Box(painted.padding(horizontal = 8.dp, vertical = 3.dp)) {
        Text(text.uppercase(ES_MX), color = fg, style = ArtaType.Status, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
    val count = options.size.coerceAtLeast(1)
    val haptics = LocalHapticFeedback.current
    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .clip(outer)
            .background(track)
            .then(if (t.isDark) Modifier.border(1.dp, Color(0x0FFFFFFF), outer) else Modifier)
            .padding(3.dp),
    ) {
        val gap = 3.dp
        val cell = (maxWidth - gap * (count - 1)) / count
        // La opción activa se desliza en vez de saltar.
        val x by animateDpAsState((cell + gap) * selected.coerceIn(0, count - 1), spring(stiffness = Spring.StiffnessMediumLow), label = "segment")
        Box(Modifier.matchParentSize()) {
            Box(
                Modifier
                    .offset(x = x)
                    .fillMaxHeight()
                    .width(cell)
                    .then(
                        if (t.isDark) Modifier.background(t.accentBrush, inner)
                        else Modifier.shadow(2.dp, inner, ambientColor = t.shadow, spotColor = t.shadow).background(t.surface, inner),
                    ),
            )
        }
        Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(gap)) {
            options.forEachIndexed { i, label ->
                val on = i == selected
                val color by animateColorAsState(
                    when {
                        !on -> t.tertiary
                        t.isDark -> t.onAccent
                        else -> t.text
                    },
                    tween(180),
                    label = "segmentText",
                )
                Box(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 38.dp)
                        .clip(inner)
                        .selectable(selected = on, role = Role.RadioButton, onClick = {
                            if (!on) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            onSelect(i)
                        })
                        .padding(vertical = 8.dp, horizontal = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = color,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
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
