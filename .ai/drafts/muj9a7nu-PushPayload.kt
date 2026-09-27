package com.artaproducciones.ops.push

import java.time.ZonedDateTime

data class PushPayload(
    val title: String,
    val body: String,
    val url: String,
    val priority: String,
    val channel: String,
    val type: String,
    val kind: String,
    val tag: String,
    val notification_id: String,
    val sender_id: String,
    val sender_name: String,
    val thread_id: String,
    val thread_title: String,
    val channel_id: String,
    val message_id: String,
    val badge: Int,
    val sent_at: ZonedDateTime,
    val silent: Boolean
) {

    companion object {
        fun from(data: Map<String, Any>): PushPayload {
            return PushPayload(
                title = data["title"] as String,
                body = data["body"] as String,
                url = data["url"] as String,
                priority = data["priority"] as String,
                channel = data["channel"] as String,
                type = data["type"] as String,
                kind = data["kind"] as String,
                tag = data["tag"] as String,
                notification_id = data["notification_id"] as String,
                sender_id = data["sender_id"] as String,
                sender_name = data["sender_name"] as String,
                thread_id = data["thread_id"] as String,
                thread_title = data["thread_title"] as String,
                channel_id = data["channel_id"] as String,
                message_id = data["message_id"] as String,
                badge = data["badge"] as Int,
                sent_at = ZonedDateTime.parse(data["sent_at"] as String),
                silent = data["silent"] as String == "1"
            )
        }
    }

    fun isChat(): Boolean {
        return kind == "chat"
    }

    fun isSilent(): Boolean {
        return silent
    }
}