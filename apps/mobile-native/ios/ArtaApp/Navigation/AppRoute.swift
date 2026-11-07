import Foundation

/// Pantallas a las que se llega desde cualquier pestaña, un aviso o un enlace
/// interno de la vista web. Las vistas navegan con `router.open(...)`.
enum AppRoute: Hashable {
    case task(String)
    case event(String)
    /// `focus`: la OC o el anticipo del aviso, que se abre al llegar.
    case approvals(focus: String? = nil)
    case web(path: String, title: String?)
    /// `parentId`: raíz del hilo cuando el aviso es de una respuesta; se abre ese hilo.
    case chat(channelId: String, messageId: String?, parentId: String? = nil)
    /// Más › Usuarios bloqueados (docs/chat-reportar-bloquear.md).
    case blockedUsers
    /// Qué llega al teléfono: Más › Preferencias de avisos y la barra de Avisos.
    case notificationPreferences
    /// La cartelera pública de Arta: lo que viene y la temporada.
    case cartelera
}
