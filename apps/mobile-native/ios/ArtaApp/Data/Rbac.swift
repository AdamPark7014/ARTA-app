import Foundation

// Quién ve y quién edita qué (docs/ROLES-Y-PERMISOS.md). Copia a mano de `packages/rbac/src/roles.ts`,
// con los mismos nombres y el mismo comportamiento: si cambia allá, cambia aquí (y en `data/Rbac.kt`).
// Quien manda es el API (redacta el evento y responde 403); esto es para no enseñar pestañas vacías
// ni botones que dan 403.

/// `AccessUser` de `@arta/rbac`.
struct AccessUser: Equatable {
    var roleKey: String
    var entities: [String]?
    var permissions: [String]?
}

/// `EventModule` de `@arta/rbac`: las pestañas del evento que dependen de permisos.
enum EventModule {
    case corrida, campaign, formats, po, convenios, ticketing, tasks, documents, adendum, testigos
}

enum Rbac {
    // MARK: Permisos por rol

    private static let ASSIGNABLE_PERMISSIONS: [String] = [
        "finance.view", "finance.edit", "campaign.view", "campaign.edit", "po.authorize", "po.mark_paid",
        "event.create", "event.close", "checklist.edit", "studio.edit", "studio.publish", "ticketing.edit",
        "folders.edit", "vendor.pin", "po.view", "po.edit", "corrida.view", "corrida.upload", "corrida.edit",
        "finanzas.view", "convenios.view", "convenios.edit", "ticketing.view", "testigos.edit",
        "advance.request", "practicantes.manage",
    ]

    /// Lo que tienen Leida y Sol (`dir_adjunta`) y la gerencia de Arta: todo Arta, sin modificar corrida ni tocar OC.
    private static let ARTA_MANAGEMENT: [String] = [
        "finance.view", "corrida.view", "corrida.upload", "po.view", "campaign.view", "campaign.edit",
        "convenios.view", "convenios.edit", "ticketing.view", "ticketing.edit", "event.create", "event.close",
        "checklist.edit", "studio.edit", "studio.publish", "folders.edit", "vendor.pin", "testigos.edit",
        "advance.request",
    ]

    private static let DIR_GENERAL_PERMISSIONS: [String] =
        ["everything", "users.manage", "users.create"] + ASSIGNABLE_PERMISSIONS

    /// `ROLE_PERMISSIONS`. Es la única copia de la tabla en iOS.
    static let ROLE_PERMISSIONS: [String: [String]] = [
        "super_admin": ["everything"],
        "dir_general": DIR_GENERAL_PERMISSIONS,
        "dir_adjunta": ARTA_MANAGEMENT,
        "gerente_arta": ARTA_MANAGEMENT,
        "dir_auditorio": [
            "ticketing.view", "ticketing.edit", "event.create", "event.close", "checklist.edit", "folders.edit",
            "vendor.pin", "testigos.edit", "advance.request",
        ],
        "produccion": [
            "campaign.view", "campaign.edit", "convenios.view", "ticketing.view", "ticketing.edit", "checklist.edit",
            "event.create", "folders.edit", "testigos.edit", "advance.request",
        ],
        "compras": [
            "po.view", "po.edit", "finance.view", "campaign.view", "convenios.view", "ticketing.view",
            "checklist.edit", "advance.request",
        ],
        "contenido": ["campaign.view"],
        "catering": ["checklist.edit"],
        "logistica": [
            "campaign.edit", "campaign.view", "checklist.edit", "event.create", "ticketing.view", "ticketing.edit",
            "folders.edit", "advance.request",
        ],
        "convenios": ["checklist.edit", "campaign.view", "convenios.view", "convenios.edit", "folders.edit", "advance.request"],
        "enlace_gobierno": ["checklist.edit", "po.view", "po.mark_paid", "event.create", "folders.edit", "advance.request"],
        "solo_carpetas": [],
        "contabilidad": [
            "finanzas.view", "finance.view", "po.view", "po.mark_paid", "campaign.view", "campaign.edit",
            "convenios.view", "convenios.edit", "ticketing.view", "ticketing.edit",
        ],
        "practicante": ["studio.edit", "testigos.edit"],
    ]

    /// Hacer OC es de compras aunque dirección «pueda todo»: `po.edit` solo como permiso extra.
    static func hasPermission(_ roleKey: String, _ extra: [String]?, _ needed: String) -> Bool {
        if roleKey == "super_admin" { return true }
        if roleKey == "dir_general" { return needed != "po.edit" || (extra ?? []).contains(needed) }
        if (ROLE_PERMISSIONS[roleKey] ?? []).contains(needed) { return true }
        return (extra ?? []).contains(needed)
    }

