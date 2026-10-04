import Foundation

/// Pestañas de la app (mismo orden que Android). Fuera de `AppRouter` para que
/// `PanelLink`, que no corre en el hilo principal, pueda nombrarlas.
enum AppTab: Hashable {
    case inicio, chats, tareas, avisos, mas
}

/// A dónde lleva una ruta interna del panel: una pantalla nativa o solo una pestaña.
enum PanelTarget: Equatable {
    case screen(AppRoute)
    case tab(AppTab)
}

/// Traduce las rutas internas del panel (la `url` de cada aviso, los enlaces de
/// la vista web y `arta://`) a pantallas nativas. Contrato de paridad §4.
enum PanelLink {
    /// Pestañas del hub del evento con versión nativa; las demás se quedan en la web.
    private static let nativeEventTabs: Set<String> = ["overview", "tasks"]

    /// Avisos que piden una decisión (mismo criterio que `notification-push-meta.ts`).
    private static let approvalTypes: Set<String> = [
        "po.requested", "po.updated", "po.aging", "po.to_pay",
        "task.submitted", "checklist.submitted", "checklist.signature_needed",
        "checklist.returned", "checklist.signature_backlog",
    ]

    /// Push o campana: con `channel_id` es de una conversación (mensajes y menciones).
    static func target(channelId: String?, messageId: String?, url: String?, type: String?) -> PanelTarget? {
        if let channelId, !channelId.isEmpty {
            return .screen(.chat(channelId: channelId, messageId: messageId))
        }
        guard let url, !url.isEmpty else { return nil }
        return target(path: url, type: type)
    }

    /// Cualquier ruta del panel: la pantalla nativa si existe, si no la vista web en esa ruta.
    static func target(path raw: String, type: String? = nil) -> PanelTarget {
        let path = normalize(raw)
        if let native = nativeTarget(path: path) { return native }
        if isPendingApproval(path: path, type: type) { return .screen(.approvals) }
        return .screen(.web(path: path, title: nil))
    }

    /// Solo las rutas con pantalla nativa; `nil` = se queda en la web.
    static func nativeTarget(path raw: String) -> PanelTarget? {
        guard let comps = URLComponents(string: normalize(raw)) else { return nil }
        let items = comps.queryItems ?? []
        func value(_ name: String) -> String? {
            guard let v = items.first(where: { $0.name == name })?.value, !v.isEmpty else { return nil }
            return v
        }
        let parts = comps.path.split(separator: "/").map(String.init)
        guard let first = parts.first else { return nil }
        switch first {
        case "chat":
            if let channel = value("channel") {
                return .screen(.chat(channelId: channel, messageId: value("msg")))
            }
            return parts.count == 1 ? .tab(.chats) : nil
        case "tasks":
            if parts.count >= 2 { return parts[1] == "new" ? nil : .screen(.task(parts[1])) }
            if let task = value("task") { return .screen(.task(task)) }
            return .tab(.tareas)
        case "events":
            guard parts.count >= 2, parts[1] != "new" else { return nil }
            if let task = value("task") { return .screen(.task(task)) }
            guard parts.count == 2 else { return nil }
            if let tab = value("tab"), !nativeEventTabs.contains(tab) { return nil }
            return .screen(.event(parts[1]))
        case "dashboard":
            return parts.count == 1 ? .tab(.inicio) : nil
        default:
            return nil
        }
    }

    /// `arta://chat?channel=…`, `arta://avisos`, `arta://tasks/<id>`, `arta://web?path=…`
    /// y enlaces `https://` del propio panel.
    static func target(url: URL) -> PanelTarget? {
        if url.scheme == "arta" {
            let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
            let host = url.host ?? ""
            switch host {
            case "":
                return nil
            case "avisos", "notifications":
                return .tab(.avisos)
            case "web":
                let path = comps?.queryItems?.first(where: { $0.name == "path" })?.value ?? "/dashboard"
                return target(path: path)
            default:
                var path = "/" + host + (comps?.percentEncodedPath ?? "")
                if let query = comps?.percentEncodedQuery, !query.isEmpty { path += "?" + query }
                return target(path: path)
            }
        }
        guard let host = url.host?.lowercased(), host == ApiConfig.origin.host?.lowercased() else { return nil }
        return target(path: pathAndQuery(of: url))
    }

