package com.artaproducciones.ops.ui.more

import com.artaproducciones.ops.data.api.UserDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** El menú Más respeta `apps/web/lib/access-matrix.ts`. */
class WebModulesTest {
    private val both = listOf("ARTA", "EXPLANADA")

    private fun menu(role: String, entity: String = "ARTA", extra: List<String> = emptyList()) =
        WebModules.visibleFor(UserDto(id = "u1", roleKey = role, entities = both, permissions = extra), entity)

    private fun paths(role: String, entity: String = "ARTA", extra: List<String> = emptyList()) =
        menu(role, entity, extra).map { it.path }.toSet()

    @Test
    fun campaignsAndCorridasOnlyInArta() {
        assertTrue("/campaigns" in paths("dir_general", "ARTA"))
        assertTrue("/finance" in paths("dir_general", "ARTA"))
        assertFalse("/campaigns" in paths("dir_general", "EXPLANADA"))
        assertFalse("/finance" in paths("dir_general", "EXPLANADA"))
        assertEquals("Corridas", menu("dir_general").first { it.path == "/finance" }.label)
    }

    @Test
    fun corridasNeedCorridaView() {
        assertTrue("/finance" in paths("dir_adjunta"))
        assertFalse("/finance" in paths("compras"))
        assertFalse("/finance" in paths("contabilidad"))
    }

    @Test
    fun onlyTopRolesManageUsers() {
        assertTrue("/users" in paths("dir_general"))
        assertTrue("/users" in paths("super_admin"))
        assertFalse("/users" in paths("dir_adjunta"))
        // Ni con el permiso: el rol también cuenta.
        assertFalse("/users" in paths("dir_adjunta", extra = listOf("users.manage")))
    }

    @Test
    fun purchaseOrdersWithAnyOfTheirPermissions() {
        assertTrue("/purchase-orders" in paths("compras"))
        assertTrue("/purchase-orders" in paths("contabilidad"))
        assertTrue("/purchase-orders" in paths("dir_adjunta"))
        assertTrue("/purchase-orders" in paths("dir_general"))
        assertFalse("/purchase-orders" in paths("produccion"))
        assertFalse("/purchase-orders" in paths("catering"))
    }

    @Test
    fun ticketingWithViewOrEdit() {
        assertTrue("/ticketing" in paths("compras"))
        assertTrue("/ticketing" in paths("produccion"))
        assertFalse("/ticketing" in paths("catering"))
    }

    @Test
    fun foldersNeitherForContentCateringNorInterns() {
        assertFalse("/folders" in paths("contenido"))
        // Catering sí trae `checklist.edit`: lo que lo deja fuera es la regla de carpetas.
        assertFalse("/folders" in paths("catering"))
        assertFalse("/folders" in paths("practicante"))
        assertTrue("/folders" in paths("compras"))
    }

    @Test
    fun finanzasOnlyWithItsPermission() {
        assertTrue("/finanzas" in paths("contabilidad"))
        assertTrue("/finanzas" in paths("dir_general"))
        assertFalse("/finanzas" in paths("dir_adjunta"))
        assertFalse("/finanzas" in paths("compras"))
        assertFalse(menu("contabilidad").first { it.path == "/finanzas" }.hidden)
    }

    @Test
    fun theInternSeesTestigosCalendarAndStudio() {
        val items = menu("practicante")
        val testigos = items.first { it.path == "/testigos" }
        assertFalse(testigos.hidden)
        assertEquals("Control", testigos.group)
        val paths = items.map { it.path }.toSet()
        assertTrue("/calendar" in paths)
        assertTrue("/studio" in paths)
        assertFalse("/events?scope=active" in paths)
        assertFalse("/purchase-orders" in paths)
        // Para los demás sigue en «Más herramientas».
        assertTrue(menu("dir_general").first { it.path == "/testigos" }.hidden)
    }

    @Test
    fun onlyChachoAndArturoSeeTheTeamLocation() {
        assertTrue("/ubicacion" in paths("dir_general"))
        assertTrue("/ubicacion" in paths("super_admin"))
        assertTrue("/ubicacion" in paths("dir_general", "EXPLANADA"))
        assertEquals("Ubicación del equipo", menu("dir_general").first { it.path == "/ubicacion" }.label)
        assertFalse("/ubicacion" in paths("dir_adjunta"))
        assertFalse("/ubicacion" in paths("compras"))
        // Ni con permisos extra: es dato sensible.
        assertFalse("/ubicacion" in paths("dir_adjunta", extra = listOf("everything")))
    }

    @Test
    fun accountingSeesAdvancesInTheMenu() {
        val advances = menu("contabilidad").first { it.path == "/advances" }
        assertFalse(advances.hidden)
        assertEquals("Control", advances.group)
    }
}
