package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.artaproducciones.ops.data.ChatRefs
import com.artaproducciones.ops.data.api.ChatRefDto
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import kotlin.math.max
import kotlin.math.roundToInt

/** Bloques del formato tipo Slack (contrato chat v2, sección 7). */
sealed interface MdBlock {
    data class Paragraph(val text: String) : MdBlock
    data class Code(val text: String) : MdBlock
    data class Quote(val text: String) : MdBlock
    data class Item(val marker: String, val text: String) : MdBlock
}

private const val FENCE = "```"
private val ORDERED = Regex("""^(\d{1,3})[.)]\s+(.*)$""")
private val BULLET = Regex("""^[-•*]\s+(.*)$""")
private val QUOTE = Regex("""^>\s?(.*)$""")

// Menciones y enlaces heredan el color del texto que los rodea (monocromo): se leen igual en mi
// burbuja (tinta o grafito) y en la ajena. El gris al 15 % marca la mención en los dos modos.
private val MentionStyle = SpanStyle(background = Color(0x26888888), fontWeight = FontWeight.Bold)
private val LinkStyles = TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline, fontWeight = FontWeight.SemiBold))

fun parseBlocks(body: String): List<MdBlock> {
    val out = ArrayList<MdBlock>()
    var rest = body
    while (true) {
        val open = rest.indexOf(FENCE)
        val close = if (open >= 0) rest.indexOf(FENCE, open + FENCE.length) else -1
        if (open < 0 || close < 0) {
            parseLines(rest, out)
            break
        }
        parseLines(rest.substring(0, open), out)
        val code = rest.substring(open + FENCE.length, close).trim('\n').trimEnd()
        if (code.isNotEmpty()) out.add(MdBlock.Code(code))
        rest = rest.substring(close + FENCE.length)
    }
    return out
}

private fun parseLines(text: String, out: MutableList<MdBlock>) {
    if (text.isBlank()) return
    val para = StringBuilder()
    val quote = StringBuilder()
    fun flushPara() {
        if (para.isNotBlank()) out.add(MdBlock.Paragraph(para.toString().trim('\n')))
        para.clear()
    }
    fun flushQuote() {
        if (quote.isNotBlank()) out.add(MdBlock.Quote(quote.toString().trimEnd('\n')))
        quote.clear()
    }
    for (line in text.trim('\n').split('\n')) {
        val q = QUOTE.matchEntire(line)
        val b = if (q == null) BULLET.matchEntire(line) else null
        val o = if (q == null && b == null) ORDERED.matchEntire(line) else null
        when {
            q != null -> {
                flushPara()
                quote.append(q.groupValues[1]).append('\n')
            }
            b != null -> {
                flushPara(); flushQuote()
                out.add(MdBlock.Item("•", b.groupValues[1]))
            }
            o != null -> {
                flushPara(); flushQuote()
                out.add(MdBlock.Item(o.groupValues[1] + ".", o.groupValues[2]))
            }
            else -> {
                flushQuote()
                para.append(line).append('\n')
            }
        }
    }
    flushPara()
    flushQuote()
}

private enum class Tok { Code, Mention, Url, Channel, Bold, Italic, Strike }

private val INLINE = listOf(
    Tok.Code to Regex("`([^`\n]+)`"),
    Tok.Mention to Regex("""\[@([^\]]{1,80})]\(user:([\w-]{1,64})\)"""),
    Tok.Url to Regex("""https?://[^\s<>"]+""", RegexOption.IGNORE_CASE),
    Tok.Channel to Regex("""(?<![\w@])@(canal|channel|todos|here)(?!\w)""", RegexOption.IGNORE_CASE),
    Tok.Bold to Regex("""(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])"""),
    Tok.Italic to Regex("""(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])"""),
    Tok.Strike to Regex("""(?<![\w~])~(?=\S)([^~\n]*?\S)~(?![\w~])"""),
)

/** Quita la puntuación final que casi nunca es parte del enlace («mira https://x.com/a.»). */
private fun trimUrl(raw: String): String {
    var u = raw
    while (true) {
        val before = u
        while (u.isNotEmpty() && u.last() in ".,;:!?'\"*_~") u = u.dropLast(1)
        if (u.endsWith(")") && u.count { it == '(' } < u.count { it == ')' }) u = u.dropLast(1)
        if (u == before) return u
    }
}

/** Primer enlace del cuerpo fuera de código, para la tarjeta de vista previa. */
fun firstUrl(body: String): String? {
    val clean = body.replace(Regex("```[\\s\\S]*?```"), " ").replace(Regex("`[^`\n]+`"), " ")
    val m = INLINE.first { it.first == Tok.Url }.second.find(clean) ?: return null
    return trimUrl(m.value).takeIf { it.length > 10 }
}

/** Referencias (tarea, evento, OC…) del mensaje: sus `@Etiqueta` se pintan como chip. */
class RefChips(val refs: List<ChatRefDto>, val muted: Color, val onOpen: (ChatRefDto) -> Unit)

private const val CHIP_TAG = "arta_ref_chip"
private const val THIN_SPACE = " "

