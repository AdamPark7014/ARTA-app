import Foundation
import UIKit
import UserNotifications
#if canImport(FirebaseCore) && canImport(FirebaseMessaging)
import FirebaseCore
import FirebaseMessaging
#endif

/// Avisos push estilo WhatsApp.
///
/// El API manda con firebase-admin (FCM), que no acepta tokens APNs crudos: el
/// token que se registra en `POST devices/push` es el de FCM. Sin
/// `GoogleService-Info.plist` la app funciona pero no recibe push.
///
/// - Chat (`kind=chat`, categoría `ARTA_CHAT`): se apila por conversación
///   (`thread-id` = `chat-<canal>`), trae «Responder» y «Marcar como leído», y no
///   suena si esa conversación está abierta en pantalla. La extensión
///   `NotificationService` le pone la cara (iniciales) de quien escribe.
/// - Procesos (`ARTA_EVENT`): OC, formatos, tareas… con «Marcar como leído». El
///   servidor elige la categoría por `kind` y apila por entidad (`thread-id` = `tag`
///   o `link:<ruta>`); `channel` (tasks, approvals, finance, events, documents,
///   general) solo ordena los canales de Android.
/// - Tocar un aviso abre su pantalla nativa (`PanelLink`, contrato §4): con
///   `channel_id` la conversación; si no, según `url` y `type`. Nunca se aprueba
///   desde la notificación.
/// - Silenciosos (`silent=1`: `chat.read`, `notification.read`): quitan los avisos
///   de lo que ya se leyó en otro dispositivo y ajustan el globo del ícono.
final class PushManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushManager()

    static let chatCategory = "ARTA_CHAT"
    static let eventCategory = "ARTA_EVENT"
    static let replyAction = "ARTA_REPLY"
    static let markReadAction = "ARTA_MARK_READ"

    private static let tokenKey = "arta.push.fcmToken"

    /// `true` cuando Firebase quedó configurado en este arranque.
    private(set) var firebaseEnabled = false

    func configure() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories(Self.categories())
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            if FirebaseApp.app() == nil { FirebaseApp.configure() }
            Messaging.messaging().delegate = self
            firebaseEnabled = true
        }
        #endif
    }

    private static func categories() -> Set<UNNotificationCategory> {
        let reply = UNTextInputNotificationAction(
            identifier: replyAction,
            title: "Responder",
            options: [.authenticationRequired],
            icon: UNNotificationActionIcon(systemImageName: "arrowshape.turn.up.left"),
            textInputButtonTitle: "Enviar",
            textInputPlaceholder: "Mensaje"
        )
        let read = UNNotificationAction(
            identifier: markReadAction,
            title: "Marcar como leído",
            options: [],
            icon: UNNotificationActionIcon(systemImageName: "checkmark.message")
        )
        let chat = UNNotificationCategory(
            identifier: chatCategory,
            actions: [reply, read],
            intentIdentifiers: ["INSendMessageIntent"],
            hiddenPreviewsBodyPlaceholder: "Mensaje nuevo",
            categorySummaryFormat: "%u mensajes más",
            options: [.hiddenPreviewsShowTitle]
        )
        let event = UNNotificationCategory(
            identifier: eventCategory,
            actions: [read],
            intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: "Aviso nuevo de ARTA",
            categorySummaryFormat: "%u avisos más",
            options: []
        )
        return [chat, event]
    }

    // MARK: Permiso y token

    /// Tras iniciar sesión: pide permiso si aún no se decidió y registra el token vigente.
    func requestPermissionAndRegister() async {
        #if DEBUG
        // Modo demo: ni diálogo de permiso (bloquearía las pruebas de interfaz) ni registro.
        if DemoMode.isActive { return }
        #endif
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
        // Se registra aunque la persona haya negado los avisos: si luego los
        // activa en Ajustes, el servidor ya tiene a dónde mandarlos.
        await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
        await registerCurrentToken()
    }

    /// Token APNs del sistema; Firebase lo cambia por el de FCM.
    func didRegister(deviceToken: Data) {
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        if firebaseEnabled {
            Messaging.messaging().apnsToken = deviceToken
            Task { await registerCurrentToken() }
        }
        #endif
    }

    private func registerCurrentToken() async {
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        guard firebaseEnabled, ApiClient.shared.hasSession() else { return }
        // Sin token APNs todavía, `token()` falla; llegará por el delegado.
        guard Messaging.messaging().apnsToken != nil, let token = try? await Messaging.messaging().token() else { return }
        await send(token: token)
        #endif
    }

    fileprivate func send(token: String) async {
        #if DEBUG
        if DemoMode.isActive { return }
        #endif
        guard !token.isEmpty, ApiClient.shared.hasSession() else { return }
        let body = RegisterPushBody(
            token: token,
            deviceName: await MainActor.run { UIDevice.current.name },
            appVersion: ApiConfig.appVersion
        )
        do {
            try await ApiClient.shared.registerPush(body)
            UserDefaults.standard.set(token, forKey: Self.tokenKey)
        } catch {
            print("PushManager: no se registró el token - \(error.userMessage)")
        }
    }

    /// Al cerrar sesión: baja del token para que los avisos de esta cuenta no le
    /// lleguen a quien use el teléfono después, y token nuevo para la siguiente.
    func unregister() async {
        guard let token = UserDefaults.standard.string(forKey: Self.tokenKey) else { return }
        try? await ApiClient.shared.removePush(token)
        UserDefaults.standard.removeObject(forKey: Self.tokenKey)
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        if firebaseEnabled { try? await Messaging.messaging().deleteToken() }
        #endif
    }

    // MARK: Bandeja

    func clearDelivered() {
        let center = UNUserNotificationCenter.current()
        center.removeAllDeliveredNotifications()
        center.setBadgeCount(0)
    }

    /// Quita de la bandeja los avisos de una conversación (`chat-<canal>`).
    static func removeDelivered(threadId: String) {
        guard !threadId.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { list in
            let ids = list
                .filter { $0.request.content.threadIdentifier == threadId || text($0.request.content.userInfo, "thread_id") == threadId }
                .map(\.request.identifier)
            if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        }
    }

    static func removeDelivered(chatChannelId: String) {
        removeDelivered(threadId: "chat-\(chatChannelId)")
    }

    /// Quita avisos de procesos ya leídos: uno (`notification_id`) o todos si es `nil`.
    static func removeDeliveredNotices(notificationId: String?) {
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { list in
            let ids = list
                .filter { item in
                    let info = item.request.content.userInfo
                    guard text(info, "kind") != "chat" else { return false }
                    guard let notificationId else { return true }
                    return text(info, "notification_id") == notificationId
                }
                .map(\.request.identifier)
            if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        }
    }

    func setBadge(_ count: Int) {
        UNUserNotificationCenter.current().setBadgeCount(max(0, count))
    }

    /// Push silencioso (`content-available`): `chat.read` o `notification.read` desde otro dispositivo.
    func handleSilent(_ userInfo: [AnyHashable: Any]) {
        switch Self.text(userInfo, "type") {
        case "chat.read":
            if let thread = Self.text(userInfo, "thread_id") { Self.removeDelivered(threadId: thread) }
        case "notification.read":
            Self.removeDeliveredNotices(notificationId: Self.text(userInfo, "notification_id"))
        default:
            break
        }
        if let badge = Self.text(userInfo, "badge").flatMap({ Int($0) }) { setBadge(badge) }
    }

    // MARK: UNUserNotificationCenterDelegate

    /// Con la app abierta: banner + bandeja + sonido, como WhatsApp. Única
    /// excepción: un mensaje de la conversación que está abierta en pantalla.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let info = notification.request.content.userInfo
        if Self.text(info, "silent") == "1" {
            handleSilent(info)
            completionHandler([])
            return
        }
        // Mensajes y menciones traen `channel_id` (las menciones con kind=event).
        if let channel = Self.text(info, "channel_id"),
           ActiveConversation.shared.isOpen(channel) {
            completionHandler([])
            return
        }
        completionHandler([.banner, .list, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let content = response.notification.request.content
        let info = content.userInfo
        let channelId = Self.text(info, "channel_id")
        let notificationId = Self.text(info, "notification_id")
        let threadId = Self.text(info, "thread_id") ?? content.threadIdentifier

        switch response.actionIdentifier {
        case Self.replyAction:
            let text = (response as? UNTextInputNotificationResponse)?.userText.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard let channelId, !text.isEmpty else { completionHandler(); return }
            Task {
                await Self.reply(channelId: channelId, text: text, threadId: threadId)
                completionHandler()
            }

        case Self.markReadAction:
            Task {
                if let channelId {
                    Self.removeDelivered(threadId: threadId)
                    try? await ApiClient.shared.markRead(channelId)
                }
                if let notificationId { try? await ApiClient.shared.notificationRead(notificationId) }
                completionHandler()
            }

        case UNNotificationDismissActionIdentifier:
            completionHandler()

        default:
            if let notificationId { Task { try? await ApiClient.shared.notificationRead(notificationId) } }
            let target = PanelLink.target(
                channelId: channelId,
                messageId: Self.text(info, "message_id"),
                url: Self.text(info, "url"),
                type: Self.text(info, "type")
            )
            Task { @MainActor in
                if let target {
                    AppRouter.shared.follow(target, fromLink: true)
                } else {
                    AppRouter.shared.select(.avisos)
                }
                completionHandler()
            }
        }
    }

    /// «Responder» desde la notificación, sin abrir la app.
    private static func reply(channelId: String, text: String, threadId: String) async {
        do {
            _ = try await ApiClient.shared.post(channelId, PostMessageBody(body: text, clientId: "n-\(UUID().uuidString)"))
            try? await ApiClient.shared.markRead(channelId)
            removeDelivered(threadId: threadId)
        } catch {
            let content = UNMutableNotificationContent()
            content.title = "No se envió tu respuesta"
            content.body = text
            content.threadIdentifier = threadId
            content.categoryIdentifier = chatCategory
            content.userInfo = ["kind": "chat", "channel_id": channelId, "thread_id": threadId]
            content.sound = nil
            let request = UNNotificationRequest(identifier: "reply-failed-\(channelId)", content: content, trigger: nil)
            try? await UNUserNotificationCenter.current().add(request)
        }
    }

    static func text(_ info: [AnyHashable: Any], _ key: String) -> String? {
        let value = info[AnyHashable(key)]
        if let s = value as? String {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        if let n = value as? NSNumber { return n.stringValue }
        return nil
    }
}

#if canImport(FirebaseCore) && canImport(FirebaseMessaging)
extension PushManager: MessagingDelegate {
    /// Llega al arrancar y cada vez que FCM rota el token.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken, !fcmToken.isEmpty else { return }
        Task { await self.send(token: fcmToken) }
    }
}
#endif

/// Conversaciones de chat en pantalla (el canal y su hilo pueden coincidir al
/// navegar, por eso se cuentan). Con candado porque `willPresent` puede llegar
/// desde cualquier hilo.
final class ActiveConversation: @unchecked Sendable {
    static let shared = ActiveConversation()

    private let lock = NSLock()
    private var counts: [String: Int] = [:]

    private init() {}

    func open(_ id: String) {
        lock.lock()
        counts[id, default: 0] += 1
        lock.unlock()
        PushManager.removeDelivered(chatChannelId: id)
    }

    func close(_ id: String) {
        lock.lock()
        defer { lock.unlock() }
        guard let n = counts[id] else { return }
        counts[id] = n > 1 ? n - 1 : nil
    }

    func isOpen(_ id: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return (counts[id] ?? 0) > 0
    }
}
