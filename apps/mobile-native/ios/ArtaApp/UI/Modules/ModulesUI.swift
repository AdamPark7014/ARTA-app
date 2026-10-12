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

// MARK: - Estados

/// Tono de un estado. Regla del sistema visual: «lleno» (acento con su texto) = requiere
/// acción; «borde» (contorno de línea fuerte) = informativo. Rojo solo para alertas reales.
enum PillTone {
    case neutral, accent, ok, warn, danger, info

    /// Color sólido del tono (íconos y texto suelto).
    var foreground: Color {
        switch self {
        case .neutral, .info, .ok: return ArtaColor.muted
        case .accent, .warn: return ArtaColor.text
        case .danger: return ArtaColor.danger
        }
    }

    /// `warn` (por aprobar, por autorizar, sin abrir) pide una decisión: va lleno.
    var isFilled: Bool { self == .warn }
}

/// Estado en MAYÚSCULAS 10 px: lleno (requiere acción) o con borde (informativo).
struct StatusPill: View {
    let text: String
    var tone: PillTone = .neutral

    var body: some View {
        let shape = ArtaControlShape(squareRadius: 3)
        Text(text.uppercased(with: Locale(identifier: "es_MX")))
            .font(ArtaFont.status)
            .tracking(0.6)
            .foregroundStyle(textColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(shape.fill(tone.isFilled ? ArtaColor.accentFill : AnyShapeStyle(Color.clear)))
            .overlay(shape.strokeBorder(tone.isFilled ? Color.clear : borderColor, lineWidth: 1))
            .lineLimit(1)
            .fixedSize()
    }

    private var textColor: Color {
        if tone.isFilled { return ArtaColor.onAccent }
        switch tone {
        case .danger: return ArtaColor.danger
        case .accent: return ArtaColor.text
        default: return ArtaColor.muted
        }
    }

    private var borderColor: Color {
        switch tone {
        case .danger: return ArtaColor.danger.opacity(0.45)
        case .accent: return ArtaTheme.isLight ? Color(hex: 0x0C0C0D, opacity: 0.35) : Color(hex: 0xC7CCD4, opacity: 0.45)
        default: return ArtaTheme.isLight ? Color(hex: 0x0C0C0D, opacity: 0.2) : Color.white.opacity(0.18)
        }
    }
}

// MARK: - Estados de pantalla

/// Esqueleto mientras llega la primera carga: tarjetas del tema con marcadores y un brillo
/// que las recorre (blanco en ARTA, plata tenue en Auditorio).
struct ModuleSkeletonList: View {
    var rows: Int = 6

    var body: some View {
        ScrollView {
            VStack(spacing: ArtaSpace.m) {
                ForEach(0..<rows, id: \.self) { i in
                    HStack(spacing: ArtaSpace.m) {
                        Circle().fill(ArtaColor.surface2).frame(width: 36, height: 36)
                        VStack(alignment: .leading, spacing: ArtaSpace.s) {
                            SkeletonBar(width: CGFloat(150 + (i * 41) % 90), height: 12)
                            SkeletonBar(width: CGFloat(90 + (i * 29) % 70), height: 8)
                        }
                        Spacer(minLength: 0)
                    }
                    .artaCard(padding: ArtaSpace.l)
                }
            }
            .padding(.horizontal, ArtaLayout.gutter)
            .padding(.vertical, ArtaSpace.l)
            .artaShimmer()
        }
        .scrollDisabled(true)
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }
}

struct ModuleErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        EmptyState(
            icon: "wifi.exclamationmark",
            title: "No se pudo cargar",
            message: message,
            actionTitle: "Reintentar",
            action: retry
        )
    }
}

struct ModuleEmptyView: View {
    let icon: String
    let title: String
    var message: String? = nil

    var body: some View {
        EmptyState(icon: icon, title: title, message: message)
    }
}

/// Tarjeta con título opcional en etiqueta «cap» (fichas de detalle) y su contador discreto.
struct ModuleCard<Content: View>: View {
    var title: String? = nil
    var count: Int? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: ArtaSpace.m) {
            if let title {
                ArtaSectionHeader(title, count: count)
            }
            content()
        }
        .artaCard()
    }
}

/// Sección de una lista hecha de tarjetas (Tareas, Aprobaciones): encabezado «cap» afuera,
/// con su contador, y las filas dentro de una sola tarjeta separadas por línea fina. Así las
/// esquinas son las de la entidad (16 en ARTA, 6 en Auditorio) y no las de la lista del sistema.
struct CardSection<Item: Identifiable, Row: View>: View {
    /// Sin título, solo la tarjeta (cuando el segmentado de arriba ya dice qué es).
    var title: String? = nil
    var count: Int? = nil
    var alert = false
    let items: [Item]
    /// Sangría de la línea entre filas (hasta el texto).
    var dividerInset: CGFloat = 0
    /// Aire arriba y abajo de cada fila (las filas de tarea ya traen 4 propios).
    var rowPadding: CGFloat = ArtaSpace.m
    @ViewBuilder let row: (Item) -> Row

