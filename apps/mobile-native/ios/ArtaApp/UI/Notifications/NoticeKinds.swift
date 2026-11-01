import Foundation

// Cómo se presenta cada aviso según su tipo. Copia de `apps/web/lib/notification-kinds.ts`
// (y mismas categorías que `apps/api/src/notifications/notification-push-meta.ts`): si cambia
// allá, cambia aquí.

/// Categoría de un aviso: la que se ve en la lista y la que se puede apagar en preferencias.
/// `rawValue` es el valor de `muted` en `notifications/preferences`.
enum NoticeChannel: String, CaseIterable, Identifiable {
    case chat, approvals, tasks, finance, events, documents, general

    var id: String { rawValue }

    var label: String {
        switch self {
        case .chat: return "Chat"
        case .approvals: return "Aprobaciones"
        case .tasks: return "Tareas"
        case .finance: return "Finanzas"
        case .events: return "Eventos"
        case .documents: return "Documentos"
        case .general: return "General"
        }
    }

    /// Qué entra en cada categoría, para la pantalla de preferencias.
    var hint: String {
        switch self {
        case .chat: return "Mensajes, menciones y respuestas."
        case .approvals: return "Lo que espera tu visto bueno, tu firma o tu revisión."
        case .tasks: return "Lo que te asignan, lo que vence y lo que te regresan."
        case .finance: return "Órdenes de compra, anticipos y corrida."
        case .events: return "Cambios de fecha, cancelaciones y boletera."
        case .documents: return "Archivos, carpetas y formatos ya resueltos."
        case .general: return "Lo demás de tu cuenta y de la organización."
        }
    }

    /// Ícono de línea (SF Symbols), el equivalente de `CHANNEL_ICONS` de la web.
    var icon: String {
        switch self {
        case .chat: return "bubble.left"
        case .approvals: return "checkmark.seal"
        case .tasks: return "checklist"
        case .finance: return "banknote"
        case .events: return "calendar"
        case .documents: return "doc.text"
        case .general: return "bell"
        }
    }

    static func of(_ type: String?) -> NoticeChannel {
        let t = (type ?? "").lowercased()
        if t.hasPrefix("chat.") { return .chat }
        if NoticeKinds.approvalTypes.contains(t) || NoticeKinds.pendingTypes.contains(t) || t.hasSuffix(".review") {
            return .approvals
        }
        if t.hasPrefix("task.") { return .tasks }
        if t.hasPrefix("po.") || t.hasPrefix("finance.") || t.hasPrefix("advance.") || t.hasSuffix(".paid") {
            return .finance
        }
        if t.hasPrefix("campaign.") || t.hasPrefix("convenios.") { return .approvals }
        if ["checklist.", "document.", "file.", "folder.", "slot."].contains(where: { t.hasPrefix($0) }) {
            return .documents
        }
        if t.hasPrefix("event.") || t.hasPrefix("ticketing.") { return .events }
        return .general
    }
}

/// Grupos de la lista.
enum NoticeGroup: String, CaseIterable {
    case today = "Hoy"
    case yesterday = "Ayer"
    case earlier = "Antes"
}

enum NoticeKinds {
    fileprivate static let approvalTypes: Set<String> = [
        "advance.requested",
        "po.requested",
        "po.updated",
        "task.submitted",
        "checklist.submitted",
        "checklist.signature_needed",
    ]
    fileprivate static let pendingTypes: Set<String> = ["checklist.returned", "checklist.signature_backlog", "po.aging"]
    private static let urgentTaskTypes: Set<String> = [
        "task.assigned",
        "task.reassigned",
        "task.rejected",
        "task.blocked",
        "task.reopened",
        "task.due_soon",
        "task.overdue",
    ]
    private static let urgentFinanceTypes: Set<String> = ["advance.to_pay", "advance.rejected", "po.to_pay"]

    /// ¿Espera algo de quien lo lee? En la lista va con el ícono lleno y entra a «Por atender».
    static func needsAction(_ type: String?) -> Bool {
        let t = (type ?? "").lowercased()
        return approvalTypes.contains(t)
            || pendingTypes.contains(t)
            || urgentTaskTypes.contains(t)
            || urgentFinanceTypes.contains(t)
            || t.hasSuffix(".review")
            || t == "chat.mention"
    }

    /// Ícono propio del tipo; `nil` = el de su categoría. El acuse de visto lleva un ojo y, como no
    /// pide nada, va en contorno y no entra a `needsAction`.
    static func symbol(_ type: String?) -> String? {
        (type ?? "").lowercased() == "notice.seen" ? "eye" : nil
    }

    private static let dayMonth: DateFormatter = formatter("d MMM")
    private static let dayMonthYear: DateFormatter = formatter("d MMM yyyy")

    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = pattern
        return f
    }

    /// «ahora», «hace 5 min», «hace 3 h»; de días pasados, la fecha.
    static func age(_ iso: String, now: Date = Date()) -> String {
        guard let date = parseDate(iso) else { return "" }
        let mins = Int((now.timeIntervalSince(date) / 60).rounded())
        if mins < 1 { return "ahora" }
        if mins < 60 { return "hace \(mins) min" }
        let hours = Int((Double(mins) / 60).rounded())
        if hours < 24 { return "hace \(hours) h" }
        let cal = Calendar.current
        let sameYear = cal.component(.year, from: date) == cal.component(.year, from: now)
        return (sameYear ? dayMonth : dayMonthYear).string(from: date).replacingOccurrences(of: ".", with: "")
    }

    /// «Visto hace 5 min», «Visto ahora», «Visto el 3 nov». Sin fecha legible, solo «Visto».
    static func stamp(_ verb: String, _ iso: String?, now: Date = Date()) -> String {
        guard let iso else { return verb }
        let when = age(iso, now: now)
        if when.isEmpty { return verb }
        return when == "ahora" || when.hasPrefix("hace ") ? "\(verb) \(when)" : "\(verb) el \(when)"
    }

    /// «Hoy», «Ayer» o «Antes».
    static func group(_ iso: String, now: Date = Date()) -> NoticeGroup {
        guard let date = parseDate(iso) else { return .earlier }
        let cal = Calendar.current
        let diff = cal.dateComponents([.day], from: cal.startOfDay(for: date), to: cal.startOfDay(for: now)).day ?? 0
        if diff <= 0 { return .today }
        return diff == 1 ? .yesterday : .earlier
    }
}
