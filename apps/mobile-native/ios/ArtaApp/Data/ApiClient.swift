import Combine
import Foundation
import UIKit

enum ApiConfig {
    /// `ARTA_API_BASE_URL` del `project.yml` (Info.plist `ArtaApiBaseURL`).
    static let baseURL: URL = {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "ArtaApiBaseURL") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let fallback = "https://arta.artaproducciones.com/api"
        let value = raw.isEmpty || raw.hasPrefix("$(") ? fallback : raw
        return URL(string: value.hasSuffix("/") ? String(value.dropLast()) : value) ?? URL(string: fallback)!
    }()

    /// Origen sin `/api`: ahí viven los adjuntos (`/uploads/...`), el socket
    /// (`/api/socket.io`) y el panel web.
    static let origin: URL = {
        var c = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        c.path = ""
        c.query = nil
        return c.url!
    }()

    /// `/uploads/x.jpg` → URL absoluta del mismo host (la cookie de sesión la autoriza).
    static func resolve(_ path: String) -> URL? {
        if path.hasPrefix("http://") || path.hasPrefix("https://") { return URL(string: path) }
        let clean = path.hasPrefix("/") ? path : "/" + path
        return URL(string: origin.absoluteString + clean)
    }

    static let appVersion: String =
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0"
}

struct ApiError: LocalizedError {
    let status: Int?
    let message: String

    var errorDescription: String? { message }
    var isUnauthorized: Bool { status == 401 }
}

extension Error {
    /// Mensaje legible para la persona (Nest manda `{ message }`, a veces lista).
    var userMessage: String {
        if let api = self as? ApiError { return api.message }
        if self is URLError { return "Sin conexión. Revisa tu internet." }
        if self is DecodingError { return "Respuesta inesperada del servidor." }
        return localizedDescription
    }
}

/// Único cliente HTTP de la app. Sesión por cookies (`HTTPCookieStorage`, que
/// persiste las cookies con `Max-Age` en el contenedor protegido de la app) y
/// doble envío de CSRF: en cada petición que modifica algo se copia la cookie
/// `arta_csrf` al header `x-csrf-token`, exactamente como hace la web.
final class ApiClient {
    static let shared = ApiClient()

    private static let safeMethods: Set<String> = ["GET", "HEAD", "OPTIONS"]

    let session: URLSession
    /// Subidas del chat: un video de 100 MB con datos móviles no cabe en los 120 s de `session`.
    private let uploadSession: URLSession
    private let cookies = HTTPCookieStorage.shared
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    /// 401 en cualquier llamada: la sesión se venció o la cerraron desde otro lado.
    let unauthorized = PassthroughSubject<Void, Never>()

    /// `ArtaApp/0.1.0 (iOS 17.5; iPhone)`: el API lo registra como «Móvil».
    private let userAgent: String = {
        let device = UIDevice.current
        return "ArtaApp/\(ApiConfig.appVersion) (iOS \(device.systemVersion); \(device.model))"
    }()

    private init() {
        // `self.cookies` no se puede leer hasta inicializar todas las propiedades.
        let jar = HTTPCookieStorage.shared
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = jar
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        config.waitsForConnectivity = false
        #if DEBUG
        // Modo demo (`-ArtaDemo YES`): el API lo contestan las fixtures, sin red.
        DemoMode.install(on: config)
        #endif
        session = URLSession(configuration: config)
        let uploads = URLSessionConfiguration.default
        uploads.httpCookieStorage = jar
        uploads.httpCookieAcceptPolicy = .always
        uploads.httpShouldSetCookies = true
        uploads.timeoutIntervalForRequest = 120
        uploads.timeoutIntervalForResource = 60 * 60
        #if DEBUG
        DemoMode.install(on: uploads)
        #endif
        uploadSession = URLSession(configuration: uploads)
        cookies.cookieAcceptPolicy = .always
    }

    // MARK: Cookies

    private func cookie(_ name: String) -> HTTPCookie? {
        let now = Date()
        return cookies.cookies(for: ApiConfig.origin)?.first {
            $0.name == name && ($0.expiresDate.map { $0 > now } ?? true)
        }
    }

    func hasSession() -> Bool { cookie("arta_access") != nil || cookie("arta_session") != nil }

