import Intents
import UIKit
import UserNotifications

/// Convierte cada push de chat en una notificación de comunicación de iOS: la
/// cara de quien escribe (iniciales sobre dorado) en lugar del ícono de la app
/// y, en canales, el nombre del canal como grupo. Es lo que hace WhatsApp.
///
/// Requiere `mutable-content: 1` (el API lo manda en `aps`) y la capacidad
/// Communication Notifications en la app. Si algo falla se muestra el aviso tal cual.
final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        bestAttempt = content
        let info = content.userInfo

        func text(_ key: String) -> String {
            if let s = info[key] as? String { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let n = info[key] as? NSNumber { return n.stringValue }
            return ""
        }

        if content.threadIdentifier.isEmpty, !text("thread_id").isEmpty {
            content.threadIdentifier = text("thread_id")
        }

        guard text("kind") == "chat" else {
            // Procesos: los urgentes (aprobaciones, pagos) no se quedan callados en el resumen.
            if text("priority") == "high" { content.relevanceScore = 1 }
            contentHandler(content)
            return
        }

        let senderId = text("sender_id")
        let senderName = text("sender_name").isEmpty ? content.title : text("sender_name")
        let threadTitle = text("thread_title")
        let isGroup = !threadTitle.isEmpty && threadTitle != senderName

        let sender = INPerson(
            personHandle: INPersonHandle(value: senderId.isEmpty ? senderName : senderId, type: .unknown),
            nameComponents: nil,
            displayName: senderName,
            image: Self.avatar(for: senderName).map { INImage(imageData: $0) },
            contactIdentifier: nil,
            customIdentifier: senderId.isEmpty ? nil : senderId
        )
        let me = INPerson(
            personHandle: INPersonHandle(value: "arta-me", type: .unknown),
            nameComponents: nil,
            displayName: nil,
            image: nil,
            contactIdentifier: nil,
            customIdentifier: nil,
            isMe: true
        )
        let intent = INSendMessageIntent(
            recipients: isGroup ? [me, sender] : nil,
            outgoingMessageType: .outgoingMessageText,
            content: content.body,
            speakableGroupName: isGroup ? INSpeakableString(spokenPhrase: threadTitle) : nil,
            conversationIdentifier: content.threadIdentifier.isEmpty ? text("channel_id") : content.threadIdentifier,
            serviceName: nil,
            sender: sender,
            attachments: nil
        )
        if isGroup, let data = Self.avatar(for: threadTitle, channel: true) {
            intent.setImage(INImage(imageData: data), forParameterNamed: \.speakableGroupName)
        }

        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate { _ in
            do {
                let updated = try content.updating(from: intent)
                contentHandler(updated)
            } catch {
                contentHandler(content)
            }
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler, let bestAttempt { contentHandler(bestAttempt) }
    }

    /// Círculo dorado con iniciales (o `#` para canales), igual que el avatar de la app.
    private static func avatar(for name: String, channel: Bool = false) -> Data? {
        let size = CGSize(width: 120, height: 120)
        let gold = UIColor(red: 0xC9 / 255, green: 0xA9 / 255, blue: 0x62 / 255, alpha: 1)
        let dark = UIColor(red: 0x09 / 255, green: 0x09 / 255, blue: 0x0B / 255, alpha: 1)
        let label = channel ? "#" : initials(name)
        let image = UIGraphicsImageRenderer(size: size).image { _ in
            (channel ? dark : gold).setFill()
            UIBezierPath(ovalIn: CGRect(origin: .zero, size: size)).fill()
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 48, weight: .bold),
                .foregroundColor: channel ? gold : dark,
            ]
            let textSize = (label as NSString).size(withAttributes: attrs)
            (label as NSString).draw(
                at: CGPoint(x: (size.width - textSize.width) / 2, y: (size.height - textSize.height) / 2),
                withAttributes: attrs
            )
        }
        return image.pngData()
    }

    private static func initials(_ name: String) -> String {
        let letters = name.split(whereSeparator: \.isWhitespace)
            .compactMap { $0.first(where: { $0.isLetter || $0.isNumber }) }
            .prefix(2)
        let s = String(letters).uppercased()
        return s.isEmpty ? "A" : s
    }
}
