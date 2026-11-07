package com.artaproducciones.ops.ui.modules

import com.artaproducciones.ops.data.api.EventSummaryDto
import com.artaproducciones.ops.data.api.TaskDto
import com.artaproducciones.ops.data.api.TaskEventRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime

/**
 * El día de un vencimiento se cuenta en la zona de la persona cuando trae hora (como `MDate.dueDay` en iOS):
 * las 19:00 de Puebla son `…T01:00Z` del día siguiente y siguen siendo hoy. Sin hora, el día de la cadena.
 */
class DueDateTest {
    private val puebla: ZoneId = ZoneId.of("America/Mexico_City")
    private val today: LocalDate = LocalDate.of(2026, 11, 7)

    /** Mediodía del 7 de noviembre en Puebla. */
    private val noon: ZonedDateTime = ZonedDateTime.of(2026, 11, 7, 12, 0, 0, 0, puebla)

    @Test
    fun aDueTimeTonightInPueblaIsStillToday() {
        val tonight = "2026-11-08T01:00:00.000Z" // 19:00 en Puebla
        assertEquals(today, dueDate(tonight, puebla))
        assertEquals(LocalDate.of(2026, 11, 8), dueDate(tonight, ZoneOffset.UTC))
        // Medianoche en otra zona también es una hora elegida: se convierte.
        assertEquals(today, dueDate("2026-11-07T00:00:00-06:00", puebla))
    }

    @Test
    fun aDateOnlyDueKeepsItsDayInAnyZone() {
        assertEquals(today, dueDate("2026-11-07", puebla))
        assertEquals(today, dueDate("2026-11-07T00:00:00.000Z", puebla))
        assertEquals(today, dueDate("2026-11-07T00:00:00.000Z", ZoneId.of("Pacific/Auckland")))
        assertNull(dueDate(null))
        assertNull(dueDate("hoy"))
        assertNull(dueDate("2026-11"))
    }

    @Test
    fun bucketsFollowTheLocalDay() {
        val task = TaskDto(id = "t", dueAt = "2026-11-08T01:00:00.000Z")
        assertEquals(DueBucket.TODAY, task.bucket(today, puebla))
        assertEquals(DueBucket.TOMORROW, task.bucket(today, ZoneOffset.UTC))
        assertEquals(DueBucket.OVERDUE, task.bucket(LocalDate.of(2026, 11, 8), puebla))
        assertEquals(DueBucket.DONE, task.copy(status = "DONE").bucket(today, puebla))
        assertEquals(DueBucket.NONE, task.copy(dueAt = null).bucket(today, puebla))
    }

    /** La línea de tiempo de Inicio: lo sin hora primero y luego por hora local, eventos y tareas mezclados. */
    @Test
    fun theTimelineOrdersByLocalTimeWithTheDatelessFirst() {
        val continuing = EventSummaryDto(id = "e0", name = "Festival", startsAt = "2026-11-06T18:00:00.000Z", endsAt = "2026-11-09T06:00:00.000Z")
        val tonight = EventSummaryDto(id = "e1", name = "Boleros", venue = "Teatro", startsAt = "2026-11-08T02:00:00.000Z") // 20:00
        val rider = TaskDto(id = "t1", title = "Rider", dueAt = "2026-11-08T01:00:00.000Z", event = TaskEventRef("e1", "Boleros")) // 19:00

        val moments = momentsOf(listOf(tonight, continuing), listOf(rider), today, noon)

        assertEquals(listOf("Hoy", "19:00", "20:00"), moments.map { it.time })
        assertEquals(listOf(null, "t1", null), moments.map { it.taskId })
        assertEquals(listOf("e0", "e1", "e1"), moments.map { it.eventId })
        // Con dos eventos cada renglón lleva el nombre; la tarea dice de qué evento es.
        assertEquals("Festival", moments[0].title)
        assertEquals("Rider", moments[1].title)
        assertEquals("Boleros", moments[1].detail)
        assertEquals("Boleros", moments[2].title)
        assertEquals("Teatro", moments[2].detail)
        // Lo que ya empezó va relleno; lo que falta, en contorno.
        assertTrue(moments[0].done)
        assertEquals("en curso", moments[0].detail)
        assertFalse(moments[1].done)
        assertFalse(moments[2].done)
    }

    /** Un solo evento: «Inicio» y «Cierre» sin repetir su nombre, y la tarea con hora entre los dos. */
    @Test
    fun aSingleEventSaysStartAndClose() {
        val show = EventSummaryDto(id = "e1", name = "Boleros", startsAt = "2026-11-07T16:00:00.000Z", endsAt = "2026-11-08T04:00:00.000Z") // 10:00 – 22:00
        val task = TaskDto(id = "t1", title = "Sonido", dueAt = "2026-11-07T20:30:00.000Z") // 14:30
        val moments = momentsOf(listOf(show), listOf(task), today, noon)
        assertEquals(listOf("10:00", "14:30", "22:00"), moments.map { it.time })
        assertEquals(listOf("Inicio", "Sonido", "Cierre"), moments.map { it.title })
        assertEquals("Tarea", moments[1].detail)
        assertNull(moments[2].detail)
        assertTrue(moments[0].done)
        assertFalse(moments[2].done)
    }
}
