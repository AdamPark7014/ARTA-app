package com.artaproducciones.ops.push

import com.artaproducciones.ops.data.BizEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
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

    @Test
    fun entityAndPassiveComeFromTheNewFields() {
        val p = PushPayload.from(mapOf("entity" to "EXPLANADA", "passive" to "1"))
        assertEquals(BizEntity.EXPLANADA, p.entity)
        assertEquals("Auditorio", p.entity?.short)
        assertTrue(p.passive)

        // Lo que manda el servidor sin esos datos (o uno viejo) sigue siendo un aviso normal.
        val old = PushPayload.from(mapOf("entity" to "", "passive" to ""))
        assertNull(old.entity)
        assertFalse(old.passive)
        assertEquals(BizEntity.ARTA, PushPayload.from(mapOf("entity" to "ARTA")).entity)
    }

    /** Una ráfaga llega con el mismo id y texto nuevo: esa se pinta; la re-entrega de FCM, no. */
    @Test
    fun burstUpdatesAreNotDuplicates() {
        fun push(title: String) = PushPayload.from(mapOf("notification_id" to "n1", "tag" to "arta-n1", "title" to title, "body" to "Noche de Boleros"))
        assertEquals(push("2 archivos").dedupeKey, push("2 archivos").dedupeKey)
        assertNotEquals(push("2 archivos").dedupeKey, push("3 archivos").dedupeKey)

        val chat = PushPayload.from(mapOf("kind" to "chat", "channel_id" to "c1", "message_id" to "m1", "title" to "Ana"))
        assertEquals("m:m1", chat.dedupeKey)
        assertNull(PushPayload.from(mapOf("silent" to "1", "notification_id" to "n1")).dedupeKey)
        assertNull(PushPayload.from(emptyMap()).dedupeKey)
    }

    @Test
    fun theSameScreenStacksAndLooseNoticesGoByCategory() {
        val a = PushPayload.from(mapOf("channel" to "tasks", "tag" to "arta-1", "thread_id" to "link:/events/e1"))
        val b = PushPayload.from(mapOf("channel" to "finance", "tag" to "arta-2", "thread_id" to "link:/events/e1"))
        assertEquals(PushGrouping.groupFor(a), PushGrouping.groupFor(b))
        assertNotEquals(ArtaNotifications.CHANNEL_TASKS, PushGrouping.groupFor(a))

        // Sin liga el API manda `thread_id = tag`: cada uno sería su propio grupo y llenaría la barra.
        val loose = PushPayload.from(mapOf("channel" to "general", "tag" to "arta-3", "thread_id" to "arta-3"))
        assertEquals(ArtaNotifications.CHANNEL_GENERAL, PushGrouping.groupFor(loose))
        assertEquals(ArtaNotifications.CHANNEL_DOCUMENTS, PushGrouping.groupFor(PushPayload.from(mapOf("channel" to "documents"))))
    }

    @Test
    fun summaryNamesTheEventWhenTheBodiesShareIt() {
        assertEquals(
            "Noche de Boleros",
            PushGrouping.subject("", listOf("Anticipo de hospedaje · ${'$'}8,400.00 · Noche de Boleros", "Confirmar el rider · Noche de Boleros")),
        )
        // Un nombre de evento con su propio separador se conserva entero.
        assertEquals(
            "Eco de Volcanes · Gira 2026",
            PushGrouping.subject("", listOf("Medios · Eco de Volcanes · Gira 2026", "Rider · Eco de Volcanes · Gira 2026")),
        )
        assertEquals("Mi hilo", PushGrouping.subject("Mi hilo", emptyList()))
        // Nada en común, un solo aviso o textos sin trozo propio: solo cuenta.
        assertNull(PushGrouping.subject("", listOf("Algo · Noche", "Otra cosa · Día")))
        assertNull(PushGrouping.subject("", listOf("Algo · Noche")))
        assertNull(PushGrouping.subject("", listOf("Noche de Boleros", "Noche de Boleros")))
        assertNull(PushGrouping.subject("", listOf("A · " + "x".repeat(60), "B · " + "x".repeat(60))))

        assertEquals("3 avisos de Noche de Boleros", PushGrouping.summaryTitle(3, "Noche de Boleros"))
        assertEquals("2 avisos", PushGrouping.summaryTitle(2, null))
    }

    @Test
    fun onlyWhatIsDecidedThereOpensApprovals() {
        assertTrue(PushPayload.from(mapOf("type" to "po.requested")).opensApprovals)
        assertTrue(PushPayload.from(mapOf("type" to "task.submitted")).opensApprovals)
        // Un formato por revisar pide «Abrir» pero se revisa en su pantalla, no en Aprobaciones.
        val checklist = PushPayload.from(mapOf("type" to "checklist.submitted"))
        assertTrue(checklist.isApproval)
        assertFalse(checklist.opensApprovals)
    }
}
