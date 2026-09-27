package com.artaproducciones.ops.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class PushPayloadTest {

    @Test
    fun chatPayloadGoesToChatChannel() {
        val p = PushPayload.from(
            mapOf(
                "kind" to "chat",
                "channel" to "chat",
                "channel_id" to "c1",
                "thread_id" to "chat-c1",
                "sender_name" to "Ana López",
                "message_id" to "m9",
                "badge" to "3",
            ),
        )
        assertTrue(p.isChat)
        assertEquals(ArtaNotifications.CHANNEL_CHAT, p.androidChannel)
        assertEquals("c1", p.chatChannelId)
        assertEquals("chat-c1", p.threadId)
        assertEquals("Ana López", p.senderName)
        assertEquals("m9", p.messageId)
        assertEquals(3, p.badge)
        assertFalse(p.silent)
    }

    @Test
    fun processPayloadUsesRoutingChannel() {
        val p = PushPayload.from(mapOf("channel" to "finance", "type" to "po.to_pay", "tag" to "po-1"))
        assertEquals(PushPayload.Kind.EVENT, p.kind)
        assertEquals(ArtaNotifications.CHANNEL_FINANCE, p.androidChannel)
        assertEquals("po-1", p.threadId)
        assertNull(p.badge)
    }

    @Test
    fun unknownRoutingFallsBackToGeneral() {
        val p = PushPayload.from(mapOf("channel" to "whatever"))
        assertEquals(ArtaNotifications.CHANNEL_GENERAL, p.androidChannel)
    }

    @Test
    fun silentFlag() {
        assertTrue(PushPayload.from(mapOf("silent" to "1", "type" to "chat.read")).silent)
    }

    @Test
    fun missingThreadIdFallsBackToChannel() {
        val p = PushPayload.from(mapOf("kind" to "chat", "channel_id" to "c7"))
        assertEquals("chat-c7", p.threadId)
    }

    @Test
    fun sentAtParsing() {
        val iso = "2026-09-26T18:30:00.000Z"
        assertEquals(Instant.parse(iso).toEpochMilli(), PushPayload.from(mapOf("sent_at" to iso)).sentAtMillis)
        assertEquals(1_700_000_000_000L, PushPayload.parseIso("1700000000"))
        assertEquals(1_700_000_000_123L, PushPayload.parseIso("1700000000123"))
        assertEquals(42L, PushPayload.from(emptyMap(), fallbackSentAt = 42L).sentAtMillis)
        assertNull(PushPayload.parseIso("nope"))
    }
}
