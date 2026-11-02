package com.artaproducciones.ops.data

/** `AccessUser` de `@arta/rbac`. */
data class AccessUser(
    val roleKey: String,
    val entities: List<String>? = null,
    val permissions: List<String>? = null,
)

/** `EventModule` de `@arta/rbac`: las pestañas del evento que dependen de permisos. */
enum class EventModule { CORRIDA, CAMPAIGN, FORMATS, PO, CONVENIOS, TICKETING, TASKS, DOCUMENTS, ADENDUM, TESTIGOS }

/**
 * Quién ve y quién edita qué (docs/ROLES-Y-PERMISOS.md). Copia a mano de `packages/rbac/src/roles.ts`, con
 * los mismos nombres y el mismo comportamiento: si cambia allá, cambia aquí (y en `Data/Rbac.swift`).
 * Quien manda es el API (redacta el evento y responde 403); esto es para no enseñar pestañas vacías ni
 * botones que dan 403. Probado en `RbacTest`.
 */
object Rbac {
    private const val ARTA = "ARTA"
    private const val EXPLANADA = "EXPLANADA"

    private val ASSIGNABLE_PERMISSIONS = setOf(
        "finance.view", "finance.edit", "campaign.view", "campaign.edit", "po.authorize", "po.mark_paid",
        "event.create", "event.close", "checklist.edit", "studio.edit", "studio.publish", "ticketing.edit",
        "folders.edit", "vendor.pin", "po.view", "po.edit", "corrida.view", "corrida.upload", "corrida.edit",
        "finanzas.view", "convenios.view", "convenios.edit", "ticketing.view", "testigos.edit",
        "advance.request", "practicantes.manage",
    )

    /** Lo que tienen Leida y Sol (`dir_adjunta`) y la gerencia de Arta: todo Arta, sin modificar corrida ni tocar OC. */
    private val ARTA_MANAGEMENT = setOf(
        "finance.view", "corrida.view", "corrida.upload", "po.view", "campaign.view", "campaign.edit",
        "convenios.view", "convenios.edit", "ticketing.view", "ticketing.edit", "event.create", "event.close",
        "checklist.edit", "studio.edit", "studio.publish", "folders.edit", "vendor.pin", "testigos.edit",
        "advance.request",
    )

    /** `ROLE_PERMISSIONS`. Es la única copia de la tabla en Android. */
    val ROLE_PERMISSIONS: Map<String, Set<String>> = mapOf(
        "super_admin" to setOf("everything"),
        "dir_general" to setOf("everything", "users.manage", "users.create") + ASSIGNABLE_PERMISSIONS,
        "dir_adjunta" to ARTA_MANAGEMENT,
        "gerente_arta" to ARTA_MANAGEMENT,
        "dir_auditorio" to setOf(
            "ticketing.view", "ticketing.edit", "event.create", "event.close", "checklist.edit", "folders.edit",
            "vendor.pin", "testigos.edit", "advance.request",
        ),
        "produccion" to setOf(
            "campaign.view", "campaign.edit", "convenios.view", "ticketing.view", "ticketing.edit", "checklist.edit",
            "event.create", "folders.edit", "testigos.edit", "advance.request",
        ),
        "compras" to setOf(
            "po.view", "po.edit", "finance.view", "campaign.view", "convenios.view", "ticketing.view",
            "checklist.edit", "advance.request",
        ),
        "contenido" to setOf("campaign.view"),
        "catering" to setOf("checklist.edit"),
        "logistica" to setOf(
            "campaign.edit", "campaign.view", "checklist.edit", "event.create", "ticketing.view", "ticketing.edit",
            "folders.edit", "advance.request",
        ),
        "convenios" to setOf("checklist.edit", "campaign.view", "convenios.view", "convenios.edit", "folders.edit", "advance.request"),
        "enlace_gobierno" to setOf("checklist.edit", "po.view", "po.mark_paid", "event.create", "folders.edit", "advance.request"),
        "solo_carpetas" to emptySet(),
        "contabilidad" to setOf(
            "finanzas.view", "finance.view", "po.view", "po.mark_paid", "campaign.view", "campaign.edit",
            "convenios.view", "convenios.edit", "ticketing.view", "ticketing.edit",
        ),
        "practicante" to setOf("studio.edit", "testigos.edit"),
    )

