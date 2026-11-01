import SwiftUI

/// Un bloque del cuerpo de un mensaje con el formato del contrato (§7).
enum ChatBlock: Equatable {
    case text(AttributedString)
    case quote(AttributedString)
    case code(String)
}

/// Ícono de una referencia dentro del texto. `Text` no pinta adjuntos de un `AttributedString`:
/// la corrida lleva el símbolo y `ChatMarkdown.text(_:)` la cambia por `Text(Image)` al pintar.
struct ChatRefIcon: Hashable, Sendable {
    let symbol: String
    /// Se puede abrir: va con el acento. Si no, apagado.
    let live: Bool
}

enum ChatRefIconAttribute: AttributedStringKey {
    typealias Value = ChatRefIcon
    static let name = "artaRefIcon"
}

/// Subconjunto tipo Slack: `*negrita*`, `_cursiva_`, `~tachado~`, `` `código` ``,
/// bloques ```…```, `> cita`, listas `- ` / `1. `, enlaces sueltos, menciones
/// `[@Nombre](user:id)` como chip dorado, `@canal` y referencias `@Etiqueta` (contrato §9) como
/// chip con ícono. Los marcadores no aplican dentro de código.
enum ChatMarkdown {
    final class Box {
        let blocks: [ChatBlock]
        init(_ blocks: [ChatBlock]) { self.blocks = blocks }
    }

    private static let cache: NSCache<NSString, Box> = {
        let c = NSCache<NSString, Box>()
        c.countLimit = 600
        return c
    }()

    // Grupos: 1 código · 2-3 mención · 4 URL · 5 negrita · 6 cursiva · 7 tachado · 8 @canal · 9 referencia.
    private static let inlineRegex = try! NSRegularExpression(pattern: [
        #"`([^`\n]+)`"#,
        #"\[@([^\]\n]{1,80})\]\(user:([\w-]{1,64})\)"#,
        #"(https?://[^\s<>]+)"#,
        #"(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])"#,
        #"(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])"#,
        #"(?<![\w~])~(?=\S)([^~\n]*?\S)~(?![\w~])"#,
        #"(?<![\w@])@(canal)\b"#,
        #"\x{E001}(\d{1,2})\x{E002}"#,
    ].joined(separator: "|"))

    /// «@Etiqueta» se cambia por esta marca antes de leer el formato: así un `*` o un `_` de la
    /// etiqueta no se toma por negrita o cursiva. Uso privado de Unicode: nadie lo escribe.
    private static func refToken(_ index: Int) -> String { "\u{E001}\(index)\u{E002}" }

    /// Lo largo primero, para que «@Luces 2» no pierda ante «@Luces». Ni dentro de una mención de
    /// persona (`[@Ana](user:id)`) ni a media palabra («@Lucesita»).
    private static func tokenized(_ body: String, refs: [ChatRef]) -> String {
        guard !refs.isEmpty, body.contains("@") else { return body }
        var out = body
        let longestFirst = refs.enumerated().sorted { $0.element.label.count > $1.element.label.count }
        for (index, ref) in longestFirst {
            let needle = "@" + ref.label
            var result = ""
            var rest = Substring(out)
            while let found = rest.range(of: needle) {
                let before: Character? = found.lowerBound > rest.startIndex ? rest[rest.index(before: found.lowerBound)] : result.last
                let after: Character? = found.upperBound < rest.endIndex ? rest[found.upperBound] : nil
                result += rest[..<found.lowerBound]
                if before == "[" || after?.isLetter == true || after?.isNumber == true {
                    result += rest[found]
                } else {
                    result += refToken(index)
                }
                rest = rest[found.upperBound...]
            }
            result += rest
            out = result
        }
        return out
    }

    /// Dentro de código la marca vuelve a ser el texto que se escribió.
    private static func untokenized(_ text: String, refs: [ChatRef]) -> String {
        guard !refs.isEmpty, text.contains("\u{E001}") else { return text }
        var out = text
        for (index, ref) in refs.enumerated() {
            out = out.replacingOccurrences(of: refToken(index), with: "@" + ref.label)
        }
        return out
    }

    /// La caché se separa también por cómo está cada referencia: el chip cambia al llegar su tarjeta.
    private static func refsSignature(_ refs: [ChatRef]) -> String {
        var parts: [String] = []
        for ref in refs {
            let state: String = ref.isMissing ? "-" : (ref.isOpenable ? (ref.href ?? "") : "~")
            parts.append(ref.key + "=" + ref.label + "=" + state)
        }
        return parts.joined(separator: ",")
    }

