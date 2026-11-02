package com.artaproducciones.ops.ui.cartelera

import com.artaproducciones.ops.data.api.PublicShowDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

/** La app tiene que decir lo mismo que el sitio: `apps/web/lib/site-format.ts`. */
class CarteleraRulesTest {
    private val today = LocalDate.of(2026, 11, 2)

    private fun show(
        date: String? = "2026-11-04T12:00:00.000Z",
        time: String? = "20:00",
        href: String? = "https://www.eticket.mx/masinformacion.aspx?idevento=36266",
        status: String? = null,
    ) = PublicShowDto(
        id = "1",
        slug = "soy-luna",
        title = "Soy Luna",
        eventDate = date,
        eventTime = time,
        venue = "Auditorio GNP Seguros",
        city = "Puebla",
        ctaHref = href,
        showStatus = status,
    )

    @Test
    fun `la fecha se lee en UTC y no se corre de dia`() {
        assertEquals(LocalDate.of(2026, 11, 4), CarteleraRules.date(show()))
        assertEquals("4 de noviembre", CarteleraRules.dayMonth(show(), today))
    }

    @Test
    fun `el anio solo sale si no es este`() {
        assertEquals("19 de febrero de 2027", CarteleraRules.dayMonth(show(date = "2027-02-19T12:00:00.000Z"), today))
    }

    @Test
    fun `sin enlace es proximamente y con enlace esta a la venta`() {
        assertEquals("venta", CarteleraRules.status(show()))
        assertEquals("pronto", CarteleraRules.status(show(href = null)))
    }

    @Test
    fun `solo se ofrece comprar si esta a la venta y el enlace es seguro`() {
        assertEquals(show().ctaHref, CarteleraRules.ticketUrl(show()))
        assertNull(CarteleraRules.ticketUrl(show(status = "agotado")))
        assertNull(CarteleraRules.ticketUrl(show(href = "http://inseguro.example")))
        assertNull(CarteleraRules.ticketUrl(show(href = "javascript:alert(1)")))
    }

    @Test
    fun `cuenta los dias y sabe cuando ya paso`() {
        assertEquals("Faltan 2 días", CarteleraRules.countdown(show(), today))
        assertEquals("Es mañana", CarteleraRules.countdown(show(), LocalDate.of(2026, 11, 3)))
        assertEquals("Es hoy", CarteleraRules.countdown(show(), LocalDate.of(2026, 11, 4)))
        assertNull(CarteleraRules.countdown(show(), LocalDate.of(2026, 11, 5)))
        assertFalse(CarteleraRules.isPast(show(), LocalDate.of(2026, 11, 4)))
        assertTrue(CarteleraRules.isPast(show(), LocalDate.of(2026, 11, 5)))
    }

    @Test
    fun `la hora se lee como en el sitio`() {
        assertEquals("8:00 p. m.", CarteleraRules.timeLabel(show()))
        assertEquals("12:30 p. m.", CarteleraRules.timeLabel(show(time = "12:30")))
        assertNull(CarteleraRules.timeLabel(show(time = null)))
    }

    @Test
    fun `el calendario usa la hora de Puebla y sin hora es de todo el dia`() {
        val span = CarteleraRules.calendarSpan(show())!!
        assertEquals(Instant.parse("2026-11-05T02:00:00Z").toEpochMilli(), span.startMillis)
        assertEquals(Instant.parse("2026-11-05T05:00:00Z").toEpochMilli(), span.endMillis)
        assertFalse(span.allDay)
        assertTrue(CarteleraRules.calendarSpan(show(time = null))!!.allDay)
        assertNull(CarteleraRules.calendarSpan(show(date = null)))
    }
}
