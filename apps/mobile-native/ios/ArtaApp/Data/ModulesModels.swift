import Foundation

// Contratos de los módulos diarios (Inicio, Tareas, Eventos, Aprobaciones), con
// las mismas formas que devuelven `tasks`, `events`, `calendar/notes`,
// `purchase-orders` y `analytics/purchase-orders`. Todo lo que el API puede
// omitir es opcional; las fechas llegan como texto ISO y se leen con `parseDate`.

// MARK: - Montos

/// `Decimal` de Prisma llega como texto («1234.50»); los montos de analytics, como número.
struct FlexDouble: Codable, Equatable, Hashable {
    let value: Double

    init(_ value: Double) { self.value = value }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) {
            value = d
        } else if let s = try? c.decode(String.self), let d = Double(s.trimmingCharacters(in: .whitespaces)) {
            value = d
        } else {
            // Un monto ilegible no debe tumbar la lista entera.
            value = 0
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(value)
    }
}

// MARK: - Perfil con permisos

/// `GET auth/me` completo: `UserDto` no trae entidades ni permisos.
struct ModulesProfile: Codable, Equatable {
    let id: String
    var fullName: String?
    var roleKey: String?
    var entities: [String]?
    var permissions: [String]?
}

struct ModulesMeResponse: Codable {
    let user: ModulesProfile
}

extension ModulesProfile {
    var role: String { roleKey ?? "" }

    /// `isDirectionRole` del API: aprueba cualquier entrega y reabre.
    var isDirection: Bool { ["super_admin", "dir_general", "dir_adjunta"].contains(role) }

    /// Mismo criterio que `hasPermission` (`apps/api/src/common/rbac/roles.ts`).
    func can(_ permission: String) -> Bool {
        if role == "super_admin" || role == "dir_general" { return true }
        if role == "dir_adjunta" && permission != "users.manage" { return true }
        let fromRole = Self.rolePermissions[role] ?? []
        if fromRole.contains("everything") || fromRole.contains(permission) { return true }
        return (permissions ?? []).contains(permission)
    }

    private static let rolePermissions: [String: [String]] = [
        "gerente_arta": [
            "finance.edit", "finance.view", "campaign.edit", "campaign.view", "po.authorize", "po.mark_paid",
            "event.create", "event.close", "checklist.edit", "studio.edit", "ticketing.edit", "folders.edit", "vendor.pin",
        ],
        "dir_auditorio": [
            "finance.view", "campaign.view", "po.authorize", "po.mark_paid", "event.create", "event.close",
            "checklist.edit", "studio.edit", "ticketing.edit", "folders.edit", "vendor.pin",
        ],
        "logistica": ["campaign.edit", "campaign.view", "checklist.edit", "event.create", "ticketing.edit", "finance.view", "folders.edit"],
        "convenios": ["checklist.edit", "finance.view", "campaign.view", "folders.edit"],
        "enlace_gobierno": ["checklist.edit", "finance.view", "po.mark_paid", "event.create", "folders.edit"],
    ]

    /// `eventOpsEntities`: solo carpetas no opera eventos; Auditorio no opera Arta.
    var eventEntities: [String] {
        guard role != "solo_carpetas" else { return [] }
        return (entities ?? []).filter { !(role == "dir_auditorio" && $0 == "ARTA") }
    }

    /// Ve «Todas las tareas» (`GET tasks/workload`).
    var seesTeamTasks: Bool {
        ["super_admin", "dir_general", "dir_adjunta", "gerente_arta", "dir_auditorio", "convenios"].contains(role)
    }

    var canAuthorizePO: Bool { can("po.authorize") }

    /// El API además limita: gerencia de Arta solo autoriza Arta y Auditorio solo Explanada.
    func authorizesPO(entity: String?) -> Bool {
        guard canAuthorizePO else { return false }
        if role == "gerente_arta" { return entity == "ARTA" }
        if role == "dir_auditorio" { return entity == "EXPLANADA" }
        return true
    }
}

// MARK: - Personas

struct PersonRef: Codable, Equatable, Hashable, Identifiable {
    let id: String
    var fullName: String?
    var email: String?

    var name: String {
        if let fullName, !fullName.isEmpty { return fullName }
        return email ?? "Sin nombre"
    }
}

struct NameRef: Codable, Equatable, Hashable {
    var fullName: String?
}

/// `GET users/directory`.
struct DirectoryPerson: Codable, Equatable, Hashable, Identifiable {
    let id: String
    var fullName: String?
    var email: String?
    var title: String?
    var roleKey: String?

    var name: String {
        if let fullName, !fullName.isEmpty { return fullName }
        return email ?? "Sin nombre"
    }
}

// MARK: - Tareas

