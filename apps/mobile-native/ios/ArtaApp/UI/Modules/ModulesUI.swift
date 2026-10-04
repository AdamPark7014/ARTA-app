import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

// Piezas comunes de Inicio, Tareas, Eventos y Aprobaciones. El tema vive en
// `UI/Common/Theme.swift` (solo lectura); aquí van los ayudantes propios.

// MARK: - Perfil con permisos (compartido entre pantallas)

@MainActor
final class ModulesProfileStore {
    static let shared = ModulesProfileStore()

    private(set) var profile: ModulesProfile?
    private var loadedAt: Date?

    private init() {}

    /// Se vuelve a pedir pasados 5 minutos o si cambió la persona (otra sesión en el mismo teléfono).
    func load(force: Bool = false, expectedUserId: String? = nil) async throws -> ModulesProfile {
        if !force, let profile, let loadedAt, Date().timeIntervalSince(loadedAt) < 300,
           expectedUserId == nil || expectedUserId == profile.id {
            return profile
        }
        let fresh = try await ApiClient.shared.modulesProfile()
        profile = fresh
        loadedAt = Date()
        return fresh
    }
}

extension Error {
    /// Soltar el «tirar para actualizar» o salir de la pantalla cancela la petición: eso no es un error.
    var isModuleCancellation: Bool {
        if self is CancellationError { return true }
        if let url = self as? URLError, url.code == .cancelled { return true }
        return false
    }
}

extension String {
    var moduleTrimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

// MARK: - Hápticos

@MainActor
enum Haptics {
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func error() { UINotificationFeedbackGenerator().notificationOccurred(.error) }
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
}

// MARK: - Colores de estado

enum PillTone {
    case neutral, gold, ok, warn, danger, info

    var foreground: Color {
        switch self {
        case .neutral: return ArtaColor.muted
        case .gold: return ArtaColor.gold
        case .ok: return Color(hex: 0x22C55E)
        case .warn: return Color(hex: 0xF59E0B)
        case .danger: return ArtaColor.danger
        case .info: return ArtaColor.read
        }
    }

    var background: Color { foreground.opacity(0.16) }
}

struct StatusPill: View {
    let text: String
    var tone: PillTone = .neutral

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tone.foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(tone.background))
            .lineLimit(1)
    }
}

// MARK: - Estados de pantalla

/// Esqueleto con marcadores `redacted` mientras llega la primera carga.
struct ModuleSkeletonList: View {
    var rows: Int = 6

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ForEach(0..<rows, id: \.self) { _ in
                    HStack(spacing: 12) {
                        Circle().frame(width: 36, height: 36)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Título de ejemplo de una fila").font(.subheadline)
                            Text("Detalle · vence mañana").font(.caption)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(ArtaColor.bgElev))
                }
            }
            .padding(16)
        }
        .foregroundStyle(ArtaColor.surface2)
        .redacted(reason: .placeholder)
        .allowsHitTesting(false)
        .accessibilityLabel("Cargando")
    }
}

struct ModuleErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("No se pudo cargar", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("Reintentar", action: retry)
                .buttonStyle(.borderedProminent)
                .tint(ArtaColor.gold)
                .foregroundStyle(ArtaColor.bg)
        }
    }
}

struct ModuleEmptyView: View {
    let icon: String
    let title: String
    var message: String? = nil

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: icon)
        } description: {
            if let message { Text(message) }
        }
    }
}

/// Tarjeta con título opcional sobre el fondo elevado.
struct ModuleCard<Content: View>: View {
    var title: String? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.muted)
                    .textCase(.uppercase)
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(ArtaColor.bgElev))
    }
}

/// Fila «etiqueta: valor» de las fichas de detalle.
struct FactRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label).font(.subheadline).foregroundStyle(ArtaColor.muted)
            Spacer(minLength: 8)
            Text(value).font(.subheadline).foregroundStyle(ArtaColor.text).multilineTextAlignment(.trailing)
        }
    }
}

/// Avatares apilados con los nombres al lado.
struct PeopleLine: View {
    let names: [String]
    var emptyText: String = "Sin asignar"

