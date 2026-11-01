import Foundation

/// Interceptor HTTP del modo demo. Va primero en las configuraciones
/// de `ApiClient` (`DemoMode.install(on:)`) y registrado para `URLSession.shared`
/// (`DemoMode.bootstrap()`): con el demo activo NINGUNA petición http(s) de la app
/// sale a la red. Las respuestas las decide `DemoBackend`.
final class DemoURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        guard DemoMode.isActive, let scheme = request.url?.scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let reply = DemoBackend.reply(to: request)
        let url = request.url ?? ApiConfig.baseURL
        let headers = ["Content-Type": "application/json; charset=utf-8"]
        guard let response = HTTPURLResponse(url: url, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: headers) else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotParseResponse))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if !reply.data.isEmpty {
            client?.urlProtocol(self, didLoad: reply.data)
        }
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

/// «Servidor» del demo. Reglas:
///  - GET del API: la fixture de la clave exacta (`DemoFixtures.key`) y, si no hay,
///    la de la ruta sin query (`events?scope=active` → `events`). Sin fixture: 404,
///    que las pantallas ya tratan como «sin datos» o con su vista de error.
///  - POST/PATCH/DELETE: nada se guarda. 200 con lo grabado del recurso o de su
///    padre (`tasks/x/approve` → `tasks/x`) para que los decodificadores lo acepten;
///    si no hay, `{"ok":true}`. «Chat del evento» (`POST chat/event/:id`) devuelve el
///    canal grabado de ese evento.
///  - Lo que no es del API (fotos de `/uploads`, el socket, otros hosts): 404 vacío.
///  - Avisos: los contesta `DemoNotices`, que sí recuerda leídos y preferencias mientras la
///    app sigue abierta (así se prueban los filtros y el horario silencioso).
/// Las fechas de las respuestas se mueven al día de hoy (`DemoClock.shift`).
enum DemoBackend {
    struct Reply {
        let status: Int
        let data: Data
    }

