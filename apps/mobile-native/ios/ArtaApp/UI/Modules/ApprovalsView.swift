import QuickLook
import SwiftUI

/// Lo que espera mi visto bueno: entregas de tareas que pedí (o todas, si soy dirección)
/// y órdenes de compra y anticipos de la entidad activa, si puedo autorizarlos.
struct ApprovalsView: View {
    enum Segment: String, CaseIterable, Identifiable {
        case pending = "Pendientes"
        case history = "Historial"
        var id: String { rawValue }
    }

    @EnvironmentObject private var router: AppRouter
    @State private var segment: Segment = .pending
    @State private var profile: ModulesProfile?
    @State private var tasks: [ArtaTask] = []
    @State private var approvedTasks: [ArtaTask] = []
    @State private var orders: [PurchaseOrderRow] = []
    @State private var loading = true
    @State private var loaded = false
    @State private var error: String?
    @State private var refreshError: String?
    @State private var busyTaskId: String?
    @State private var rejecting: ArtaTask?
    @State private var selectedOrder: PurchaseOrderRow?
    @State private var flash: String?
    /// `GET finance/advances/pending`; vacío si el API aún no tiene la ruta (404).
    @State private var advances: [AdvanceRow] = []
    @State private var advancesError: String?
    @State private var rejectingAdvance: AdvanceRow?
    @State private var payingAdvance: AdvanceRow?
    @State private var confirmPay = false
    @State private var previewURL: URL?

    private var pendingOrders: [PurchaseOrderRow] {
        orders
            .filter { $0.isPending && !$0.isEventClosed && profile?.authorizesPO(entity: $0.entity) == true }
            .sorted { ($0.ageDays ?? 0) > ($1.ageDays ?? 0) }
    }

    private var decidedOrders: [PurchaseOrderRow] {
        Array(
            orders
                .filter { !$0.isPending }
                .sorted { ($0.ageDays ?? 0) < ($1.ageDays ?? 0) }
                .prefix(60)
        )
    }

    var body: some View {
        Group {
            if !loaded && loading {
                ModuleSkeletonList()
            } else if !loaded, let error {
                ModuleErrorView(message: error) {
                    Task { await load(showSkeleton: true) }
                }
            } else if segment == .pending {
                pendingList
            } else {
                historyList
            }
        }
        .artaScreenBackground(glow: false)
        .safeAreaInset(edge: .top) {
            Picker("Vista", selection: $segment) {
                ForEach(Segment.allCases) { s in
                    Text(s.rawValue).tag(s)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, ArtaLayout.gutter)
            .padding(.vertical, ArtaSpace.s)
            .background(ArtaColor.bg)
        }
        .flashToast(flash)
        .navigationTitle("Aprobaciones")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if !loaded { await load() }
        }
        .sheet(item: $rejecting) { task in
            RejectTaskSheet(task: task) { _ in
                tasks.removeAll { $0.id == task.id }
                show("Se pidió corrección.")
            }
        }
        .sheet(item: $selectedOrder) { row in
            PurchaseOrderSheet(
                row: row,
                canDecide: profile?.authorizesPO(entity: row.entity) == true,
                onDecided: { status in
                    applyDecision(row.id, status: status)
                },
                onOpen: { route in
                    selectedOrder = nil
                    router.open(route)
                }
            )
        }
        .sheet(item: $rejectingAdvance) { advance in
            RejectAdvanceSheet(advance: advance) { reason in
                Task {
                    await resolveAdvance(advance, done: "Anticipo rechazado.", warn: true) {
                        try await ApiClient.shared.rejectAdvance(advance.id, reason: reason)
                    }
                }
            }
        }
        .confirmationDialog("¿Marcar como pagado?", isPresented: $confirmPay, titleVisibility: .visible, presenting: payingAdvance) { advance in
            Button("Marcar pagado") {
                Task {
                    await resolveAdvance(advance, done: "Anticipo marcado como pagado.") {
                        try await ApiClient.shared.markAdvancePaid(advance.id)
                    }
                }
            }
            Button("Cancelar", role: .cancel) {}
        } message: { advance in
            Text("\(AdvanceInfo.title(advance)) · \(Money.mxn(advance.amount?.value)). A quien lo pidió le llega el aviso.")
        }
        .quickLookPreview($previewURL)
    }