    var body: some View {
        VStack(alignment: .leading, spacing: ArtaSpace.s) {
            if let title {
                ArtaSectionHeader(title, count: count, alert: alert)
                    .padding(.horizontal, ArtaSpace.xs)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(items) { item in
                    row(item)
                        .padding(.horizontal, ArtaSpace.l)
                        .padding(.vertical, rowPadding)
                    if item.id != items.last?.id {
                        ArtaDivider(leading: ArtaSpace.l + dividerInset)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ArtaCardBackground())
        }
    }
}

/// Renglón con ícono de los encabezados (fecha, lugar, horario): el ícono en una columna fija
/// para que todos los textos arranquen en la misma orilla.
struct InfoLine: View {
    let icon: String
    let text: String
    var color: Color? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.s) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(ArtaColor.tertiary)
                .frame(width: 20, alignment: .center)
            Text(text)
                .font(.subheadline)
                .monospacedDigit()
                .foregroundStyle(color ?? ArtaColor.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Aviso breve abajo de la pantalla (lo hecho: «Entrega aprobada»): píldora del acento.
struct FlashToast: ViewModifier {
    let text: String?

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let text {
                    Text(text)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.onAccent)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, ArtaSpace.l)
                        .padding(.vertical, 10)
                        .background(ArtaControlShape().fill(ArtaColor.accentFill))
                        .shadow(color: ArtaTheme.isLight ? Color(hex: 0x0C0C0D, opacity: 0.18) : .black.opacity(0.55), radius: 10, y: 5)
                        .padding(.horizontal, ArtaLayout.gutter)
                        .padding(.bottom, ArtaSpace.l)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: text)
    }
}

extension View {
    func flashToast(_ text: String?) -> some View { modifier(FlashToast(text: text)) }
}

/// Panel del tablero: título 600 y, a la derecha, un dato o «Ver todo» en terciario.
struct PanelCard<Content: View>: View {
    let title: String
    var trailing: String? = nil
    var trailingId: String? = nil
    var trailingAction: (() -> Void)? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: ArtaSpace.m) {
            HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.s) {
                Text(title)
                    .font(ArtaFont.panelTitle)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .layoutPriority(1)
                Spacer(minLength: ArtaSpace.s)
                if let trailing {
                    if let trailingAction {
                        Button(action: trailingAction) {
                            HStack(spacing: 3) {
                                Text(trailing)
                                    .lineLimit(1)
                                Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
                            }
                            .font(.footnote)
                            .foregroundStyle(ArtaColor.tertiary)
                            // Área de toque cómoda sin mover el diseño.
                            .padding(.vertical, ArtaSpace.xs)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(ArtaPressStyle(scale: 0.96))
                        .accessibilityIdentifier(trailingId ?? "")
                    } else {
                        Text(trailing)
                            .font(.footnote)
                            .foregroundStyle(ArtaColor.tertiary)
                            .lineLimit(1)
                    }
                }
            }
            content()
        }
        .artaCard()
    }
}

/// Barra de avance de 3 px: tinta en ARTA, degradado plata en Auditorio.
struct ProgressBar: View {
    let value: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(ArtaColor.line)
                Capsule()
                    .fill(ArtaTheme.isLight
                          ? AnyShapeStyle(ArtaColor.accent)
                          : AnyShapeStyle(LinearGradient(colors: [Color(hex: 0x9AA1AC), Color(hex: 0xF1F3F6)], startPoint: .leading, endPoint: .trailing)))
                    .frame(width: geo.size.width * min(max(value, 0), 1))
            }
        }
        .frame(height: 3)
        .accessibilityHidden(true)
    }
}

/// Fila «etiqueta: valor» de las fichas de detalle.
struct FactRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.m) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(ArtaColor.tertiary)
                .fixedSize()
            Spacer(minLength: ArtaSpace.s)
            Text(value)
                .font(.subheadline)
                .monospacedDigit()
                .foregroundStyle(ArtaColor.text)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Avatares apilados con los nombres al lado. Con más de dos personas: «Ana, Beto +2»
/// (sin puntos suspensivos a media palabra).
struct PeopleLine: View {
    let names: [String]
    var emptyText: String = "Sin asignar"

    private var summary: String {
        guard names.count > 2 else { return names.joined(separator: ", ") }
        return names.prefix(2).joined(separator: ", ") + " +\(names.count - 2)"
    }

    var body: some View {
        if names.isEmpty {
            Text(emptyText).font(.caption).foregroundStyle(ArtaColor.muted)
        } else {
            HStack(spacing: 6) {
                HStack(spacing: -6) {
                    ForEach(Array(names.prefix(3).enumerated()), id: \.offset) { _, name in
                        Avatar(name: name, size: 20)
                            .overlay(Circle().stroke(ArtaColor.surface, lineWidth: 1.5))
                    }
                }
                Text(summary)
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
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
    /// «21:30» (horas tabulares de la línea de tiempo).
    static func timeText(_ date: Date) -> String { hm.string(from: date) }
    /// «16 oct».
    static func dayMonthText(_ date: Date) -> String { dayMonth.string(from: date).replacingOccurrences(of: ".", with: "") }
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
        case "IN_PROGRESS": return .accent
        default: return .neutral
        }
    }

    /// Mismo texto que la web: qué tan atendida está la tarea.
    static func engagement(_ task: ArtaTask) -> (String, PillTone)? {
        if task.isDone { return ("Hecha", .ok) }
        if task.isPendingApproval { return ("Por aprobar", .warn) }
        if task.status == "BLOCKED" { return ("Bloqueada", .danger) }
        if task.status == "IN_PROGRESS" { return ("En curso", .accent) }
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
