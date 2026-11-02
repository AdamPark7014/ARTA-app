package com.artaproducciones.ops.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.OffsetDateTime
import java.util.TimeZone

/** Horario de Puebla, alarma y cola de la ubicación del equipo (docs/UBICACION.md). */
class LocationRulesTest {
    private val minute = 60_000L
    private val hour = 60 * minute

    /** Hora de Puebla (México ya no cambia de horario: siempre UTC-6). */
    private fun puebla(time: String, day: String = "2026-11-02"): Instant =
        OffsetDateTime.parse("${day}T$time-06:00").toInstant()

    private fun withDefaultZone(zone: String, block: () -> Unit) {
        val original = TimeZone.getDefault()
        try {
            TimeZone.setDefault(TimeZone.getTimeZone(zone))
            block()
        } finally {
            TimeZone.setDefault(original)
        }
    }

    // ─── Horario ─────────────────────────────────────────────────────────────

    @Test
    fun theWindowIsFromTenToSix() {
        assertFalse(LocationRules.inWindow(puebla("09:59:00")))
        assertFalse(LocationRules.inWindow(puebla("09:59:59")))
        assertTrue(LocationRules.inWindow(puebla("10:00:00")))
        assertTrue(LocationRules.inWindow(puebla("17:59:00")))
        assertTrue(LocationRules.inWindow(puebla("17:59:59")))
        assertFalse(LocationRules.inWindow(puebla("18:00:00")))
    }

    @Test
    fun theWindowIsTheSameWhereverThePhoneIs() {
        listOf("Asia/Tokyo", "America/Tijuana", "UTC", "Europe/Madrid").forEach { zone ->
            withDefaultZone(zone) {
                assertFalse(zone, LocationRules.inWindow(puebla("09:59:00")))
                assertTrue(zone, LocationRules.inWindow(puebla("10:00:00")))
                assertTrue(zone, LocationRules.inWindow(puebla("17:59:00")))
                assertFalse(zone, LocationRules.inWindow(puebla("18:00:00")))
            }
        }
    }

    @Test
    fun theWindowFollowsPueblaAndNotUtc() {
        assertTrue(LocationRules.inWindow(Instant.parse("2026-11-02T16:00:00Z")))
        assertFalse(LocationRules.inWindow(Instant.parse("2026-11-03T00:00:00Z")))
        // En julio también: México ya no adelanta el reloj.
        assertFalse(LocationRules.inWindow(Instant.parse("2026-07-15T15:59:00Z")))
        assertTrue(LocationRules.inWindow(Instant.parse("2026-07-15T16:00:00Z")))
    }

    @Test
    fun theDayIsTheOneInPuebla() {
        // Ya es 3 de noviembre en UTC, pero «Ahora no» sigue valiendo.
        assertEquals("2026-11-02", LocationRules.dayKey(puebla("23:30:00")))
        withDefaultZone("Asia/Tokyo") { assertEquals("2026-11-02", LocationRules.dayKey(puebla("23:30:00"))) }
    }

    // ─── Alarma ──────────────────────────────────────────────────────────────

    @Test
    fun timeToTheEdgesOfTheWindow() {
        assertEquals(hour, LocationRules.msUntilWindowEnd(puebla("17:00:00")))
        assertEquals(hour, LocationRules.msUntilNextStart(puebla("09:00:00")))
        assertEquals(16 * hour, LocationRules.msUntilNextStart(puebla("18:00:00")))
        assertEquals(11 * hour, LocationRules.msUntilNextStart(puebla("23:00:00")))
        // A las 10:00 en punto ya empezó: la siguiente es mañana.
        assertEquals(24 * hour, LocationRules.msUntilNextStart(puebla("10:00:00")))
    }

    @Test
    fun theAlarmIsHalfAnHourAfterTheLastPoint() {
        val now = puebla("12:00:00")
        val ms = now.toEpochMilli()
        assertEquals(30 * minute, LocationRules.nextAlarmDelayMs(now, null, 0))
        assertEquals(20 * minute, LocationRules.nextAlarmDelayMs(now, ms - 10 * minute, 0))
        // Un punto viejo no deja la alarma sonando cada minuto.
        assertEquals(30 * minute, LocationRules.nextAlarmDelayMs(now, ms - 40 * minute, 0))
        // Con el reloj movido hacia atrás tampoco.
        assertEquals(30 * minute, LocationRules.nextAlarmDelayMs(now, ms + 10 * minute, 0))
    }

