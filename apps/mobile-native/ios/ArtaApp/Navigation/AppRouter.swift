import Foundation

/// A dónde lleva un aviso tocado o un enlace `arta://` (mismas URLs internas que genera el API).
enum DeepLink: Equatable {
    case chat(channelId: String, messageId: String?)
    case notifications(url: String?)

    static func from(channelId: String?, messageId: String?, url: String?) -> DeepLink? {
        if let channelId, !channelId.isEmpty { return .chat(channelId: channelId, messageId: messageId) }
        guard let url, !url.isEmpty else { return nil }
        if let comps = URLComponents(string: url), comps.path == "/chat" || comps.path.hasSuffix("/chat") {
            let items = comps.queryItems ?? []
            if let channel = items.first(where: { $0.name == "channel" })?.value, !channel.isEmpty {
                return .chat(channelId: channel, messageId: items.first(where: { $0.name == "msg" })?.value)
            }
        }
        return .notifications(url: url)
    }

    /// `arta://chat?channel=…&msg=…` o `arta://avisos`.
    static func from(url: URL) -> DeepLink? {
        guard url.scheme == "arta" else { return nil }
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let items = comps?.queryItems ?? []
        switch url.host {
        case "chat":
            guard let channel = items.first(where: { $0.name == "channel" })?.value, !channel.isEmpty else { return nil }
            return .chat(channelId: channel, messageId: items.first(where: { $0.name == "msg" })?.value)
        case "avisos", "notifications":
            return .notifications(url: nil)
        default:
            return nil
        }
    }
}

enum ChatRoute: Hashable {
    case conversation(channelId: String, focusMessageId: String?)
    case thread(channelId: String, rootId: String)
}

/// Pestaña y pila de navegación. Vive fuera de las vistas para que un toque en
/// un push (que puede llegar antes de que exista la interfaz) sepa a dónde ir.
@MainActor
final class AppRouter: ObservableObject {
    enum Tab: Hashable { case chats, notices, profile }

    static let shared = AppRouter()

    @Published var tab: Tab = .chats
    @Published var chatPath: [ChatRoute] = []

    private init() {}

    func open(_ link: DeepLink) {
        switch link {
        case let .chat(channelId, messageId):
            tab = .chats
            chatPath = [.conversation(channelId: channelId, focusMessageId: messageId)]
        case .notifications:
            tab = .notices
        }
    }

    func openChat(_ channelId: String) {
        tab = .chats
        chatPath = [.conversation(channelId: channelId, focusMessageId: nil)]
    }

    func reset() {
        tab = .chats
        chatPath = []
    }
}