    private static func refChip(_ ref: ChatRef) -> AttributedString {
        let live = ref.isOpenable
        var chip = AttributedString("\u{FFFC}")
        chip[ChatRefIconAttribute.self] = ChatRefIcon(symbol: ref.symbol, live: live)
        var label = AttributedString("\u{2009}" + ref.label + "\u{2009}")
        label.font = Font.body.weight(.semibold)
        label.foregroundColor = live ? ArtaColor.accent : ArtaColor.tertiary
        label.backgroundColor = live ? ArtaColor.accentSoft : ArtaColor.inset
        if ref.isMissing {
            label[AttributeScopes.SwiftUIAttributes.StrikethroughStyleAttribute.self] = Text.LineStyle.single
        }
        if live, let url = ChatRefLink.url(href: ref.href ?? "") { label.link = url }
        chip += label
        return chip
    }

    /// El texto ya listo para pintar, con los íconos de las referencias en su lugar.
    static func text(_ s: AttributedString) -> Text {
        guard s.runs.contains(where: { $0[ChatRefIconAttribute.self] != nil }) else { return Text(s) }
        var out = Text(verbatim: "")
        for run in s.runs {
            if let icon = run[ChatRefIconAttribute.self] {
                out = out + Text(Image(systemName: icon.symbol))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(icon.live ? ArtaColor.accent : ArtaColor.tertiary)
            } else {
                out = out + Text(AttributedString(s[run.range]))
            }
        }
        return out
    }

