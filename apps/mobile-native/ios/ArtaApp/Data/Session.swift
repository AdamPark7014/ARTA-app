import Combine
import Foundation

/// Sesión de la app: quién entró y el ciclo login → push/socket → logout.
@MainActor
final class Session: ObservableObject {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(UserDto)
    }

    enum LoginResult {
        case success
        case needsCode(challengeId: String)
        /// La organización exige 2FA y la persona no lo ha configurado: se hace en la web.
        case needsEnrollment
        case error(String)
    }

    static let shared = Session()

    @Published private(set) var state: State = .loading

    var currentUser: UserDto? {
        if case .signedIn(let user) = state { return user }
        return nil
    }

    private static let userKey = "arta.session.user"
    private var bag = Set<AnyCancellable>()

    private init() {
        ApiClient.shared.unauthorized
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.expire() }
            .store(in: &bag)
    }

    /// Al abrir la app: con cookie guardada se confirma con `/auth/me`; sin red se usa el último usuario.
    func restore() async {
        #if DEBUG
        // Modo demo (`-ArtaDemo YES`): dentro como la persona de las fixtures, solo
        // en memoria. No pasa por `signedIn` para no guardar nada ni abrir socket/push.
        if DemoMode.isActive {
            if let user = DemoMode.sessionUser() {
                state = .signedIn(user)
            } else {
                state = .signedOut
            }
            return
        }
        #endif
        guard ApiClient.shared.hasSession() else {
            state = .signedOut
            return
        }
        do {
            signedIn(try await ApiClient.shared.me())
        } catch let error as ApiError where error.isUnauthorized {
            expire()
        } catch {
            if let cached = cachedUser() { signedIn(cached) } else { state = .signedOut }
        }
    }

    func login(email: String, password: String) async -> LoginResult {
        // `.whitespacesAndNewlines`: el autollenado y el pegado a veces traen un
        // salto de línea al final, y el API compara el correo tal cual.
        await handle { try await ApiClient.shared.login(LoginBody(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)) }
    }

    func verifyCode(challengeId: String, code: String) async -> LoginResult {
        await handle { try await ApiClient.shared.verifyLogin(VerifyLoginBody(challengeId: challengeId, code: code.filter(\.isNumber))) }
    }

    private func handle(_ call: () async throws -> LoginResponse) async -> LoginResult {
        do {
            let res = try await call()
            if res.requires2fa == true, let challenge = res.challengeId, !challenge.isEmpty {
                return .needsCode(challengeId: challenge)
            }
            if res.requiresTotpEnrollment == true { return .needsEnrollment }
            // La respuesta del login trae un usuario parcial: el completo sale de /auth/me.
            let full = try? await ApiClient.shared.me()
            guard let user = full ?? res.user else { return .error("No se pudo abrir la sesión") }
            signedIn(user)
            return .success
        } catch {
            return .error(error.userMessage)
        }
    }

    private func signedIn(_ user: UserDto) {
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: Self.userKey)
        }
        state = .signedIn(user)
        RealtimeClient.shared.connect()
        Task { await PushManager.shared.requestPermissionAndRegister() }
    }

    func logout() async {
        // Primero la baja del token: después ya no hay cookie para autorizarla.
        await withTimeout(seconds: 5) { await PushManager.shared.unregister() }
        await withTimeout(seconds: 5) { try? await ApiClient.shared.logout() }
        clearLocal()
    }

    /// 401 del API: la sesión se venció o se revocó en «Sesiones» de la web.
    func expire() {
        if state == .signedOut { return }
        clearLocal()
    }

    private func clearLocal() {
        RealtimeClient.shared.disconnect()
        ApiClient.shared.clearCookies()
        Task { await WebSession.clearCookies() }
        PushManager.shared.clearDelivered()
        UserDefaults.standard.removeObject(forKey: Self.userKey)
        AppRouter.shared.reset()
        state = .signedOut
    }

    private func cachedUser() -> UserDto? {
        guard let data = UserDefaults.standard.data(forKey: Self.userKey) else { return nil }
        return try? JSONDecoder().decode(UserDto.self, from: data)
    }
}

/// Corre `work` como máximo `seconds`; si se pasa, sigue sin esperar el resultado.
func withTimeout(seconds: Double, _ work: @escaping @Sendable () async -> Void) async {
    await withTaskGroup(of: Void.self) { group in
        group.addTask { await work() }
        group.addTask { try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) }
        _ = await group.next()
        group.cancelAll()
    }
}
