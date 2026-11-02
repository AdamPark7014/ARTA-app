package com.artaproducciones.ops.data

import com.artaproducciones.ops.ui.modules.ModulesPerms
import com.artaproducciones.ops.data.api.ModulesMe
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** La matriz del cliente (docs/ROLES-Y-PERMISOS.md), persona por persona. */
class RbacTest {
    private val both = listOf("ARTA", "EXPLANADA")
    private val allModules = EventModule.entries

    private val juanPablo = AccessUser("compras", both)
    private val chacho = AccessUser("dir_general", both)
    private val leida = AccessUser("dir_adjunta", listOf("ARTA"))
    private val rodrigo = AccessUser("dir_auditorio", both)
    private val williams = AccessUser("produccion", both)
    private val paula = AccessUser("contabilidad", both)
    private val monse = AccessUser("contenido", both)
    private val iliana = AccessUser("catering", both)
    private val practicante = AccessUser("practicante", both)

    private fun modules(user: AccessUser, entity: String) = allModules.filter { Rbac.canSeeModule(user, entity, it) }.toSet()

    // ─── hasPermission ──────────────────────────────────────────────────────

    @Test
    fun onlySuperAdminAndExtraPermissionsGoPastTheTable() {
        assertTrue(Rbac.hasPermission("super_admin", null, "po.edit"))
        assertTrue(Rbac.hasPermission("compras", null, "po.edit"))
        assertFalse(Rbac.hasPermission("compras", null, "po.authorize"))
        assertTrue(Rbac.hasPermission("compras", listOf("po.authorize"), "po.authorize"))
        assertFalse(Rbac.hasPermission("rol_desconocido", null, "po.view"))
    }

    @Test
    fun dirGeneralCanDoEverythingButMakePurchaseOrders() {
        assertFalse(Rbac.hasPermission("dir_general", null, "po.edit"))
        assertFalse(Rbac.hasPermission("dir_general", emptyList(), "po.edit"))
        assertTrue(Rbac.hasPermission("dir_general", listOf("po.edit"), "po.edit"))
        assertTrue(Rbac.hasPermission("dir_general", null, "po.authorize"))
        assertTrue(Rbac.hasPermission("dir_general", null, "users.manage"))
    }

    @Test
    fun dirAdjuntaIsNoLongerEverythingButUsers() {
        assertFalse(Rbac.hasPermission("dir_adjunta", null, "users.manage"))
        assertFalse(Rbac.hasPermission("dir_adjunta", null, "po.authorize"))
        assertFalse(Rbac.hasPermission("dir_adjunta", null, "po.edit"))
        assertFalse(Rbac.hasPermission("dir_adjunta", null, "corrida.edit"))
        assertTrue(Rbac.hasPermission("dir_adjunta", null, "corrida.upload"))
        assertTrue(Rbac.hasPermission("dir_adjunta", null, "po.view"))
    }

    // ─── Juan Pablo ─────────────────────────────────────────────────────────

    @Test
    fun juanPabloMakesPurchaseOrdersWithoutSeeingTheCorrida() {
        assertTrue(Rbac.hasPermission("compras", null, "po.edit"))
        assertFalse(Rbac.canSeeModule(juanPablo, "ARTA", EventModule.CORRIDA))
        assertTrue(Rbac.canSeeModule(juanPablo, "ARTA", EventModule.PO))
        assertTrue(Rbac.canEditFormat(juanPablo, "EXPLANADA", "BARRA"))
        assertFalse(Rbac.canEditFormat(juanPablo, "ARTA", "EVENTO_GENERAL"))
        assertFalse(Rbac.canEditEventInfo(juanPablo, "ARTA"))
    }

    // ─── Leida y Sol ────────────────────────────────────────────────────────

    @Test
    fun leidaApprovesEverythingButTheTopFormats() {
        assertFalse(Rbac.canApproveFormat(leida, "ARTA", "EVENTO_GENERAL"))
        assertFalse(Rbac.canApproveFormat(leida, "ARTA", "ARTES_SHOWS"))
        assertFalse(Rbac.canApproveFormat(leida, "ARTA", "PENDONES"))
        assertFalse(Rbac.canApproveFormat(leida, "ARTA", Rbac.formatRuleKey("CUSTOM", "Distribución de Pendones (Excel)")))
        assertTrue(Rbac.canApproveFormat(leida, "ARTA", Rbac.formatRuleKey("CUSTOM", "Checklist de sonido")))
        assertTrue(Rbac.canApproveFormat(leida, "ARTA", "TRANSPORTACION"))
        assertTrue(Rbac.canApproveFormat(chacho, "ARTA", "EVENTO_GENERAL"))
        assertTrue(Rbac.canSeeModule(leida, "ARTA", EventModule.CORRIDA))
        assertFalse(Rbac.canAccessEventOps(leida.entities.orEmpty(), leida.roleKey, "EXPLANADA"))
    }

    // ─── Rodrigo ────────────────────────────────────────────────────────────

