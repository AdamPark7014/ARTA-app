import Foundation

/// Pantallas a las que se llega desde cualquier pestaña, un aviso o un enlace
/// interno de la vista web. Las vistas navegan con `router.open(...)`.
enum AppRoute: Hashable {
    case task(String)
    case event(String)
    case approvals
    case web(path: String, title: String?)
    case chat(channelId: String, messageId: String?)
    /// Más › Usuarios bloqueados (docs/chat-reportar-bloquear.md).
    case blockedUsers
}