    /// Header `Cookie` para el handshake del socket.
    func cookieHeader() -> String {
        let list = cookies.cookies(for: ApiConfig.origin) ?? []
        return HTTPCookie.requestHeaderFields(with: list)["Cookie"] ?? ""
    }

    func clearCookies() {
        for c in cookies.cookies(for: ApiConfig.origin) ?? [] {
            cookies.deleteCookie(c)
        }
    }

    // MARK: Peticiones

    private func url(_ path: String, query: [String: String?]) -> URL {
        var c = URLComponents(url: ApiConfig.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { k, v in v.map { URLQueryItem(name: k, value: $0) } }
        if !items.isEmpty { c.queryItems = items.sorted { $0.name < $1.name } }
        return c.url!
    }

    func request(_ method: String, _ path: String, query: [String: String?] = [:]) -> URLRequest {
        var req = URLRequest(url: url(path, query: query))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        if !Self.safeMethods.contains(method), let csrf = cookie("arta_csrf")?.value {
            req.setValue(csrf, forHTTPHeaderField: "x-csrf-token")
        }
        return req
    }

    func perform(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw ApiError(status: nil, message: "Respuesta inválida") }
        guard (200..<300).contains(http.statusCode) else {
            let path = req.url?.path ?? ""
            let isLogin = path.contains("/auth/login") || path.contains("/auth/2fa")
            if http.statusCode == 401 && !isLogin {
                DispatchQueue.main.async { self.unauthorized.send(()) }
            }
            throw ApiError(status: http.statusCode, message: Self.message(from: data, status: http.statusCode))
        }
        return data
    }

    private static func message(from data: Data, status: Int) -> String {
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let list = obj["message"] as? [String], !list.isEmpty { return list.joined(separator: ". ") }
            if let msg = obj["message"] as? String, !msg.isEmpty { return msg }
        }
        switch status {
        case 401: return "Tu sesión terminó. Vuelve a entrar."
        case 403: return "No tienes permiso para esto."
        case 404: return "Ya no existe."
        case 413: return "El archivo es demasiado grande."
        case 429: return "Demasiados intentos. Espera un momento."
        case 500...: return "El servidor tuvo un problema. Intenta de nuevo."
        default: return "Error \(status)"
        }
    }

    func get<T: Decodable>(_ path: String, query: [String: String?] = [:]) async throws -> T {
        let data = try await perform(request("GET", path, query: query))
        return try decoder.decode(T.self, from: data)
    }

    /// Rutas que responden `null`: Nest lo manda como cuerpo vacío.
    func getOptional<T: Decodable>(_ path: String, query: [String: String?] = [:]) async throws -> T? {
        let data = try await perform(request("GET", path, query: query))
        let raw = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty || raw == "null" { return nil }
        return try decoder.decode(T.self, from: data)
    }

    private func sendRaw(_ method: String, _ path: String, body: (any Encodable)?) async throws -> Data {
        var req = request(method, path)
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(body)
        }
        return try await perform(req)
    }

    func send<T: Decodable>(_ method: String, _ path: String, body: (any Encodable)? = nil, as type: T.Type) async throws -> T {
        let data = try await sendRaw(method, path, body: body)
        return try decoder.decode(T.self, from: data)
    }

    /// Para rutas cuya respuesta no se usa (`{ ok: true }`, la entidad, vacía…).
    func send(_ method: String, _ path: String, body: (any Encodable)? = nil) async throws {
        _ = try await sendRaw(method, path, body: body)
    }

    /// `multipart/form-data` con el campo `file`, como `POST chat/upload` en la web.
    func upload(_ path: String, data fileData: Data, filename: String, mime: String) async throws -> UploadResult {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("upload-\(UUID().uuidString)")
        try fileData.write(to: tmp)
        defer { try? FileManager.default.removeItem(at: tmp) }
        return try await uploadFile(path, fileURL: tmp, filename: filename, mime: mime)
    }

    /// Igual, pero leyendo del disco: el archivo nunca se carga entero en memoria.
    /// [progress] 0‥1 desde la cola de URLSession (hay que saltar al hilo principal).
    func uploadFile(
        _ path: String,
        fileURL: URL,
        filename: String,
        mime: String,
        progress: (@Sendable (Double) -> Void)? = nil
    ) async throws -> UploadResult {
        var req = request("POST", path)
        let boundary = "arta-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let body = try Self.multipartFile(for: fileURL, filename: filename, mime: mime, boundary: boundary)
        defer { try? FileManager.default.removeItem(at: body) }
        let delegate = progress.map { UploadProgressDelegate(onProgress: $0) }
        let (data, response) = try await uploadSession.upload(for: req, fromFile: body, delegate: delegate)
        guard let http = response as? HTTPURLResponse else { throw ApiError(status: nil, message: "Respuesta inválida") }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { DispatchQueue.main.async { self.unauthorized.send(()) } }
            throw ApiError(status: http.statusCode, message: Self.message(from: data, status: http.statusCode))
        }
        return try decoder.decode(UploadResult.self, from: data)
    }

    private static func multipartFile(for fileURL: URL, filename: String, mime: String, boundary: String) throws -> URL {
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("multipart-\(UUID().uuidString)")
        FileManager.default.createFile(atPath: out.path, contents: nil)
        let writer = try FileHandle(forWritingTo: out)
        defer { try? writer.close() }
        let safeName = filename.components(separatedBy: CharacterSet(charactersIn: "\"\r\n")).joined()
        let head = "--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\nContent-Type: \(mime)\r\n\r\n"
        try writer.write(contentsOf: Data(head.utf8))
        let reader = try FileHandle(forReadingFrom: fileURL)
        defer { try? reader.close() }
        while let chunk = try reader.read(upToCount: 1 << 20), !chunk.isEmpty {
            try writer.write(contentsOf: chunk)
        }
        try writer.write(contentsOf: Data("\r\n--\(boundary)--\r\n".utf8))
        return out
    }

    /// Baja un adjunto con la cookie de sesión a un archivo temporal (para Vista Rápida).
    func download(_ url: URL, suggestedName: String?) async throws -> URL {
        var req = URLRequest(url: url)
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        let (tmp, response) = try await session.download(for: req)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw ApiError(status: http.statusCode, message: Self.message(from: Data(), status: http.statusCode))
        }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("chat-files", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let name = (suggestedName?.isEmpty == false ? suggestedName! : url.lastPathComponent)
            .replacingOccurrences(of: "/", with: "-")
        let dest = dir.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: dest)
        try FileManager.default.moveItem(at: tmp, to: dest)
        return dest
    }
}