    /// Dirección: aprueba, sella, reabre y no la encierran los días de cobro.
    static func isDirectionRole(_ roleKey: String?) -> Bool {
        roleKey == "super_admin" || roleKey == "dir_general" || roleKey == "dir_adjunta"
    }

    // MARK: Entidades y operación de eventos

    static func canAccessEntity(_ userEntities: [String], _ roleKey: String, _ entity: String) -> Bool {
        if roleKey == "super_admin" || roleKey == "dir_general" { return true }
        return userEntities.contains(entity)
    }

    static func canAccessEventOps(_ userEntities: [String], _ roleKey: String, _ entity: String) -> Bool {
        if !canAccessEntity(userEntities, roleKey, entity) { return false }
        if roleKey == "solo_carpetas" { return false }
        // El practicante no opera eventos: calendario (`canSeeEventCalendar`) y testigos (`canSeeModule`).
        if roleKey == "practicante" { return false }
        return true
    }

    static func eventOpsEntities(_ userEntities: [String], _ roleKey: String) -> [String] {
        userEntities.filter { canAccessEventOps(userEntities, roleKey, $0) }
    }

    /// Quien opera eventos ve el calendario completo; el practicante lo consulta en solo lectura.
    static func canSeeEventCalendar(_ userEntities: [String], _ roleKey: String, _ entity: String) -> Bool {
        if canAccessEventOps(userEntities, roleKey, entity) { return true }
        return roleKey == "practicante" && canAccessEntity(userEntities, roleKey, entity)
    }

    /// Canales de chat de un evento: contabilidad y practicantes entran solo si alguien los agrega.
    static func canJoinEventChannels(_ roleKey: String?) -> Bool {
        roleKey != "contabilidad" && roleKey != "practicante"
    }

    /// Carpetas generales: todos los que trabajan en la entidad menos practicante, contenido y catering.
    static func canSeeGeneralFolders(_ roleKey: String?) -> Bool {
        roleKey != "practicante" && roleKey != "contenido" && roleKey != "catering"
    }

    /// Crear y asignar tareas: no quien solo consulta carpetas, el practicante, contenido ni catering.
    static func canCreateTasks(_ roleKey: String?) -> Bool {
        roleKey != "solo_carpetas" && roleKey != "practicante" && roleKey != "contenido" && roleKey != "catering"
    }

    // MARK: Módulos del evento

    /// El Auditorio no lleva corrida, campaña ni convenios.
    static func entityHasModule(_ entity: String, _ module: EventModule) -> Bool {
        if entity != "EXPLANADA" { return true }
        return module != .corrida && module != .campaign && module != .convenios
    }

    private static func can(_ user: AccessUser, _ needed: String) -> Bool {
        hasPermission(user.roleKey, user.permissions, needed)
    }

    private static func opsIn(_ user: AccessUser, _ entity: String) -> Bool {
        canAccessEventOps(user.entities ?? [], user.roleKey, entity)
    }

    /// Rodrigo: en Arta solo llega a sus formatos de transporte, hospedaje y catering.
    private static func onlyFormatsIn(_ user: AccessUser, _ entity: String) -> Bool {
        (user.roleKey == "dir_auditorio" && entity == "ARTA") || user.roleKey == "catering"
    }

    /// Pestaña del evento: ¿la ve esta persona en este negocio?
    static func canSeeModule(_ user: AccessUser, _ entity: String, _ module: EventModule) -> Bool {
        if !entityHasModule(entity, module) { return false }
        if module == .testigos {
            if user.roleKey == "catering" { return false }
            if user.roleKey == "dir_auditorio" && entity == "ARTA" { return false }
            if user.roleKey == "practicante" { return canAccessEntity(user.entities ?? [], "practicante", entity) }
            return opsIn(user, entity)
        }
        if !opsIn(user, entity) { return false }
        if module == .formats { return true }
        if onlyFormatsIn(user, entity) { return false }
        switch module {
        case .corrida:
            return can(user, "corrida.view")
        case .campaign:
            return can(user, "campaign.view") || can(user, "campaign.edit")
        case .convenios:
            return can(user, "convenios.view") || can(user, "convenios.edit")
        case .ticketing:
            return can(user, "ticketing.view") || can(user, "ticketing.edit")
        case .po, .adendum:
            return can(user, "po.view") || can(user, "po.edit") || can(user, "po.authorize") || can(user, "po.mark_paid")
        case .tasks, .documents:
            return user.roleKey != "contenido"
        case .formats, .testigos:
            return false
        }
    }

