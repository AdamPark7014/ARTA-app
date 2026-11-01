package com.artaproducciones.ops.ui.modules

/** Navegación que el cascarón (ArtaApp) implementa para las pantallas de módulos. */
interface ModuleNav {
    fun openTask(id: String)
    fun openEvent(id: String)
    fun openApprovals()
    fun openWeb(path: String, title: String? = null)
    fun openChat(channelId: String)
    /** «Más › Usuarios bloqueados» del chat. */
    fun openBlockedUsers()
    /** Qué avisos llegan al teléfono (desde Más y desde la barra de Avisos). */
    fun openNotificationPrefs()
    fun back()
}