    // MARK: Pendientes

    @ViewBuilder
    private var pendingList: some View {
        if tasks.isEmpty && pendingOrders.isEmpty && advances.isEmpty {
            emptyScroll(icon: "checkmark.seal",
                        title: "Nada por aprobar",
                        message: "Cuando alguien entregue una tarea que pediste, haya una orden de compra por autorizar o un anticipo por resolver, aparecerá aquí.")
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: ArtaSpace.xl) {
                    if let refreshError { errorRow(refreshError) }
                    if let advancesError { errorRow("Anticipos: \(advancesError)") }
                    if !tasks.isEmpty {
                        CardSection(title: "Entregas por revisar", count: tasks.count, items: tasks,
                                    dividerInset: 36, rowPadding: ArtaSpace.s) { task in
                            pendingTaskRow(task)
                        }
                    }
                    if !pendingOrders.isEmpty {
                        CardSection(title: "Órdenes de compra por autorizar", count: pendingOrders.count, items: pendingOrders) { row in
                            orderRow(row)
                        }
                    }
                    if !advances.isEmpty {
                        CardSection(title: "Anticipos", count: advances.count, items: advances) { advance in
                            advanceRow(advance)
                        }
                    }
                }
                .padding(.horizontal, ArtaLayout.gutter)
                .padding(.top, ArtaSpace.m)
                .padding(.bottom, ArtaSpace.l)
            }
            .refreshable { await load() }
            .artaTabBarScrim(glow: false)
        }
    }

    private func pendingTaskRow(_ task: ArtaTask) -> some View {
        VStack(alignment: .leading, spacing: ArtaSpace.s) {
            Button {
                router.open(AppRoute.task(task.id))
            } label: {
                TaskRow(task: task)
            }
            .buttonStyle(ArtaPressStyle(scale: 0.99))
            if let note = task.completionNote, !note.isEmpty {
                Text("«\(note)»")
                    .font(.footnote)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, 36)
            }
            HStack(spacing: ArtaSpace.s) {
                VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
                    if !task.evidenceList.isEmpty {
                        Label(pluralized(task.evidenceList.count, "archivo", "archivos"), systemImage: "paperclip")
                            .font(.caption)
                            .foregroundStyle(ArtaColor.muted)
                    }
                    if let submitted = task.submittedAt {
                        Text("Entregada \(relativeTime(submitted))")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(ArtaColor.tertiary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: ArtaSpace.xs)
                if busyTaskId == task.id {
                    ProgressView().tint(ArtaColor.accent)
                } else {
                    // Corregir abre la hoja del motivo (con su confirmación); no es un botón rojo lleno.
                    Button("Corregir") { rejecting = task }
                        .buttonStyle(ArtaDestructiveButtonStyle(fullWidth: false, compact: true))
                        .disabled(task.isEventClosed)
                    Button("Aprobar") {
                        Task { await approve(task) }
                    }
                    .buttonStyle(ArtaPrimaryButtonStyle(fullWidth: false, compact: true))
                    .disabled(task.isEventClosed)
                }
            }
            .padding(.leading, 36)
        }
    }

    private func orderRow(_ row: PurchaseOrderRow) -> some View {
        Button {
            Haptics.tap()
            selectedOrder = row
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.vendorName?.isEmpty == false ? (row.vendorName ?? "") : POInfo.rubroLabel(row.rubro))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.text)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text([row.eventName ?? "Sin evento", POInfo.rubroLabel(row.rubro)].joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(orderMeta(row))
                        .font(.caption)
                        .foregroundStyle(ArtaColor.tertiary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .layoutPriority(1)
                VStack(alignment: .trailing, spacing: 6) {
                    Text(Money.mxn(row.amount?.value))
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(ArtaColor.text)
                        .fixedSize()
                    StatusPill(text: POInfo.statusLabel(row.status), tone: POInfo.statusTone(row.status))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(ArtaPressStyle(scale: 0.99))
        // Para la prueba de interfaz de las capturas (detalle de la orden).
        .accessibilityIdentifier("approval-order-\(row.id)")
    }

    private func orderMeta(_ row: PurchaseOrderRow) -> String {
        var parts: [String] = []
        if let by = row.createdBy, !by.isEmpty { parts.append("Pidió \(by)") }
        let days = Int(row.ageDays ?? 0)
        parts.append(days <= 0 ? "hoy" : (days == 1 ? "hace 1 día" : "hace \(days) días"))
        if let entity = row.entity { parts.append(EntityInfo.label(entity)) }
        return parts.joined(separator: " · ")
    }

    private func advanceRow(_ advance: AdvanceRow) -> some View {
        VStack(alignment: .leading, spacing: ArtaSpace.m) {
            HStack(alignment: .top, spacing: ArtaSpace.m) {
                VStack(alignment: .leading, spacing: ArtaSpace.xs) {
                    Text(AdvanceInfo.title(advance))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.text)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(advanceEventLine(advance))
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(advanceMeta(advance))
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(ArtaColor.tertiary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .layoutPriority(1)
                VStack(alignment: .trailing, spacing: 6) {
                    Text(Money.mxn(advance.amount?.value))
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(ArtaColor.text)
                        .fixedSize()
                    StatusPill(text: AdvanceInfo.statusLabel(advance.advanceStatus),
                               tone: AdvanceInfo.statusTone(advance.advanceStatus))
                }
            }
            if let note = advance.note?.moduleTrimmed, !note.isEmpty {
                Text("«\(note)»")
                    .font(.footnote)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: ArtaSpace.s) {
                if let fileUrl = advance.fileUrl, !fileUrl.isEmpty {
                    Button {
                        openAdvanceFile(fileUrl, name: advance.label)
                    } label: {
                        Label("Ver archivo", systemImage: "paperclip")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(ArtaColor.text)
                            .padding(.vertical, ArtaSpace.xs)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(ArtaPressStyle(scale: 0.97))
                }
                Spacer(minLength: ArtaSpace.xs)
                if advance.isPending {
                    // Rechazar pide el motivo en su hoja antes de mandar nada.
                    Button("Rechazar") { rejectingAdvance = advance }
                        .buttonStyle(ArtaDestructiveButtonStyle(fullWidth: false, compact: true))
                    Button("Aprobar") {
                        Task {
                            await resolveAdvance(advance, done: "Anticipo aprobado.") {
                                try await ApiClient.shared.approveAdvance(advance.id)
                            }
                        }
                    }
                    .buttonStyle(ArtaPrimaryButtonStyle(fullWidth: false, compact: true))
                } else if advance.isApproved {
                    Button("Marcar pagado") {
                        payingAdvance = advance
                        confirmPay = true
                    }
                    .buttonStyle(ArtaPrimaryButtonStyle(fullWidth: false, compact: true))
                }
            }
        }
    }

    private func advanceEventLine(_ advance: AdvanceRow) -> String {
        var parts: [String] = []
        if let name = advance.event?.name, !name.isEmpty { parts.append(name) } else { parts.append("Sin evento") }
        if let entity = advance.event?.entity, !entity.isEmpty { parts.append(EntityInfo.label(entity)) }
        return parts.joined(separator: " · ")
    }

    private func advanceMeta(_ advance: AdvanceRow) -> String {
        var parts: [String] = []
        if let by = advance.uploadedBy?.fullName, !by.isEmpty { parts.append("Pidió \(by)") }
        let when = relativeTime(advance.createdAt)
        if !when.isEmpty { parts.append(when) }
        return parts.isEmpty ? "Solicitud de anticipo" : parts.joined(separator: " · ")
    }

    // MARK: Historial

    @ViewBuilder
    private var historyList: some View {
        if approvedTasks.isEmpty && decidedOrders.isEmpty {
            emptyScroll(icon: "clock.arrow.circlepath",
                        title: "Sin historial",
                        message: "Aquí verás las entregas que aprobaste y las órdenes de compra ya decididas.")
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: ArtaSpace.xl) {
                    if let refreshError { errorRow(refreshError) }
                    if !approvedTasks.isEmpty {
                        CardSection(title: "Entregas aprobadas", count: approvedTasks.count, items: approvedTasks,
                                    dividerInset: 36, rowPadding: ArtaSpace.s) { task in
                            Button {
                                router.open(AppRoute.task(task.id))
                            } label: {
                                VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
                                    TaskRow(task: task)
                                    if let approved = task.approvedAt {
                                        Text("Aprobada \(relativeTime(approved))")
                                            .font(.caption)
                                            .monospacedDigit()
                                            .foregroundStyle(ArtaColor.tertiary)
                                            .padding(.leading, 36)
                                    }
                                }
                            }
                            .buttonStyle(ArtaPressStyle(scale: 0.99))
                        }
                    }
                    if !decidedOrders.isEmpty {
                        CardSection(title: "Órdenes de compra", count: decidedOrders.count, items: decidedOrders) { row in
                            orderRow(row)
                        }
                    }
                }
                .padding(.horizontal, ArtaLayout.gutter)
                .padding(.top, ArtaSpace.m)
                .padding(.bottom, ArtaSpace.l)
            }
            .refreshable { await load() }
            .artaTabBarScrim(glow: false)
        }
    }

    // MARK: Piezas

    private func emptyScroll(icon: String, title: String, message: String) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                if let refreshError {
                    Label(refreshError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                        .padding(.horizontal, 16)
                }
                ModuleEmptyView(icon: icon, title: title, message: message)
                    .frame(minHeight: 420)
            }
        }
        .refreshable { await load() }
    }

    private func errorRow(_ text: String) -> some View {
        Label(text, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote)
            .foregroundStyle(ArtaColor.danger)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, ArtaSpace.xs)
    }

    // MARK: Datos

    private func load(showSkeleton: Bool = false) async {
        if showSkeleton {
            loading = true
            error = nil
        }
        do {
            let me = try await ModulesProfileStore.shared.load()
            profile = me
            let requested = try await ApiClient.shared.requestedTasks()
            var pending = requested.filter { $0.isPendingApproval }
            if me.isDirection {
                let team = (try? await ApiClient.shared.teamTasks(status: "PENDING_APPROVAL")) ?? []
                let known = Set(pending.map(\.id))
                pending += team.filter { $0.isPendingApproval && !known.contains($0.id) }
            }
            // Solo la entidad activa (docs/entidades-arta-auditorio.md): antes se juntaban las dos.
            var rows: [PurchaseOrderRow] = []
            if let entity = me.activeEventEntity, me.authorizesPO(entity: entity) {
                rows = try await ApiClient.shared.purchaseOrders(entity: entity)
            }
            // La entrega más antigua primero: es la que lleva más tiempo esperando.
            tasks = pending.sorted { ($0.submittedAt ?? "") < ($1.submittedAt ?? "") }
            approvedTasks = requested
                .filter { $0.isDone && $0.approvedAt != nil }
                .sorted { ($0.approvedAt ?? "") > ($1.approvedAt ?? "") }
            orders = rows
            await loadAdvances()
            loaded = true
            error = nil
            refreshError = nil
        } catch {
            if !error.isModuleCancellation {
                if loaded { refreshError = error.userMessage } else { self.error = error.userMessage }
            }
        }
        loading = false
    }

    private func approve(_ task: ArtaTask) async {
        busyTaskId = task.id
        do {
            let updated = try await ApiClient.shared.approveTask(task.id)
            Haptics.success()
            tasks.removeAll { $0.id == task.id }
            approvedTasks.insert(updated, at: 0)
            show("Entrega aprobada.")
        } catch {
            Haptics.error()
            refreshError = error.userMessage
        }
        busyTaskId = nil
    }

    /// Aparte de tareas y órdenes: si falla (o el API aún no tiene la ruta) el resto de la pantalla sigue.
    private func loadAdvances() async {
        do {
            let list = try await ApiClient.shared.pendingAdvances()
            advances = list
                .filter { $0.isPending || $0.isApproved }
                .sorted { a, b in
                    if a.isPending != b.isPending { return a.isPending }
                    return (a.createdAt ?? "") < (b.createdAt ?? "")
                }
            advancesError = nil
        } catch {
            if error.isModuleCancellation { return }
            if let api = error as? ApiError, api.status == 404 || api.status == 403 {
                advances = []
                advancesError = nil
            } else {
                advancesError = error.userMessage
            }
        }
    }

    /// Optimista: la tarjeta sale al instante y vuelve a su lugar si el API falla.
    /// Un 409 trae el motivo en español: se muestra y se recarga la lista.
    private func resolveAdvance(_ advance: AdvanceRow, done: String, warn: Bool = false, call: () async throws -> Void) async {
        let index = advances.firstIndex(where: { $0.id == advance.id }) ?? 0
        advances.removeAll { $0.id == advance.id }
        do {
            try await call()
            if warn { Haptics.warning() } else { Haptics.success() }
            show(done)
            // Quien aprueba también puede pagar: entonces regresa como «Por pagar».
            await loadAdvances()
        } catch {
            if !advances.contains(where: { $0.id == advance.id }) {
                advances.insert(advance, at: min(index, advances.count))
            }
            if error.isModuleCancellation { return }
            Haptics.error()
            refreshError = error.userMessage
            if let api = error as? ApiError, api.status == 409 {
                await loadAdvances()
            }
        }
    }

    private func openAdvanceFile(_ path: String, name: String?) {
        Task {
            do {
                previewURL = try await ModuleFiles.download(path, name: name)
            } catch {
                if !error.isModuleCancellation { refreshError = error.userMessage }
            }
        }
    }

    private func applyDecision(_ orderId: String, status: String) {
        if let index = orders.firstIndex(where: { $0.id == orderId }) {
            orders[index].status = status
            if status == "AUTHORIZED" { orders[index].authorizedBy = profile?.fullName }
        }
        show(status == "AUTHORIZED" ? "Orden de compra autorizada." : "Orden de compra rechazada.")
    }

    private func show(_ text: String) {
        flash = text
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if flash == text { flash = nil }
        }
    }
}

