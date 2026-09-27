package com.artaproducciones.ops.push

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class PushPayloadTest {

    @Test
    fun testChatPayloadWithKindChat() {
        val payload = PushPayload.from(mapOf(
            "kind" to "chat",
            "channel_id" to "123",
            "thread_id" to "456",
            "sender_name" to "John"
        ))
        assertEquals(PushKind.CHAT, payload.kind)
        assertEquals(ChannelType.CHANNEL_CHAT, payload.channelType)
        assertEquals("123", payload.channelId)
        assertEquals("456", payload.threadId)
        assertEquals("John", payload.senderName)
    }

    @Test
    fun testEventPayloadWithChannelFinance() {
        val payload = PushPayload.from(mapOf(
            "channel" to "finance"
        ))
        assertEquals(PushKind.CHAT, payload.kind)
        assertEquals(ChannelType.CHANNEL_FINANCE, payload.channelType)
        assertEquals("finance", payload.channelId)
        assertNull(payload.threadId)
        assertNull(payload.senderName)
    }

    @Test
    fun testSilentFieldSetsSilent() {
        val payload = PushPayload.from(mapOf(
            "silent" to "1"
        ))
        assertTrue(payload.isSilent)
    }

    @Test
    fun testSentAtIsoParsedToEpochMillis() {
        val isoString = "2023-04-10T12:34:56Z"
        val expectedEpochMillis = Instant.parse(isoString).toEpochMilli()
        val payload = PushPayload.from(mapOf(
            "sent_at" to isoString
        ))
        assertEquals(expectedEpochMillis, payload.sentAt)
    }

    @Test
    fun testMissingThreadIdFallsBackToChatChannelId() {
        val payload = PushPayload.from(mapOf(
            "kind" to "chat",
            "channel_id" to "123"
        ))
        assertEquals("chat-123", payload.threadId)
    }
}