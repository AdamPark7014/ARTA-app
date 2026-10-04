import SwiftUI

/// Un bloque del cuerpo de un mensaje con el formato del contrato (§7).
enum ChatBlock: Equatable {
    case text(AttributedString)
    case quote(AttributedString)
    case code(String)
}

/// Subconjunto tipo Slack: `*negrita*`, `_cursiva_`, `~tachado~`, `` `código` ``,
/// bloques ```…```, `> cita`, listas `- ` / `1. `, enlaces sueltos, menciones
/// `[@Nombre](user:id)` como chip dorado y `@canal`. Los marcadores no aplican dentro de código.
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

    // Grupos: 1 código · 2-3 mención · 4 URL · 5 negrita · 6 cursiva · 7 tachado · 8 @canal.
    private static let inlineRegex = try! NSRegularExpression(pattern: [
        #"`([^`\n]+)`"#,
        #"\[@([^\]\n]{1,80})\]\(user:([\w-]{1,64})\)"#,
        #"(https?://[^\s<>]+)"#,
        #"(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])"#,
        #"(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])"#,
        #"(?<![\w~])~(?=\S)([^~\n]*?\S)~(?![\w~])"#,
        #"(?<![\w@])@(canal)\b"#,
    ].joined(separator: "|"))

    private static let urlRegex = try! NSRegularExpression(pattern: #"https?://[^\s<>]+"#)
    private static let orderedItem = try! NSRegularExpression(pattern: #"^\s*\d{1,3}[.)]\s"#)
    private static let trailingPunctuation = Set(".,;:!?)]}'\"»")

    private struct Style {
        var bold = false
        var italic = false
        var strike = false
    }

    static func blocks(_ body: String) -> [ChatBlock] {
        if let hit = cache.object(forKey: body as NSString) { return hit.blocks }
        var out: [ChatBlock] = []
        let parts = body.components(separatedBy: "```")
        let unclosed = parts.count % 2 == 0
        for (i, part) in parts.enumerated() {
            let isLast = i == parts.count - 1
            if i % 2 == 1 && !(isLast && unclosed) {
                var code = part
                if code.hasPrefix("\n") { code.removeFirst() }
                if code.hasSuffix("\n") { code.removeLast() }
                if !code.isEmpty { out.append(.code(code)) }
            } else {
                var text = (i % 2 == 1) ? "```" + part : part
                if parts.count > 1 { text = text.trimmingCharacters(in: .newlines) }
                if !text.isEmpty { out.append(contentsOf: textBlocks(text)) }
            }
        }
        cache.setObject(Box(out), forKey: body as NSString)
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

    private static func textBlocks(_ text: String) -> [ChatBlock] {
        var result: [ChatBlock] = []
        var para: [String] = []
        var quote: [String] = []
        for line in text.components(separatedBy: "\n") {
            if let q = quoteContent(line) {
                if !para.isEmpty {
                    result.append(.text(inline(para.joined(separator: "\n"))))
                    para = []
                }
                quote.append(q)
            } else {
                if !quote.isEmpty {
                    result.append(.quote(inline(quote.joined(separator: "\n"))))
                    quote = []
                }
                para.append(listLine(line))
            }
        }
        if !para.isEmpty { result.append(.text(inline(para.joined(separator: "\n")))) }
        if !quote.isEmpty { result.append(.quote(inline(quote.joined(separator: "\n")))) }
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

    private static func inline(_ text: String, style: Style = Style()) -> AttributedString {
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
                var piece = AttributedString(ns.substring(with: m.range(at: 1)))
                piece.font = Font.system(.body, design: .monospaced)
                piece.backgroundColor = Color.white.opacity(0.1)
                out += piece
            } else if found(m, 2) {
                var piece = AttributedString("\u{2009}@" + ns.substring(with: m.range(at: 2)) + "\u{2009}")
                piece.font = Font.body.weight(.semibold)
                piece.foregroundColor = ArtaColor.gold
                piece.backgroundColor = ArtaColor.goldSoft
                out += piece
            } else if found(m, 4) {
                let raw = trimURL(ns.substring(with: m.range(at: 4)))
                end = m.range.location + max(1, (raw as NSString).length)
                var piece = styled(raw, style)
                if let url = URL(string: raw) { piece.link = url }
                out += piece
            } else if found(m, 5) {
                var s = style
                s.bold = true
                out += inline(ns.substring(with: m.range(at: 5)), style: s)
            } else if found(m, 6) {
                var s = style
                s.italic = true
                out += inline(ns.substring(with: m.range(at: 6)), style: s)
            } else if found(m, 7) {
                var s = style
                s.strike = true
                out += inline(ns.substring(with: m.range(at: 7)), style: s)
            } else if found(m, 8) {
                var piece = AttributedString("@" + ns.substring(with: m.range(at: 8)))
                piece.font = Font.body.weight(.semibold)
                piece.foregroundColor = ArtaColor.gold
                piece.backgroundColor = ArtaColor.goldSoft
                out += piece
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

    var body: some View {
        let blocks = ChatMarkdown.blocks(source)
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .text(let s):
                    Text(s)
                        .foregroundStyle(ArtaColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                case .quote(let s):
                    Text(s)
                        .foregroundStyle(ArtaColor.text.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.leading, 11)
                        .overlay(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 1.5).fill(ArtaColor.gold).frame(width: 3)
                        }
                case .code(let code):
                    Text(code)
                        .font(.system(.footnote, design: .monospaced))
                        .foregroundStyle(ArtaColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.black.opacity(0.35)))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(ArtaColor.line))
                }
            }
        }
        .tint(ArtaColor.read)
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
                .foregroundStyle(ArtaColor.gold)
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
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.black.opacity(0.22)))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 1.5).fill(ArtaColor.gold).frame(width: 3).padding(.vertical, 4)
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
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            if let site = p.siteName, !site.isEmpty {
                Text(site).font(.caption2.weight(.semibold)).foregroundStyle(ArtaColor.muted).lineLimit(1)
            }
            if let title = p.title, !title.isEmpty {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(ArtaColor.read).lineLimit(2)
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
