import Combine
import Foundation
import SocketIO

struct TypingEvent {
    let channelId: String
    let userId: String
    let fullName: String
}

struct ReadEvent {
    let channelId: String
    let userId: String
    let at: String
}

struct DeletedEvent {
    let channelId: String
    let messageId: String
    let parentId: String?
}

struct ActivityEvent {
    let channelId: String
    let messageId: String
    let parentId: String?
    let senderId: String
}

/// Socket.IO del API con la misma sesión que HTTP: el handshake manda la cookie
/// `arta_access` (el gateway la valida contra `UserSession`). Detrás de Traefik
/// el path es `/api/socket.io`. Los eventos llegan en el hilo principal.
final class RealtimeClient {
    static let shared = RealtimeClient()

    /// Mensajes nuevos, raíz o respuesta de hilo (ver `parentId`).
    let messages = PassthroughSubject<ChatMessage, Never>()
    let updated = PassthroughSubject<ChatMessage, Never>()
    let deleted = PassthroughSubject<DeletedEvent, Never>()
    let typing = PassthroughSubject<TypingEvent, Never>()
    let reads = PassthroughSubject<ReadEvent, Never>()
    /// Algo pasó en una de mis conversaciones: la lista de chats se reordena.
    let activity = PassthroughSubject<ActivityEvent, Never>()
    /// Cambió un canal (tema, miembros, archivado, leído): recargar lista o detalle.
    let channelsChanged = PassthroughSubject<String, Never>()
    let chatUnread = PassthroughSubject<Int, Never>()
    let notificationsUnread = PassthroughSubject<Int, Never>()
    let connected = CurrentValueSubject<Bool, Never>(false)

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var joined: [String: Int] = [:]
    private let decoder = JSONDecoder()

    private init() {}

    private static func object(_ data: [Any]) -> [String: Any]? { data.first as? [String: Any] }

    private static func string(_ obj: [String: Any], _ key: String) -> String? {
        if let s = obj[key] as? String, !s.isEmpty { return s }
        if let n = obj[key] as? NSNumber { return n.stringValue }
        return nil
    }

    private func message(_ data: [Any]) -> ChatMessage? {
        guard let obj = Self.object(data),
              let json = try? JSONSerialization.data(withJSONObject: obj) else { return nil }
        return try? decoder.decode(ChatMessage.self, from: json)
    }

    func connect() {
        if let socket, socket.status == .connected || socket.status == .connecting { return }
        teardown()
        let cookie = ApiClient.shared.cookieHeader()
        guard !cookie.isEmpty else { return }
        let manager = SocketManager(socketURL: ApiConfig.origin, config: [
            .log(false),
            .path("/api/socket.io/"),
            .forceWebsockets(true),
            .compress,
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(15),
            .extraHeaders(["Cookie": cookie]),
        ])
        let s = manager.defaultSocket

        s.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            self.connected.send(true)
            // Reconexión: el servidor olvidó las salas, se vuelven a pedir.
            for id in self.joined.keys { s.emit("chat:join", ["channelId": id]) }
            s.emit("chat:presence", ["status": "online"])
        }
        s.on(clientEvent: .disconnect) { [weak self] _, _ in self?.connected.send(false) }
        s.on(clientEvent: .error) { [weak self] _, _ in self?.connected.send(false) }

        s.on("chat:message") { [weak self] data, _ in
            if let m = self?.message(data) { self?.messages.send(m) }
        }
        s.on("chat:thread-reply") { [weak self] data, _ in
            if let m = self?.message(data) { self?.messages.send(m) }
        }
        s.on("chat:message-updated") { [weak self] data, _ in
            if let m = self?.message(data) { self?.updated.send(m) }
        }
        s.on("chat:message-deleted") { [weak self] data, _ in
            guard let o = Self.object(data), let channel = Self.string(o, "channelId"), let id = Self.string(o, "messageId") else { return }
            self?.deleted.send(DeletedEvent(channelId: channel, messageId: id, parentId: Self.string(o, "parentId")))
        }
        s.on("chat:typing") { [weak self] data, _ in
            guard let o = Self.object(data), let channel = Self.string(o, "channelId"), let user = Self.string(o, "userId") else { return }
            self?.typing.send(TypingEvent(channelId: channel, userId: user, fullName: Self.string(o, "fullName") ?? "Alguien"))
        }
        s.on("chat:read") { [weak self] data, _ in
            guard let o = Self.object(data), let channel = Self.string(o, "channelId") else { return }
            if let user = Self.string(o, "userId"), let at = Self.string(o, "at") {
                self?.reads.send(ReadEvent(channelId: channel, userId: user, at: at))
            }
            self?.channelsChanged.send(channel)
        }
        s.on("chat:channel-activity") { [weak self] data, _ in
            guard let o = Self.object(data), let channel = Self.string(o, "channelId") else { return }
            self?.activity.send(ActivityEvent(
                channelId: channel,
                messageId: Self.string(o, "messageId") ?? "",
                parentId: Self.string(o, "parentId"),
                senderId: Self.string(o, "senderId") ?? ""
            ))
        }
        for name in ["chat:channel-updated", "chat:members-changed"] {
            s.on(name) { [weak self] data, _ in
                if let o = Self.object(data), let channel = Self.string(o, "channelId") { self?.channelsChanged.send(channel) }
            }
        }
        s.on("chat:unread") { [weak self] data, _ in
            if let o = Self.object(data) { self?.chatUnread.send((o["total"] as? NSNumber)?.intValue ?? 0) }
        }
        s.on("notification:new") { [weak self] data, _ in
            if let o = Self.object(data) { self?.notificationsUnread.send((o["unread"] as? NSNumber)?.intValue ?? 0) }
        }

        self.manager = manager
        socket = s
        s.connect()
    }

    /// Cierre de sesión: olvida también las salas.
    func disconnect() {
        teardown()
        joined.removeAll()
    }

    /// App en segundo plano: se cierra el socket pero se recuerdan las salas
    /// para volver a unirse al regresar.
    func pause() { teardown() }

    private func teardown() {
        guard let s = socket else { return }
        if s.status == .connected { s.emit("chat:presence", ["status": "away"]) }
        s.removeAllHandlers()
        s.disconnect()
        manager?.disconnect()
        socket = nil
        manager = nil
        connected.send(false)
    }

    /// Las salas se cuentan: un canal y su hilo abiertos a la vez comparten sala.
    func join(_ channelId: String) {
        guard !channelId.isEmpty else { return }
        joined[channelId, default: 0] += 1
        if joined[channelId] == 1, socket?.status == .connected {
            socket?.emit("chat:join", ["channelId": channelId])
        }
    }

    func leave(_ channelId: String) {
        guard let n = joined[channelId] else { return }
        if n > 1 {
            joined[channelId] = n - 1
            return
        }
        joined[channelId] = nil
        if socket?.status == .connected { socket?.emit("chat:leave", ["channelId": channelId]) }
    }

    func sendTyping(_ channelId: String) {
        if socket?.status == .connected { socket?.emit("chat:typing", ["channelId": channelId]) }
    }
}