struct TaskEventRef: Codable, Equatable, Hashable {
    let id: String
    var name: String?
    var status: String?
    var entity: String?
}

struct TaskEvidence: Codable, Equatable, Identifiable {
    let id: String
    let fileUrl: String
    var label: String?
    var note: String?
    var createdAt: String?
    var uploadedBy: PersonRef?

    var displayName: String {
        if let label, !label.isEmpty { return label }
        return (fileUrl as NSString).lastPathComponent
    }
}

struct TaskActivity: Codable, Equatable, Identifiable {
    let id: String
    let action: String
    var detail: String?
    var createdAt: String?
    var actor: PersonRef?
}

/// Fila de `TaskAssignment` con `assigneeIds` / `assignees` (el principal primero).
struct ArtaTask: Codable, Equatable, Identifiable {
    let id: String
    var title: String
    var module: String?
    var detail: String?
    var status: String
    var dueAt: String?
    var seenAt: String?
    var submittedAt: String?
    var completionNote: String?
    var rejectionNote: String?
    var approvedAt: String?
    var rejectedAt: String?
    var createdAt: String?
    var updatedAt: String?
    var eventId: String?
    var assigneeId: String?
    var assignee: PersonRef?
    var assigneeIds: [String]?
    var assignees: [PersonRef]?
    var createdById: String?
    var createdBy: PersonRef?
    var approvedBy: PersonRef?
    var rejectedBy: PersonRef?
    var event: TaskEventRef?
    var evidences: [TaskEvidence]?
    var activities: [TaskActivity]?
}

extension ArtaTask {
    var allAssigneeIds: [String] {
        if let ids = assigneeIds, !ids.isEmpty { return ids }
        return assigneeId.map { [$0] } ?? []
    }

    var people: [PersonRef] {
        if let list = assignees, !list.isEmpty { return list }
        return assignee.map { [$0] } ?? []
    }

    func isAssignee(_ userId: String?) -> Bool {
        guard let userId else { return false }
        return allAssigneeIds.contains(userId)
    }

    /// Hay quien pidió y no está entre los responsables: hace falta visto bueno.
    var needsApproval: Bool {
        guard let creator = createdById else { return false }
        return !isAssignee(creator)
    }

    var isDone: Bool { status == "DONE" }
    var isPendingApproval: Bool { status == "PENDING_APPROVAL" }
    var isEventClosed: Bool { event?.status == "CLOSED" || event?.status == "CANCELLED" }
    var evidenceList: [TaskEvidence] { evidences ?? [] }
    var activityList: [TaskActivity] { activities ?? [] }
}

struct CreateTaskBody: Encodable {
    var title: String
    var detail: String? = nil
    var module: String? = nil
    var assigneeIds: [String] = []
    var eventId: String? = nil
    var dueAt: String? = nil
}

/// `PATCH tasks/:id`. Lo que va en `nil` no se manda; `dueAt = .some(nil)` manda `null` (quita la fecha).
struct UpdateTaskBody: Encodable {
    var title: String? = nil
    var detail: String? = nil
    var module: String? = nil
    var assigneeIds: [String]? = nil
    var status: String? = nil
    var dueAt: String?? = nil

    enum CodingKeys: String, CodingKey {
        case title, detail, module, assigneeIds, status, dueAt
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(detail, forKey: .detail)
        try c.encodeIfPresent(module, forKey: .module)
        try c.encodeIfPresent(assigneeIds, forKey: .assigneeIds)
        try c.encodeIfPresent(status, forKey: .status)
        if let due = dueAt {
            if let value = due {
                try c.encode(value, forKey: .dueAt)
            } else {
                try c.encodeNil(forKey: .dueAt)
            }
        }
    }
}

struct SubmitTaskBody: Encodable {
    let completionNote: String
}

struct RejectTaskBody: Encodable {
    let note: String
}

// MARK: - Eventos

/// Fila de `GET events`.
struct ArtaEvent: Codable, Equatable, Hashable, Identifiable {
    let id: String
    var name: String
    var artist: String?
    var promoter: String?
    var venue: String?
    var city: String?
    var status: String?
    var entity: String?
    var startsAt: String?
    var endsAt: String?
    var schedule: String?
    var functions: Int?
    var updatedAt: String?
}

struct EventChecklistRef: Codable, Equatable, Identifiable {
    let id: String
    var title: String?
    var progressPct: Double?
    var status: String?
}

struct EventPurchaseOrderRef: Codable, Equatable, Identifiable {
    let id: String
    var status: String?
    var amount: FlexDouble?
    var vendorName: String?
    var rubro: String?
}

struct EventFileRef: Codable, Equatable, Identifiable {
    let id: String
    var fileName: String?
    var url: String?
    var module: String?
}