    static func reply(to request: URLRequest) -> Reply {
        guard let url = request.url, let path = apiPath(of: url) else {
            return Reply(status: 404, data: Data())
        }
        let method = (request.httpMethod ?? "GET").uppercased()
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if path.hasPrefix("notifications"),
           let notices = DemoNotices.reply(path: path, method: method, query: items, body: method == "PATCH" ? bodyData(of: request) : nil) {
            return notices
        }
        guard method == "GET" || method == "HEAD" else {
            return mutation(path: path)
        }
        let key = DemoFixtures.key(path: path, queryItems: items)
        if let data = DemoFixtures.data(forKey: key) ?? DemoFixtures.data(forKey: path) {
            return Reply(status: 200, data: DemoClock.shift(data))
        }
        // Reportar y bloquear (docs/chat-reportar-bloquear.md): sin fixture, nadie bloqueado.
        if path == "chat/blocks" {
            return json(200, "[]")
        }
        return json(404, #"{"statusCode":404,"message":"Sin datos de muestra para esta pantalla."}"#)
    }

    /// `https://host/api/chat/channels?x=1` → `chat/channels`. `nil` si no es del API.
    static func apiPath(of url: URL) -> String? {
        let base = ApiConfig.baseURL
        guard let host = url.host?.lowercased(), host == base.host?.lowercased() else { return nil }
        var prefix = base.path
        if !prefix.hasSuffix("/") { prefix += "/" }
        let full = url.path
        guard full.hasPrefix(prefix) else { return nil }
        let relative = String(full.dropFirst(prefix.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return relative.isEmpty ? nil : relative
    }

    private static func mutation(path: String) -> Reply {
        let parts = path.split(separator: "/").map(String.init)
        // Reportar un mensaje y bloquear/desbloquear: nada que grabar, solo `ok`.
        if parts.count == 4, parts[0] == "chat",
           (parts[1] == "messages" && parts[3] == "report") || (parts[1] == "users" && parts[3] == "block") {
            return json(200, #"{"ok":true}"#)
        }
        if parts.count == 3, parts[0] == "chat", parts[1] == "event", let channelId = eventChannelId(parts[2]) {
            return json(200, "{\"id\":\"\(channelId)\"}")
        }
        if let data = DemoFixtures.data(forKey: path) {
            return Reply(status: 200, data: DemoClock.shift(data))
        }
        if parts.count > 1, let data = DemoFixtures.data(forKey: parts.dropLast().joined(separator: "/")) {
            return Reply(status: 200, data: DemoClock.shift(data))
        }
        return json(200, #"{"ok":true}"#)
    }

    /// Id del canal de chat grabado cuyo `eventId` es ese evento.
    private static func eventChannelId(_ eventId: String) -> String? {
        guard let data = DemoFixtures.data(forKey: "chat/channels") else { return nil }
        let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
        let match = list.first(where: { ($0["eventId"] as? String) == eventId })
        return match?["id"] as? String
    }

    fileprivate static func json(_ status: Int, _ body: String) -> Reply {
        Reply(status: status, data: Data(body.utf8))
    }

    /// Dentro de un `URLProtocol` el cuerpo suele llegar como flujo, no en `httpBody`.
    private static func bodyData(of request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var out = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            out.append(buffer, count: count)
        }
        return out
    }
}

/// Avisos del modo de muestra. La lista sale de la fixture de siempre; lo leído y las preferencias
/// se guardan solo en memoria mientras la app sigue abierta. `URLProtocol` corre en los hilos de
/// URLSession: todo el estado va con candado.
private enum DemoNotices {
    private static let lock = NSLock()
    private static var readIds = Set<String>()
    /// Entidades a las que ya se les hizo «Leer todo» (`""` = sin `entity`, todas).
    private static var readAllEntities = Set<String>()
    private static var prefs: Data?

    private static let defaultPrefs = #"{"muted":[],"quietHours":{"enabled":false,"start":"22:00","end":"07:00"}}"#

    /// Las mismas personas de `chat/colleagues`.
    private static let lucia = (id: "c56ea4d06e6e4b57237532cd4", name: "Lucía Méndez Arriaga")
    private static let mateo = (id: "c7c0ae50aaa46fda9060d0947", name: "Mateo Ríos Calderón")
    private static let valeria = (id: "ce08d1dd4a18c703877519be3", name: "Valeria Ortega Luna")
    /// Base de las fechas de muestra: fija, así «hace 5 min» avanza como en cualquier aviso.
    private static let sampleNow = Date()

    /// `nil`: no es de avisos, sigue la lógica general.
    static func reply(path: String, method: String, query: [URLQueryItem], body: Data?) -> DemoBackend.Reply? {
        let entity = query.first(where: { $0.name == "entity" })?.value ?? ""
        switch (method, path) {
        case ("GET", "notifications/preferences"):
            return savedPrefs()
        case ("PATCH", "notifications/preferences"):
            return savePrefs(body)
        case ("GET", "notifications"):
            // La fixture cabe entera en la primera página: `before` ya no trae nada más.
            if query.contains(where: { $0.name == "before" }) { return DemoBackend.json(200, "[]") }
            let unreadOnly = query.first(where: { $0.name == "unread" })?.value == "1"
            let rows = notices(entity: entity).filter { !unreadOnly || !isRead($0) }
            return encode(rows)
        case ("GET", "notifications/unread-count"):
            let count = notices(entity: entity).filter { !isRead($0) }.count
            return DemoBackend.json(200, "{\"count\":\(count)}")
        case ("POST", "notifications/read-all"):
            lock.lock()
            readAllEntities.insert(entity)
            lock.unlock()
            return DemoBackend.json(200, #"{"ok":true}"#)
        case ("GET", "notifications/sent"):
            return encode(sentRows(entity: entity))
        case ("POST", "notifications/seen"):
            // La app no lo manda en el demo; si llegara, no se marca nada.
            return DemoBackend.json(200, #"{"seen":0}"#)
        default:
            break
        }
        let parts = path.split(separator: "/").map(String.init)
        if method == "PATCH", parts.count == 3, parts[0] == "notifications", parts[2] == "read" {
            lock.lock()
            readIds.insert(parts[1])
            lock.unlock()
            return DemoBackend.json(200, #"{"ok":true}"#)
        }
        return nil
    }

    private static func savedPrefs() -> DemoBackend.Reply {
        lock.lock()
        let saved = prefs
        lock.unlock()
        return saved.map { DemoBackend.Reply(status: 200, data: $0) } ?? DemoBackend.json(200, defaultPrefs)
    }

    private static func savePrefs(_ body: Data?) -> DemoBackend.Reply {
        guard let body, !body.isEmpty else { return savedPrefs() }
        lock.lock()
        prefs = body
        lock.unlock()
        return DemoBackend.Reply(status: 200, data: body)
    }

    /// Filas de la fixture con fechas al día, de esa entidad y con `readAt` si ya se leyeron aquí.
    private static func notices(entity: String) -> [[String: Any]] {
        guard let raw = DemoFixtures.data(forKey: "notifications") else { return [] }
        let recorded = (try? JSONSerialization.jsonObject(with: DemoClock.shift(raw))) as? [[String: Any]] ?? []
        let list = recorded + [seenReceipt()]
        lock.lock()
        let ids = readIds
        let allRead = readAllEntities
        lock.unlock()
        let stamp = ISO8601DateFormatter().string(from: Date())
        return list.compactMap { (row: [String: Any]) -> [String: Any]? in
            let rowEntity = row["entity"] as? String
            if !entity.isEmpty, let rowEntity, rowEntity != entity { return nil }
            guard !isRead(row) else { return row }
            let rowId = (row["id"] as? String) ?? ""
            let readHere = ids.contains(rowId)
                || allRead.contains("")
                || (rowEntity == nil && !allRead.isEmpty)
                || (rowEntity.map { allRead.contains($0) } ?? false)
            guard readHere else { return row }
            var copy = row
            copy["readAt"] = stamp
            return copy
        }
    }

    private static func isRead(_ row: [String: Any]) -> Bool {
        row["readAt"] is String
    }

    // MARK: Acuse de visto (sin fixture: va aquí con fechas relativas a hoy)

    /// El acuse de lo que Lucía vio en `sentRows`: enseña el ojo y su liga a «Enviados».
    private static func seenReceipt() -> [String: Any] {
        [
            "id": "demo-notice-seen",
            "type": "notice.seen",
            "title": "Lucía M. ya vio 2 de tus avisos",
            "body": "Demo R. te mencionó en Trío Luna de Plata · Noche de Boleros · Demo R. te mencionó en: Enviar el plano de escenario al recinto",
            "linkUrl": "/notifications?tab=enviados",
            "entity": "ARTA",
            "createdAt": minutesAgo(12),
            "actor": ["id": lucia.id, "fullName": lucia.name],
        ]
    }

    /// `GET notifications/sent`, de lo más nuevo a lo más viejo y con un ejemplo de cada estado de la
    /// píldora. Títulos como los arma el API; ligas a tareas y canales que sí existen en el demo.
    private static func sentRows(entity: String) -> [[String: Any]] {
        // El canal «general» no es de ninguna entidad: sale en las dos.
        var rows = [
            sentRow("chat.mention", "Demo R. te mencionó en general", "/chat?channel=c7f77b485b329c6ecd8b7dfba", minutes: 8, [
                person(mateo), person(valeria),
            ]),
        ]
        if entity.isEmpty || entity == "ARTA" {
            rows += [
                sentRow(
                    "task.comment",
                    "Demo R. comentó: Confirmar el rider técnico con el Trío Luna de Plata",
                    "/events/cbf9b2784b0797342c1629b09?tab=tasks&task=cda29bbe09655a95f799bee13",
                    minutes: 20,
                    [person(lucia)]
                ),
                sentRow(
                    "chat.mention",
                    "Demo R. te mencionó en Trío Luna de Plata · Noche de Boleros",
                    "/chat?channel=c65090e75d0dc02ce58fd8254",
                    minutes: 55,
                    [person(lucia, seen: 12), person(mateo, read: 40), person(valeria)]
                ),
                sentRow(
                    "task.mention",
                    "Demo R. te mencionó en: Enviar el plano de escenario al recinto",
                    "/events/cbf9b2784b0797342c1629b09?tab=tasks&task=c3b2a1069f3d808b124c49e08",
                    minutes: 180,
                    [person(lucia, seen: 12), person(mateo, seen: 130)]
                ),
                sentRow(
                    "task.assigned",
                    "Demo R. te asignó: Reservar hospedaje para el trío",
                    "/events/cbf9b2784b0797342c1629b09?tab=tasks&task=c40c99ec13d86f7ea7b453962",
                    minutes: 2880,
                    [person(mateo, seen: 2860)]
                ),
            ]
        }
        if entity.isEmpty || entity == "EXPLANADA" {
            rows.append(sentRow(
                "task.assigned",
                "Demo R. te asignó: Cerrar la lista de medios para la rueda de prensa",
                "/events/c159b2f535555db3effcb05ba?tab=tasks&task=ced2acc3fbe422e89ea322ed0",
                minutes: 4320,
                [person(mateo, seen: 4300)]
            ))
        }
        return rows
    }

    private static func sentRow(_ type: String, _ title: String, _ link: String, minutes: Int, _ recipients: [[String: Any]]) -> [String: Any] {
        [
            "key": "\(type)|\(link)|\(title)",
            "type": type,
            "title": title,
            "linkUrl": link,
            "createdAt": minutesAgo(minutes),
            "recipients": recipients,
        ]
    }

    private static func person(_ who: (id: String, name: String), seen: Int? = nil, read: Int? = nil) -> [String: Any] {
        ["id": who.id, "fullName": who.name, "seenAt": optionalStamp(seen), "readAt": optionalStamp(read)]
    }

    private static func optionalStamp(_ minutes: Int?) -> Any {
        guard let minutes else { return NSNull() }
        return minutesAgo(minutes)
    }

    private static func minutesAgo(_ minutes: Int) -> String {
        ISO8601DateFormatter().string(from: sampleNow.addingTimeInterval(TimeInterval(-60 * minutes)))
    }

    private static func encode(_ rows: [[String: Any]]) -> DemoBackend.Reply {
        guard let data = try? JSONSerialization.data(withJSONObject: rows) else {
            return DemoBackend.json(200, "[]")
        }
        return DemoBackend.Reply(status: 200, data: data)
    }
}
