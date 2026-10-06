#if DEBUG
import Foundation

/// Interceptor HTTP del modo demo (solo Debug). Va primero en las configuraciones
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
        guard method == "GET" || method == "HEAD" else {
            return mutation(path: path)
        }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
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

    private static func json(_ status: Int, _ body: String) -> Reply {
        Reply(status: status, data: Data(body.utf8))
    }
}
#endif