    @Test
    fun aFailedReadingRetriesInFiveMinutesThreeTimes() {
        val now = puebla("12:00:00")
        assertEquals(5 * minute, LocationRules.nextAlarmDelayMs(now, now.toEpochMilli(), 1))
        assertEquals(1, LocationRules.nextRetries(0))
        assertEquals(3, LocationRules.nextRetries(2))
        assertEquals(0, LocationRules.nextRetries(3))
    }

    @Test
    fun theAlarmStopsAtSixAndComesBackAtTen() {
        val late = puebla("17:50:00")
        assertEquals(10 * minute, LocationRules.nextAlarmDelayMs(late, late.toEpochMilli() - 5 * minute, 0))
        assertEquals(10 * minute, LocationRules.nextAlarmDelayMs(late, null, 0))
        assertEquals(16 * hour, LocationRules.nextAlarmDelayMs(puebla("18:00:00"), null, 0))
        assertEquals(hour, LocationRules.nextAlarmDelayMs(puebla("09:00:00"), null, 0))
    }

    @Test
    fun neverTwoPointsInTwentyMinutes() {
        val now = puebla("12:00:00").toEpochMilli()
        assertTrue(LocationRules.isDue(now, null))
        assertFalse(LocationRules.isDue(now, now - 19 * minute))
        assertTrue(LocationRules.isDue(now, now - 20 * minute))
        assertTrue(LocationRules.isDue(now, now + 5 * minute))
    }

    @Test
    fun aLostAlarmIsOnlyTheOneThatShouldHaveRung() {
        val now = puebla("12:00:00").toEpochMilli()
        assertTrue(LocationRules.alarmLost(0L, now))
        assertFalse(LocationRules.alarmLost(now + 20 * minute, now))
        assertFalse(LocationRules.alarmLost(now - 4 * minute, now))
        assertTrue(LocationRules.alarmLost(now - 6 * minute, now))
    }

    @Test
    fun theServiceOnlyStartsFromTheBackgroundOnOldAndroid() {
        assertTrue(LocationRules.canStartFromBackground(26))
        assertTrue(LocationRules.canStartFromBackground(29))
        assertFalse(LocationRules.canStartFromBackground(30))
        assertFalse(LocationRules.canStartFromBackground(31))
        assertFalse(LocationRules.canStartFromBackground(34))
    }

    @Test
    fun atMostOneReminderPerHour() {
        val now = puebla("12:00:00").toEpochMilli()
        assertTrue(LocationRules.shouldRemind(0L, now))
        assertFalse(LocationRules.shouldRemind(now - 59 * minute, now))
        assertTrue(LocationRules.shouldRemind(now - hour, now))
    }

    // ─── Consentimiento y estado ─────────────────────────────────────────────

    @Test
    fun notNowAsksAgainAnotherDay() {
        assertTrue(LocationRules.shouldAskConsent(null, null, "2026-11-02"))
        assertFalse(LocationRules.shouldAskConsent(null, "2026-11-02", "2026-11-02"))
        assertTrue(LocationRules.shouldAskConsent(null, "2026-11-01", "2026-11-02"))
        assertTrue(LocationRules.shouldAskConsent("", null, "2026-11-02"))
        assertFalse(LocationRules.shouldAskConsent("2026-11-01T16:00:00.000Z", null, "2026-11-02"))
    }

    @Test
    fun theStateTellsWhyThereAreNoPoints() {
        assertEquals(LocationState.OK, LocationRules.stateOf(hasPermission = true, enabled = true))
        assertEquals(LocationState.NO_PERMISSION, LocationRules.stateOf(hasPermission = false, enabled = true))
        assertEquals(LocationState.OFF, LocationRules.stateOf(hasPermission = true, enabled = false))
        assertEquals(LocationState.OFF, LocationRules.stateOf(hasPermission = false, enabled = false))
        assertEquals("sin_permiso", LocationState.NO_PERMISSION.wire)
        assertEquals("apagada", LocationState.OFF.wire)
        assertEquals("ok", LocationState.OK.wire)
    }