// MARK: - Detalle de la orden de compra

struct PurchaseOrderSheet: View {
    let row: PurchaseOrderRow
    let canDecide: Bool
    let onDecided: (String) -> Void
    /// La hoja no navega por su cuenta: la pantalla que la abrió la cierra y abre la ruta.
    let onOpen: (AppRoute) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var detail: PurchaseOrderDetail?
    @State private var loading = true
    @State private var error: String?
    @State private var busy = false
    @State private var actionError: String?
    @State private var confirmAuthorize = false
    @State private var confirmReject = false
    @State private var previewURL: URL?

    private var amountText: String { Money.mxn(detail?.amount?.value ?? row.amount?.value) }

    var body: some View {
        NavigationStack {
            Group {
                if let detail {
                    content(detail)
                } else if loading {
                    ModuleSkeletonList(rows: 3)
                } else {
                    ModuleErrorView(message: error ?? "No se encontró la orden de compra.") {
                        Task { await load() }
                    }
                }
            }
            .background(ArtaColor.bg)
            .navigationTitle("Orden de compra")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
            .task { await load() }
            .quickLookPreview($previewURL)
            .confirmationDialog("¿Autorizar \(amountText)?", isPresented: $confirmAuthorize, titleVisibility: .visible) {
                Button("Autorizar") {
                    Task { await decide("AUTHORIZED") }
                }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("Pasa a «Por pagar» y le llega el aviso a quien la pidió.")
            }
            .confirmationDialog("¿Rechazar esta orden de compra?", isPresented: $confirmReject, titleVisibility: .visible) {
                Button("Rechazar", role: .destructive) {
                    Task { await decide("REJECTED") }
                }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("El sistema no guarda el motivo: si hace falta, explícalo en el chat del evento.")
            }
        }
    }