    @Test
    fun rodrigoOnlyHasFormatsInArta() {
        assertEquals(setOf(EventModule.FORMATS), modules(rodrigo, "ARTA"))
        assertTrue(Rbac.canSeeFormat(rodrigo, "ARTA", "TRANSPORTACION"))
        assertTrue(Rbac.canEditFormat(rodrigo, "ARTA", "CATERING"))
        assertFalse(Rbac.canSeeFormat(rodrigo, "ARTA", "EVENTO_GENERAL"))
        assertFalse(Rbac.canApproveFormat(rodrigo, "ARTA", "TRANSPORTACION"))
        assertFalse(Rbac.canEditEventInfo(rodrigo, "ARTA"))
    }

    @Test
    fun rodrigoRunsTheAuditoriumExceptPurchaseOrders() {
        assertFalse(Rbac.canSeeModule(rodrigo, "EXPLANADA", EventModule.PO))
        assertTrue(Rbac.canSeeModule(rodrigo, "EXPLANADA", EventModule.TICKETING))
        assertTrue(Rbac.canSeeModule(rodrigo, "EXPLANADA", EventModule.TESTIGOS))
        assertTrue(Rbac.canApproveFormat(rodrigo, "EXPLANADA", "EVENTO_GENERAL"))
        assertTrue(Rbac.canEditEventInfo(rodrigo, "EXPLANADA"))
    }

    // ─── Auditorio ──────────────────────────────────────────────────────────

    @Test
    fun theAuditoriumHasNoCorridaCampaignNorConvenios() {
        val missing = setOf(EventModule.CORRIDA, EventModule.CAMPAIGN, EventModule.CONVENIOS)
        missing.forEach {
            assertFalse(Rbac.entityHasModule("EXPLANADA", it))
            assertTrue(Rbac.entityHasModule("ARTA", it))
            // Ni siquiera dirección los ve en Auditorio.
            assertFalse(Rbac.canSeeModule(chacho, "EXPLANADA", it))
            assertFalse(Rbac.canSeeModule(AccessUser("super_admin"), "EXPLANADA", it))
        }
        assertEquals(allModules.toSet() - missing, modules(chacho, "EXPLANADA"))
        assertEquals(allModules.toSet(), modules(chacho, "ARTA"))
    }

    // ─── Iliana ─────────────────────────────────────────────────────────────

    @Test
    fun ilianaOnlyHasCatering() {
        assertEquals(setOf(EventModule.FORMATS), modules(iliana, "ARTA"))
        assertEquals(setOf(EventModule.FORMATS), modules(iliana, "EXPLANADA"))
        assertTrue(Rbac.canSeeFormat(iliana, "ARTA", "CATERING"))
        assertTrue(Rbac.canEditFormat(iliana, "ARTA", "CATERING"))
        assertFalse(Rbac.canSeeFormat(iliana, "ARTA", "TRANSPORTACION"))
        assertFalse(Rbac.canEditFormat(iliana, "ARTA", "TRANSPORTACION"))
        assertFalse(Rbac.canApproveFormat(iliana, "ARTA", "CATERING"))
        assertFalse(Rbac.canCreateFormats(iliana, "ARTA"))
        assertFalse(Rbac.canCreateTasks(iliana.roleKey))
        assertFalse(Rbac.canSeeGeneralFolders(iliana.roleKey))
    }

    // ─── Los demás ──────────────────────────────────────────────────────────

    @Test
    fun williamsEditsTheAuditoriumAndHisFormatsInArta() {
        assertFalse(Rbac.canSeeModule(williams, "ARTA", EventModule.PO))
        assertFalse(Rbac.canSeeModule(williams, "ARTA", EventModule.CORRIDA))
        assertTrue(Rbac.canEditFormat(williams, "ARTA", "PRODUCCION"))
        assertFalse(Rbac.canEditFormat(williams, "ARTA", "CATERING"))
        assertTrue(Rbac.canEditFormat(williams, "EXPLANADA", "CATERING"))
        assertFalse(Rbac.canEditEventInfo(williams, "ARTA"))
        assertTrue(Rbac.canEditEventInfo(williams, "EXPLANADA"))
        assertFalse(Rbac.canEditTicketing(williams, "ARTA"))
        assertTrue(Rbac.canEditTicketing(williams, "EXPLANADA"))
        assertTrue(Rbac.canEditCampaign(williams, "ARTA"))
    }

    @Test
    fun monseOnlyAddsImagesToTheGeneralFormats() {
        assertEquals(setOf(EventModule.CAMPAIGN, EventModule.FORMATS, EventModule.TESTIGOS), modules(monse, "ARTA"))
        assertFalse(Rbac.canEditFormat(monse, "ARTA", "EVENTO_GENERAL"))
        assertTrue(Rbac.canAddFormatImages(monse, "ARTA", "EVENTO_GENERAL"))
        assertTrue(Rbac.canAddFormatImages(monse, "EXPLANADA", "CHECKLIST_AUDITORIO"))
        assertFalse(Rbac.canAddFormatImages(monse, "ARTA", "BARRA"))
        assertFalse(Rbac.canCreateFormats(monse, "ARTA"))
    }