// MARK: - Rutas del API

extension ApiClient {
    func login(_ body: LoginBody) async throws -> LoginResponse { try await send("POST", "auth/login", body: body, as: LoginResponse.self) }
    func verifyLogin(_ body: VerifyLoginBody) async throws -> LoginResponse { try await send("POST", "auth/2fa/verify-login", body: body, as: LoginResponse.self) }
    func logout() async throws { try await send("POST", "auth/logout") }
    func me() async throws -> UserDto {
        let res: MeResponse = try await get("auth/me")
        return res.user
    }

    func channels() async throws -> [ChannelSummary] { try await get("chat/channels") }
    func channel(_ id: String) async throws -> ChannelDetail { try await get("chat/channels/\(id)") }

    func messages(_ channelId: String, before: String? = nil, after: String? = nil, around: String? = nil, limit: Int? = nil) async throws -> MessagePage {
        try await get("chat/channels/\(channelId)/messages", query: [
            "before": before, "after": after, "around": around, "limit": limit.map { String($0) },
        ])
    }

    func post(_ channelId: String, _ body: PostMessageBody) async throws -> ChatMessage {
        try await send("POST", "chat/channels/\(channelId)/messages", body: body, as: ChatMessage.self)
    }

    func thread(_ messageId: String) async throws -> ThreadDto { try await get("chat/messages/\(messageId)/thread") }
    func edit(_ messageId: String, body: String) async throws -> ChatMessage { try await send("PATCH", "chat/messages/\(messageId)", body: EditBody(body: body), as: ChatMessage.self) }
    func deleteMessage(_ messageId: String) async throws { try await send("DELETE", "chat/messages/\(messageId)") }
    func react(_ messageId: String, emoji: String) async throws -> ChatMessage { try await send("POST", "chat/messages/\(messageId)/reactions", body: ReactionBody(emoji: emoji), as: ChatMessage.self) }
    func pin(_ messageId: String) async throws -> ChatMessage { try await send("POST", "chat/messages/\(messageId)/pin", as: ChatMessage.self) }
    func pins(_ channelId: String) async throws -> [ChatMessage] {
        let res: MessageList = try await get("chat/channels/\(channelId)/pins")
        return res.messages
    }
    func markRead(_ channelId: String) async throws { try await send("POST", "chat/channels/\(channelId)/read") }
    func mute(_ channelId: String, muted: Bool, hours: Int?) async throws { try await send("PATCH", "chat/channels/\(channelId)/mute", body: MuteBody(muted: muted, hours: hours)) }
    func openDirect(_ userId: String) async throws -> ChannelDetail { try await send("POST", "chat/dm", body: DirectBody(userId: userId), as: ChannelDetail.self) }
    func search(_ q: String, channelId: String? = nil) async throws -> [ChatMessage] {
        let res: MessageList = try await get("chat/search", query: ["q": q, "channelId": channelId])
        return res.messages
    }
    func colleagues(_ q: String? = nil) async throws -> [Colleague] { try await get("chat/colleagues", query: ["q": q]) }
    func chatUnread() async throws -> Int {
        let res: UnreadTotal = try await get("chat/unread")
        return res.total ?? 0
    }