    private static let urlRegex = try! NSRegularExpression(pattern: #"https?://[^\s<>]+"#)
    private static let orderedItem = try! NSRegularExpression(pattern: #"^\s*\d{1,3}[.)]\s"#)
    private static let trailingPunctuation = Set(".,;:!?)]}'\"»")

    private struct Style {
        var bold = false
        var italic = false
        var strike = false
    }

    static func blocks(_ body: String, refs allRefs: [ChatRef] = []) -> [ChatBlock] {
        let refs = allRefs.filter { !$0.label.isEmpty }
        // Las menciones llevan el acento de la entidad activa: la caché se separa por entidad.
        let cacheKey = (EntityContext.entity.rawValue + "|" + refsSignature(refs) + "|" + body) as NSString
        if let hit = cache.object(forKey: cacheKey) { return hit.blocks }
        var out: [ChatBlock] = []
        let parts = tokenized(body, refs: refs).components(separatedBy: "```")
        let unclosed = parts.count % 2 == 0
        for (i, part) in parts.enumerated() {
            let isLast = i == parts.count - 1
            if i % 2 == 1 && !(isLast && unclosed) {
                var code = untokenized(part, refs: refs)
                if code.hasPrefix("\n") { code.removeFirst() }
                if code.hasSuffix("\n") { code.removeLast() }
                if !code.isEmpty { out.append(.code(code)) }
            } else {
                var text = (i % 2 == 1) ? "```" + part : part
                if parts.count > 1 { text = text.trimmingCharacters(in: .newlines) }
                if !text.isEmpty { out.append(contentsOf: textBlocks(text, refs: refs)) }
            }
        }
        cache.setObject(Box(out), forKey: cacheKey)
        return out
    }

    /// Primer enlace fuera de bloques de código (para la tarjeta de vista previa).
    static func firstURL(in body: String) -> String? {
        let parts = body.components(separatedBy: "```")
        for (i, part) in parts.enumerated() where i % 2 == 0 {
            let ns = part as NSString
            if let m = urlRegex.firstMatch(in: part, range: NSRange(location: 0, length: ns.length)) {
                let raw = trimURL(ns.substring(with: m.range))
                if URL(string: raw) != nil { return raw }
            }
        }
        return nil
    }

    private static func trimURL(_ raw: String) -> String {
        var s = raw
        while let last = s.last, trailingPunctuation.contains(last) { s.removeLast() }
        return s
    }

    private static func quoteContent(_ line: String) -> String? {
        guard line.hasPrefix(">") else { return nil }
        let rest = line.dropFirst()
        return String(rest.hasPrefix(" ") ? rest.dropFirst() : rest)
    }

    private static func listLine(_ line: String) -> String {
        let trimmed = line.drop(while: { $0 == " " })
        let indent = String(repeating: " ", count: line.count - trimmed.count)
        if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") || trimmed.hasPrefix("• ") {
            return indent + "•  " + String(trimmed.dropFirst(2))
        }
        return line
    }

    private static func textBlocks(_ text: String, refs: [ChatRef]) -> [ChatBlock] {
        var result: [ChatBlock] = []
        var para: [String] = []
        var quote: [String] = []
        for line in text.components(separatedBy: "\n") {
            if let q = quoteContent(line) {
                if !para.isEmpty {
                    result.append(.text(inline(para.joined(separator: "\n"), refs: refs)))
                    para = []
                }
                quote.append(q)
            } else {
                if !quote.isEmpty {
                    result.append(.quote(inline(quote.joined(separator: "\n"), refs: refs)))
                    quote = []
                }
                para.append(listLine(line))
            }
        }
        if !para.isEmpty { result.append(.text(inline(para.joined(separator: "\n"), refs: refs))) }
        if !quote.isEmpty { result.append(.quote(inline(quote.joined(separator: "\n"), refs: refs))) }
        return result
    }

    private static func styled(_ s: String, _ style: Style) -> AttributedString {
        var piece = AttributedString(s)
        if style.bold || style.italic {
            var font = Font.body
            if style.bold { font = font.bold() }
            if style.italic { font = font.italic() }
            piece.font = font
        }
        if style.strike {
            piece[AttributeScopes.SwiftUIAttributes.StrikethroughStyleAttribute.self] = Text.LineStyle.single
        }
        return piece
    }

    private static func found(_ m: NSTextCheckingResult, _ group: Int) -> Bool {
        m.range(at: group).location != NSNotFound
    }

    private static func inline(_ text: String, style: Style = Style(), refs: [ChatRef] = []) -> AttributedString {
        var out = AttributedString()
        let ns = text as NSString
        var pos = 0
        while pos < ns.length {
            guard let m = inlineRegex.firstMatch(in: text, range: NSRange(location: pos, length: ns.length - pos)) else { break }
            if m.range.location > pos {
                out += styled(ns.substring(with: NSRange(location: pos, length: m.range.location - pos)), style)
            }
            var end = m.range.location + m.range.length
            if found(m, 1) {
                var piece = AttributedString(untokenized(ns.substring(with: m.range(at: 1)), refs: refs))
                piece.font = Font.system(.body, design: .monospaced)
                piece.backgroundColor = ArtaColor.inset
                out += piece
            } else if found(m, 2) {
                var piece = AttributedString("\u{2009}@" + ns.substring(with: m.range(at: 2)) + "\u{2009}")
                piece.font = Font.body.weight(.semibold)
                piece.foregroundColor = ArtaColor.accent
                piece.backgroundColor = ArtaColor.accentSoft
                out += piece
            } else if found(m, 4) {
                let raw = trimURL(ns.substring(with: m.range(at: 4)))
                end = m.range.location + max(1, (raw as NSString).length)
                var piece = styled(raw, style)
                if let url = URL(string: raw) {
                    piece.link = url
                    // Monocromo: el enlace se distingue por el subrayado, no por un azul.
                    piece[AttributeScopes.SwiftUIAttributes.UnderlineStyleAttribute.self] = Text.LineStyle.single
                }
                out += piece
            } else if found(m, 5) {
                var s = style
                s.bold = true
                out += inline(ns.substring(with: m.range(at: 5)), style: s, refs: refs)
            } else if found(m, 6) {
                var s = style
                s.italic = true
                out += inline(ns.substring(with: m.range(at: 6)), style: s, refs: refs)
            } else if found(m, 7) {
                var s = style
                s.strike = true
                out += inline(ns.substring(with: m.range(at: 7)), style: s, refs: refs)
            } else if found(m, 8) {
                var piece = AttributedString("@" + ns.substring(with: m.range(at: 8)))
                piece.font = Font.body.weight(.semibold)
                piece.foregroundColor = ArtaColor.accent
                piece.backgroundColor = ArtaColor.accentSoft
                out += piece
            } else if found(m, 9) {
                if let index = Int(ns.substring(with: m.range(at: 9))), refs.indices.contains(index) {
                    out += refChip(refs[index])
                }
            } else {
                out += styled(ns.substring(with: m.range), style)
            }
            pos = max(end, pos + 1)
        }
        if pos < ns.length { out += styled(ns.substring(from: pos), style) }
        return out
    }
}

/// Cuerpo de un mensaje con formato: párrafos, citas con barra dorada y bloques de código.
struct ChatRichText: View {
    let source: String
    /// Lo arrobado en este mensaje (contrato §9): cada `@Etiqueta` del cuerpo se pinta como chip.
    var refs: [ChatRef] = []