    private func content(_ po: PurchaseOrderDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ModuleCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(amountText)
                            .font(ArtaFont.figure(34))
                            .tracking(-0.8)
                            .foregroundStyle(ArtaColor.figureStyle)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        HStack(spacing: 8) {
                            StatusPill(text: POInfo.statusLabel(po.status), tone: POInfo.statusTone(po.status))
                            if let withIva = po.withIva {
                                StatusPill(text: withIva ? "Con IVA" : "Sin IVA")
                            }
                        }
                        Text(po.vendorName?.isEmpty == false ? (po.vendorName ?? "") : "Sin proveedor")
                            .font(.headline)
                            .foregroundStyle(ArtaColor.text)
                        Text(POInfo.rubroLabel(po.rubro))
                            .font(.subheadline)
                            .foregroundStyle(ArtaColor.muted)
                    }
                }

                ModuleCard(title: "Datos") {
                    VStack(alignment: .leading, spacing: ArtaSpace.s) {
                        if let event = po.event {
                            Button {
                                onOpen(AppRoute.event(event.id))
                            } label: {
                                // Misma etiqueta que las demás filas; el valor es el enlace.
                                HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.m) {
                                    Text("Evento").font(.subheadline).foregroundStyle(ArtaColor.tertiary).fixedSize()
                                    Spacer(minLength: ArtaSpace.s)
                                    Text(event.name ?? "Ver evento")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(ArtaColor.text)
                                        .multilineTextAlignment(.trailing)
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(ArtaColor.tertiary)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(ArtaPressStyle(scale: 0.99))
                        }
                        FactRow(label: "Pidió", value: po.createdBy?.fullName ?? row.createdBy ?? "—")
                        if let created = po.createdAt {
                            FactRow(label: "Fecha", value: MDate.stampText(created))
                        }
                        FactRow(label: "Forma de pago", value: POInfo.paymentLabel(po.paymentMethod))
                        FactRow(label: "Beneficiario", value: POInfo.payeeLabel(po.payeeType))
                        if let entity = row.entity {
                            FactRow(label: "Entidad", value: EntityInfo.label(entity))
                        }
                        if let by = po.authorizedBy?.fullName ?? row.authorizedBy, !by.isEmpty {
                            FactRow(label: "Autorizó", value: by)
                        }
                    }
                }

                if let description = po.description, !description.isEmpty {
                    ModuleCard(title: "Descripción") {
                        Text(description).font(.body).foregroundStyle(ArtaColor.text).textSelection(.enabled)
                    }
                }

                if let lines = po.lines, !lines.isEmpty {
                    ModuleCard(title: "Conceptos", count: lines.count) {
                        VStack(alignment: .leading, spacing: ArtaSpace.m) {
                            ForEach(lines) { line in
                                HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.m) {
                                    VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
                                        Text(line.concept ?? "Concepto")
                                            .font(.subheadline)
                                            .foregroundStyle(ArtaColor.text)
                                            .fixedSize(horizontal: false, vertical: true)
                                        if let qty = line.qty?.value, let unit = line.unitPrice?.value {
                                            Text("\(qty.formatted()) × \(Money.mxn(unit))")
                                                .font(.caption)
                                                .monospacedDigit()
                                                .foregroundStyle(ArtaColor.tertiary)
                                        }
                                    }
                                    Spacer(minLength: ArtaSpace.s)
                                    Text(Money.mxn(line.total?.value))
                                        .font(.subheadline.weight(.semibold))
                                        .monospacedDigit()
                                        .foregroundStyle(ArtaColor.text)
                                        .fixedSize()
                                }
                            }
                        }
                    }
                }

                ModuleCard(title: "Comprobantes", count: (po.proofs ?? []).isEmpty ? nil : (po.proofs ?? []).count) {
                    let proofs = po.proofs ?? []
                    if proofs.isEmpty {
                        Text("Sin comprobantes adjuntos.").font(.subheadline).foregroundStyle(ArtaColor.muted)
                    } else {
                        VStack(alignment: .leading, spacing: ArtaSpace.m) {
                            ForEach(proofs) { proof in
                                Button {
                                    open(proof)
                                } label: {
                                    HStack(spacing: ArtaSpace.m) {
                                        Image(systemName: "doc.text.magnifyingglass")
                                            .foregroundStyle(ArtaColor.accent)
                                            .frame(width: 24)
                                        VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
                                            Text(proofName(proof)).font(.subheadline).foregroundStyle(ArtaColor.text).lineLimit(2)
                                            if let amount = proof.amount?.value {
                                                Text(Money.mxn(amount)).font(.caption).monospacedDigit().foregroundStyle(ArtaColor.tertiary)
                                            }
                                        }
                                        Spacer(minLength: ArtaSpace.s)
                                        Image(systemName: "eye").foregroundStyle(ArtaColor.tertiary)
                                    }
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(ArtaPressStyle(scale: 0.99))
                            }
                        }
                    }
                }

                if let actionError {
                    Label(actionError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                }

                if canDecide && po.isPending {
                    if po.isEventClosed {
                        Label("Evento cerrado: ya no se pueden autorizar órdenes.", systemImage: "lock.fill")
                            .font(.footnote)
                            .foregroundStyle(ArtaColor.muted)
                    } else {
                        // Rechazar es discreto y siempre pide confirmación; autorizar es la acción principal.
                        HStack(spacing: ArtaSpace.m) {
                            Button("Rechazar") { confirmReject = true }
                                .buttonStyle(ArtaDestructiveButtonStyle())
                            Button("Autorizar") { confirmAuthorize = true }
                                .buttonStyle(ArtaPrimaryButtonStyle())
                        }
                        .disabled(busy)
                        .padding(.top, ArtaSpace.xs)
                    }
                }

                if let eventId = po.event?.id ?? row.eventId {
                    Button {
                        onOpen(AppRoute.web(path: "/events/\(eventId)?tab=ocs", title: "Órdenes de compra"))
                    } label: {
                        HStack(spacing: ArtaSpace.xs) {
                            Text("Ver las órdenes del evento en la web")
                            Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .semibold))
                        }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ArtaColor.muted)
                        .padding(.vertical, ArtaSpace.s)
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(ArtaPressStyle(scale: 0.98))
                }
            }
            .padding(.horizontal, ArtaLayout.gutter)
            .padding(.vertical, ArtaSpace.l)
        }
    }

    private func proofName(_ proof: PurchaseOrderProof) -> String {
        if let label = proof.label, !label.isEmpty { return label }
        return (proof.fileUrl as NSString).lastPathComponent
    }

    private func load() async {
        loading = true
        error = nil
        do {
            detail = try await ApiClient.shared.purchaseOrder(row.id)
        } catch {
            if !error.isModuleCancellation { self.error = error.userMessage }
        }
        loading = false
    }

    private func decide(_ status: String) async {
        busy = true
        actionError = nil
        do {
            try await ApiClient.shared.setPurchaseOrderStatus(row.id, status: status)
            if status == "AUTHORIZED" { Haptics.success() } else { Haptics.warning() }
            onDecided(status)
            dismiss()
        } catch {
            Haptics.error()
            actionError = error.userMessage
        }
        busy = false
    }

    private func open(_ proof: PurchaseOrderProof) {
        Task {
            do {
                previewURL = try await ModuleFiles.download(proof.fileUrl, name: proof.label)
            } catch {
                actionError = error.userMessage
            }
        }
    }
}
