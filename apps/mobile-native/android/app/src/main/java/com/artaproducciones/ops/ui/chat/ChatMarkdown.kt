package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
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
import androidx.compose.ui.unit.sp
import com.artaproducciones.ops.ui.theme.ArtaColors
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

private val CodeBg = Color(0xFF0B0B0E)
private val CodeFg = Color(0xFFE4E4E7)
private val MentionStyle = SpanStyle(color = ArtaColors.Gold, background = ArtaColors.GoldSoft, fontWeight = FontWeight.SemiBold)
private val LinkStyles = TextLinkStyles(SpanStyle(color = ArtaColors.Read, textDecoration = TextDecoration.Underline))

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

/** Formato en línea → AnnotatedString. Dentro de código no se aplica nada más. */
fun inlineMarkdown(text: String): AnnotatedString = buildAnnotatedString { appendInline(text) }

private fun AnnotatedString.Builder.appendInline(text: String) {
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
        if (best == null || bestTok == null) {
            append(text.substring(pos))
            return
        }
        append(text.substring(pos, best.range.first))
        var end = best.range.last + 1
        when (bestTok) {
            Tok.Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = CodeBg, color = CodeFg)) {
                append("\u2009" + best.groupValues[1] + "\u2009")
            }
            Tok.Mention -> withStyle(MentionStyle) { append("\u2009@" + best.groupValues[1] + "\u2009") }
            Tok.Url -> {
                val url = trimUrl(best.value)
                end = best.range.first + url.length
                withLink(LinkAnnotation.Url(url, LinkStyles)) { append(url) }
            }
            Tok.Channel -> withStyle(MentionStyle) { append(best.value) }
            Tok.Bold -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { appendInline(best.groupValues[1]) }
            Tok.Italic -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { appendInline(best.groupValues[1]) }
            Tok.Strike -> withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { appendInline(best.groupValues[1]) }
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
    meta: (@Composable () -> Unit)? = null,
) {
    val blocks = remember(body) { parseBlocks(body) }
    val single = blocks.singleOrNull() as? MdBlock.Paragraph
    if (single != null) {
        val text = remember(single.text) { inlineMarkdown(single.text) }
        if (meta == null) Text(text, style = style, color = color, modifier = modifier)
        else TextWithTrailingMeta(text, style, color, modifier, meta)
        return
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        blocks.forEach { MdBlockView(it, style, color) }
        if (meta != null) Box(Modifier.align(Alignment.End)) { meta() }
    }
}

@Composable
private fun MdBlockView(b: MdBlock, style: TextStyle, color: Color) {
    when (b) {
        is MdBlock.Paragraph -> Text(remember(b.text) { inlineMarkdown(b.text) }, style = style, color = color)
        is MdBlock.Code -> Text(
            b.text,
            style = style.copy(fontFamily = FontFamily.Monospace, fontSize = 13.sp, lineHeight = 18.sp),
            color = CodeFg,
            softWrap = false,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(CodeBg)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 8.dp, vertical = 6.dp),
        )
        is MdBlock.Quote -> Text(
            remember(b.text) { inlineMarkdown(b.text) },
            style = style,
            color = color.copy(alpha = 0.85f),
            modifier = Modifier
                .drawBehind { drawRect(ArtaColors.Gold, size = Size(3.dp.toPx(), size.height)) }
                .padding(start = 11.dp),
        )
        is MdBlock.Item -> Row {
            Text(b.marker, style = style, color = ArtaColors.Muted, modifier = Modifier.widthIn(min = 18.dp))
            Text(remember(b.text) { inlineMarkdown(b.text) }, style = style, color = color, modifier = Modifier.padding(start = 4.dp))
        }
    }
}

@Composable
private fun TextWithTrailingMeta(
    text: AnnotatedString,
    style: TextStyle,
    color: Color,
    modifier: Modifier,
    meta: @Composable () -> Unit,
) {
    // onTextLayout se llama durante la medición del Text, así que ya está listo al acomodar.
    val layoutRef = remember { arrayOfNulls<TextLayoutResult>(1) }
    Layout(
        content = {
            Text(text, style = style, color = color, onTextLayout = { layoutRef[0] = it })
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
