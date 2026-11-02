import Foundation

// La cartelera pública de Arta (`GET /studio/public/shows`): la misma del sitio y sin sesión,
// así que también se ve antes de entrar. Se edita en Studio (docs/SITIO-PUBLICO.md).

struct PublicShow: Decodable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let excerpt: String?
    let body: String?
    let coverUrl: String?
    let eventDate: String?
    let eventTime: String?
    let venue: String?
    let city: String?
    let ctaLabel: String?
    let ctaHref: String?
    let showStatus: String?
}

struct PublicShowsResponse: Decodable {
    let upcoming: [PublicShow]
    let past: [PublicShow]
}

extension ApiClient {
    func publicShows() async throws -> PublicShowsResponse {
        try await get("studio/public/shows")
    }
}

/// Las mismas reglas que el sitio (`apps/web/lib/site-format.ts`).
enum CarteleraRules {
    private static let statusLabels = [
        "venta": "A la venta",
        "pronto": "Próximamente",
        "agotado": "Agotado",
        "pospuesto": "Pospuesto",
        "cancelado": "Cancelado",
    ]

    private static let mexico = TimeZone(identifier: "America/Mexico_City") ?? .current

    /// La API guarda la fecha a mediodía UTC: se lee en UTC para no correrla de día.
    private static var utcCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .current
        return cal
    }

    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = format
        return f
    }

    static func date(of show: PublicShow) -> Date? {
        guard let raw = show.eventDate else { return nil }
        let plain = ISO8601DateFormatter()
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: raw) ?? plain.date(from: raw)
    }

    static func status(of show: PublicShow) -> String {
        if let saved = show.showStatus, statusLabels[saved] != nil { return saved }
        return (show.ctaHref?.isEmpty == false) ? "venta" : "pronto"
    }

    static func statusLabel(of show: PublicShow) -> String { statusLabels[status(of: show)] ?? "" }

    /// Solo se vende si el estado lo permite y el enlace es seguro.
    static func ticketURL(of show: PublicShow) -> URL? {
        guard status(of: show) == "venta", let raw = show.ctaHref, raw.hasPrefix("https://") else { return nil }
        return URL(string: raw)
    }

    /// Días que faltan. Hoy = 0; ya pasó = negativo.
    static func daysUntil(_ show: PublicShow, now: Date = Date()) -> Int? {
        guard let target = date(of: show) else { return nil }
        var local = Calendar(identifier: .gregorian)
        local.timeZone = mexico
        let today = local.dateComponents([.year, .month, .day], from: now)
        let day = utcCalendar.dateComponents([.year, .month, .day], from: target)
        guard let from = utcCalendar.date(from: today), let to = utcCalendar.date(from: day) else { return nil }
        return utcCalendar.dateComponents([.day], from: from, to: to).day
    }

    static func isPast(_ show: PublicShow, now: Date = Date()) -> Bool {
        (daysUntil(show, now: now) ?? 0) < 0
    }

    static func countdown(_ show: PublicShow, now: Date = Date()) -> String? {
        guard let days = daysUntil(show, now: now), days >= 0 else { return nil }
        if days == 0 { return "Es hoy" }
        if days == 1 { return "Es mañana" }
        return "Faltan \(days) días"
    }

    /// «4 de noviembre», con el año solo si no es este.
    static func dayMonth(_ show: PublicShow, now: Date = Date()) -> String? {
        guard let target = date(of: show) else { return nil }
        let sameYear = utcCalendar.component(.year, from: target) == utcCalendar.component(.year, from: now)
        return formatter(sameYear ? "d 'de' MMMM" : "d 'de' MMMM 'de' yyyy").string(from: target)
    }

    static func longDate(_ show: PublicShow) -> String? {
        guard let target = date(of: show) else { return nil }
        return formatter("EEEE d 'de' MMMM 'de' yyyy").string(from: target).capitalizedFirst
    }

    /// 21:30 → 9:30 p. m.
    static func timeLabel(_ show: PublicShow) -> String? {
        let parts = (show.eventTime ?? "").split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        let twelve = parts[0] % 12 == 0 ? 12 : parts[0] % 12
        return String(format: "%d:%02d\u{00a0}%@", twelve, parts[1], parts[0] < 12 ? "a.\u{00a0}m." : "p.\u{00a0}m.")
    }

    static func place(of show: PublicShow) -> String? {
        let text = [show.venue, show.city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        return text.isEmpty ? nil : text
    }

    static func directionsURL(for place: String) -> URL? {
        var c = URLComponents(string: "https://www.google.com/maps/search/")
        c?.queryItems = [URLQueryItem(name: "api", value: "1"), URLQueryItem(name: "query", value: place)]
        return c?.url
    }

    static func siteURL(of show: PublicShow) -> URL? {
        URL(string: "https://artaproducciones.com/p/arta/cartelera/\(show.slug)")
    }

    /// Guardar en el calendario sin pedir permisos: una liga, como en el sitio.
    static func calendarURL(for show: PublicShow) -> URL? {
        guard let target = date(of: show) else { return nil }
        let day = formatter("yyyyMMdd").string(from: target)
        let parts = (show.eventTime ?? "").split(separator: ":").compactMap { Int($0) }
        let dates: String
        if parts.count == 2 {
            let end = String(format: "%02d%02d00", min(parts[0] + 3, 23), parts[1])
            dates = String(format: "%@T%02d%02d00/%@T%@", day, parts[0], parts[1], day, end)
        } else {
            let next = target.addingTimeInterval(86_400)
            dates = "\(day)/\(formatter("yyyyMMdd").string(from: next))"
        }
        var c = URLComponents(string: "https://calendar.google.com/calendar/render")
        c?.queryItems = [
            URLQueryItem(name: "action", value: "TEMPLATE"),
            URLQueryItem(name: "text", value: show.title),
            URLQueryItem(name: "dates", value: dates),
            URLQueryItem(name: "ctz", value: "America/Mexico_City"),
            URLQueryItem(name: "location", value: place(of: show) ?? ""),
        ]
        return c?.url
    }
}

private extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