    var body: some View {
        if names.isEmpty {
            Text(emptyText).font(.caption).foregroundStyle(ArtaColor.muted)
        } else {
            HStack(spacing: 6) {
                HStack(spacing: -6) {
                    ForEach(Array(names.prefix(3).enumerated()), id: \.offset) { _, name in
                        Avatar(name: name, size: 20)
                            .overlay(Circle().stroke(ArtaColor.bgElev, lineWidth: 1.5))
                    }
                }
                Text(names.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
                    .lineLimit(1)
            }
        }
    }
}

// MARK: - Fechas (español de México)

enum MDate {
    private static let esMX = Locale(identifier: "es_MX")

    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = esMX
        f.dateFormat = pattern
        return f
    }

    private static let hm = formatter("HH:mm")
    private static let dayMonth = formatter("d MMM")
    private static let weekdayDayMonth = formatter("EEE d MMM")
    private static let weekday = formatter("EEEE")
    private static let longDay = formatter("EEEE d 'de' MMMM")
    private static let monthYear = formatter("LLLL yyyy")
    private static let stamp = formatter("d MMM yyyy, HH:mm")

    /// `AAAA-MM-DD` en la zona del teléfono (días del calendario, fechas de vencimiento).
    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func capitalized(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

    static func ymdString(_ date: Date) -> String { ymd.string(from: date) }
    static func fromYMD(_ s: String) -> Date? { ymd.date(from: String(s.prefix(10))) }

    static func daysFromToday(_ date: Date) -> Int {
        let cal = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: date)).day ?? 0
    }

    /// La web guarda los vencimientos de `<input type=date>` como medianoche UTC:
    /// esos son «solo día» y se leen por su `AAAA-MM-DD`, sin correr un día en México.
    static func isDateOnly(_ iso: String) -> Bool {
        if iso.count == 10 { return true }
        return iso.contains("T00:00:00") && (iso.hasSuffix("Z") || iso.hasSuffix("+00:00"))
    }

    static func dueDay(_ iso: String?) -> Date? {
        guard let iso, iso.count >= 10 else { return nil }
        if isDateOnly(iso) { return fromYMD(iso) }
        if let date = parseDate(iso) { return Calendar.current.startOfDay(for: date) }
        return fromYMD(iso)
    }

    static func dueHasTime(_ iso: String?) -> Bool {
        guard let iso, iso.count > 10 else { return false }
        return !isDateOnly(iso)
    }

    /// «vence hoy 16:00», «vence mañana», «vence en 3 días», «venció hace 2 días».
    static func dueText(_ iso: String?) -> String? {
        guard let day = dueDay(iso) else { return nil }
        let n = daysFromToday(day)
        var time = ""
        if dueHasTime(iso), let date = parseDate(iso) { time = " " + hm.string(from: date) }
        switch n {
        case 0: return "vence hoy" + time
        case 1: return "vence mañana" + time
        case -1: return "venció ayer"
        case 2...6: return "vence en \(n) días"
        case ..<(-1): return "venció hace \(-n) días"
        default: return "vence " + dayMonth.string(from: day)
        }
    }

    /// Cuándo es un evento: «Hoy · 20:00», «Mañana», «Sáb 12 sept · 21:00 – 13 sept».
    static func eventWhen(_ startsAt: String?, _ endsAt: String?) -> String {
        guard let start = parseDate(startsAt) else { return "Sin fecha" }
        let n = daysFromToday(start)
        var text: String
        switch n {
        case 0: text = "Hoy"
        case 1: text = "Mañana"
        case -1: text = "Ayer"
        case 2...6: text = capitalized(weekday.string(from: start))
        default: text = capitalized(weekdayDayMonth.string(from: start))
        }
        let time = hm.string(from: start)
        if time != "00:00" { text += " · " + time }
        if let end = parseDate(endsAt), !Calendar.current.isDate(end, inSameDayAs: start) {
            text += " – " + dayMonth.string(from: end)
        }
        return text
    }

    /// «Hoy», «Mañana», «En 5 días», o la fecha.
    static func countdown(_ startsAt: String?) -> String? {
        guard let start = parseDate(startsAt) else { return nil }
        let n = daysFromToday(start)
        if n == 0 { return "Hoy" }
        if n == 1 { return "Mañana" }
        if n > 1 && n <= 60 { return "En \(n) días" }
        return dayMonth.string(from: start)
    }

    /// Para historiales: «12 sept 2026, 14:05».
    static func stampText(_ iso: String?) -> String {
        guard let date = parseDate(iso) else { return "" }
        return stamp.string(from: date)
    }

    static func todayTitle() -> String { capitalized(longDay.string(from: Date())) }
    static func monthTitle(_ date: Date) -> String { capitalized(monthYear.string(from: date)) }
    static func longDayTitle(_ date: Date) -> String { capitalized(longDay.string(from: date)) }
    static func dayNumber(_ date: Date) -> String { String(Calendar.current.component(.day, from: date)) }
    static func shortMonth(_ date: Date) -> String {
        dayMonth.string(from: date).split(separator: " ").last.map(String.init)?.replacingOccurrences(of: ".", with: "") ?? ""
    }
}

