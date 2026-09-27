package com.artaproducciones.ops.ui.chat

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChannelDetail
import com.artaproducciones.ops.data.api.ChatAttachment
import com.artaproducciones.ops.data.api.ChatAuthor
import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.data.api.EditBody
import com.artaproducciones.ops.data.api.MuteBody
import com.artaproducciones.ops.data.api.PostMessageBody
import com.artaproducciones.ops.data.api.ReactionBody
import com.artaproducciones.ops.data.api.UploadResult
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.push.ActiveConversation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.Instant
import java.util.UUID

data class ConversationState(
    val channel: ChannelDetail? = null,
    /** Orden cronológico (el más viejo primero). En un hilo, el primero es la raíz. */
    val messages: List<ChatMessage> = emptyList(),
    val loading: Boolean = true,
    val loadingOlder: Boolean = false,
    val hasMore: Boolean = false,
    val typing: List<String> = emptyList(),
    val error: String? = null,
    val uploading: Boolean = false,
    val focusMessageId: String? = null,
)

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

    init {
        RealtimeClient.join(channelId)
        viewModelScope.launch { loadInitial() }
        collectRealtime()
    }

    private suspend fun loadInitial() {
        try {
            val channel = ApiClient.api.channel(channelId)
            _state.update { it.copy(channel = channel) }
            if (parentId != null) {
                val t = ApiClient.api.thread(parentId)
                _state.update { it.copy(messages = listOf(t.root) + t.replies, loading = false, hasMore = false, error = null) }
            } else {
                val focus = _state.value.focusMessageId
                val page = if (focus != null) ApiClient.api.messages(channelId, around = focus, limit = 60) else ApiClient.api.messages(channelId, limit = 50)
                _state.update { it.copy(messages = page.messages, loading = false, hasMore = page.hasMore, error = null) }
            }
            markReadIfVisible()
        } catch (e: Exception) {
            _state.update { it.copy(loading = false, error = e.userMessage()) }
        }
    }

    private fun belongsHere(m: ChatMessage): Boolean =
        m.channelId == channelId && (if (parentId == null) m.parentId == null else m.parentId == parentId || m.id == parentId)

    private fun collectRealtime() {
        viewModelScope.launch {
            RealtimeClient.messages.collect { m ->
                if (!belongsHere(m)) return@collect
                upsert(m)
                typingUntil.remove(m.author.id)
                publishTyping()
                if (m.author.id != myId) markReadIfVisible()
            }
        }
        viewModelScope.launch {
            RealtimeClient.updated.collect { m ->
                if (m.channelId != channelId) return@collect
                _state.update { s -> s.copy(messages = s.messages.map { if (it.id == m.id) m else it }) }
            }
        }
        viewModelScope.launch {
            RealtimeClient.deleted.collect { d ->
                if (d.channelId != channelId) return@collect
                _state.update { s -> s.copy(messages = s.messages.filterNot { it.id == d.messageId }) }
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
                if (id == channelId) runCatching { ApiClient.api.channel(channelId) }.onSuccess { ch -> _state.update { it.copy(channel = ch) } }
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
                catchUp()
            }
        }
    }

    private suspend fun catchUp() {
        val last = _state.value.messages.lastOrNull { !it.pending && !it.failed } ?: return
        runCatching {
            if (parentId != null) {
                val t = ApiClient.api.thread(parentId)
                (listOf(t.root) + t.replies).forEach(::upsert)
            } else {
                ApiClient.api.messages(channelId, after = last.id, limit = 200).messages.forEach(::upsert)
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
                byId >= 0 -> list[byId] = m
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
        if (!visible || parentId != null) return
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

    fun onTyping() {
        val now = System.currentTimeMillis()
        if (now - lastTypingSent < 3_000) return
        lastTypingSent = now
        RealtimeClient.typing(channelId)
    }

    fun send(body: String, attachment: UploadResult? = null) {
        val text = body.trim()
        if (text.isBlank() && attachment == null) return
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
            clientId = clientId,
            pending = true,
        )
        _state.update { it.copy(messages = it.messages + optimistic) }
        post(optimistic)
    }

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
                    ),
                )
                _state.update { s ->
                    val exists = s.messages.any { it.id == saved.id }
                    s.copy(messages = if (exists) s.messages.filterNot { it.clientId == m.clientId && it.pending } else s.messages.map { if (it.clientId == m.clientId) saved else it })
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

    /** Sube una foto o PDF y la manda como mensaje (con el texto escrito, si hay). */
    fun sendFile(uri: Uri, caption: String) {
        _state.update { it.copy(uploading = true) }
        viewModelScope.launch {
            try {
                val uploaded = withContext(Dispatchers.IO) { upload(uri) }
                send(caption, uploaded)
            } catch (e: Exception) {
                _state.update { it.copy(error = e.userMessage()) }
            } finally {
                _state.update { it.copy(uploading = false) }
            }
        }
    }

    private suspend fun upload(uri: Uri): UploadResult {
        val resolver = getApplication<Application>().contentResolver
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        var name = "archivo"
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) name = c.getString(0) ?: name
        }
        if (!name.contains('.')) {
            name += when {
                mime == "application/pdf" -> ".pdf"
                mime == "image/png" -> ".png"
                mime == "image/webp" -> ".webp"
                mime.startsWith("image/") -> ".jpg"
                else -> ""
            }
        }
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: error("No se pudo leer el archivo")
        require(bytes.size <= MAX_UPLOAD_BYTES) { "El archivo pesa más de 20 MB" }
        val part = MultipartBody.Part.createFormData("file", name, bytes.toRequestBody(mime.toMediaTypeOrNull()))
        return ApiClient.api.upload(part)
    }

    fun react(m: ChatMessage, emoji: String) = mutate { ApiClient.api.react(m.id, ReactionBody(emoji)) }

    fun togglePin(m: ChatMessage) = mutate { ApiClient.api.pin(m.id) }

    fun edit(m: ChatMessage, body: String) {
        if (body.isBlank() || body.trim() == m.body) return
        mutate { ApiClient.api.edit(m.id, EditBody(body.trim())) }
    }

    fun delete(m: ChatMessage) {
        viewModelScope.launch {
            runCatching { ApiClient.api.delete(m.id) }
                .onSuccess { _state.update { s -> s.copy(messages = s.messages.filterNot { it.id == m.id }) } }
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
                .onSuccess { runCatching { ApiClient.api.channel(channelId) }.onSuccess { ch -> _state.update { it.copy(channel = ch) } } }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
        }
    }

    suspend fun pins(): List<ChatMessage> = runCatching { ApiClient.api.pins(channelId).messages }.getOrDefault(emptyList())

    fun clearError() = _state.update { it.copy(error = null) }

    fun clearFocus() = _state.update { it.copy(focusMessageId = null) }

    /** ✓✓ cuando todos los demás miembros ya leyeron hasta ese mensaje (en directos, la otra persona). */
    fun readByAll(m: ChatMessage): Boolean {
        val others = _state.value.channel?.members?.filter { it.id != myId }.orEmpty()
        if (others.isEmpty()) return false
        val at = runCatching { Instant.parse(m.createdAt) }.getOrNull() ?: return false
        return others.all { mem -> mem.lastReadAt?.let { runCatching { !Instant.parse(it).isBefore(at) }.getOrDefault(false) } == true }
    }

    override fun onCleared() {
        ActiveConversation.close(channelId)
        // El hilo comparte sala con su canal: solo sale la pantalla principal.
        if (parentId == null) RealtimeClient.leave(channelId)
        super.onCleared()
    }

    companion object {
        const val MAX_UPLOAD_BYTES = 20 * 1024 * 1024
        const val EDIT_WINDOW_MS = 60 * 60 * 1000L
    }
}
