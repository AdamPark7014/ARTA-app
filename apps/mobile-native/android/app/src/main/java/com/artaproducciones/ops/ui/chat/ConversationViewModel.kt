package com.artaproducciones.ops.ui.chat

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChannelDetail
import com.artaproducciones.ops.data.api.ChatAttachment
import com.artaproducciones.ops.data.api.ChatAuthor
import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.data.api.ChatReplyRef
import com.artaproducciones.ops.data.api.EditBody
import com.artaproducciones.ops.data.api.MuteBody
import com.artaproducciones.ops.data.api.PostMessageBody
import com.artaproducciones.ops.data.api.ReactionBody
import com.artaproducciones.ops.data.api.UploadResult
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.push.ActiveConversation
import com.artaproducciones.ops.ui.common.parseInstant
import com.artaproducciones.ops.ui.common.plainText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MultipartBody
import java.io.File
import java.time.Instant
import java.util.UUID

/** [fraction] null mientras se prepara (p. ej. comprimiendo la foto) o si no se sabe el tamaño. */
data class UploadProgress(val label: String, val index: Int, val total: Int, val fraction: Float?)

/** Cuántos de los demás miembros ya leyeron hasta un mensaje. */
data class ReadReceipt(val readers: Int, val others: Int)

data class ConversationState(
    val channel: ChannelDetail? = null,
    /** Orden cronológico (el más viejo primero). En un hilo, el primero es la raíz. */
    val messages: List<ChatMessage> = emptyList(),
    val loading: Boolean = true,
    /** Falló la carga inicial: la pantalla muestra «Reintentar» en lugar de quedarse en blanco. */
    val loadError: String? = null,
    val loadingOlder: Boolean = false,
    val hasMore: Boolean = false,
    /** La página cargada no llega hasta lo último (se abrió alrededor de un mensaje). */
    val hasNewer: Boolean = false,
    val loadingNewer: Boolean = false,
    val typing: List<String> = emptyList(),
    val error: String? = null,
    val upload: UploadProgress? = null,
    val focusMessageId: String? = null,
    /** Resaltado breve del mensaje al que se saltó (búsqueda, cita, aviso). */
    val highlightId: String? = null,
    /** Primer mensaje ajeno posterior al `lastReadAt` con el que se abrió: separador «Mensajes nuevos». */
    val firstUnreadId: String? = null,
) {
    val uploading: Boolean get() = upload != null
}

