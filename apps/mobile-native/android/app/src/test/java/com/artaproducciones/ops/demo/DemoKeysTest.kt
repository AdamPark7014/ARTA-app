package com.artaproducciones.ops.demo

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class DemoKeysTest {
    private val base = "https://arta.artaproducciones.com/api/".toHttpUrl()

    @Test
    fun pathIsRelativeToApiBase() {
        assertEquals("chat/channels/c1/messages", DemoKeys.apiPath("https://arta.artaproducciones.com/api/chat/channels/c1/messages?limit=50".toHttpUrl(), base))
        assertEquals("auth/me", DemoKeys.apiPath("https://arta.artaproducciones.com/api/auth/me".toHttpUrl(), base))
    }

    @Test
    fun uploadsAndOtherHostsAreNotApi() {
        assertNull(DemoKeys.apiPath("https://arta.artaproducciones.com/uploads/chat/a.jpg".toHttpUrl(), base))
        assertNull(DemoKeys.apiPath("https://otro.example.com/api/auth/me".toHttpUrl(), base))
    }

    @Test
    fun keyKeepsOnlyEntityAndScopeSorted() {
        val url = "https://arta.artaproducciones.com/api/events?scope=current&take=20&entity=ARTA".toHttpUrl()
        assertEquals(
            listOf("events?entity=ARTA&scope=current", "events?entity=ARTA", "events?scope=current", "events"),
            DemoKeys.candidates("events", url),
        )
    }

    @Test
    fun keyWithoutEntityOrScopeIsThePath() {
        val url = "https://arta.artaproducciones.com/api/notifications?take=60".toHttpUrl()
        assertEquals(listOf("notifications"), DemoKeys.candidates("notifications", url))
        val scoped = "https://arta.artaproducciones.com/api/events?scope=active".toHttpUrl()
        assertEquals(listOf("events?scope=active", "events"), DemoKeys.candidates("events", scoped))
    }

    @Test
    fun entityOnlyFallsBackToThePath() {
        // Las apps mandan la entidad activa en todo listado; lo grabado sin ella sigue sirviendo.
        val url = "https://arta.artaproducciones.com/api/tasks/mine?entity=EXPLANADA".toHttpUrl()
        assertEquals(listOf("tasks/mine?entity=EXPLANADA", "tasks/mine"), DemoKeys.candidates("tasks/mine", url))
    }
}

/** Los avisos del modo demo se comportan como `GET /notifications` del API, sin red. */
class DemoNoticesTest {
    private val raw = JSONArray()
        .put(JSONObject().put("id", "c").put("createdAt", "2026-10-03T00:00:00.000Z").put("readAt", JSONObject.NULL))
        .put(JSONObject().put("id", "a").put("createdAt", "2026-10-05T00:00:00.000Z").put("readAt", JSONObject.NULL))
        .put(JSONObject().put("id", "b").put("createdAt", "2026-10-04T00:00:00.000Z").put("readAt", "2026-10-04T01:00:00.000Z"))
        .toString()

    private fun ids(query: String): List<String> {
        val page = JSONArray(DemoNotices.page(raw, "https://arta.artaproducciones.com/api/notifications?$query".toHttpUrl()))
        return (0 until page.length()).map { page.getJSONObject(it).getString("id") }
    }

    @Test
    fun newestFirstAndTakeLimits() {
        assertEquals(listOf("a", "b", "c"), ids("take=30"))
        assertEquals(listOf("a"), ids("take=1"))
    }

    @Test
    fun beforeIsTheNextPage() {
        assertEquals(listOf("b", "c"), ids("take=30&before=2026-10-05T00:00:00.000Z"))
        assertEquals(emptyList<String>(), ids("take=30&before=2026-10-03T00:00:00.000Z"))
    }

    @Test
    fun unreadLeavesOnlyUnread() {
        assertEquals(listOf("a", "c"), ids("take=30&unread=1"))
    }

    @Test
    fun prefsAlwaysHaveTheFullShape() {
        val defaults = JSONObject(DemoNotices.DEFAULT_PREFS)
        assertEquals(defaults.toString(), DemoNotices.normalizePrefs(JSONObject()).toString())

        val saved = DemoNotices.normalizePrefs(
            JSONObject()
                .put("muted", JSONArray().put("general").put("inventada").put("chat"))
                .put("quietHours", JSONObject().put("enabled", true).put("start", "23:15").put("end", "25:00")),
        )
        assertEquals(listOf("chat", "general"), saved.getJSONArray("muted").let { a -> (0 until a.length()).map { a.getString(it) } })
        val quiet = saved.getJSONObject("quietHours")
        assertEquals(true, quiet.getBoolean("enabled"))
        assertEquals("23:15", quiet.getString("start"))
        assertEquals("07:00", quiet.getString("end"))
    }
}