    /** Hacer OC es de compras aunque dirección «pueda todo»: `po.edit` solo como permiso extra. */
    fun hasPermission(roleKey: String, extra: List<String>?, needed: String): Boolean {
        if (roleKey == "super_admin") return true
        if (roleKey == "dir_general") return needed != "po.edit" || extra.orEmpty().contains(needed)
        if (needed in ROLE_PERMISSIONS[roleKey].orEmpty()) return true
        return extra.orEmpty().contains(needed)
    }

    /** Dirección: aprueba, sella, reabre y no la encierran los días de cobro. */
    fun isDirectionRole(roleKey: String?): Boolean =
        roleKey == "super_admin" || roleKey == "dir_general" || roleKey == "dir_adjunta"

    // ─── Entidades y operación de eventos ───────────────────────────────────

    fun canAccessEntity(userEntities: List<String>, roleKey: String, entity: String): Boolean {
        if (roleKey == "super_admin" || roleKey == "dir_general") return true
        return entity in userEntities
    }

    fun canAccessEventOps(userEntities: List<String>, roleKey: String, entity: String): Boolean {
        if (!canAccessEntity(userEntities, roleKey, entity)) return false
        if (roleKey == "solo_carpetas") return false
        // El practicante no opera eventos: calendario (`canSeeEventCalendar`) y testigos (`canSeeModule`).
        if (roleKey == "practicante") return false
        return true
    }

    fun eventOpsEntities(userEntities: List<String>, roleKey: String): List<String> =
        userEntities.filter { canAccessEventOps(userEntities, roleKey, it) }

    /** Quien opera eventos ve el calendario completo; el practicante lo consulta en solo lectura. */
    fun canSeeEventCalendar(userEntities: List<String>, roleKey: String, entity: String): Boolean {
        if (canAccessEventOps(userEntities, roleKey, entity)) return true
        return roleKey == "practicante" && canAccessEntity(userEntities, roleKey, entity)
    }

    /** Canales de chat de un evento: contabilidad y practicantes entran solo si alguien los agrega. */
    fun canJoinEventChannels(roleKey: String?): Boolean = roleKey != "contabilidad" && roleKey != "practicante"

    /** Carpetas generales: todos los que trabajan en la entidad menos practicante, contenido y catering. */
    fun canSeeGeneralFolders(roleKey: String?): Boolean =
        roleKey != "practicante" && roleKey != "contenido" && roleKey != "catering"

    /** Crear y asignar tareas: no quien solo consulta carpetas, el practicante, contenido ni catering. */
    fun canCreateTasks(roleKey: String?): Boolean =
        roleKey != "solo_carpetas" && roleKey != "practicante" && roleKey != "contenido" && roleKey != "catering"

    // ─── Módulos del evento ─────────────────────────────────────────────────

    /** El Auditorio no lleva corrida, campaña ni convenios. */
    fun entityHasModule(entity: String, module: EventModule): Boolean {
        if (entity != EXPLANADA) return true
        return module != EventModule.CORRIDA && module != EventModule.CAMPAIGN && module != EventModule.CONVENIOS
    }

    private fun can(user: AccessUser, needed: String): Boolean = hasPermission(user.roleKey, user.permissions, needed)

    private fun opsIn(user: AccessUser, entity: String): Boolean =
        canAccessEventOps(user.entities.orEmpty(), user.roleKey, entity)

    /** Rodrigo: en Arta solo llega a sus formatos de transporte, hospedaje y catering. */
    private fun onlyFormatsIn(user: AccessUser, entity: String): Boolean =
        (user.roleKey == "dir_auditorio" && entity == ARTA) || user.roleKey == "catering"

    /** Pestaña del evento: ¿la ve esta persona en este negocio? */
    fun canSeeModule(user: AccessUser, entity: String, module: EventModule): Boolean {
        if (!entityHasModule(entity, module)) return false
        if (module == EventModule.TESTIGOS) {
            if (user.roleKey == "catering") return false
            if (user.roleKey == "dir_auditorio" && entity == ARTA) return false
            if (user.roleKey == "practicante") return canAccessEntity(user.entities.orEmpty(), "practicante", entity)
            return opsIn(user, entity)
        }
        if (!opsIn(user, entity)) return false
        if (module == EventModule.FORMATS) return true
        if (onlyFormatsIn(user, entity)) return false
        return when (module) {
            EventModule.CORRIDA -> can(user, "corrida.view")
            EventModule.CAMPAIGN -> can(user, "campaign.view") || can(user, "campaign.edit")
            EventModule.CONVENIOS -> can(user, "convenios.view") || can(user, "convenios.edit")
            EventModule.TICKETING -> can(user, "ticketing.view") || can(user, "ticketing.edit")
            EventModule.PO, EventModule.ADENDUM ->
                can(user, "po.view") || can(user, "po.edit") || can(user, "po.authorize") || can(user, "po.mark_paid")
            EventModule.TASKS, EventModule.DOCUMENTS -> user.roleKey != "contenido"
            EventModule.FORMATS, EventModule.TESTIGOS -> false
        }
    }

