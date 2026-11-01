package com.artaproducciones.ops.data

import com.artaproducciones.ops.data.api.NotificationDto
import com.artaproducciones.ops.data.api.NotificationPrefsDto
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/** Debe decir lo mismo que `apps/web/lib/notification-kinds.ts` y el push del API. */
class NoticeKindsTest {
    private val puebla = ZoneId.of("America/Mexico_City")
    private val now = Instant.parse("2026-11-01T18:00:00Z") // 12:00 en Puebla

    private fun notice(id: String, createdAt: String = "2026-11-01T17:00:00Z", readAt: String? = null, type: String = "task.done") =
        NotificationDto(id = id, type = type, title = id, createdAt = createdAt, readAt = readAt)

    @Test
    fun channelsMatchTheWeb() {
        assertEquals(NoticeChannel.CHAT, NoticeKinds.channelOf("chat.mention"))
        assertEquals(NoticeChannel.APPROVALS, NoticeKinds.channelOf("po.requested"))
        assertEquals(NoticeChannel.APPROVALS, NoticeKinds.channelOf("checklist.submitted"))
        assertEquals(NoticeChannel.APPROVALS, NoticeKinds.channelOf("anything.review"))
        assertEquals(NoticeChannel.APPROVALS, NoticeKinds.channelOf("campaign.created"))
        assertEquals(NoticeChannel.TASKS, NoticeKinds.channelOf("task.assigned"))
        assertEquals(NoticeChannel.FINANCE, NoticeKinds.channelOf("po.to_pay"))
        assertEquals(NoticeChannel.FINANCE, NoticeKinds.channelOf("advance.paid"))
        assertEquals(NoticeChannel.DOCUMENTS, NoticeKinds.channelOf("file.uploaded"))
        assertEquals(NoticeChannel.DOCUMENTS, NoticeKinds.channelOf("checklist.approved"))
        assertEquals(NoticeChannel.EVENTS, NoticeKinds.channelOf("ticketing.sold_out"))
        assertEquals(NoticeChannel.GENERAL, NoticeKinds.channelOf("account.updated"))
        assertEquals(NoticeChannel.GENERAL, NoticeKinds.channelOf(null))
        assertEquals(NoticeChannel.TASKS, NoticeKinds.channelOf("TASK.Assigned"))
    }

    @Test
    fun onlyWhatWaitsForTheReaderNeedsAction() {
        listOf("chat.mention", "po.requested", "task.rejected", "advance.to_pay", "checklist.returned", "x.review").forEach {
            assertTrue(it, NoticeKinds.needsAction(it))
        }
        listOf("chat.message", "task.completed", "file.uploaded", "advance.paid", "", null).forEach {
            assertFalse("$it", NoticeKinds.needsAction(it))
        }
    }

    @Test
    fun filtersFollowTheWeb() {
        val unreadAction = notice("a", type = "task.assigned")
        val unreadInfo = notice("b", type = "file.uploaded")
        val readAction = notice("c", type = "task.assigned", readAt = "2026-11-01T17:30:00Z")
        val all = listOf(unreadAction, unreadInfo, readAction)
        assertEquals(all, all.filter(NoticeFilter.ALL::matches))
        assertEquals(listOf(unreadAction, unreadInfo), all.filter(NoticeFilter.UNREAD::matches))
        assertEquals(listOf(unreadAction), all.filter(NoticeFilter.ACTION::matches))
        assertFalse(NoticeFilter.ALL.unreadOnly)
        assertTrue(NoticeFilter.UNREAD.unreadOnly && NoticeFilter.ACTION.unreadOnly)
    }

    @Test
    fun ageReadsLikeTheWeb() {
        assertEquals("ahora", NoticeKinds.age("2026-11-01T17:59:50Z", now, puebla))
        assertEquals("hace 5 min", NoticeKinds.age("2026-11-01T17:55:00Z", now, puebla))
        assertEquals("hace 59 min", NoticeKinds.age("2026-11-01T17:01:00Z", now, puebla))
        assertEquals("hace 3 h", NoticeKinds.age("2026-11-01T15:00:00Z", now, puebla))
        assertTrue(NoticeKinds.age("2026-10-20T15:00:00Z", now, puebla).startsWith("20 "))
        assertFalse(NoticeKinds.age("2026-10-20T15:00:00Z", now, puebla).contains("."))
        assertTrue(NoticeKinds.age("2025-10-20T15:00:00Z", now, puebla).endsWith("2025"))
        assertEquals("", NoticeKinds.age(null, now, puebla))
    }

    /** 23:30 de ayer en Puebla hace 12 horas y media sigue siendo «Ayer», no «Hoy». */
    @Test
    fun daysAreCalendarDaysInTheLocalZone() {
        assertEquals(NoticeDay.TODAY, NoticeKinds.dayOf("2026-11-01T07:00:00Z", now, puebla))
        assertEquals(NoticeDay.YESTERDAY, NoticeKinds.dayOf("2026-11-01T05:30:00Z", now, puebla))
        assertEquals(NoticeDay.EARLIER, NoticeKinds.dayOf("2026-10-30T18:00:00Z", now, puebla))
        // Un reloj atrasado no manda el aviso a un día futuro.
        assertEquals(NoticeDay.TODAY, NoticeKinds.dayOf("2026-11-02T18:00:00Z", now, puebla))
    }

