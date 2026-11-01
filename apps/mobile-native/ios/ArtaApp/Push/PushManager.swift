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
///   general) solo ordena los canales de Android. Ráfagas de avisos iguales actualizan
///   la misma tarjeta (`apns-collapse-id`).
/// - Lo que no espera a nadie (`passive=1`, `interruption-level: passive`) entra a la
///   bandeja sin sonar ni encender la pantalla, también con la app abierta.
/// - Tocar un aviso abre su pantalla nativa (`PanelLink`, contrato §4) en la entidad
///   del aviso (`entity`) y lo marca leído: con `channel_id` la conversación; si no,
///   según `url` y `type`.
/// - Los botones van por caso (docs/AVISOS.md § Casos): `ARTA_TASK` entrega con una nota
///   escrita ahí mismo, `ARTA_TASK_REVIEW` aprueba la entrega de una tarea con un toque y
///   `ARTA_APPROVAL` solo abre la pantalla: el dinero y las firmas nunca se aprueban desde el
///   aviso. Actúan sobre `target_kind` y `target_id`; si la llamada falla, una notificación
///   local invita a abrir la tarea.
/// - Silenciosos (`silent=1`: `chat.read`, `notification.read`): quitan los avisos
///   de lo que ya se leyó en otro dispositivo y ajustan el globo del ícono.
/// - El resumen de grupo en español va en `categorySummaryFormat`; `summaryArgument`
///   no se usa porque iOS lo ignora desde la versión 15.
final class PushManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushManager()

    static let chatCategory = "ARTA_CHAT"
    static let eventCategory = "ARTA_EVENT"
    static let taskCategory = "ARTA_TASK"
    static let taskReviewCategory = "ARTA_TASK_REVIEW"
    static let approvalCategory = "ARTA_APPROVAL"
    static let replyAction = "ARTA_REPLY"
    static let markReadAction = "ARTA_MARK_READ"
    static let deliverAction = "ARTA_TASK_DELIVER"
    static let approveAction = "ARTA_TASK_APPROVE"
    /// «Abrir» y «Revisar» llevan a donde lleva tocar el aviso: no hay nada que hacer en segundo plano.
    static let openAction = "ARTA_OPEN"
    static let reviewAction = "ARTA_REVIEW"

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
        let readNotice = UNNotificationAction(
            identifier: markReadAction,
            title: "Marcar como leído",
            options: [],
            icon: UNNotificationActionIcon(systemImageName: "checkmark.circle")
        )
        // Con las vistas previas ocultas se sigue viendo de qué entidad es (Arta o Auditorio).
        let chat = UNNotificationCategory(
            identifier: chatCategory,
            actions: [reply, read],
            intentIdentifiers: ["INSendMessageIntent"],
            hiddenPreviewsBodyPlaceholder: "Mensaje nuevo",
            categorySummaryFormat: "%u mensajes más",
            options: [.hiddenPreviewsShowTitle, .hiddenPreviewsShowSubtitle]
        )
        let event = UNNotificationCategory(
            identifier: eventCategory,
            actions: [readNotice],
            intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: "Aviso nuevo de ARTA",
            categorySummaryFormat: "%u avisos más",
            options: [.hiddenPreviewsShowSubtitle]
        )
        // Quien pidió autenticarse ya desbloqueó el teléfono: la sesión del contenedor se puede leer.
        let deliver = UNTextInputNotificationAction(
            identifier: deliverAction,
            title: "Entregar",
            options: [.authenticationRequired],
            icon: UNNotificationActionIcon(systemImageName: "tray.and.arrow.up"),
            textInputButtonTitle: "Enviar",
            textInputPlaceholder: "¿Qué hiciste?"
        )
        let approve = UNNotificationAction(
            identifier: approveAction,
            title: "Aprobar",
            options: [.authenticationRequired],
            icon: UNNotificationActionIcon(systemImageName: "checkmark.seal")
        )
        let open = UNNotificationAction(
            identifier: openAction,
            title: "Abrir",
            options: [.foreground],
            icon: UNNotificationActionIcon(systemImageName: "arrow.up.forward.app")
        )
        let review = UNNotificationAction(
            identifier: reviewAction,
            title: "Revisar",
            options: [.foreground],
            icon: UNNotificationActionIcon(systemImageName: "eye")
        )
        func noticeCategory(_ identifier: String, _ actions: [UNNotificationAction]) -> UNNotificationCategory {
            UNNotificationCategory(
                identifier: identifier,
                actions: actions,
                intentIdentifiers: [],
                hiddenPreviewsBodyPlaceholder: "Aviso nuevo de ARTA",
                categorySummaryFormat: "%u avisos más",
                options: [.hiddenPreviewsShowSubtitle]
            )
        }
        return [
            chat,
            event,
            noticeCategory(taskCategory, [deliver, open]),
            noticeCategory(taskReviewCategory, [approve, open]),
            noticeCategory(approvalCategory, [review]),
        ]
    }

    // MARK: Permiso y token

    /// Tras iniciar sesión: pide permiso si aún no se decidió y registra el token vigente.
    func requestPermissionAndRegister() async {
        // Modo demo: ni diálogo de permiso (bloquearía las pruebas de interfaz) ni registro.
        if DemoMode.isActive { return }
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
        if DemoMode.isActive { return }
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

    /// Con la app abierta: banner + bandeja + sonido, como WhatsApp. Excepciones: un
    /// mensaje de la conversación que está abierta en pantalla no se muestra, y lo
    /// pasivo entra a la bandeja callado, igual que con la app cerrada.
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
        if Self.text(info, "passive") == "1" || notification.request.content.interruptionLevel == .passive {
            completionHandler([.list, .badge])
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

        case Self.deliverAction:
            let note = (response as? UNTextInputNotificationResponse)?.userText.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !note.isEmpty else { completionHandler(); return }
            let action = TaskPushAction(info: info, threadId: threadId, failedTitle: "No se pudo entregar la tarea", note: note)
            Task {
                await Self.run(action) { taskId in
                    _ = try await ApiClient.shared.submitTask(taskId, note: note)
                }
                completionHandler()
            }

        case Self.approveAction:
            let action = TaskPushAction(info: info, threadId: threadId, failedTitle: "No se pudo aprobar la entrega", note: nil)
            Task {
                await Self.run(action) { taskId in
                    _ = try await ApiClient.shared.approveTask(taskId)
                }
                completionHandler()
            }

        case UNNotificationDismissActionIdentifier:
            completionHandler()

        // Tocar el aviso, «Abrir» y «Revisar»: su pantalla.
        default:
            if let notificationId { Task { try? await ApiClient.shared.notificationRead(notificationId) } }
            let target = PanelLink.target(
                channelId: channelId,
                messageId: Self.text(info, "message_id"),
                url: Self.text(info, "url"),
                type: Self.text(info, "type")
            )
            let entity = Self.text(info, "entity").flatMap(ArtaEntity.init(rawValue:))
            Task { @MainActor in
                // Antes de navegar: cambiar de entidad limpia las pilas abiertas.
                if let entity { ActiveEntity.shared.focus(on: entity) }
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

    /// «Entregar» o «Aprobar» sin abrir la app. Al salir marca leído el aviso, como «Responder».
    private static func run(_ action: TaskPushAction, _ call: (String) async throws -> Void) async {
        guard let taskId = action.taskId else {
            await taskActionFailed(action)
            return
        }
        do {
            try await call(taskId)
            if let notificationId = action.notificationId {
                try? await ApiClient.shared.notificationRead(notificationId)
                removeDeliveredNotices(notificationId: notificationId)
            }
        } catch {
            await taskActionFailed(action)
        }
    }

    /// Tocarla abre la tarea. Lo que se escribió se conserva a la vista para no perderlo.
    private static func taskActionFailed(_ action: TaskPushAction) async {
        let content = UNMutableNotificationContent()
        content.title = action.failedTitle
        if let note = action.note {
            content.body = "Abre la tarea para intentarlo de nuevo. Tu nota: \(note)"
        } else {
            content.body = "Abre la tarea para intentarlo de nuevo."
        }
        content.threadIdentifier = action.threadId
        var info: [AnyHashable: Any] = ["kind": "event"]
        if let url = action.openURL { info["url"] = url }
        if let entity = action.entity { info["entity"] = entity }
        content.userInfo = info
        content.sound = nil
        let request = UNNotificationRequest(identifier: "task-action-failed-\(action.taskId ?? action.threadId)", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
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

/// Lo que hace falta de un aviso para actuar sobre su tarea en segundo plano, ya como texto.
private struct TaskPushAction {
    /// `target_id`, solo si el aviso trata de una tarea.
    let taskId: String?
    let notificationId: String?
    let entity: String?
    let threadId: String
    let failedTitle: String
    let note: String?
    /// Si falla: la tarea o, sin ella, la liga del aviso.
    let openURL: String?

    init(info: [AnyHashable: Any], threadId: String, failedTitle: String, note: String?) {
        let task = PushManager.text(info, "target_kind") == "task" ? PushManager.text(info, "target_id") : nil
        taskId = task
        notificationId = PushManager.text(info, "notification_id")
        entity = PushManager.text(info, "entity")
        self.threadId = threadId
        self.failedTitle = failedTitle
        self.note = note
        openURL = task.map { "/tasks?task=\($0)" } ?? PushManager.text(info, "url")
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