private val ChipOpen = SpanStyle(fontWeight = FontWeight.SemiBold, fontSize = 0.92.em)

/** Formato en línea → AnnotatedString. Dentro de código no se aplica nada más. */
fun inlineMarkdown(text: String, chips: RefChips? = null): AnnotatedString = buildAnnotatedString { appendInline(text, chips) }

private fun chipIconId(kind: String, on: Boolean) = "ref:$kind:" + if (on) "on" else "off"

/** Ícono por tipo + etiqueta, sin la arroba. Abre su liga; apagado o tachado no hace nada. */
private fun AnnotatedString.Builder.appendChip(ref: ChatRefDto, chips: RefChips) {
    val state = ChatRefs.chipState(ref)
    val on = state == ChatRefs.ChipState.OPEN
    fun content() {
        append(THIN_SPACE)
        appendInlineContent(chipIconId(ref.kind, on))
        append(THIN_SPACE + ref.label + THIN_SPACE)
    }
    pushStringAnnotation(CHIP_TAG, state.name)
    if (on) {
        withLink(LinkAnnotation.Clickable(CHIP_TAG, TextLinkStyles(ChipOpen)) { chips.onOpen(ref) }) { content() }
    } else {
        val off = SpanStyle(
            color = chips.muted,
            fontWeight = FontWeight.Medium,
            fontSize = 0.92.em,
            textDecoration = if (state == ChatRefs.ChipState.MISSING) TextDecoration.LineThrough else null,
        )
        withStyle(off) { content() }
    }
    pop()
}

private fun AnnotatedString.Builder.appendInline(text: String, chips: RefChips?) {
    var pos = 0
    while (pos < text.length) {
        var bestTok: Tok? = null
        var best: MatchResult? = null
        for ((tok, re) in INLINE) {
            val m = re.find(text, pos) ?: continue
            if (best == null || m.range.first < best.range.first) {
                best = m
                bestTok = tok
            }
        }
        // Lo que empieza antes gana (`código`, un enlace, *negritas*, que luego se revisan por dentro);
        // en empate, la referencia, para que una tarea llamada «canal…» no se lea como @canal.
        val hit = chips?.let { ChatRefs.nextIn(text, pos, it.refs) }
        if (hit != null && (best == null || hit.start <= best.range.first)) {
            append(text.substring(pos, hit.start))
            appendChip(hit.ref, chips)
            pos = hit.end
            continue
        }
        if (best == null || bestTok == null) {
            append(text.substring(pos))
            return
        }
        append(text.substring(pos, best.range.first))
        var end = best.range.last + 1
        when (bestTok) {
            Tok.Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Color(0x26888888))) {
                append("\u2009" + best.groupValues[1] + "\u2009")
            }
            Tok.Mention -> withStyle(MentionStyle) { append("\u2009@" + best.groupValues[1] + "\u2009") }
            Tok.Url -> {
                val url = trimUrl(best.value)
                end = best.range.first + url.length
                withLink(LinkAnnotation.Url(url, LinkStyles)) { append(url) }
            }
            Tok.Channel -> withStyle(MentionStyle) { append(best.value) }
            Tok.Bold -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { appendInline(best.groupValues[1], chips) }
            Tok.Italic -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { appendInline(best.groupValues[1], chips) }
            Tok.Strike -> withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { appendInline(best.groupValues[1], chips) }
        }
        pos = end
    }
}

/**
 * Cuerpo de un mensaje con formato. Si es un solo párrafo, [meta] (hora, editado,
 * palomitas) se acomoda al final de la última línea cuando cabe, como WhatsApp.
 */
@Composable
fun MarkdownText(
    body: String,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyLarge,
    color: Color = ArtaColors.Text,
    refs: List<ChatRefDto> = emptyList(),
    onRef: (ChatRefDto) -> Unit = {},
    meta: (@Composable () -> Unit)? = null,
) {
    val blocks = remember(body) { parseBlocks(body) }
    val single = blocks.singleOrNull() as? MdBlock.Paragraph
    val muted = LocalArtaTokens.current.secondary
    val open by rememberUpdatedState(onRef)
    val chips = remember(refs, muted) { if (refs.isEmpty()) null else RefChips(refs, muted) { open(it) } }
    if (single != null) {
        val text = remember(single.text, chips) { inlineMarkdown(single.text, chips) }
        if (meta == null) RichText(text, chips, style, color, modifier)
        else TextWithTrailingMeta(text, chips, style, color, modifier, meta)
        return
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        blocks.forEach { MdBlockView(it, chips, style, color) }
        if (meta != null) Box(Modifier.align(Alignment.End)) { meta() }
    }
}

