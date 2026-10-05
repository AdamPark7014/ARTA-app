package com.artaproducciones.ops.demo

import okhttp3.HttpUrl.Companion.toHttpUrl
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
        assertEquals(listOf("events?entity=ARTA&scope=current", "events?entity=ARTA", "events"), DemoKeys.candidates("events", url))
    }

    @Test
    fun keyWithoutEntityOrScopeIsThePath() {
        val url = "https://arta.artaproducciones.com/api/notifications?take=60".toHttpUrl()
        assertEquals(listOf("notifications"), DemoKeys.candidates("notifications", url))
        val scoped = "https://arta.artaproducciones.com/api/events?scope=active".toHttpUrl()
        assertEquals(listOf("events?scope=active", "events"), DemoKeys.candidates("events", scoped))
    }
}