/// `GET events/:id` (solo lo que pintan Resumen y Tareas; el resto se ignora).
struct ArtaEventDetail: Codable, Equatable, Identifiable {
    let id: String
    var name: String
    var artist: String?
    var promoter: String?
    var venue: String?
    var city: String?
    var status: String?
    var entity: String?
    var startsAt: String?
    var endsAt: String?
    var notes: String?
    var description: String?
    var schedule: String?
    var functions: Int?
    var createdBy: PersonRef?
    var checklists: [EventChecklistRef]?
    var purchaseOrders: [EventPurchaseOrderRef]?
    var tasks: [ArtaTask]?
    var files: [EventFileRef]?

    var isClosed: Bool { status == "CLOSED" || status == "CANCELLED" }
}

/// `POST chat/event/:eventId` devuelve el canal completo; aquí solo hace falta el id.
struct EventChannelRef: Codable {
    let id: String
}

// MARK: - Notas del calendario

struct CalendarNote: Codable, Equatable, Identifiable {
    let id: String
    /// `AAAA-MM-DD`, sin hora.
    var date: String
    var text: String
    var entity: String?
    var createdBy: PersonRef?
    var updatedBy: PersonRef?
    var createdAt: String?
    var updatedAt: String?
}

struct CalendarNoteBody: Encodable {
    let entity: String
    let date: String
    let text: String
}

struct CalendarNoteTextBody: Encodable {
    let text: String
}

// MARK: - Órdenes de compra

/// Fila de `GET analytics/purchase-orders` → `orders[]`.
struct PurchaseOrderRow: Codable, Equatable, Identifiable {
    let id: String
    var eventId: String?
    var eventName: String?
    var eventStatus: String?
    var rubro: String?
    var vendorName: String?
    var paymentMethod: String?
    var payeeType: String?
    var withIva: Bool?
    var proofCount: Int?
    var status: String
    var amount: FlexDouble?
    var ageDays: Double?
    var createdAt: String?
    /// Aquí es el nombre (texto), no un objeto.
    var createdBy: String?
    var authorizedBy: String?
    /// La pone la app: de qué entidad se pidió la lista.
    var entity: String? = nil

    /// DRAFT es una orden regresada a borrador: no espera autorización.
    var isPending: Bool { status == "PENDING_AUTH" }
    var isEventClosed: Bool { eventStatus == "CLOSED" || eventStatus == "CANCELLED" }
}

struct PurchaseOrderAnalytics: Codable {
    var orders: [PurchaseOrderRow]?
}

struct PurchaseOrderLine: Codable, Equatable, Identifiable {
    let id: String
    var concept: String?
    var qty: FlexDouble?
    var unitPrice: FlexDouble?
    var total: FlexDouble?
}

struct PurchaseOrderProof: Codable, Equatable, Identifiable {
    let id: String
    var fileUrl: String
    var label: String?
    var amount: FlexDouble?
    var createdAt: String?
}

/// `GET purchase-orders/:id`.
struct PurchaseOrderDetail: Codable, Equatable, Identifiable {
    let id: String
    var eventId: String?
    var rubro: String?
    var vendorName: String?
    var description: String?
    var status: String?
    var paymentMethod: String?
    var payeeType: String?
    var withIva: Bool?
    var amount: FlexDouble?
    var createdAt: String?
    var authorizedAt: String?
    var paidAt: String?
    var event: TaskEventRef?
    var createdBy: NameRef?
    var authorizedBy: NameRef?
    var lines: [PurchaseOrderLine]?
    var proofs: [PurchaseOrderProof]?

    var isPending: Bool { status == "PENDING_AUTH" }
    var isEventClosed: Bool { event?.status == "CLOSED" || event?.status == "CANCELLED" }
}

struct PurchaseOrderStatusBody: Encodable {
    let status: String
}

// MARK: - Anticipos (docs/ANTICIPOS-CONTRATO.md)

/// Fila de `GET finance/advances/pending`: un `PaymentProof` sin orden de compra.
/// `event` trae `{ id, name, entity }` (sin `status`).
struct AdvanceRow: Codable, Equatable, Identifiable {
    let id: String
    var eventId: String?
    var label: String?
    var amount: FlexDouble?
    var fileUrl: String?
    var note: String?
    /// PENDING | APPROVED | REJECTED | PAID (null en comprobantes de OC).
    var advanceStatus: String?
    var createdAt: String?
    var decidedAt: String?
    var rejectReason: String?
    var paidAt: String?
    var paidProofUrl: String?
    var uploadedBy: PersonRef?
    var decidedBy: PersonRef?
    var paidBy: PersonRef?
    var event: TaskEventRef?

    var isPending: Bool { advanceStatus == "PENDING" }
    var isApproved: Bool { advanceStatus == "APPROVED" }
}

struct AdvanceRejectBody: Encodable {
    let reason: String
}
