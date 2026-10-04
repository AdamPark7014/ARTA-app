package com.artaproducciones.ops.ui.chat

import android.content.Context
import android.util.LruCache
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.LinkPreview
import com.artaproducciones.ops.data.realtime.RealtimeClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Quién está en línea en mi organización: `GET /chat/presence` + evento `chat:presence`. */
object ChatPresence {
    private val _online = MutableStateFlow<Set<String>>(emptySet())
    val online: StateFlow<Set<String>> = _online
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var started = false

    @Synchronized
    fun ensureStarted() {
        if (started) return
        started = true
        scope.launch {
            RealtimeClient.presence.collect { e -> _online.update { if (e.online) it + e.userId else it - e.userId } }
        }
        // Al (re)conectar se vuelve a pedir la foto completa: lo que pasó sin socket se perdió.
        scope.launch { RealtimeClient.connected.collect { if (it) refresh() } }
        scope.launch { refresh() }
    }

    suspend fun refresh() {
        runCatching { ApiClient.api.presence().online.toSet() }.onSuccess { _online.value = it }
    }
}

/** Borradores por conversación (y por hilo), sobreviven a cerrar la app. */
object ChatDrafts {
    private const val PREFS = "chat_drafts"
    const val MAX_CHARS = 8000

    fun key(channelId: String, parentId: String?) = if (parentId == null) channelId else "$channelId:$parentId"

    fun get(context: Context, key: String): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, null).orEmpty()

    fun put(context: Context, key: String, text: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (text.isBlank()) prefs.remove(key) else prefs.putString(key, text.take(MAX_CHARS))
        prefs.apply()
    }
}

/** Vista previa de enlaces en memoria; también recuerda las URL que no tienen. */
object LinkPreviews {
    private val NONE = Any()
    private val cache = LruCache<String, Any>(300)

    fun known(url: String): Boolean = cache.get(url) != null

    fun cached(url: String): LinkPreview? = cache.get(url) as? LinkPreview

    suspend fun load(url: String): LinkPreview? {
        cache.get(url)?.let { return it as? LinkPreview }
        val fetched = runCatching { ApiClient.api.linkPreview(url) }
        // Un fallo de red no significa "sin vista previa": se reintenta la próxima vez.
        if (fetched.exceptionOrNull() is java.io.IOException) return null
        val result = fetched.getOrNull()
            ?.takeIf { !it.title.isNullOrBlank() || !it.description.isNullOrBlank() || !it.image.isNullOrBlank() }
        cache.put(url, result ?: NONE)
        return result
    }
}
