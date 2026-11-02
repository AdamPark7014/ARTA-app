import Combine
import CoreLocation
import Foundation
import UIKit

/// Ubicación del equipo, de 10:00 a 18:00 (docs/UBICACION.md).
///
/// Solo corre con consentimiento y si el servidor dice `tracked`: a Chacho, a Arturo y a `super_admin`
/// no les sale hoja, permiso ni medición. Con «Ahora no» la app sigue igual y se pregunta otro día.
///
/// **Solo «Mientras se usa».** Apple rechazó en NEXARA el modo de fondo `location` por 2.5.4 (seguir a
/// empleados no es un uso válido, 07-10-2026) y ARTA es app pública: aquí no hay «Siempre» ni
/// `allowsBackgroundLocationUpdates` ni cambios significativos. Se mide con lecturas sueltas al pasar a
/// primer plano y cada 30 min mientras la app siga abierta. Con la app cerrada no se mide: el servidor
/// manda un recordatorio visible (`location.reminder`) y al abrirla se mide.
///
/// Todo punto entra a una cola persistente antes de salir: si no hay red o la sesión se cerró (401), sigue
/// guardado con su hora y se reenvía en lotes de 50. Un envío repetido no estorba: el servidor tira lo que
/// quede a menos de 20 minutos de otro punto.
@MainActor
final class LocationTracker: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = LocationTracker()

    private static let userKey = "arta.location.user"
    private static let activeKey = "arta.location.active"
    private static let lastTakenKey = "arta.location.lastTaken"
    private static let queueKey = "arta.location.queue"
    private static let stateSentKey = "arta.location.stateSent"
    private static let dismissedPrefix = "arta.location.dismissed."

    /// La hoja de aceptar. La presenta `SignedInView`.
    @Published var showsConsent = false
    /// Permiso negado o ubicación apagada, dentro del horario: el aviso de Inicio.
    @Published private(set) var problem: LocationState?

    private let manager = CLLocationManager()
    private let defaults = UserDefaults.standard
    /// Quien entró en este arranque. `nil` sin sesión y en el modo demo.
    private var userId: String?
    private var timer: Timer?
    private var measuring = false
    private var measureStartedAt: Date?
    private var sendingQueue = false
    private var reportingState = false
    private var acceptedConsent = false

    private override init() {
        super.init()
        manager.delegate = self
        // Unos 100 m bastan para coordinar al equipo y gasta menos batería.
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// Aceptó y el servidor lo mide.
    private var isActive: Bool {
        !DemoMode.isActive && userId != nil && defaults.bool(forKey: Self.activeKey)
    }

    private var isAuthorized: Bool {
        let status = manager.authorizationStatus
        return status == .authorizedWhenInUse || status == .authorizedAlways
    }

    private var lastTaken: Date? {
        get { defaults.object(forKey: Self.lastTakenKey) as? Date }
        set { defaults.set(newValue, forKey: Self.lastTakenKey) }
    }

    // MARK: Sesión

    /// Al entrar con sesión (`Session.signedIn`): pregunta al servidor qué le toca a esta persona.
    func signedIn(_ user: UserDto) {
        // Lo medido es de una persona: si entra otra en este teléfono, no se mezcla.
        if defaults.string(forKey: Self.userKey) != user.id {
            forgetPerson()
            defaults.set(user.id, forKey: Self.userKey)
        }
        userId = user.id
        // A un exento no le queda nada encendido aunque el servidor no conteste.
        if !Rbac.isLocationTracked(user.roleKey) { deactivate(clearQueue: true) }
        Task { await refresh() }
    }

    /// Modo demo: la hoja y el permiso se pueden ver, nada sale a la red. Con `-ArtaDemo YES` (capturas
    /// automáticas) la hoja no sale, salvo que se pida con `-ArtaDemoUbicacion YES`.
    func startDemo() {
        userId = nil
        disarm()
        problem = nil
        showsConsent = DemoMode.enteredFromLogin || DemoMode.locationSheetRequested
    }

    /// Se acabó la sesión. «Cerrar sesión» vacía la cola de esa persona (`clearQueue`); un 401 la deja con su
    /// dueño: si vuelve a entrar la misma persona se manda, y si entra otra, `signedIn` la tira.
    func stop(clearQueue: Bool) {
        deactivate(clearQueue: clearQueue)
        if clearQueue {
            forgetPerson()
            defaults.removeObject(forKey: Self.userKey)
        }
        showsConsent = false
        userId = nil
    }

    private func forgetPerson() {
        defaults.removeObject(forKey: Self.activeKey)
        defaults.removeObject(forKey: Self.lastTakenKey)
        defaults.removeObject(forKey: Self.queueKey)
        defaults.removeObject(forKey: Self.stateSentKey)
    }

    private func deactivate(clearQueue: Bool) {
        defaults.set(false, forKey: Self.activeKey)
        disarm()
        problem = nil
        if clearQueue { defaults.removeObject(forKey: Self.queueKey) }
    }

    private func disarm() {
        timer?.invalidate()
        timer = nil
        measuring = false
        // También cancela un `requestLocation` en curso.
        manager.stopUpdatingLocation()
    }

    // MARK: Primer plano

    /// La app volvió a primer plano: el temporizador no corre suspendido y lo que pasó afuera se revisa aquí.
    func appBecameActive() {
        guard userId != nil else { return }
        measuring = false
        Task { await refresh() }
    }

    func appEnteredBackground() {
        timer?.invalidate()
        timer = nil
    }

    /// Tocó el recordatorio (`location.reminder`), o llegó con la app abierta. Si la sesión todavía no
    /// termina de cargar, `signedIn` hace lo mismo.
    func reminderOpened() {
        guard userId != nil else { return }
        Task { await refresh() }
    }

    private func refresh() async {
        guard !DemoMode.isActive, userId != nil, ApiClient.shared.hasSession() else { return }
        do {
            let status = try await ApiClient.shared.locationStatus()
            // Pudo cerrarse la sesión mientras contestaba.
            guard userId != nil else { return }
            apply(status)
        } catch let error as ApiError where error.isUnauthorized {
            // Lo atiende `Session.expire`.
            return
        } catch {
            // Sin red se sigue con lo último que se supo.
        }
        await sync()
    }

    private func apply(_ status: LocationStatusResponse) {
        guard status.tracked else {
            deactivate(clearQueue: true)
            showsConsent = false
            return
        }
        guard let consent = status.consentAt, !consent.isEmpty else {
            deactivate(clearQueue: true)
            let dismissed = userId.flatMap { defaults.string(forKey: Self.dismissedPrefix + $0) }
            if LocationRules.shouldAskConsent(consentAt: nil, dismissedDay: dismissed, today: LocationRules.dayKey(Date())) {
                showsConsent = true
            }
            return
        }
        defaults.set(true, forKey: Self.activeKey)
    }

    /// Con consentimiento: pone al día el permiso, el estado, la cola y el temporizador, y mide si toca.
    private func sync() async {
        guard isActive else { return }
        if UIApplication.shared.applicationState != .background { armTimer() }
        // Aceptó aquí o en otro teléfono y aquí nunca se le pidió: iOS enseña el diálogo una sola vez.
        // Sin decidir todavía no es «sin permiso».
        if manager.authorizationStatus == .notDetermined {
            problem = nil
            manager.requestWhenInUseAuthorization()
            return
        }
        if LocationRules.inWindow(Date()) {
            await reportState()
        } else {
            // Fuera del horario no se molesta a nadie por tener la ubicación apagada.
            problem = nil
        }
        await sendQueue()
        measureIfDue(gap: LocationRules.minGap)
    }

    private func armTimer() {
        guard timer == nil else { return }
        let t = Timer(timeInterval: LocationRules.tick, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        t.tolerance = 10
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func tick() {
        guard isActive else { return }
        Task { await sendQueue() }
        // Medio minuto de holgura: la revisión es cada minuto y el punto no debe irse a los 31.
        measureIfDue(gap: LocationRules.cadence - 30)
    }

    // MARK: La hoja

    /// «Aceptar». Devuelve el error para la hoja o `nil` si quedó. El diálogo del sistema sale de aquí.
    func acceptConsent() async -> String? {
        if DemoMode.isActive {
            acceptedConsent = true
            showsConsent = false
            if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
            return nil
        }
        do {
            try await ApiClient.shared.acceptLocationConsent()
            defaults.set(true, forKey: Self.activeKey)
            acceptedConsent = true
            showsConsent = false
            await sync()
            return nil
        } catch {
            return error.userMessage
        }
    }

    /// La hoja se cerró. Si no fue por aceptar («Ahora no» o deslizarla), se vuelve a preguntar a otro día.
    /// En el demo no se guarda nada.
    func consentClosed() {
        defer { acceptedConsent = false }
        guard !acceptedConsent, !DemoMode.isActive, let userId else { return }
        defaults.set(LocationRules.dayKey(Date()), forKey: Self.dismissedPrefix + userId)
    }

    // MARK: Medir

    private func measureIfDue(gap: TimeInterval) {
        let now = Date()
        // `requestLocation` siempre contesta, salvo que la app se vaya a segundo plano a media lectura.
        if measuring, let started = measureStartedAt, now.timeIntervalSince(started) < 60 { return }
        guard isActive,
              isAuthorized,
              UIApplication.shared.applicationState != .background,
              LocationRules.inWindow(now),
              LocationRules.isDue(now: now, last: lastTaken, gap: gap) else { return }
        measuring = true
        measureStartedAt = now
        manager.requestLocation()
    }

    private func received(_ location: CLLocation) {
        measuring = false
        guard isActive, location.horizontalAccuracy >= 0 else { return }
        let now = Date()
        let coordinate = location.coordinate
        // La lectura pudo cruzar las 18:00, y nunca dos puntos en 20 min.
        guard LocationRules.inWindow(now),
              LocationRules.isDue(now: now, last: lastTaken, gap: LocationRules.minGap),
              LocationRules.isRealFix(lat: coordinate.latitude, lng: coordinate.longitude) else { return }
        // Se marca como tomado aunque no llegue: queda en la cola con su hora y no se repite a los segundos.
        lastTaken = now
        let point = QueuedLocationPoint(
            lat: coordinate.latitude,
            lng: coordinate.longitude,
            accuracyM: location.horizontalAccuracy,
            capturedAt: now
        )
        saveQueue(LocationRules.adding(point, to: loadQueue()))
        Task { await sendQueue() }
    }

    // MARK: Estado y cola

    private func currentState() async -> LocationState {
        // `locationServicesEnabled` no debe llamarse en el hilo principal: puede trabar la interfaz.
        let enabled = await Task.detached(priority: .utility) { CLLocationManager.locationServicesEnabled() }.value
        return LocationRules.stateOf(hasPermission: isAuthorized, enabled: enabled)
    }

    /// `sin_permiso`, `apagada` y, cuando se arregla, `ok`: una vez al cambiar.
    private func reportState() async {
        let state = await currentState()
        problem = state == .ok ? nil : state
        guard !reportingState,
              LocationRules.shouldReport(lastSent: defaults.string(forKey: Self.stateSentKey), current: state) else { return }
        reportingState = true
        defer { reportingState = false }
        do {
            try await ApiClient.shared.reportLocationState(state)
            defaults.set(state.rawValue, forKey: Self.stateSentKey)
        } catch let error as ApiError where error.status == 403 {
            deactivate(clearQueue: true)
        } catch {
            // No se anota: se vuelve a intentar al siguiente regreso a primer plano.
        }
    }

    private func loadQueue() -> [QueuedLocationPoint] {
        guard let data = defaults.data(forKey: Self.queueKey) else { return [] }
        return (try? JSONDecoder().decode([QueuedLocationPoint].self, from: data)) ?? []
    }

    private func saveQueue(_ queue: [QueuedLocationPoint]) {
        guard let data = try? JSONEncoder().encode(queue) else { return }
        defaults.set(data, forKey: Self.queueKey)
    }

    /// Reenvía la cola del más viejo al más nuevo, en lotes de 50. Se detiene en el primer fallo de red o de sesión.
    private func sendQueue() async {
        guard isActive, !sendingQueue, ApiClient.shared.hasSession() else { return }
        var pending = LocationRules.fresh(loadQueue(), now: Date())
        guard !pending.isEmpty else {
            defaults.removeObject(forKey: Self.queueKey)
            return
        }
        saveQueue(pending)
        sendingQueue = true
        defer { sendingQueue = false }
        while !pending.isEmpty {
            let batch = Array(pending.prefix(LocationRules.batchMax))
            do {
                let result = try await ApiClient.shared.sendLocationPoints(batch)
                // El servidor pasa a `ok` cuando guarda un punto.
                if (result.saved ?? 0) > 0 { defaults.set(LocationState.ok.rawValue, forKey: Self.stateSentKey) }
            } catch let error as ApiError where error.status == 403 {
                // Ya no es de los que se miden.
                deactivate(clearQueue: true)
                return
            } catch let error as ApiError where error.status == 400 || error.status == 422 {
                // Lo que el servidor nunca va a aceptar no debe atorar lo demás.
                print("LocationTracker: puntos rechazados - \(error.message)")
            } catch {
                return
            }
            // Se relee: pudo entrar otro punto, o cerrarse la sesión y vaciarse la cola a media llamada.
            pending = loadQueue().filter { !batch.contains($0) }
            saveQueue(pending)
        }
    }

    // MARK: Delegado

    /// iOS también lo llama al apagar o encender la ubicación del teléfono.
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            guard self.isActive else { return }
            await self.sync()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in self.received(location) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Un fallo suelto es normal en interiores: la siguiente revisión lo vuelve a intentar.
        Task { @MainActor in self.measuring = false }
    }
}