    @Test
    fun groupsKeepTheOrderOfTheList() {
        val groups = NoticeKinds.group(
            listOf(
                notice("a", "2026-11-01T17:00:00Z"),
                notice("b", "2026-11-01T16:00:00Z"),
                notice("c", "2026-10-31T17:00:00Z"),
                notice("d", "2026-10-01T17:00:00Z"),
            ),
            { it.createdAt },
            now,
            puebla,
        )
        assertEquals(listOf(NoticeDay.TODAY, NoticeDay.YESTERDAY, NoticeDay.EARLIER), groups.map { it.day })
        assertEquals(listOf("a", "b"), groups[0].items.map { it.id })
        assertEquals(listOf("Hoy", "Ayer", "Antes"), groups.map { it.day.label })
    }

    @Test
    fun firstPageKeepsWhatWasLoadedBelow() {
        val old = NoticeFeed(listOf(notice("n2", "2026-11-01T12:00:00Z"), notice("n1", "2026-11-01T11:00:00Z")), hasMore = true)
        val page = listOf(notice("n3", "2026-11-01T13:00:00Z"), notice("n2", "2026-11-01T12:00:00Z", readAt = "x"))
        val merged = old.withFirstPage(page, pageSize = 2)
        assertEquals(listOf("n3", "n2", "n1"), merged.items.map { it.id })
        assertEquals("x", merged.items[1].readAt)
        assertTrue(merged.hasMore)
    }

    @Test
    fun anIncompleteFirstPageIsAllThereIs() {
        val old = NoticeFeed(listOf(notice("n1"), notice("gone", "2026-10-01T00:00:00Z")), hasMore = true)
        val merged = old.withFirstPage(listOf(notice("n1")), pageSize = 30)
        assertEquals(listOf("n1"), merged.items.map { it.id })
        assertFalse(merged.hasMore)
    }

    @Test
    fun nextPageSkipsRepeatedAndKnowsWhenItEnds() {
        val feed = NoticeFeed(listOf(notice("a")), hasMore = true)
        val full = feed.withNextPage(listOf(notice("a"), notice("b")), pageSize = 2)
        assertEquals(listOf("a", "b"), full.items.map { it.id })
        assertTrue(full.hasMore)
        assertFalse(full.withNextPage(listOf(notice("c")), pageSize = 2).hasMore)
    }

    @Test
    fun readAndUndo() {
        val feed = NoticeFeed(listOf(notice("a"), notice("b", readAt = "antes")))
        val one = feed.read("a", "ahora")
        assertEquals("ahora", one.items[0].readAt)
        assertEquals("antes", one.items[1].readAt)
        assertNull(one.unread("a").items[0].readAt)
        assertEquals(listOf("ahora", "antes"), feed.read(null, "ahora").items.map { it.readAt })
    }

    @Test
    fun mutingKeepsTheApiOrderWithoutRepeats() {
        var prefs = NotificationPrefsDto()
        prefs = NoticeKinds.withChannel(prefs, NoticeChannel.GENERAL, on = false)
        prefs = NoticeKinds.withChannel(prefs, NoticeChannel.CHAT, on = false)
        prefs = NoticeKinds.withChannel(prefs, NoticeChannel.CHAT, on = false)
        assertEquals(listOf("chat", "general"), prefs.muted)
        assertEquals(listOf("general"), NoticeKinds.withChannel(prefs, NoticeChannel.CHAT, on = true).muted)
    }

    @Test
    fun hoursRoundTrip() {
        assertEquals(22 to 0, NoticeKinds.parseHhMm("22:00"))
        assertEquals(7 to 5, NoticeKinds.parseHhMm("07:05"))
        assertEquals(22 to 0, NoticeKinds.parseHhMm("25:99"))
        assertEquals("07:05", NoticeKinds.hhMm(7, 5))
    }

    /** El contrato con el API: `bundleCount` es nuevo y el servidor viejo no lo manda. */
    @Test
    fun parsesApiRows() {
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val row = moshi.adapter(NotificationDto::class.java).fromJson(
            """{"id":"n","type":"file.uploaded","title":"t","createdAt":"2026-11-01T17:00:00Z","readAt":null,"entity":"ARTA","bundleCount":3,"extra":1}""",
        )!!
        assertEquals(3, row.bundleCount)
        assertEquals("ARTA", row.entity)
        val old = moshi.adapter(NotificationDto::class.java).fromJson("""{"id":"n","type":"x","title":"t","createdAt":"2026-11-01T17:00:00Z"}""")!!
        assertEquals(1, old.bundleCount)
        val prefs = moshi.adapter(NotificationPrefsDto::class.java).fromJson(
            """{"muted":["chat"],"quietHours":{"enabled":true,"start":"23:00","end":"06:30"}}""",
        )!!
        assertEquals(listOf("chat"), prefs.muted)
        assertTrue(prefs.quietHours.enabled)
        assertEquals("06:30", prefs.quietHours.end)
        assertEquals(
            """{"muted":[],"quietHours":{"enabled":false,"start":"22:00","end":"07:00"}}""",
            moshi.adapter(NotificationPrefsDto::class.java).toJson(NotificationPrefsDto()),
        )
    }
}
