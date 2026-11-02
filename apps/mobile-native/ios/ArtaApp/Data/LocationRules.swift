import Foundation

/// Lo que se le dice al servidor del teléfono (`POST /ubicacion/estado`).
enum LocationState: String {
    case ok
    case noPermission = "sin_permiso"
    case off = "apagada"
}

/// Un punto que todavía no llega al servidor, con la hora del teléfono al medir.
struct QueuedLocationPoint: Codable, Equatable {
    let lat: Double
    let lng: Double
    let accuracyM: Double?
    let capturedAt: Date
}

/// Reglas de la ubicación del equipo (docs/UBICACION.md). Mismas cifras que
/// `apps/api/src/ubicacion/horario.ts` y que `location/LocationRules.kt`. El candado de verdad
/// es del servidor; aquí se evita medir cuando no toca.
enum LocationRules {
    static let startHour = 10
    static let endHour = 18

    /// Un punto cada media hora.
    static let cadence: TimeInterval = 30 * 60

    /// Nunca dos en menos de esto: la misma cifra con la que el servidor tira los repetidos.
    static let minGap: TimeInterval = 20 * 60

    /// Cada cuánto se revisa con la app abierta (también para no perder las 10:00 en punto).
    static let tick: TimeInterval = 60

    /// Lo que acepta `POST /ubicacion/puntos`.
    static let batchMax = 50

    /// Un día de horario son 16 puntos: esto es tope de seguridad.
    static let queueMax = 100

    /// Más viejo el servidor ya no lo guarda.
    static let maxAge: TimeInterval = 24 * 60 * 60

    /// Manda la hora de Puebla, no la del teléfono: alguien de viaje mide en el mismo horario.
    private static let calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/Mexico_City") ?? TimeZone(secondsFromGMT: -6 * 60 * 60) ?? TimeZone.current
        return cal
    }()

    /// De 10:00:00 a 17:59:59.
    static func inWindow(_ date: Date) -> Bool {
        let hour = calendar.component(.hour, from: date)
        return hour >= startHour && hour < endHour
    }

    /// El día en Puebla (`2026-11-01`): «Ahora no» vale hasta que cambia.
    static func dayKey(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Un reloj movido hacia atrás no deja a nadie sin medir.
    static func isDue(now: Date, last: Date?, gap: TimeInterval) -> Bool {
        guard let last else { return true }
        let elapsed = now.timeIntervalSince(last)
        return elapsed < 0 || elapsed >= gap
    }

    /// Sin aceptar y sin haber dicho «Ahora no» hoy.
    static func shouldAskConsent(consentAt: String?, dismissedDay: String?, today: String) -> Bool {
        (consentAt ?? "").isEmpty && dismissedDay != today
    }

    /// Primero el interruptor: con la ubicación apagada iOS contesta `.denied` aunque haya permiso.
    static func stateOf(hasPermission: Bool, enabled: Bool) -> LocationState {
        if !enabled { return .off }
        return hasPermission ? .ok : .noPermission
    }

    /// Una vez al cambiar. Lo primero que se manda solo si es un problema: sin dato ya se lee como «bien».
    static func shouldReport(lastSent: String?, current: LocationState) -> Bool {
        guard let lastSent else { return current != .ok }
        return lastSent != current.rawValue
    }

    /// El (0,0) de una lectura vacía no es un sitio donde haya estado nadie.
    static func isRealFix(lat: Double, lng: Double) -> Bool {
        guard lat.isFinite, lng.isFinite else { return false }
        if lat == 0 && lng == 0 { return false }
        return abs(lat) <= 90 && abs(lng) <= 180
    }

    /// Del más viejo al más nuevo; si se llena, se quedan los últimos.
    static func adding(_ point: QueuedLocationPoint, to queue: [QueuedLocationPoint]) -> [QueuedLocationPoint] {
        Array((queue + [point]).sorted { $0.capturedAt < $1.capturedAt }.suffix(queueMax))
    }

    static func fresh(_ queue: [QueuedLocationPoint], now: Date) -> [QueuedLocationPoint] {
        queue.filter { now.timeIntervalSince($0.capturedAt) <= maxAge }
    }
}
