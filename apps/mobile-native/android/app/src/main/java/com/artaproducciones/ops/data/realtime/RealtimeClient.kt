package com.artaproducciones.ops.data.realtime

import android.util.Log
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChatMessage
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject

data class TypingEvent(val channelId: String, val userId: String, val fullName: String, val at: Long)
data class ReadEvent(val channelId: String, val userId: String, val at: String)
data class DeletedEvent(val channelId: String, val messageId: String, val parentId: String?)
data class ActivityEvent(val channelId: String, val messageId: String, val parentId: String?, val preview: String, val senderId: String)

/**
 * Socket.IO del API con la misma sesión que HTTP: el handshake manda la cookie
 * `arta_access` (el gateway la valida contra `UserSession`). Detrás de Traefik
 * el path es `/api/socket.io`.
 */
object RealtimeClient {
    private const val TAG = "ArtaRealtime"
    private var socket: Socket? = null
    private val joined = mutableSetOf<String>()
    private val messageAdapter = Moshi.Builder().add(KotlinJsonAdapterFactory()).build().adapter(ChatMessage::class.java)

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected

    private val _messages = MutableSharedFlow<ChatMessage>(extraBufferCapacity = 64)
    /** Mensajes nuevos, raíz o respuesta de hilo (ver `parentId`). */
    val messages: SharedFlow<ChatMessage> = _messages

    private val _updated = MutableSharedFlow<ChatMessage>(extraBufferCapacity = 64)
    val updated: SharedFlow<ChatMessage> = _updated

    private val _deleted = MutableSharedFlow<DeletedEvent>(extraBufferCapacity = 32)
    val deleted: SharedFlow<DeletedEvent> = _deleted

    private val _typing = MutableSharedFlow<TypingEvent>(extraBufferCapacity = 32)
    val typing: SharedFlow<TypingEvent> = _typing

    private val _reads = MutableSharedFlow<ReadEvent>(extraBufferCapacity = 32)
    val reads: SharedFlow<ReadEvent> = _reads

    private val _activity = MutableSharedFlow<ActivityEvent>(extraBufferCapacity = 64)
    /** Algo pasó en una de mis conversaciones: la lista de chats se reordena. */
    val activity: SharedFlow<ActivityEvent> = _activity

    private val _channelsChanged = MutableSharedFlow<String>(extraBufferCapacity = 16)
    /** Cambió un canal (tema, miembros, archivado, leído): recargar lista o detalle. */
    val channelsChanged: SharedFlow<String> = _channelsChanged

    private val _chatUnread = MutableSharedFlow<Int>(extraBufferCapacity = 8)
    val chatUnread: SharedFlow<Int> = _chatUnread

    private val _notificationsUnread = MutableSharedFlow<Int>(extraBufferCapacity = 8)
    val notificationsUnread: SharedFlow<Int> = _notificationsUnread

    private fun obj(args: Array<out Any?>): JSONObject? = args.firstOrNull() as? JSONObject

    private fun message(o: JSONObject): ChatMessage? = runCatching { messageAdapter.fromJson(o.toString()) }
        .onFailure { Log.w(TAG, "Mensaje ilegible: ${it.message}") }
        .getOrNull()