    @Test
    fun theStateIsSentOnceWhenItChanges() {
        // Nunca hubo problema: no hay nada que decir.
        assertFalse(LocationRules.shouldReport(null, LocationState.OK))
        assertTrue(LocationRules.shouldReport(null, LocationState.OFF))
        assertFalse(LocationRules.shouldReport("apagada", LocationState.OFF))
        assertTrue(LocationRules.shouldReport("apagada", LocationState.NO_PERMISSION))
        // Cuando se arregla, sí.
        assertTrue(LocationRules.shouldReport("apagada", LocationState.OK))
        assertFalse(LocationRules.shouldReport("ok", LocationState.OK))
    }

    @Test
    fun anEmptyReadingIsNotAPlace() {
        assertTrue(LocationRules.isRealFix(19.04, -98.2))
        assertFalse(LocationRules.isRealFix(0.0, 0.0))
        assertFalse(LocationRules.isRealFix(Double.NaN, -98.2))
        assertFalse(LocationRules.isRealFix(95.0, -98.2))
        assertFalse(LocationRules.isRealFix(19.04, -181.0))
    }

    // ─── Cola ────────────────────────────────────────────────────────────────

    private fun point(atMs: Long, accuracy: Double? = 12.5) = QueuedPoint(19.04, -98.2, accuracy, atMs)

    @Test
    fun theQueueGoesFromOldestToNewest() {
        val queue = LocationQueue.add(LocationQueue.add(emptyList(), point(2_000L)), point(1_000L))
        assertEquals(listOf(1_000L, 2_000L), queue.map { it.capturedAtMs })
    }

    @Test
    fun theQueueKeepsTheNewestWhenItIsFull() {
        var queue = emptyList<QueuedPoint>()
        (1..LocationQueue.MAX_SIZE + 5).forEach { queue = LocationQueue.add(queue, point(it.toLong())) }
        assertEquals(LocationQueue.MAX_SIZE, queue.size)
        assertEquals(6L, queue.first().capturedAtMs)
        assertEquals((LocationQueue.MAX_SIZE + 5).toLong(), queue.last().capturedAtMs)
    }

    @Test
    fun theQueueDropsWhatTheServerWouldThrowAway() {
        val now = puebla("12:00:00").toEpochMilli()
        val queue = listOf(point(now - 25 * hour), point(now - 23 * hour))
        assertEquals(listOf(now - 23 * hour), LocationQueue.fresh(queue, now).map { it.capturedAtMs })
    }

    @Test
    fun batchesAreOfFiftyAtMost() {
        val queue = (1..120).map { point(it.toLong()) }
        assertEquals(50, LocationQueue.nextBatch(queue).size)
        assertEquals(1L, LocationQueue.nextBatch(queue).first().capturedAtMs)
        assertEquals(3, LocationQueue.nextBatch(listOf(point(1L), point(2L), point(3L))).size)
    }

    @Test
    fun theQueueSurvivesBeingSaved() {
        val queue = listOf(point(1_000L), point(2_000L, accuracy = null))
        val back = LocationQueue.parse(LocationQueue.serialize(queue))
        assertEquals(queue, back)
        assertNull(back[1].accuracyM)
    }

    @Test
    fun aDamagedQueueDoesNotBreakAnything() {
        assertTrue(LocationQueue.parse(null).isEmpty())
        assertTrue(LocationQueue.parse("").isEmpty())
        assertTrue(LocationQueue.parse("no es json").isEmpty())
        assertTrue(LocationQueue.parse("""[{"lat":1}]""").isEmpty())
    }

    @Test
    fun capturedAtIsTheMomentOfTheReading() {
        assertEquals("2026-11-02T16:00:00Z", point(puebla("10:00:00").toEpochMilli()).capturedAt)
        assertEquals("2026-11-02T16:00:00.250Z", point(puebla("10:00:00").toEpochMilli() + 250).capturedAt)
    }
}
