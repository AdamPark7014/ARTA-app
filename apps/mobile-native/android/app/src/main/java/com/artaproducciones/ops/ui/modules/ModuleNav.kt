package com.artaproducciones.ops.ui.modules

/** Navegación que el cascarón (ArtaApp) implementa para las pantallas de módulos. */
interface ModuleNav {
    fun openTask(id: String)
    fun openEvent(id: String)
    fun openApprovals()

    /**
     * Aprobaciones con esa orden de compra o ese anticipo ya abierto (como `.approvals(focus:)` en iOS):
     * tocar una fila concreta nunca cae en la lista genérica. Sin ids es [openApprovals].
     */
    fun openApproval(poId: String? = null, advanceId: String? = null)

    /**
     * La pestaña Tareas; [filter] es la llave de la web (`vencidas`, `abiertas`, `todas`, `bloqueadas`,
     * `hechas`) y la pestaña la aplica al abrirse. Null deja el filtro como estaba.
     */
    fun openTasks(filter: String? = null)
    fun openWeb(path: String, title: String? = null)

    /**
     * Como [openWeb], pero en lugar de la pantalla de arriba, que se quita de la pila: el respaldo web de una
     * pantalla nativa que no tiene lo que se le pidió (una OC que ya no está en mis Aprobaciones).
     */
    fun replaceWithWeb(path: String, title: String? = null)
    fun openChat(channelId: String)
    /** «Más › Usuarios bloqueados» del chat. */
    fun openBlockedUsers()
    /** Qué avisos llegan al teléfono (desde Más y desde la barra de Avisos). */
    fun openNotificationPrefs()
    /** La cartelera pública de Arta: lo que viene y la temporada; con [showId], ese show ya abierto. */
    fun openCartelera(showId: String? = null)
    fun back()
}
