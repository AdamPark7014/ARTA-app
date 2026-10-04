package com.artaproducciones.ops.ui.modules

/** Navegación que el cascarón (ArtaApp) implementa para las pantallas de módulos. */
interface ModuleNav {
    fun openTask(id: String)
    fun openEvent(id: String)
    fun openApprovals()
    fun openWeb(path: String, title: String? = null)
    fun openChat(channelId: String)
    fun back()
}
