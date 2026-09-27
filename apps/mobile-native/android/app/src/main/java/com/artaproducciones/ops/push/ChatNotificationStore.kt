package com.artaproducciones.ops.push

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Últimos mensajes de cada conversación con aviso en la bandeja, para que cada
 * push nuevo se sume a la misma notificación (como WhatsApp) aunque el sistema
 * haya matado el proceso entre un mensaje y otro. También guarda las respuestas
 * enviadas desde la notificación, que se ven como «Tú».
 */
internal object ChatNotificationStore {
    private const val PREFS = "arta_chat_notifications"
    private const val MAX_MESSAGES = 8
    private const val KEY_PREFIX = "t_"

    data class Entry(
        val messageId: String,
        val senderId: String,
        val senderName: String,
        val text: String,
        val at: Long,
        val mine: Boolean = false,
    )

    data class Conversation(
        val threadId: String,
        val chatChannelId: String,
        val title: String,
        val url: String,
        val messages: List<Entry>,
        val updatedAt: Long = 0L,
    )

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Agrega [entry] sin duplicar `messageId` y devuelve la conversación resultante. */
    @Synchronized
    fun append(
        context: Context,
        threadId: String,
        chatChannelId: String,
        title: String,
        url: String,
        entry: Entry,
    ): Conversation {
        val current = read(context, threadId)
        val duplicate = entry.messageId.isNotBlank() && current?.messages?.any { it.messageId == entry.messageId } == true
        val messages = if (duplicate) current?.messages.orEmpty() else (current?.messages.orEmpty() + entry).sortedBy { it.at }.takeLast(MAX_MESSAGES)
        val conversation = Conversation(
            threadId = threadId,
            chatChannelId = chatChannelId.ifBlank { current?.chatChannelId.orEmpty() },
            title = title.ifBlank { current?.title.orEmpty() },
            url = url.ifBlank { current?.url.orEmpty() },
            messages = messages,
            updatedAt = System.currentTimeMillis(),
        )
        write(context, conversation)
        return conversation
    }

    @Synchronized
    fun get(context: Context, threadId: String): Conversation? = read(context, threadId)

    @Synchronized
    fun clear(context: Context, threadId: String) {
        if (threadId.isBlank()) return
        val p = prefs(context)
        if (p.contains(KEY_PREFIX + threadId)) commit(p.edit().remove(KEY_PREFIX + threadId))
    }

    @Synchronized
    fun clearAll(context: Context) = commit(prefs(context).edit().clear())

    private fun read(context: Context, threadId: String): Conversation? {
        val raw = prefs(context).getString(KEY_PREFIX + threadId, null) ?: return null
        return runCatching {
            val o = JSONObject(raw)
            val arr = o.optJSONArray("messages") ?: JSONArray()
            Conversation(
                threadId = threadId,
                chatChannelId = o.optString("chatChannelId"),
                title = o.optString("title"),
                url = o.optString("url"),
                updatedAt = o.optLong("updatedAt"),
                messages = (0 until arr.length()).mapNotNull { i ->
                    val m = arr.optJSONObject(i) ?: return@mapNotNull null
                    Entry(
                        messageId = m.optString("id"),
                        senderId = m.optString("senderId"),
                        senderName = m.optString("senderName"),
                        text = m.optString("text"),
                        at = m.optLong("at"),
                        mine = m.optBoolean("mine"),
                    )
                },
            )
        }.getOrNull()
    }

    private fun write(context: Context, c: Conversation) {
        val arr = JSONArray()
        c.messages.forEach { m ->
            arr.put(
                JSONObject()
                    .put("id", m.messageId)
                    .put("senderId", m.senderId)
                    .put("senderName", m.senderName)
                    .put("text", m.text)
                    .put("at", m.at)
                    .put("mine", m.mine),
            )
        }
        val o = JSONObject()
            .put("chatChannelId", c.chatChannelId)
            .put("title", c.title)
            .put("url", c.url)
            .put("updatedAt", c.updatedAt)
            .put("messages", arr)
        commit(prefs(context).edit().putString(KEY_PREFIX + c.threadId, o.toString()))
    }

    /** `commit` y no `apply`: tras el push el sistema puede matar el proceso. Nunca en el hilo principal. */
    @SuppressLint("ApplySharedPref")
    private fun commit(editor: SharedPreferences.Editor) {
        editor.commit()
    }
}