    /// `/events/1?tab=tasks` de una URL absoluta (sin el fragmento).
    static func pathAndQuery(of url: URL) -> String {
        guard let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return "/" }
        var out = comps.percentEncodedPath.isEmpty ? "/" : comps.percentEncodedPath
        if let query = comps.percentEncodedQuery, !query.isEmpty { out += "?" + query }
        return out
    }

    private static func normalize(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://"), let url = URL(string: trimmed) {
            return pathAndQuery(of: url)
        }
        if trimmed.isEmpty { return "/dashboard" }
        return trimmed.hasPrefix("/") ? trimmed : "/" + trimmed
    }

    private static func isPendingApproval(path: String, type: String?) -> Bool {
        guard path.hasPrefix("/advances") || path.hasPrefix("/purchase-orders") else { return false }
        guard let t = type?.lowercased(), !t.isEmpty else { return false }
        return approvalTypes.contains(t) || t.hasSuffix(".review")
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
    typealias Tab = AppTab

    static let shared = AppRouter()

    @Published var tab: Tab = .inicio
    @Published var chatPath: [ChatRoute] = []
    @Published var inicioPath: [AppRoute] = []
    @Published var tareasPath: [AppRoute] = []
    @Published var avisosPath: [AppRoute] = []
    @Published var masPath: [AppRoute] = []

    private init() {}

    /// Desde una pantalla: apila en la pestaña actual. La pila de Chats es de
    /// `ChatRoute`, así que desde ahí la ruta se abre en su pestaña natural.
    func open(_ route: AppRoute) {
        if case let .chat(channelId, messageId) = route {
            openChat(channelId, messageId: messageId)
            return
        }
        let target = tab == .chats ? Self.home(for: route) : tab
        tab = target
        push(route, on: target)
    }

    /// Push tocado o `arta://`: pestaña natural de la ruta con la pila limpia.
    func openFromLink(_ route: AppRoute) {
        if case let .chat(channelId, messageId) = route {
            openChat(channelId, messageId: messageId)
            return
        }
        let target = Self.home(for: route)
        setPath([route], on: target)
        tab = target
    }

    func follow(_ target: PanelTarget, fromLink: Bool = false) {
        switch target {
        case .screen(let route):
            if fromLink { openFromLink(route) } else { open(route) }
        case .tab(let tab):
            select(tab)
        }
    }

    /// Ruta interna del panel (`url` de un aviso o un enlace). Contrato §4.
    func openPanel(path: String, type: String? = nil, fromLink: Bool = false) {
        follow(PanelLink.target(path: path, type: type), fromLink: fromLink)
    }

    /// Cambia de pestaña; si ya estaba en ella, vuelve a la raíz (como UIKit).
    func select(_ tab: Tab) {
        if self.tab == tab {
            if tab == .chats { chatPath = [] } else { setPath([], on: tab) }
        }
        self.tab = tab
    }

    func openChat(_ channelId: String, messageId: String? = nil) {
        tab = .chats
        chatPath = [.conversation(channelId: channelId, focusMessageId: messageId)]
    }

    func reset() {
        tab = .inicio
        chatPath = []
        inicioPath = []
        tareasPath = []
        avisosPath = []
        masPath = []
    }

    static func home(for route: AppRoute) -> Tab {
        switch route {
        case .task: return .tareas
        case .event, .approvals: return .inicio
        case .web: return .mas
        case .chat: return .chats
        }
    }

    private func push(_ route: AppRoute, on tab: Tab) {
        var stack = currentPath(on: tab)
        guard stack.last != route else { return }
        stack.append(route)
        setPath(stack, on: tab)
    }

    private func currentPath(on tab: Tab) -> [AppRoute] {
        switch tab {
        case .inicio: return inicioPath
        case .tareas: return tareasPath
        case .avisos: return avisosPath
        case .mas: return masPath
        case .chats: return []
        }
    }

    private func setPath(_ path: [AppRoute], on tab: Tab) {
        switch tab {
        case .inicio: inicioPath = path
        case .tareas: tareasPath = path
        case .avisos: avisosPath = path
        case .mas: masPath = path
        case .chats: break
        }
    }
}