    /// Datos del show. Williams edita los del Auditorio y solo ve los de Arta; Rodrigo, solo los del Auditorio.
    static func canEditEventInfo(_ user: AccessUser, _ entity: String) -> Bool {
        if !opsIn(user, entity) { return false }
        let role = user.roleKey
        if role == "super_admin" || role == "dir_general" { return true }
        if role == "dir_adjunta" || role == "gerente_arta" { return entity == "ARTA" }
        if role == "dir_auditorio" || role == "produccion" { return entity == "EXPLANADA" }
        if role == "logistica" || role == "convenios" || role == "enlace_gobierno" { return true }
        return false
    }

    /// Boletera: Williams la edita en Auditorio y la ve en Arta.
    static func canEditTicketing(_ user: AccessUser, _ entity: String) -> Bool {
        if !canSeeModule(user, entity, .ticketing) || !can(user, "ticketing.edit") { return false }
        return !(user.roleKey == "produccion" && entity == "ARTA")
    }

    /// Campaña: de dirección, gerencia, Williams y contabilidad; solo existe en Arta.
    static func canEditCampaign(_ user: AccessUser, _ entity: String) -> Bool {
        canSeeModule(user, entity, .campaign) && can(user, "campaign.edit")
    }

    // MARK: Formatos

    /// Evento General, Artes y Pendones los aprueban solo Chacho o Arturo.
    static let TOP_APPROVAL_FORMATS: Set<String> = ["EVENTO_GENERAL", "ARTES_SHOWS", "PENDONES"]
    /// El libro de Pendones comparte `CUSTOM` con las plantillas propias del equipo: solo él se reserva.
    static func formatRuleKey(key: String?, name: String?) -> String {
        if key == "CUSTOM", (name ?? "").lowercased().contains("pendones") { return "PENDONES" }
        return key ?? ""
    }
    /// Formatos generales: donde Monse y Kika suben imágenes.
    static let GENERAL_FORMATS: Set<String> = ["EVENTO_GENERAL", "CHECKLIST_AUDITORIO"]
    static let BAR_MERCH_FORMATS: Set<String> = ["BARRA", "MERCH"]
    private static let WILLIAMS_ARTA_FORMATS: Set<String> = ["PRODUCCION", "TRANSPORTACION", "HOSPEDAJE"]
    private static let RODRIGO_ARTA_FORMATS: Set<String> = ["TRANSPORTACION", "HOSPEDAJE", "CATERING"]

    static func canSeeFormat(_ user: AccessUser, _ entity: String, _ key: String) -> Bool {
        if !opsIn(user, entity) { return false }
        let role = user.roleKey
        if role == "dir_auditorio" && entity == "ARTA" { return RODRIGO_ARTA_FORMATS.contains(key) }
        if role == "catering" { return key == "CATERING" }
        if role == "contenido" { return GENERAL_FORMATS.contains(key) }
        return true
    }

    static func canEditFormat(_ user: AccessUser, _ entity: String, _ key: String) -> Bool {
        if !canSeeFormat(user, entity, key) { return false }
        let role = user.roleKey
        if role == "super_admin" || role == "dir_general" { return true }
        if role == "dir_adjunta" || role == "gerente_arta" { return entity == "ARTA" }
        if role == "dir_auditorio" { return true }
        if role == "produccion" { return entity == "EXPLANADA" || WILLIAMS_ARTA_FORMATS.contains(key) }
        if role == "compras" { return BAR_MERCH_FORMATS.contains(key) }
        if role == "catering" { return key == "CATERING" }
        if role == "contenido" || role == "contabilidad" { return false }
        return can(user, "checklist.edit")
    }

    /// Subir imágenes a un formato: quien lo edita, y Monse y Kika en los generales.
    static func canAddFormatImages(_ user: AccessUser, _ entity: String, _ key: String) -> Bool {
        if canEditFormat(user, entity, key) { return true }
        return user.roleKey == "contenido" && canSeeFormat(user, entity, key)
    }

    static func canApproveFormat(_ user: AccessUser, _ entity: String, _ key: String) -> Bool {
        if !opsIn(user, entity) { return false }
        let role = user.roleKey
        if role == "super_admin" || role == "dir_general" { return true }
        if role == "dir_adjunta" || role == "gerente_arta" {
            return entity == "ARTA" && !TOP_APPROVAL_FORMATS.contains(key)
        }
        if role == "dir_auditorio" { return entity == "EXPLANADA" }
        return false
    }

    /// Quién puede agregar un formato al evento.
    static func canCreateFormats(_ user: AccessUser, _ entity: String) -> Bool {
        if !opsIn(user, entity) { return false }
        let role = user.roleKey
        return role != "contenido" && role != "contabilidad" && role != "catering" && can(user, "checklist.edit")
    }
}