    // Chat v2 (docs/CHAT-V2-CONTRATO.md).
    func toggleSave(_ messageId: String) async throws -> Bool {
        let res = try await send("POST", "chat/messages/\(messageId)/save", as: SaveToggle.self)
        return res.saved ?? false
    }
    func saved(before: String? = nil, limit: Int = 50) async throws -> [SavedItem] {
        let res: SavedPage = try await get("chat/saved", query: ["before": before, "limit": String(limit)])
        return res.items ?? []
    }
    func groupDm(_ userIds: [String]) async throws -> ChannelDetail { try await send("POST", "chat/group-dm", body: GroupDmBody(userIds: userIds), as: ChannelDetail.self) }
    func createChannel(_ body: CreateChannelBody) async throws -> ChannelDetail { try await send("POST", "chat/channels", body: body, as: ChannelDetail.self) }
    func updateChannel(_ channelId: String, _ body: UpdateChannelBody) async throws -> ChannelDetail { try await send("PATCH", "chat/channels/\(channelId)", body: body, as: ChannelDetail.self) }
    func archiveChannel(_ channelId: String) async throws { try await send("POST", "chat/channels/\(channelId)/archive") }
    func addMembers(_ channelId: String, userIds: [String]) async throws -> ChannelDetail { try await send("POST", "chat/channels/\(channelId)/members", body: MembersBody(userIds: userIds), as: ChannelDetail.self) }
    func removeMember(_ channelId: String, userId: String) async throws { try await send("DELETE", "chat/channels/\(channelId)/members/\(userId)") }
    func leaveChannel(_ channelId: String) async throws { try await send("POST", "chat/channels/\(channelId)/leave") }
    func presence() async throws -> [String] {
        let res: PresenceDto = try await get("chat/presence")
        return res.online ?? []
    }
    func linkPreview(_ url: String) async throws -> LinkPreview? { try await getOptional("chat/link-preview", query: ["url": url]) }
    func chatPrefs() async throws -> ChatPrefs { try await get("chat/prefs") }
    func setDnd(until: String?) async throws { try await send("PATCH", "chat/prefs", body: ChatPrefsBody(dndUntil: until)) }

    func notifications(take: Int = 50) async throws -> [NotificationDto] { try await get("notifications", query: ["take": String(take)]) }
    func notificationsUnread() async throws -> Int {
        let res: UnreadCount = try await get("notifications/unread-count")
        return res.count ?? 0
    }
    func notificationRead(_ id: String) async throws { try await send("PATCH", "notifications/\(id)/read") }
    func notificationsReadAll() async throws { try await send("POST", "notifications/read-all") }

    func registerPush(_ body: RegisterPushBody) async throws { try await send("POST", "devices/push", body: body) }
    func removePush(_ token: String) async throws { try await send("DELETE", "devices/push", body: RemovePushBody(token: token)) }
}

/// Delegado por tarea: solo reporta cuánto del cuerpo ya salió.
private final class UploadProgressDelegate: NSObject, URLSessionTaskDelegate {
    let onProgress: @Sendable (Double) -> Void

    init(onProgress: @escaping @Sendable (Double) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend)))
    }
}
