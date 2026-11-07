package com.artaproducciones.ops.ui.modules

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Las llaves de las ligas de la web (`?tab=`, `?filtro=`, `?vista=`) y la hora de un vencimiento. */
class LinkKeysTest {

    @Test
    fun eventTabKeysOpenTheNativeTab() {
        assertEquals(NativeTab.SUMMARY, NativeTab.fromKey(null))
        assertEquals(NativeTab.SUMMARY, NativeTab.fromKey(""))
        assertEquals(NativeTab.SUMMARY, NativeTab.fromKey("overview"))
        assertEquals(NativeTab.TASKS, NativeTab.fromKey("tasks"))
        assertEquals(NativeTab.TASKS, NativeTab.fromKey("Tareas"))
        assertEquals(NativeTab.ADENDUM, NativeTab.fromKey("adendum"))
        assertEquals(NativeTab.TESTIGOS, NativeTab.fromKey(" testigos "))
        assertEquals(NativeTab.TEAM, NativeTab.fromKey("team"))
        assertEquals(NativeTab.TEAM, NativeTab.fromKey("equipo"))
        // Lo que vive en la web no llega aquí; si llegara, cae en Resumen.
        assertEquals(NativeTab.SUMMARY, NativeTab.fromKey("ocs"))
    }

    /** Mismas llaves que `FILTRO_PARAM` y `VISTA_PARAM` en `apps/web/app/(app)/tasks/page.tsx`. */
    @Test
    fun taskFilterAndViewKeysFollowTheWeb() {
        assertEquals(StatusFilter.OVERDUE, StatusFilter.fromKey("vencidas"))
        assertEquals(StatusFilter.OPEN, StatusFilter.fromKey("abiertas"))
        assertEquals(StatusFilter.ALL, StatusFilter.fromKey("todas"))
        assertEquals(StatusFilter.BLOCKED, StatusFilter.fromKey("bloqueadas"))
        assertEquals(StatusFilter.DONE, StatusFilter.fromKey("Hechas"))
        assertNull(StatusFilter.fromKey("lo-que-sea"))
        assertNull(StatusFilter.fromKey(null))

        assertEquals(TaskView.MINE, TaskView.fromKey("mias"))
        assertEquals(TaskView.REQUESTED, TaskView.fromKey("pedidas"))
        assertEquals(TaskView.TEAM, TaskView.fromKey("equipo"))
        assertNull(TaskView.fromKey("otra"))
        assertNull(TaskView.fromKey(null))
    }

    @Test
    fun whatTheTabWasAskedForIsKeptUntilItReadsIt() {
        TasksLaunch.request(filter = "vencidas", view = "equipo", compose = true)
        val req = TasksLaunch.pending!!
        assertEquals(StatusFilter.OVERDUE, req.filter)
        assertEquals(TaskView.TEAM, req.view)
        assertTrue(req.compose)
        TasksLaunch.consume()
        assertNull(TasksLaunch.pending)

        TasksLaunch.request()
        assertNull(TasksLaunch.pending!!.filter)
        assertFalse(TasksLaunch.pending!!.compose)
        TasksLaunch.consume()

        // Un filtro desconocido llega como «sin filtro»: la pestaña se queda como estaba.
        TasksLaunch.request(filter = "xyz")
        assertNull(TasksLaunch.pending!!.filter)
        TasksLaunch.consume()
    }

    /** La web guarda el día como medianoche UTC; solo otra hora es una cita (`MDate.dueHasTime` en iOS). */
    @Test
    fun aDueDateHasATimeOnlyWhenItIsNotMidnightUtc() {
        assertFalse(dueHasTime(null))
        assertFalse(dueHasTime("2026-11-07"))
        assertFalse(dueHasTime("2026-11-07T00:00:00.000Z"))
        assertFalse(dueHasTime("2026-11-07T00:00:00+00:00"))
        assertTrue(dueHasTime("2026-11-07T16:00:00.000Z"))
        assertTrue(dueHasTime("2026-11-07T22:30:00Z"))
        // Medianoche en otra zona sí es una hora elegida.
        assertTrue(dueHasTime("2026-11-07T00:00:00-06:00"))
    }
}
