package com.artaproducciones.ops.data.realtime

import com.artaproducciones.ops.data.api.BlockedUser
import com.artaproducciones.ops.data.api.ChatAuthor
import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.ui.chat.ReportReason
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatBlocksTest {
    private fun msg(id: String, authorId: String) =
        ChatMessage(id = id, channelId = "c1", createdAt = "2026-10-06T12:00:00Z", author = ChatAuthor(authorId, "Persona $authorId"))

    @Test
    fun dropsOnlyMessagesFromBlockedSenders() {
        val list = listOf(msg("1", "ana"), msg("2", "luis"), msg("3", "ana"), msg("4", "yo"))
        assertEquals(listOf("2", "4"), list.withoutBlocked(setOf("ana")).map { it.id })
        assertEquals(listOf("4"), list.withoutBlocked(setOf("ana", "luis")).map { it.id })
    }

    @Test
    fun withoutBlocksTheListIsUntouched() {
        val list = listOf(msg("1", "ana"), msg("2", "luis"))
        assertSame(list, list.withoutBlocked(emptySet()))
    }

    @Test
    fun blankSenderIsNeverBlocked() {
        val blocked = setOf("ana", "")
        assertFalse(isFromBlocked("", blocked))
        assertFalse(isFromBlocked(null, blocked))
        assertFalse(isFromBlocked("luis", blocked))
        assertTrue(isFromBlocked("ana", blocked))
        // Un mensaje de sistema sin autor no desaparece aunque la lista traiga un id vacío.
        assertEquals(listOf("s"), listOf(msg("s", "")).withoutBlocked(blocked).map { it.id })
    }

    @Test
    fun blockingTwiceKeepsOneEntryNewestFirst() {
        val first = addBlocked(emptyList(), BlockedUser("ana", "Ana"))
        val second = addBlocked(first, BlockedUser("luis", "Luis"))
        assertEquals(listOf("luis", "ana"), second.map { it.id })
        assertSame(second, addBlocked(second, BlockedUser("ana", "Ana otra vez")))
    }

    @Test
    fun reportReasonsMatchTheApiContract() {
        assertEquals(listOf("SPAM", "ACOSO", "OFENSIVO", "OTRO"), ReportReason.entries.map { it.api })
        assertEquals(
            listOf("Spam", "Acoso o intimidación", "Contenido ofensivo o inapropiado", "Otro"),
            ReportReason.entries.map { it.label },
        )
        assertEquals(1000, ReportReason.MAX_DETAILS)
    }
}
