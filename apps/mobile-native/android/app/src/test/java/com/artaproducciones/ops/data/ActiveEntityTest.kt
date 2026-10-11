package com.artaproducciones.ops.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Reglas de docs/entidades-arta-auditorio.md § «Apps móviles». */
class ActiveEntityTest {
    private val both = listOf("ARTA", "EXPLANADA")

    @Test
    fun directionGeneralIsHybridEvenWithOneEntity() {
        assertEquals(BizEntity.entries, ActiveEntity.availableFor("dir_general", listOf("ARTA")))
        assertEquals(BizEntity.entries, ActiveEntity.availableFor("super_admin", emptyList()))
    }

    @Test
    fun twoEntitiesMakeAHybrid() {
        assertEquals(BizEntity.entries, ActiveEntity.availableFor("dir_adjunta", listOf("EXPLANADA", "ARTA")))
    }

    @Test
    fun oneEntityIsFixed() {
        assertEquals(listOf(BizEntity.EXPLANADA), ActiveEntity.availableFor("dir_adjunta", listOf("EXPLANADA")))
        assertEquals(listOf(BizEntity.ARTA), ActiveEntity.availableFor("logistica", listOf("arta")))
    }

    @Test
    fun noEntitiesFallsBackToArtaWithoutSendingIt() {
        assertEquals(listOf(BizEntity.ARTA), ActiveEntity.availableFor("logistica", emptyList()))
        // Sin entidades asignadas no se manda `?entity=` (el API daría 403).
        assertEquals(emptySet<BizEntity>(), ActiveEntity.allowedFor("logistica", emptyList()))
    }

    @Test
    fun startsInArtaWhenTheUserHasBoth() {
        val options = ActiveEntity.availableFor("dir_adjunta", listOf("EXPLANADA", "ARTA"))
        assertEquals(BizEntity.ARTA, ActiveEntity.initialFor(options, listOf("EXPLANADA", "ARTA"), saved = null))
    }

    @Test
    fun startsInTheFirstOwnEntity() {
        val options = ActiveEntity.availableFor("dir_general", listOf("EXPLANADA"))
        assertEquals(BizEntity.EXPLANADA, ActiveEntity.initialFor(options, listOf("EXPLANADA"), saved = null))
    }

    @Test
    fun lastUsedWinsWhileItIsStillAvailable() {
        val options = ActiveEntity.availableFor("dir_adjunta", both)
        assertEquals(BizEntity.EXPLANADA, ActiveEntity.initialFor(options, both, saved = BizEntity.EXPLANADA))
        // Le quitaron Auditorio: vuelve a la que tiene.
        val onlyArta = ActiveEntity.availableFor("dir_adjunta", listOf("ARTA"))
        assertEquals(BizEntity.ARTA, ActiveEntity.initialFor(onlyArta, listOf("ARTA"), saved = BizEntity.EXPLANADA))
    }

    @Test
    fun keysMatchTheApi() {
        assertEquals(BizEntity.EXPLANADA, BizEntity.of("EXPLANADA"))
        assertEquals(BizEntity.ARTA, BizEntity.of(" arta "))
        assertNull(BizEntity.of("OTRA"))
        assertNull(BizEntity.of(null))
        assertEquals("Auditorio Explanada", BizEntity.EXPLANADA.brand)
        assertEquals(BizEntity.ARTA, BizEntity.EXPLANADA.other)
    }
}