// MARK: - Dinero

enum Money {
    private static let mxnFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "MXN"
        f.locale = Locale(identifier: "es_MX")
        f.maximumFractionDigits = 2
        return f
    }()

    static func mxn(_ value: Double?) -> String {
        guard let value else { return "—" }
        return mxnFormatter.string(from: NSNumber(value: value)) ?? String(format: "$%.2f", value)
    }
}

// MARK: - Etiquetas

enum EntityInfo {
    static func label(_ entity: String?) -> String {
        switch entity ?? "" {
        case "ARTA": return "Arta"
        case "EXPLANADA": return "Auditorio"
        default: return entity ?? ""
        }
    }
}

enum TaskInfo {
    static func statusLabel(_ status: String) -> String {
        switch status {
        case "OPEN": return "Abierta"
        case "IN_PROGRESS": return "En curso"
        case "PENDING_APPROVAL": return "Por aprobar"
        case "DONE": return "Hecha"
        case "BLOCKED": return "Bloqueada"
        default: return status
        }
    }

    static func statusTone(_ status: String) -> PillTone {
        switch status {
        case "DONE": return .ok
        case "PENDING_APPROVAL": return .warn
        case "BLOCKED": return .danger
        case "IN_PROGRESS": return .gold
        default: return .neutral
        }
    }

    /// Mismo texto que la web: qué tan atendida está la tarea.
    static func engagement(_ task: ArtaTask) -> (String, PillTone)? {
        if task.isDone { return ("Hecha", .ok) }
        if task.isPendingApproval { return ("Por aprobar", .warn) }
        if task.status == "BLOCKED" { return ("Bloqueada", .danger) }
        if task.status == "IN_PROGRESS" { return ("En curso", .gold) }
        if task.allAssigneeIds.isEmpty { return ("Sin asignar", .neutral) }
        if task.seenAt == nil { return ("Sin abrir", .warn) }
        return ("Vio · sin avance", .neutral)
    }

    static func actionLabel(_ action: String) -> String {
        switch action {
        case "created": return "Tarea creada"
        case "assigned": return "Asignada"
        case "reassigned": return "Reasignada"
        case "status_changed": return "Estado cambiado"
        case "submitted": return "Entregada para revisión"
        case "completed": return "Completada"
        case "approved": return "Aprobada"
        case "rejected": return "Rechazada — corrección pedida"
        case "evidence_added": return "Evidencia agregada"
        case "deleted": return "Eliminada"
        default: return action
        }
    }

    /// `status_changed` guarda la clave del estado en `detail`.
    static func activityDetail(_ activity: TaskActivity) -> String? {
        guard let detail = activity.detail, !detail.isEmpty else { return nil }
        if activity.action == "status_changed" { return statusLabel(detail) }
        return detail
    }
}

/// Grupos por vencimiento (la web agrupa igual, con «Mañana» aparte en la app).
enum DueBucket: Int, CaseIterable {
    case overdue, today, tomorrow, week, later, someday, done