    var body: some View {
        let blocks = ChatMarkdown.blocks(source, refs: refs)
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .text(let s):
                    ChatMarkdown.text(s)
                        .foregroundStyle(ArtaColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                case .quote(let s):
                    ChatMarkdown.text(s)
                        .foregroundStyle(ArtaColor.text.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.leading, 11)
                        .overlay(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 1.5).fill(ArtaColor.accent).frame(width: 3)
                        }
                case .code(let code):
                    Text(code)
                        .font(.system(.footnote, design: .monospaced))
                        .foregroundStyle(ArtaColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: ArtaRadius.small, style: .continuous).fill(ArtaColor.inset))
                        .overlay(RoundedRectangle(cornerRadius: ArtaRadius.small, style: .continuous).stroke(ArtaColor.line))
                }
            }
        }
        .tint(ArtaColor.text)
        // Tocar un chip lleva a su pantalla con el enrutador de los avisos; las demás ligas, al sistema.
        .environment(\.openURL, OpenURLAction { url in
            guard let href = ChatRefLink.href(from: url) else { return .systemAction }
            Task { @MainActor in AppRouter.shared.openPanel(path: href) }
            return .handled
        })
    }
}

/// Mensaje citado dentro de la burbuja (chat v2 §1). Tocarlo lleva al original.
struct QuoteBlock: View {
    let ref: ChatReplyRef

    private var excerpt: String {
        if ref.deleted == true { return "Mensaje eliminado" }
        if let e = ref.excerpt, !e.isEmpty { return e }
        if let a = ref.attachmentName, !a.isEmpty { return "📎 " + a }
        return "Adjunto"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(ref.authorName ?? "Mensaje")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ArtaColor.accent)
                .lineLimit(1)
            Text(excerpt)
                .font(.caption)
                .italic(ref.deleted == true)
                .foregroundStyle(ArtaColor.muted)
                .lineLimit(2)
        }
        .padding(.vertical, 6)
        .padding(.leading, 11)
        .padding(.trailing, 8)
        .frame(minWidth: 120, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: ArtaRadius.small, style: .continuous).fill(ArtaColor.inset))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 1.5).fill(ArtaColor.accent).frame(width: 3).padding(.vertical, 4)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Toca para ir al mensaje citado")
    }
}

/// Tarjeta del primer enlace del mensaje (contrato §5). Si no hay datos, no ocupa lugar.
struct LinkPreviewCard: View {
    let url: String
    @State private var preview: LinkPreview?
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack {
            if let p = preview {
                Button {
                    if let target = URL(string: p.url ?? url) { openURL(target) }
                } label: {
                    card(p)
                }
                .buttonStyle(.plain)
            } else {
                Color.clear.frame(width: 1, height: 1)
            }
        }
        .task(id: url) {
            if let hit = LinkPreviews.cached(url) {
                preview = hit
            } else {
                preview = await LinkPreviews.load(url)
            }
        }
    }

    private func card(_ p: LinkPreview) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let image = p.image, let imageURL = URL(string: image) {
                AsyncImage(url: imageURL) { phase in
                    if let img = phase.image {
                        img.resizable().scaledToFill()
                    } else {
                        ArtaColor.surface2
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 130)
                .clipShape(RoundedRectangle(cornerRadius: ArtaRadius.small, style: .continuous))
            }
            if let site = p.siteName, !site.isEmpty {
                Text(site).font(.caption2.weight(.semibold)).foregroundStyle(ArtaColor.muted).lineLimit(1)
            }
            if let title = p.title, !title.isEmpty {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(ArtaColor.text).underline().lineLimit(2)
            }
            if let text = p.description, !text.isEmpty {
                Text(text).font(.caption).foregroundStyle(ArtaColor.muted).lineLimit(3)
            }
        }
        .padding(.leading, 11)
        .frame(maxWidth: 260, alignment: .leading)
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 1.5).fill(ArtaColor.line).frame(width: 3)
        }
        .contentShape(Rectangle())
    }
}