    /** Datos del show. Williams edita los del Auditorio y solo ve los de Arta; Rodrigo, solo los del Auditorio. */
    fun canEditEventInfo(user: AccessUser, entity: String): Boolean {
        if (!opsIn(user, entity)) return false
        return when (user.roleKey) {
            "super_admin", "dir_general" -> true
            "dir_adjunta", "gerente_arta" -> entity == ARTA
            "dir_auditorio", "produccion" -> entity == EXPLANADA
            "logistica", "convenios", "enlace_gobierno" -> true
            else -> false
        }
    }

    /** Boletera: Williams la edita en Auditorio y la ve en Arta. */
    fun canEditTicketing(user: AccessUser, entity: String): Boolean {
        if (!canSeeModule(user, entity, EventModule.TICKETING) || !can(user, "ticketing.edit")) return false
        return !(user.roleKey == "produccion" && entity == ARTA)
    }

    /** Campaña: de dirección, gerencia, Williams y contabilidad; solo existe en Arta. */
    fun canEditCampaign(user: AccessUser, entity: String): Boolean =
        canSeeModule(user, entity, EventModule.CAMPAIGN) && can(user, "campaign.edit")

    // ─── Formatos ───────────────────────────────────────────────────────────

    /** Evento General, Artes y Pendones los aprueban solo Chacho o Arturo. `CUSTOM` es Pendones en Excel. */
    val TOP_APPROVAL_FORMATS = setOf("EVENTO_GENERAL", "ARTES_SHOWS", "PENDONES", "CUSTOM")

    /** Formatos generales: donde Monse y Kika suben imágenes. */
    val GENERAL_FORMATS = setOf("EVENTO_GENERAL", "CHECKLIST_AUDITORIO")
    val BAR_MERCH_FORMATS = setOf("BARRA", "MERCH")
    private val WILLIAMS_ARTA_FORMATS = setOf("PRODUCCION", "TRANSPORTACION", "HOSPEDAJE")
    private val RODRIGO_ARTA_FORMATS = setOf("TRANSPORTACION", "HOSPEDAJE", "CATERING")

    fun canSeeFormat(user: AccessUser, entity: String, key: String): Boolean {
        if (!opsIn(user, entity)) return false
        val role = user.roleKey
        if (role == "dir_auditorio" && entity == ARTA) return key in RODRIGO_ARTA_FORMATS
        if (role == "catering") return key == "CATERING"
        if (role == "contenido") return key in GENERAL_FORMATS
        return true
    }

    fun canEditFormat(user: AccessUser, entity: String, key: String): Boolean {
        if (!canSeeFormat(user, entity, key)) return false
        return when (user.roleKey) {
            "super_admin", "dir_general" -> true
            "dir_adjunta", "gerente_arta" -> entity == ARTA
            "dir_auditorio" -> true
            "produccion" -> entity == EXPLANADA || key in WILLIAMS_ARTA_FORMATS
            "compras" -> key in BAR_MERCH_FORMATS
            "catering" -> key == "CATERING"
            "contenido", "contabilidad" -> false
            else -> can(user, "checklist.edit")
        }
    }

    /** Subir imágenes a un formato: quien lo edita, y Monse y Kika en los generales. */
    fun canAddFormatImages(user: AccessUser, entity: String, key: String): Boolean {
        if (canEditFormat(user, entity, key)) return true
        return user.roleKey == "contenido" && canSeeFormat(user, entity, key)
    }

    fun canApproveFormat(user: AccessUser, entity: String, key: String): Boolean {
        if (!opsIn(user, entity)) return false
        return when (user.roleKey) {
            "super_admin", "dir_general" -> true
            "dir_adjunta", "gerente_arta" -> entity == ARTA && key !in TOP_APPROVAL_FORMATS
            "dir_auditorio" -> entity == EXPLANADA
            else -> false
        }
    }

    /** Quién puede agregar un formato al evento. */
    fun canCreateFormats(user: AccessUser, entity: String): Boolean {
        if (!opsIn(user, entity)) return false
        val role = user.roleKey
        return role != "contenido" && role != "contabilidad" && role != "catering" && can(user, "checklist.edit")
    }
}