    var title: String {
        switch self {
        case .overdue: return "Vencidas"
        case .today: return "Hoy"
        case .tomorrow: return "Mañana"
        case .week: return "Esta semana"
        case .later: return "Después"
        case .someday: return "Sin fecha"
        case .done: return "Completadas"
        }
    }

    static func of(_ task: ArtaTask) -> DueBucket {
        if task.isDone { return .done }
        guard let day = MDate.dueDay(task.dueAt) else { return .someday }
        let n = MDate.daysFromToday(day)
        if n < 0 { return .overdue }
        if n == 0 { return .today }
        if n == 1 { return .tomorrow }
        if n <= 7 { return .week }
        return .later
    }
}

enum POInfo {
    static func statusLabel(_ status: String?) -> String {
        switch status ?? "" {
        case "PENDING_AUTH": return "Por autorizar"
        case "DRAFT": return "Borrador"
        case "AUTHORIZED": return "Por pagar"
        case "PAID": return "Pagada"
        case "REJECTED": return "Rechazada"
        case "CANCELLED": return "Cancelada"
        default: return status ?? "—"
        }
    }

    static func statusTone(_ status: String?) -> PillTone {
        switch status ?? "" {
        case "PENDING_AUTH": return .warn
        case "AUTHORIZED": return .info
        case "PAID": return .ok
        case "REJECTED", "CANCELLED": return .danger
        default: return .neutral
        }
    }

    static func rubroLabel(_ rubro: String?) -> String {
        guard let rubro, !rubro.isEmpty else { return "Sin rubro" }
        let labels: [String: String] = [
            "audio": "Audio", "luces": "Luces", "planta_luz": "Planta de luz", "hospedaje": "Hospedaje",
            "transporte": "Transporte", "catering": "Catering", "artes": "Artes",
            "publicidad": "Publicidad / campaña", "otro": "Otro",
        ]
        return labels[rubro] ?? rubro
    }

    static func paymentLabel(_ method: String?) -> String {
        switch method ?? "" {
        case "EFECTIVO": return "Efectivo"
        case "CHEQUE": return "Cheque"
        case "TARJETA": return "Tarjeta"
        case "OTRO": return "Otro"
        default: return "Transferencia"
        }
    }

    static func payeeLabel(_ payee: String?) -> String { payee == "OTRO" ? "Otro" : "Proveedor" }
}

// MARK: - Archivos

/// Archivo elegido para subir (evidencia de una tarea).
struct PickedFile: Identifiable {
    let id = UUID()
    let name: String
    let data: Data
    let mime: String
}

enum ModuleFiles {
    static func mime(for filename: String) -> String {
        let ext = (filename as NSString).pathExtension
        return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }

    /// Lee un archivo del selector de documentos (URL con acceso temporal).
    static func read(_ url: URL) -> PickedFile? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return nil }
        let name = url.lastPathComponent
        return PickedFile(name: name, data: data, mime: mime(for: name))
    }

    /// Foto de la fototeca como JPEG: el API rechaza archivos cuyo contenido no
    /// corresponde a la extensión (una HEIC llamada .jpg no pasa).
    static func photo(_ item: PhotosPickerItem) async -> PickedFile? {
        guard let raw = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: raw),
              let jpeg = image.jpegData(compressionQuality: 0.85) else { return nil }
        let stamp = Int(Date().timeIntervalSince1970)
        return PickedFile(name: "foto-\(stamp).jpg", data: jpeg, mime: "image/jpeg")
    }

    /// Baja un adjunto con la sesión para abrirlo con Vista Rápida.
    static func download(_ path: String, name: String?) async throws -> URL {
        guard let url = ApiConfig.resolve(path) else {
            throw ApiError(status: nil, message: "El archivo no está disponible.")
        }
        let urlExt = url.pathExtension
        var suggested = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if suggested.isEmpty { suggested = url.lastPathComponent }
        // Vista Rápida necesita la extensión para saber qué es.
        if (suggested as NSString).pathExtension.isEmpty, !urlExt.isEmpty { suggested += "." + urlExt }
        return try await ApiClient.shared.download(url, suggestedName: suggested)
    }
}