class DemoEntitiesTest {
    private val events = mapOf("e-arta" to "ARTA", "e-aud" to "EXPLANADA")
    private fun eventEntity(id: String): String? = events[id]

    private fun ids(raw: String): List<String> = JSONArray(raw).let { a -> (0 until a.length()).map { a.getJSONObject(it).getString("id") } }

    @Test
    fun tasksUseTheirEntityTheirEventOrArta() {
        val raw = JSONArray()
            .put(JSONObject().put("id", "own").put("entity", "EXPLANADA"))
            .put(JSONObject().put("id", "nested").put("event", JSONObject().put("entity", "EXPLANADA")))
            .put(JSONObject().put("id", "by-id").put("eventId", "e-aud"))
            .put(JSONObject().put("id", "arta-event").put("eventId", "e-arta"))
            .put(JSONObject().put("id", "no-event").put("eventId", JSONObject.NULL))
            .toString()
        assertEquals(listOf("own", "nested", "by-id"), ids(DemoEntities.filter("tasks/mine", raw, "EXPLANADA", ::eventEntity)))
        assertEquals(listOf("arta-event", "no-event"), ids(DemoEntities.filter("tasks/mine", raw, "ARTA", ::eventEntity)))
    }

    @Test
    fun directMessagesShowInBothEntities() {
        val raw = JSONArray()
            .put(JSONObject().put("id", "dm").put("kind", "DIRECT"))
            .put(JSONObject().put("id", "group").put("kind", "PRIVATE").put("isGroupDm", true))
            .put(JSONObject().put("id", "general").put("kind", "PUBLIC"))
            .put(JSONObject().put("id", "show").put("kind", "PUBLIC").put("eventId", "e-aud"))
            .toString()
        assertEquals(listOf("dm", "group", "show"), ids(DemoEntities.filter("chat/channels", raw, "EXPLANADA", ::eventEntity)))
        assertEquals(listOf("dm", "group", "general"), ids(DemoEntities.filter("chat/channels", raw, "ARTA", ::eventEntity)))
    }

    @Test
    fun objectsAreNotFiltered() {
        val raw = """{"total":4}"""
        assertEquals(raw, DemoEntities.filter("chat/unread", raw, "EXPLANADA", ::eventEntity))
    }
}

class DemoClockTest {
    private val mx = ZoneId.of("America/Mexico_City")

    @Test
    fun recordingIsTheLatestNoticeOrChat() {
        val notices = """[{"createdAt":"2026-10-05T00:33:40.463Z"},{"createdAt":null}]"""
        val chats = """[{"lastMessageAt":"2026-10-05T00:53:40.463Z"}]"""
        assertEquals(
            Instant.parse("2026-10-05T00:53:40.463Z"),
            DemoClock.latest(listOf(notices to "createdAt", chats to "lastMessageAt", null to "createdAt")),
        )
        assertNull(DemoClock.latest(listOf(null to "createdAt", "{}" to "createdAt")))
    }

    @Test
    fun offsetCountsLocalCalendarDays() {
        // 00:53 UTC del 5 es todavía el 4 en México: a 21 son 17 días.
        val recorded = Instant.parse("2026-10-05T00:53:40.463Z")
        assertEquals(17L, DemoClock.dayOffset(recorded, LocalDate.of(2026, 10, 21), mx))
        assertEquals(0L, DemoClock.dayOffset(null, LocalDate.of(2026, 10, 21), mx))
    }

    @Test
    fun shiftMovesInstantsAndDaysKeepingTheFormat() {
        val raw = """{"dueAt":"2026-10-05T01:08:40.463Z","at":"2026-10-04T18:00:00Z","date":"2026-10-29","name":"Gira 2026-10-29 x"}"""
        assertEquals(
            """{"dueAt":"2026-10-22T01:08:40.463Z","at":"2026-10-21T18:00:00Z","date":"2026-11-15","name":"Gira 2026-10-29 x"}""",
            DemoClock.shift(raw, 17, mx),
        )
        assertEquals(raw, DemoClock.shift(raw, 0, mx))
    }
}
