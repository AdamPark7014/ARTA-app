import SwiftUI

private let esMX = Locale(identifier: "es_MX")

private let isoFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

private let isoPlain: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

private func formatter(_ pattern: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = esMX
    f.dateFormat = pattern
    return f
}

private let hm = formatter("HH:mm")
private let shortDate = formatter("dd/MM/yy")
private let weekday = formatter("EEEE")
private let longDate = formatter("EEEE d 'de' MMMM")

func parseDate(_ iso: String?) -> Date? {
    guard let iso, !iso.isEmpty else { return nil }
    return isoFractional.date(from: iso) ?? isoPlain.date(from: iso)
}

func isoNow() -> String { isoFractional.string(from: Date()) }

private func capitalizedFirst(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

/// Hora de la lista de chats, como WhatsApp: hoy «14:05», ayer «Ayer», esta semana el día, luego la fecha.
func relativeTime(_ iso: String?) -> String {
    guard let date = parseDate(iso) else { return "" }
    let cal = Calendar.current
    let days = cal.dateComponents([.day], from: cal.startOfDay(for: date), to: cal.startOfDay(for: Date())).day ?? 0
    switch days {
    case ...0: return hm.string(from: date)
    case 1: return "Ayer"
    case 2..<7: return capitalizedFirst(weekday.string(from: date))
    default: return shortDate.string(from: date)
    }
}

func messageTime(_ iso: String?) -> String { parseDate(iso).map { hm.string(from: $0) } ?? "" }

func dayKey(_ iso: String?) -> Date? { parseDate(iso).map { Calendar.current.startOfDay(for: $0) } }

/// Separador de día en la conversación.
func dayLabel(_ day: Date) -> String {
    let cal = Calendar.current
    if cal.isDateInToday(day) { return "Hoy" }
    if cal.isDateInYesterday(day) { return "Ayer" }
    return capitalizedFirst(longDate.string(from: day))
}

private let mentionRegex = try! NSRegularExpression(pattern: #"\[@([^\]]{1,80})\]\(user:([\w-]{1,64})\)"#)

/// Texto de un mensaje con las menciones `[@Nombre](user:id)` como «@Nombre» en dorado.
func mentionText(_ body: String) -> AttributedString {
    let ns = body as NSString
    var out = AttributedString()
    var last = 0
    for m in mentionRegex.matches(in: body, range: NSRange(location: 0, length: ns.length)) {
        if m.range.location > last {
            out += AttributedString(ns.substring(with: NSRange(location: last, length: m.range.location - last)))
        }
        var mention = AttributedString("@" + ns.substring(with: m.range(at: 1)))
        mention.foregroundColor = ArtaColor.gold
        mention.font = Font.body.weight(.semibold)
        out += mention
        last = m.range.location + m.range.length
    }
    if last < ns.length { out += AttributedString(ns.substring(from: last)) }
    return out
}

/// Texto plano (vista previa, copiar): menciones como «@Nombre».
func plainText(_ body: String) -> String {
    let ns = body as NSString
    return mentionRegex.stringByReplacingMatches(in: body, range: NSRange(location: 0, length: ns.length), withTemplate: "@$1")
}

func mentionToken(name: String, userId: String) -> String { "[@\(name)](user:\(userId))" }

func initials(of name: String) -> String {
    let words = name.trimmingCharacters(in: .whitespaces)
        .replacingOccurrences(of: "#", with: "")
        .split(whereSeparator: \.isWhitespace)
    let letters = words.compactMap { w in w.first(where: { $0.isLetter || $0.isNumber }) }.prefix(2)
    let s = String(letters).uppercased()
    return s.isEmpty ? "A" : s
}

func fileSize(_ bytes: Int64?) -> String {
    guard let bytes, bytes > 0 else { return "" }
    return ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
}