    @Test
    fun paulaPaysAndEntersFinanzasWithoutTheCorrida() {
        assertTrue(Rbac.hasPermission("contabilidad", null, "finanzas.view"))
        assertTrue(Rbac.hasPermission("contabilidad", null, "po.mark_paid"))
        assertFalse(Rbac.hasPermission("contabilidad", null, "po.authorize"))
        assertFalse(Rbac.canSeeModule(paula, "ARTA", EventModule.CORRIDA))
        assertTrue(Rbac.canSeeModule(paula, "ARTA", EventModule.ADENDUM))
        assertFalse(Rbac.canEditFormat(paula, "ARTA", "EVENTO_GENERAL"))
        assertFalse(Rbac.canCreateFormats(paula, "ARTA"))
        assertFalse(Rbac.canJoinEventChannels(paula.roleKey))
    }

    @Test
    fun theInternHasTestigosAndTheCalendarOnly() {
        assertEquals(setOf(EventModule.TESTIGOS), modules(practicante, "ARTA"))
        assertFalse(Rbac.canAccessEventOps(both, "practicante", "ARTA"))
        assertTrue(Rbac.canSeeEventCalendar(both, "practicante", "ARTA"))
        assertFalse(Rbac.canSeeEventCalendar(listOf("ARTA"), "practicante", "EXPLANADA"))
        assertFalse(Rbac.canCreateTasks("practicante"))
        assertFalse(Rbac.canSeeGeneralFolders("practicante"))
    }

    @Test
    fun eventOpsLeaveOutFoldersOnlyAndInterns() {
        assertEquals(emptyList<String>(), Rbac.eventOpsEntities(both, "solo_carpetas"))
        assertEquals(emptyList<String>(), Rbac.eventOpsEntities(both, "practicante"))
        assertEquals(both, Rbac.eventOpsEntities(both, "dir_auditorio"))
        assertTrue(Rbac.canAccessEventOps(emptyList(), "dir_general", "ARTA"))
        assertFalse(Rbac.canAccessEventOps(listOf("ARTA"), "compras", "EXPLANADA"))
    }

    // ─── Lo que usa la app ──────────────────────────────────────────────────

    @Test
    fun modulesPermsFollowTheSameRules() {
        val perms = { role: String -> ModulesPerms(ModulesMe(id = "u1", roleKey = role, entities = both)) }
        assertFalse(perms("dir_general").has("po.edit"))
        assertTrue(perms("compras").has("po.edit"))
        // Antes `dir_adjunta` traía todo menos usuarios: ya no autoriza OC.
        assertFalse(perms("dir_adjunta").canAuthorizePo)
        assertFalse(perms("dir_adjunta").approvesMoney)
        assertTrue(perms("dir_adjunta").isDirection)
        assertFalse(perms("dir_auditorio").canAuthorizePo)
        assertTrue(perms("contabilidad").canMarkPaid)
        assertFalse(perms("catering").canCreateTasks)
        assertTrue(perms("dir_auditorio").canAccessEventOps("ARTA"))
        assertFalse(perms("dir_auditorio").canSeeModule("ARTA", EventModule.TASKS))
        assertFalse(perms("compras").canSeeModule(null, EventModule.PO))
        // Un permiso extra llega por `permissions`, no por el rol.
        val covering = ModulesPerms(ModulesMe(id = "u2", roleKey = "dir_general", permissions = listOf("po.edit")))
        assertTrue(covering.has("po.edit"))
    }

    // ─── Ubicación (docs/UBICACION.md) ──────────────────────────────────────

    @Test
    fun everyoneIsTrackedButChachoArturoAndPlatform() {
        assertFalse(Rbac.isLocationTracked(chacho.roleKey))
        assertFalse(Rbac.isLocationTracked("super_admin"))
        assertFalse(Rbac.isLocationTracked(null))
        assertFalse(Rbac.isLocationTracked(""))
        Rbac.ROLE_PERMISSIONS.keys.filter { it !in Rbac.LOCATION_EXEMPT_ROLES }.forEach { role ->
            assertTrue(role, Rbac.isLocationTracked(role))
        }
        assertTrue(Rbac.isLocationTracked(leida.roleKey))
        assertTrue(Rbac.isLocationTracked(juanPablo.roleKey))
    }

    @Test
    fun onlyChachoArturoAndPlatformSeeTheTeam() {
        assertTrue(Rbac.canSeeTeamLocation(chacho.roleKey))
        assertTrue(Rbac.canSeeTeamLocation("super_admin"))
        assertFalse(Rbac.canSeeTeamLocation(null))
        Rbac.ROLE_PERMISSIONS.keys.filter { it !in Rbac.LOCATION_EXEMPT_ROLES }.forEach { role ->
            assertFalse(role, Rbac.canSeeTeamLocation(role))
        }
    }
}
