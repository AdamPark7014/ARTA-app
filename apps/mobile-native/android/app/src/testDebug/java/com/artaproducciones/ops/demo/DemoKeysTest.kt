package com.artaproducciones.ops.demo

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

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