/** Texto con chips: el ícono va en línea y el fondo se dibuja detrás, también si el chip parte renglón. */
@Composable
private fun RichText(
    text: AnnotatedString,
    chips: RefChips?,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    onLayout: (TextLayoutResult) -> Unit = {},
) {
    if (chips == null) {
        Text(text, style = style, color = color, modifier = modifier, onTextLayout = onLayout)
        return
    }
    val t = LocalArtaTokens.current
    val ranges = remember(text) { text.getStringAnnotations(CHIP_TAG, 0, text.length).map { it.start to it.end } }
    val icons = remember(chips) { chipIcons(chips) }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val radius = if (t.isPill) 6.dp else 3.dp
    Text(
        text,
        style = style,
        color = color,
        inlineContent = icons,
        onTextLayout = {
            layout = it
            onLayout(it)
        },
        modifier = modifier.drawBehind {
            val l = layout ?: return@drawBehind
            ranges.forEach { (start, end) -> drawChip(l, start, end, t.fill, t.lineStrong, radius.toPx()) }
        },
    )
}

private fun chipIcons(chips: RefChips): Map<String, InlineTextContent> = buildMap {
    for (kind in chips.refs.map { it.kind }.distinct()) {
        for (on in listOf(true, false)) {
            put(
                chipIconId(kind, on),
                InlineTextContent(Placeholder(1.05.em, 1.05.em, PlaceholderVerticalAlign.TextCenter)) {
                    val t = LocalArtaTokens.current
                    Icon(refIcon(kind), null, tint = if (on) t.text.copy(alpha = 0.7f) else t.tertiary, modifier = Modifier.fillMaxSize())
                },
            )
        }
    }
}

/** Un rectángulo por renglón: un chip largo que parte línea se ve como dos, no como un bloque. */
private fun DrawScope.drawChip(l: TextLayoutResult, start: Int, end: Int, fill: Color, line: Color, radius: Float) {
    val last = end.coerceAtMost(l.layoutInput.text.length)
    if (last <= start) return
    val inset = 2.dp.toPx()
    val stroke = Stroke(1.dp.toPx())
    for (n in l.getLineForOffset(start)..l.getLineForOffset(last - 1)) {
        val from = maxOf(start, l.getLineStart(n))
        val to = minOf(last, l.getLineEnd(n, visibleEnd = true))
        if (to <= from) continue
        val box = l.getPathForRange(from, to).getBounds()
        val topLeft = Offset(box.left, box.top + inset)
        val size = Size(box.width, (box.height - inset * 2).coerceAtLeast(0f))
        drawRoundRect(fill, topLeft, size, CornerRadius(radius))
        drawRoundRect(line, topLeft, size, CornerRadius(radius), style = stroke)
    }
}

@Composable
private fun MdBlockView(b: MdBlock, chips: RefChips?, style: TextStyle, color: Color) {
    when (b) {
        is MdBlock.Paragraph -> RichText(remember(b.text, chips) { inlineMarkdown(b.text, chips) }, chips, style, color)
        is MdBlock.Code -> Text(
            b.text,
            style = style.copy(fontFamily = FontFamily.Monospace, fontSize = 13.sp, lineHeight = 18.sp),
            color = ArtaColors.Text,
            softWrap = false,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(ArtaColors.Surface2)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 8.dp, vertical = 6.dp),
        )
        is MdBlock.Quote -> RichText(
            remember(b.text, chips) { inlineMarkdown(b.text, chips) },
            chips,
            style = style,
            color = color.copy(alpha = 0.85f),
            modifier = Modifier
                .drawBehind { drawRect(color.copy(alpha = 0.45f), size = Size(3.dp.toPx(), size.height)) }
                .padding(start = 11.dp),
        )
        is MdBlock.Item -> Row {
            Text(b.marker, style = style, color = color.copy(alpha = 0.7f), modifier = Modifier.widthIn(min = 18.dp))
            RichText(remember(b.text, chips) { inlineMarkdown(b.text, chips) }, chips, style, color, Modifier.padding(start = 4.dp))
        }
    }
}

@Composable
private fun TextWithTrailingMeta(
    text: AnnotatedString,
    chips: RefChips?,
    style: TextStyle,
    color: Color,
    modifier: Modifier,
    meta: @Composable () -> Unit,
) {
    // onTextLayout se llama durante la medición del Text, así que ya está listo al acomodar.
    val layoutRef = remember { arrayOfNulls<TextLayoutResult>(1) }
    Layout(
        content = {
            RichText(text, chips, style, color, onLayout = { layoutRef[0] = it })
            meta()
        },
        modifier = modifier,
    ) { measurables, constraints ->
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val textP = measurables[0].measure(loose)
        val metaP = measurables[1].measure(loose)
        val maxW = if (constraints.hasBoundedWidth) constraints.maxWidth else Int.MAX_VALUE
        val gap = 8.dp.roundToPx()
        val lines = layoutRef[0]
        val lastRight = lines?.takeIf { it.lineCount > 0 }?.let { it.getLineRight(it.lineCount - 1).roundToInt() } ?: textP.width
        val inline = lastRight + gap + metaP.width <= maxW
        val width = (if (inline) max(textP.width, lastRight + gap + metaP.width) else max(textP.width, metaP.width)).coerceAtMost(maxW)
        val height = if (inline) max(textP.height, metaP.height) else textP.height + metaP.height
        layout(width, height) {
            textP.placeRelative(0, 0)
            metaP.placeRelative(width - metaP.width, height - metaP.height)
        }
    }
}