    private val onMessage = Emitter.Listener { args -> obj(args)?.let(::message)?.let { _messages.tryEmit(it) } }
    private val onUpdated = Emitter.Listener { args -> obj(args)?.let(::message)?.let { _updated.tryEmit(it) } }
    private val onDeleted = Emitter.Listener { args ->
        val o = obj(args) ?: return@Listener
        _deleted.tryEmit(DeletedEvent(o.optString("channelId"), o.optString("messageId"), o.optString("parentId").ifBlank { null }?.takeIf { it != "null" }))
    }
    private val onTyping = Emitter.Listener { args ->
        val o = obj(args) ?: return@Listener
        _typing.tryEmit(TypingEvent(o.optString("channelId"), o.optString("userId"), o.optString("fullName", "Alguien"), o.optLong("at", System.currentTimeMillis())))
    }
    private val onRead = Emitter.Listener { args ->
        val o = obj(args) ?: return@Listener
        _reads.tryEmit(ReadEvent(o.optString("channelId"), o.optString("userId"), o.optString("at")))
        _channelsChanged.tryEmit(o.optString("channelId"))
    }
    private val onActivity = Emitter.Listener { args ->
        val o = obj(args) ?: return@Listener
        _activity.tryEmit(
            ActivityEvent(
                channelId = o.optString("channelId"),
                messageId = o.optString("messageId"),
                parentId = o.optString("parentId").takeIf { it.isNotBlank() && it != "null" },
                preview = o.optString("preview"),
                senderId = o.optString("senderId"),
            ),
        )
    }
    private val onChannelChanged = Emitter.Listener { args -> obj(args)?.optString("channelId")?.let { _channelsChanged.tryEmit(it) } }
    private val onChatUnread = Emitter.Listener { args -> obj(args)?.let { _chatUnread.tryEmit(it.optInt("total")) } }
    private val onNotification = Emitter.Listener { args -> obj(args)?.let { _notificationsUnread.tryEmit(it.optInt("unread")) } }

    private val onConnect = Emitter.Listener {
        _connected.value = true
        // Reconexión: el servidor olvidó las salas, se vuelven a pedir.
        synchronized(joined) { joined.toList() }.forEach { emitJoin(it) }
        socket?.emit("chat:presence", JSONObject().put("status", "online"))
    }
    private val onDisconnect = Emitter.Listener { _connected.value = false }
    private val onConnectError = Emitter.Listener { args ->
        _connected.value = false
        Log.d(TAG, "Sin socket: ${args.firstOrNull()}")
    }

    @Synchronized
    fun connect() {
        if (socket?.connected() == true) return
        disconnectInternal(keepRooms = true)
        val cookie = ApiClient.cookies.cookieHeader(ApiClient.originUrl)
        if (cookie.isBlank()) return
        val opts = IO.Options.builder()
            .setPath("/api/socket.io")
            .setTransports(arrayOf("websocket", "polling"))
            .setExtraHeaders(mapOf("Cookie" to listOf(cookie)))
            .setReconnection(true)
            .setReconnectionDelay(1_000)
            .setReconnectionDelayMax(15_000)
            .build()
        val s = IO.socket(ApiClient.origin, opts)
        s.on(Socket.EVENT_CONNECT, onConnect)
        s.on(Socket.EVENT_DISCONNECT, onDisconnect)
        s.on(Socket.EVENT_CONNECT_ERROR, onConnectError)
        s.on("chat:message", onMessage)
        s.on("chat:thread-reply", onMessage)
        s.on("chat:message-updated", onUpdated)
        s.on("chat:message-deleted", onDeleted)
        s.on("chat:typing", onTyping)
        s.on("chat:read", onRead)
        s.on("chat:channel-activity", onActivity)
        s.on("chat:channel-updated", onChannelChanged)
        s.on("chat:members-changed", onChannelChanged)
        s.on("chat:unread", onChatUnread)
        s.on("notification:new", onNotification)
        socket = s
        s.connect()
    }

    @Synchronized
    fun disconnect() = disconnectInternal(keepRooms = false)

    private fun disconnectInternal(keepRooms: Boolean) {
        val s = socket ?: return
        runCatching {
            s.emit("chat:presence", JSONObject().put("status", "away"))
            s.off()
            s.disconnect()
            s.close()
        }
        socket = null
        _connected.value = false
        if (!keepRooms) synchronized(joined) { joined.clear() }
    }

    fun join(channelId: String) {
        if (channelId.isBlank()) return
        synchronized(joined) { joined.add(channelId) }
        emitJoin(channelId)
    }

    fun leave(channelId: String) {
        synchronized(joined) { joined.remove(channelId) }
        socket?.emit("chat:leave", JSONObject().put("channelId", channelId))
    }

    fun typing(channelId: String) {
        socket?.emit("chat:typing", JSONObject().put("channelId", channelId))
    }

    private fun emitJoin(channelId: String) {
        socket?.emit("chat:join", JSONObject().put("channelId", channelId))
    }
}
