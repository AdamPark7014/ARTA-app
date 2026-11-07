import Foundation

/// Pantallas a las que se llega desde cualquier pestaña, un aviso o un enlace
/// interno de la vista web. Las vistas navegan con `router.open(...)`.
enum AppRoute: Hashable {
    case task(String)
    /// `tab`: pestaña del hub con versión nativa (`overview`, `tasks`, `adendum`, `testigos`); `nil` = Resumen.
    case event(String, tab: String? = nil)
    /// `focus`: la OC o el anticipo del aviso, que se abre al llegar. `web`: su ruta en el panel
    /// (`/purchase-orders?po=…`, `/advances?advance=…`), por si ya no está en las listas.
    case approvals(focus: String? = nil, web: String? = nil)
    case web(path: String, title: String?)
    /// `parentId`: raíz del hilo cuando el aviso es de una respuesta; se abre ese hilo.
    case chat(channelId: String, messageId: String?, parentId: String? = nil)
    /// Más › Usuarios bloqueados (docs/chat-reportar-bloquear.md).
    case blockedUsers
    /// Qué llega al teléfono: Más › Preferencias de avisos y la barra de Avisos.
    case notificationPreferences
    /// La cartelera pública de Arta: lo que viene y la temporada.
    case cartelera
    /// Un show de la cartelera (desde la tira «En cartelera» de Inicio).
    case show(PublicShow)
    /// Eventos nativos: la lista (`scope`: active | past, como `/events?scope=`) o el calendario del mes.
    case events(scope: String? = nil, calendar: Bool = false)
}