class ConversationViewModel(
    app: Application,
    val channelId: String,
    /** Id del mensaje raíz cuando la pantalla es un hilo. */
    val parentId: String?,
    focusMessageId: String?,
) : AndroidViewModel(app) {
    private val _state = MutableStateFlow(ConversationState(focusMessageId = focusMessageId))
    val state: StateFlow<ConversationState> = _state

    val myId: String get() = Session.currentUser?.id.orEmpty()
    private val typingUntil = mutableMapOf<String, Pair<String, Long>>()
    private var typingJob: Job? = null
    private var lastTypingSent = 0L
    private var visible = false
    private var unreadComputed = false

    init {
        RealtimeClient.join(channelId)
        viewModelScope.launch { loadInitial() }
        collectRealtime()
    }

    private suspend fun loadInitial() {
        _state.update { it.copy(loading = true, loadError = null) }
        try {
            val channel = ApiClient.api.channel(channelId)
            _state.update { it.copy(channel = channel) }
            if (parentId != null) {
                val t = ApiClient.api.thread(parentId)
                _state.update { it.copy(messages = listOf(t.root) + t.replies, loading = false, hasMore = false, hasNewer = false) }
            } else {
                val focus = _state.value.focusMessageId
                val page = if (focus != null) ApiClient.api.messages(channelId, around = focus, limit = 60) else ApiClient.api.messages(channelId, limit = 50)
                val firstUnread = if (unreadComputed) _state.value.firstUnreadId else firstUnreadAfter(channel.lastReadAt, page.messages)
                unreadComputed = true
                val pendingLocal = _state.value.messages.filter { it.pending || it.failed }
                _state.update {
                    it.copy(
                        messages = page.messages + pendingLocal,
                        loading = false,
                        hasMore = page.hasMore,
                        hasNewer = page.hasNewer,
                        firstUnreadId = firstUnread,
                    )
                }
            }
            markReadIfVisible()
        } catch (e: Exception) {
            _state.update { it.copy(loading = false, loadError = e.userMessage()) }
        }
    }

    fun retry() {
        viewModelScope.launch { loadInitial() }
    }

    private fun firstUnreadAfter(lastReadAt: String?, list: List<ChatMessage>): String? {
        val at = parseInstant(lastReadAt) ?: return null
        return list.firstOrNull { m -> m.author.id != myId && m.kind != "SYSTEM" && parseInstant(m.createdAt)?.isAfter(at) == true }?.id
    }

    private fun belongsHere(m: ChatMessage): Boolean =
        m.channelId == channelId && (if (parentId == null) m.parentId == null else m.parentId == parentId || m.id == parentId)

    private fun collectRealtime() {
        viewModelScope.launch {
            RealtimeClient.messages.collect { m ->
                if (!belongsHere(m)) return@collect
                // Abierta alrededor de un mensaje viejo: lo nuevo llega al cargar hacia abajo.
                if (_state.value.hasNewer && m.author.id != myId) return@collect
                upsert(m)
                typingUntil.remove(m.author.id)
                publishTyping()
                if (m.author.id != myId) markReadIfVisible()
            }
        }
        viewModelScope.launch {
            RealtimeClient.updated.collect { m ->
                if (m.channelId != channelId) return@collect
                // `saved` es por persona: el evento del socket no lo trae para mí.
                _state.update { s -> s.copy(messages = s.messages.map { if (it.id == m.id) m.copy(saved = it.saved) else it }) }
            }
        }
        viewModelScope.launch {
            RealtimeClient.deleted.collect { d ->
                if (d.channelId != channelId) return@collect
                _state.update { s -> s.copy(messages = applyDeletion(s.messages, d.messageId)) }
            }
        }
        viewModelScope.launch {
            RealtimeClient.typing.collect { t ->
                if (t.channelId != channelId || t.userId == myId) return@collect
                typingUntil[t.userId] = t.fullName to System.currentTimeMillis() + 5_000
                publishTyping()
                scheduleTypingExpiry()
            }
        }
        viewModelScope.launch {
            RealtimeClient.reads.collect { r ->
                if (r.channelId != channelId) return@collect
                _state.update { s ->
                    val ch = s.channel ?: return@update s
                    s.copy(channel = ch.copy(members = ch.members.map { if (it.id == r.userId) it.copy(lastReadAt = r.at) else it }))
                }
            }
        }
        viewModelScope.launch {
            RealtimeClient.channelsChanged.collect { id ->
                if (id == channelId) refreshChannel()
            }
        }
        viewModelScope.launch {
            var first = true
            RealtimeClient.connected.collect { connected ->
                if (!connected) return@collect
                if (first) {
                    first = false
                    return@collect
                }
                // Reconexión: el servidor olvidó la sala y pudo llegar algo mientras tanto.
                RealtimeClient.join(channelId)
                if (_state.value.loadError != null) loadInitial() else catchUp()
            }
        }
    }

    fun refreshChannel() {
        viewModelScope.launch {
            runCatching { ApiClient.api.channel(channelId) }.onSuccess { ch -> _state.update { it.copy(channel = ch) } }
        }
    }

    /** Con respuestas en hilo queda «Mensaje eliminado»; si no, desaparece. Las citas a él también se marcan. */
    private fun applyDeletion(list: List<ChatMessage>, id: String): List<ChatMessage> = list.mapNotNull { m ->
        val current = when {
            m.id != id -> m
            m.replyCount > 0 || m.id == parentId -> m.copy(deleted = true, body = "", attachment = null, reactions = emptyList(), pinnedAt = null)
            else -> null
        }
        current?.replyTo?.let { r -> if (r.id == id) current.copy(replyTo = r.copy(deleted = true, excerpt = null)) else current } ?: current
    }

    private suspend fun catchUp() {
        if (_state.value.hasNewer) return
        val last = _state.value.messages.lastOrNull { !it.pending && !it.failed } ?: return
        runCatching {
            if (parentId != null) {
                val t = ApiClient.api.thread(parentId)
                (listOf(t.root) + t.replies).forEach { upsert(it) }
            } else {
                ApiClient.api.messages(channelId, after = last.id, limit = 200).messages.forEach { upsert(it) }
            }
        }
        markReadIfVisible()
    }

    private fun upsert(m: ChatMessage) {
        _state.update { s ->
            val list = s.messages.toMutableList()
            val byId = list.indexOfFirst { it.id == m.id }
            val byClient = if (m.clientId != null) list.indexOfFirst { it.clientId == m.clientId && it.pending } else -1
            when {
                byId >= 0 -> list[byId] = m.copy(saved = m.saved || list[byId].saved)
                byClient >= 0 -> list[byClient] = m
                else -> list.add(m)
            }
            s.copy(messages = list.sortedWith(compareBy<ChatMessage>({ it.pending || it.failed }, { it.createdAt }, { it.id })))
        }
    }

    private fun publishTyping() {
        val now = System.currentTimeMillis()
        typingUntil.entries.removeAll { it.value.second < now }
        _state.update { it.copy(typing = typingUntil.values.map { v -> v.first }) }
    }

    private fun scheduleTypingExpiry() {
        typingJob?.cancel()
        typingJob = viewModelScope.launch {
            while (typingUntil.isNotEmpty()) {
                delay(1_000)
                publishTyping()
            }
        }
    }

    fun onVisible(isVisible: Boolean) {
        visible = isVisible
        if (isVisible) {
            ActiveConversation.open(getApplication(), channelId)
            markReadIfVisible()
        } else {
            ActiveConversation.close(channelId)
        }
    }

    private fun markReadIfVisible() {
        if (!visible || parentId != null || _state.value.hasNewer) return
        viewModelScope.launch { runCatching { ApiClient.api.markRead(channelId) } }
    }

    fun loadOlder() {
        val s = _state.value
        if (parentId != null || s.loadingOlder || !s.hasMore) return
        val oldest = s.messages.firstOrNull { !it.pending } ?: return
        _state.update { it.copy(loadingOlder = true) }
        viewModelScope.launch {
            try {
                val page = ApiClient.api.messages(channelId, before = oldest.id, limit = 50)
                _state.update { st ->
                    val known = st.messages.map { it.id }.toSet()
                    st.copy(messages = page.messages.filterNot { it.id in known } + st.messages, hasMore = page.hasMore, loadingOlder = false)
                }
            } catch (e: Exception) {
                _state.update { it.copy(loadingOlder = false, error = e.userMessage()) }
            }
        }
    }

    /** Al llegar abajo de una página abierta alrededor de un mensaje viejo. */
    fun loadNewer() {
        val s = _state.value
        if (parentId != null || s.loadingNewer || !s.hasNewer) return
        val newest = s.messages.lastOrNull { !it.pending && !it.failed } ?: return
        _state.update { it.copy(loadingNewer = true) }
        viewModelScope.launch {
            try {
                val page = ApiClient.api.messages(channelId, after = newest.id, limit = 50)
                page.messages.forEach { upsert(it) }
                _state.update { it.copy(hasNewer = page.hasNewer, loadingNewer = false) }
                markReadIfVisible()
            } catch (e: Exception) {
                _state.update { it.copy(loadingNewer = false, error = e.userMessage()) }
            }
        }
    }

    /** Botón «↓»: si la página no llega hasta lo último, se recarga desde el final. */
    fun jumpToLatest() {
        if (!_state.value.hasNewer) return
        viewModelScope.launch {
            runCatching { ApiClient.api.messages(channelId, limit = 50) }
                .onSuccess { page ->
                    _state.update { s ->
                        s.copy(messages = page.messages + s.messages.filter { it.pending || it.failed }, hasMore = page.hasMore, hasNewer = false)
                    }
                    markReadIfVisible()
                }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
        }
    }

    /** Saltar a un mensaje (cita, fijado): si no está cargado se trae la página a su alrededor. */
    fun jumpTo(messageId: String) {
        if (_state.value.messages.any { it.id == messageId }) {
            _state.update { it.copy(focusMessageId = messageId) }
            return
        }
        if (parentId != null) return
        viewModelScope.launch {
            val previousNewest = _state.value.messages.lastOrNull { !it.pending && !it.failed }?.id
            runCatching { ApiClient.api.messages(channelId, around = messageId, limit = 60) }
                .onSuccess { page ->
                    val newer = page.hasNewer || (previousNewest != null && page.messages.none { it.id == previousNewest })
                    _state.update { s ->
                        s.copy(
                            messages = page.messages + s.messages.filter { it.pending || it.failed },
                            hasMore = page.hasMore,
                            hasNewer = newer,
                            focusMessageId = messageId,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(error = "Ese mensaje ya no está disponible.") } }
        }
    }

    fun onTyping() {
        val now = System.currentTimeMillis()
        if (now - lastTypingSent < 3_000) return
        lastTypingSent = now
        RealtimeClient.typing(channelId)
    }

    fun send(body: String, attachment: UploadResult? = null, replyTo: ChatMessage? = null) {
        val text = body.trim()
        if (text.isBlank() && attachment == null) return
        if (_state.value.hasNewer) jumpToLatest()
        val me = Session.currentUser
        val clientId = "a-" + UUID.randomUUID()
        val optimistic = ChatMessage(
            id = clientId,
            channelId = channelId,
            parentId = parentId,
            body = text,
            attachment = attachment?.let { ChatAttachment(it.url, it.name, it.mime, it.size) },
            createdAt = Instant.now().toString(),
            author = ChatAuthor(me?.id.orEmpty(), me?.fullName.orEmpty()),
            replyTo = replyTo?.let(::replyRefOf),
            clientId = clientId,
            pending = true,
        )
        _state.update { it.copy(messages = it.messages + optimistic) }
        post(optimistic)
    }

    private fun replyRefOf(m: ChatMessage) = ChatReplyRef(
        id = m.id,
        authorId = m.author.id,
        authorName = m.author.fullName,
        excerpt = plainText(m.body).take(140),
        kind = m.kind,
        attachmentName = m.attachment?.name,
        deleted = m.deleted,
    )

    private fun post(m: ChatMessage) {
        viewModelScope.launch {
            try {
                val saved = ApiClient.api.post(
                    channelId,
                    PostMessageBody(
                        body = m.body.ifBlank { null },
                        parentId = parentId,
                        attachmentUrl = m.attachment?.url,
                        attachmentName = m.attachment?.name,
                        attachmentMime = m.attachment?.mime,
                        attachmentSize = m.attachment?.size,
                        clientId = m.clientId,
                        replyToId = m.replyTo?.id,
                    ),
                )
                // Un API sin citas todavía no devuelve `replyTo`: se conserva la local.
                val merged = if (saved.replyTo == null && m.replyTo != null) saved.copy(replyTo = m.replyTo) else saved
                _state.update { s ->
                    val exists = s.messages.any { it.id == merged.id }
                    s.copy(messages = if (exists) s.messages.filterNot { it.clientId == m.clientId && it.pending } else s.messages.map { if (it.clientId == m.clientId) merged else it })
                }
            } catch (e: Exception) {
                _state.update { s -> s.copy(messages = s.messages.map { if (it.clientId == m.clientId) it.copy(pending = false, failed = true) else it }, error = e.userMessage()) }
            }
        }
    }

    fun retry(m: ChatMessage) {
        val again = m.copy(pending = true, failed = false)
        _state.update { s -> s.copy(messages = s.messages.map { if (it.clientId == m.clientId) again else it }) }
        post(again)
    }

    fun discard(m: ChatMessage) {
        _state.update { s -> s.copy(messages = s.messages.filterNot { it.clientId == m.clientId && it.failed }) }
    }

    private class QueuedUpload(val prepare: suspend () -> PreparedUpload, val caption: String, val replyTo: ChatMessage?)

    private var uploadJob: Job? = null
    private val uploadQueue = ArrayDeque<QueuedUpload>()
    private var queuedTotal = 0
    private var queuedDone = 0

    /**
     * Fotos, videos o documentos (uno o varios): un mensaje por archivo, como WhatsApp.
     * El texto escrito (y la cita) van con el primero. Se suben en orden y en streaming.
     */
    fun sendFiles(uris: List<Uri>, caption: String, replyTo: ChatMessage? = null) {
        if (uris.isEmpty()) return
        val app = getApplication<Application>()
        enqueue(uris.map { uri -> suspend { ChatMedia.prepare(app, uri) } }, caption, replyTo)
    }

    /** Nota de voz grabada en la app. */
    fun sendVoice(file: File, replyTo: ChatMessage? = null) = enqueue(listOf(suspend { ChatMedia.prepareFile(file) }), "", replyTo)

    private fun enqueue(items: List<suspend () -> PreparedUpload>, caption: String, replyTo: ChatMessage?) {
        items.forEachIndexed { i, prepare ->
            uploadQueue.addLast(QueuedUpload(prepare, if (i == 0) caption else "", if (i == 0) replyTo else null))
        }
        queuedTotal += items.size
        if (uploadJob?.isActive == true) return
        uploadJob = viewModelScope.launch { drainUploads() }
    }

    private suspend fun drainUploads() {
        while (uploadQueue.isNotEmpty()) {
            val next = uploadQueue.removeFirst()
            val index = queuedDone + 1
            _state.update { it.copy(upload = UploadProgress("archivo", index, queuedTotal, null)) }
            var prepared: PreparedUpload? = null
            try {
                val p = next.prepare().also { prepared = it }
                val label = when (p.kind) {
                    "image" -> "foto"
                    "video" -> "video"
                    "audio" -> if (p.name.startsWith("nota-de-voz")) "nota de voz" else "audio"
                    else -> p.name
                }
                var lastPct = -1
                val body = p.body { sent, total ->
                    if (total <= 0) return@body
                    val pct = (sent * 100 / total).toInt()
                    if (pct != lastPct) {
                        lastPct = pct
                        _state.update { it.copy(upload = UploadProgress(label, index, queuedTotal, pct / 100f)) }
                    }
                }
                _state.update { it.copy(upload = UploadProgress(label, index, queuedTotal, if (p.size > 0) 0f else null)) }
                val uploaded = withContext(Dispatchers.IO) {
                    ApiClient.api.upload(MultipartBody.Part.createFormData("file", p.name, body))
                }
                send(next.caption, uploaded, next.replyTo)
            } catch (e: Exception) {
                _state.update { it.copy(error = e.userMessage()) }
            } finally {
                prepared?.dispose()
                queuedDone++
            }
        }
        queuedTotal = 0
        queuedDone = 0
        _state.update { it.copy(upload = null) }
    }

    fun react(m: ChatMessage, emoji: String) = mutate { ApiClient.api.react(m.id, ReactionBody(emoji)) }

    fun togglePin(m: ChatMessage) = mutate { ApiClient.api.pin(m.id) }

    private fun setSaved(id: String, saved: Boolean) =
        _state.update { s -> s.copy(messages = s.messages.map { if (it.id == id) it.copy(saved = saved) else it }) }

    /** Optimista: la marca cambia al instante y se corrige con lo que diga el API. */
    fun toggleSave(m: ChatMessage) {
        setSaved(m.id, !m.saved)
        viewModelScope.launch {
            runCatching { ApiClient.api.toggleSave(m.id) }
                .onSuccess { r -> setSaved(m.id, r.saved) }
                .onFailure { e ->
                    setSaved(m.id, m.saved)
                    _state.update { it.copy(error = e.userMessage()) }
                }
        }
    }

    fun edit(m: ChatMessage, body: String) {
        if (body.isBlank() || body.trim() == m.body) return
        mutate { ApiClient.api.edit(m.id, EditBody(body.trim())) }
    }

    fun delete(m: ChatMessage) {
        viewModelScope.launch {
            runCatching { ApiClient.api.delete(m.id) }
                .onSuccess { _state.update { s -> s.copy(messages = applyDeletion(s.messages, m.id)) } }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
        }
    }

    private fun mutate(call: suspend () -> ChatMessage) {
        viewModelScope.launch {
            runCatching { call() }
                .onSuccess { upsert(it) }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
        }
    }

    /** [hours] null = siempre; [muted] false = volver a recibir avisos. */
    fun mute(muted: Boolean, hours: Int?) {
        viewModelScope.launch {
            runCatching { ApiClient.api.mute(channelId, MuteBody(muted, hours)) }
                .onSuccess { refreshChannel() }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
        }
    }

    suspend fun pins(): List<ChatMessage> = runCatching { ApiClient.api.pins(channelId).messages }.getOrDefault(emptyList())

    fun clearError() = _state.update { it.copy(error = null) }

    fun clearFocus() {
        val id = _state.value.focusMessageId
        _state.update { it.copy(focusMessageId = null, highlightId = id) }
        viewModelScope.launch {
            delay(1_800)
            _state.update { if (it.highlightId == id) it.copy(highlightId = null) else it }
        }
    }

    fun readReceipt(m: ChatMessage): ReadReceipt {
        val others = _state.value.channel?.members?.filter { it.id != myId }.orEmpty()
        val at = parseInstant(m.createdAt) ?: return ReadReceipt(0, others.size)
        val readers = others.count { mem -> parseInstant(mem.lastReadAt)?.let { !it.isBefore(at) } == true }
        return ReadReceipt(readers, others.size)
    }

    override fun onCleared() {
        ActiveConversation.close(channelId)
        // El hilo comparte sala con su canal: solo sale la pantalla principal.
        if (parentId == null) RealtimeClient.leave(channelId)
        super.onCleared()
    }

    companion object {
        const val EDIT_WINDOW_MS = 60 * 60 * 1000L
    }
}
