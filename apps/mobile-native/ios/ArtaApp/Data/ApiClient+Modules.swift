import Foundation

// Rutas de los módulos diarios. Mismas llamadas que hace el panel web en
// `app/(app)/{dashboard,tasks,calendar,events,purchase-orders}`.
extension ApiClient {
    // MARK: Perfil

    func modulesProfile() async throws -> ModulesProfile {
        let res: ModulesMeResponse = try await get("auth/me")
        return res.user
    }

    func directory() async throws -> [DirectoryPerson] { try await get("users/directory") }

    // MARK: Tareas

    func myTasks() async throws -> [ArtaTask] { try await get("tasks/mine") }
    func requestedTasks() async throws -> [ArtaTask] { try await get("tasks/requested") }

    /// Solo dirección y convenios (403 para el resto).
    func teamTasks(status: String? = nil) async throws -> [ArtaTask] {
        try await get("tasks/workload", query: ["status": status])
    }

    func eventTasks(_ eventId: String) async throws -> [ArtaTask] { try await get("tasks/event/\(eventId)") }
    func task(_ id: String) async throws -> ArtaTask { try await get("tasks/\(id)") }

    func createTask(_ body: CreateTaskBody) async throws -> ArtaTask {
        try await send("POST", "tasks", body: body, as: ArtaTask.self)
    }

    func updateTask(_ id: String, _ body: UpdateTaskBody) async throws -> ArtaTask {
        try await send("PATCH", "tasks/\(id)", body: body, as: ArtaTask.self)
    }

    func deleteTask(_ id: String) async throws { try await send("DELETE", "tasks/\(id)") }

    /// Entrega con evidencia: va a revisión de quien la pidió (o se cierra si no hay quien apruebe).
    func submitTask(_ id: String, note: String) async throws -> ArtaTask {
        try await send("POST", "tasks/\(id)/submit", body: SubmitTaskBody(completionNote: note), as: ArtaTask.self)
    }

    func approveTask(_ id: String) async throws -> ArtaTask {
        try await send("POST", "tasks/\(id)/approve", as: ArtaTask.self)
    }

    func rejectTask(_ id: String, note: String) async throws -> ArtaTask {
        try await send("POST", "tasks/\(id)/reject", body: RejectTaskBody(note: note), as: ArtaTask.self)
    }

    /// `POST tasks/:id/evidence` (multipart: `file`, `label`, `note`). Responde la evidencia
    /// (`fileUrl`), no un `UploadResult`, por eso no sirve `uploadFile`.
    func uploadTaskEvidence(_ taskId: String, data fileData: Data, filename: String, mime: String, note: String? = nil) async throws -> TaskEvidence {
        var req = request("POST", "tasks/\(taskId)/evidence")
        let boundary = "arta-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 120
        let safeName = filename.components(separatedBy: CharacterSet(charactersIn: "\"\r\n")).joined()
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        field("label", safeName)
        if let note, !note.isEmpty { field("note", note) }
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8))
        body.append(fileData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        req.httpBody = body
        let data = try await perform(req)
        return try JSONDecoder().decode(TaskEvidence.self, from: data)
    }

    // MARK: Eventos

    /// Sin `entity`: todas las entidades que la persona opera. `scope`: active | past | all.
    func events(scope: String? = nil, entity: String? = nil) async throws -> [ArtaEvent] {
        try await get("events", query: ["scope": scope, "entity": entity])
    }

    func event(_ id: String) async throws -> ArtaEventDetail { try await get("events/\(id)") }

    /// Abre (o crea) el canal de chat del evento y devuelve su id.
    func openEventChannel(_ eventId: String) async throws -> String {
        let channel = try await send("POST", "chat/event/\(eventId)", as: EventChannelRef.self)
        return channel.id
    }

    // MARK: Notas del calendario

    func calendarNotes(entity: String, from: String? = nil, to: String? = nil) async throws -> [CalendarNote] {
        try await get("calendar/notes", query: ["entity": entity, "from": from, "to": to])
    }

    func createCalendarNote(_ body: CalendarNoteBody) async throws -> CalendarNote {
        try await send("POST", "calendar/notes", body: body, as: CalendarNote.self)
    }

    func updateCalendarNote(_ id: String, text: String) async throws -> CalendarNote {
        try await send("PATCH", "calendar/notes/\(id)", body: CalendarNoteTextBody(text: text), as: CalendarNote.self)
    }

    func deleteCalendarNote(_ id: String) async throws { try await send("DELETE", "calendar/notes/\(id)") }

    // MARK: Órdenes de compra

    /// Todas las órdenes de una entidad (la misma lista que «Pagos y autorizaciones» en la web).
    func purchaseOrders(entity: String) async throws -> [PurchaseOrderRow] {
        let res: PurchaseOrderAnalytics = try await get("analytics/purchase-orders", query: ["entity": entity])
        return (res.orders ?? []).map { row in
            var copy = row
            copy.entity = entity
            return copy
        }
    }

    func purchaseOrder(_ id: String) async throws -> PurchaseOrderDetail { try await get("purchase-orders/\(id)") }

    /// AUTHORIZED / REJECTED piden `po.authorize`; el API no guarda motivo de rechazo.
    func setPurchaseOrderStatus(_ id: String, status: String) async throws {
        try await send("PATCH", "purchase-orders/\(id)/status", body: PurchaseOrderStatusBody(status: status))
    }
}
