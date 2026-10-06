package com.artaproducciones.ops.data.realtime

import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.BlockedUser
import com.artaproducciones.ops.data.api.ChatMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant

/** Mensajes sin los de personas bloqueadas. Pura (sin Android): la prueba la usa directo. */
fun List<ChatMessage>.withoutBlocked(blocked: Set<String>): List<ChatMessage> =
    if (blocked.isEmpty()) this else filterNot { isFromBlocked(it.author.id, blocked) }

/** Un id vacío (mensaje de sistema, autor desconocido) nunca cuenta como bloqueado. */
fun isFromBlocked(senderId: String?, blocked: Set<String>): Boolean =
    !senderId.isNullOrBlank() && senderId in blocked

/** [list] con [user] al principio, sin duplicarlo si ya estaba. */
fun addBlocked(list: List<BlockedUser>, user: BlockedUser): List<BlockedUser> =
    if (list.any { it.id == user.id }) list else listOf(user) + list

/**
 * Personas que YO bloqueé en el chat (`GET /chat/blocks`), compartidas por la conversación,
 * el socket y «Más › Usuarios bloqueados». Se carga al entrar al chat; bloquear y desbloquear
 * la actualizan al momento. Contrato: docs/chat-reportar-bloquear.md.
 */
object ChatBlocks {
    private val _users = MutableStateFlow<List<BlockedUser>>(emptyList())
    val users: StateFlow<List<BlockedUser>> = _users

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Usuario para el que ya se pidió la lista: otra cuenta en el mismo teléfono la vuelve a pedir. */
    @Volatile
    private var loadedFor: String? = null

    val ids: Set<String> get() = _users.value.mapTo(HashSet()) { it.id }

    /** Lo usa el socket en su propio hilo: lectura directa del StateFlow, sin bloqueo. */
    fun isBlocked(userId: String?): Boolean = !userId.isNullOrBlank() && _users.value.any { it.id == userId }

    /** Al entrar al chat. Con [refresh] se vuelve a pedir aunque ya esté cargada. */
    fun ensureLoaded(refresh: Boolean = false) {
        val me = Session.currentUser?.id ?: return
        synchronized(this) {
            if (loadedFor == me && !refresh) return
            if (loadedFor != me) _users.value = emptyList()
            loadedFor = me
        }
        scope.launch {
            if (refresh().isFailure) synchronized(this@ChatBlocks) { if (loadedFor == me) loadedFor = null }
        }
    }

    suspend fun refresh(): Result<List<BlockedUser>> =
        runCatching { ApiClient.api.blocks() }.onSuccess { _users.value = it }

    /** Lanza la excepción del API para que la pantalla muestre el motivo. */
    suspend fun block(userId: String, name: String) {
        ApiClient.api.blockUser(userId)
        _users.update { addBlocked(it, BlockedUser(id = userId, name = name, blockedAt = Instant.now().toString())) }
    }

    suspend fun unblock(userId: String) {
        ApiClient.api.unblockUser(userId)
        _users.update { list -> list.filterNot { it.id == userId } }
    }
}
