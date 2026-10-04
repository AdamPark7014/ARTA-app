import QuickLook
import SwiftUI

/// Lo que espera mi visto bueno: entregas de tareas que pedí (o todas, si soy dirección)
/// y órdenes de compra por autorizar de las entidades que puedo autorizar.
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
        .background(ArtaColor.bg)
        .safeAreaInset(edge: .top) {
            Picker("Vista", selection: $segment) {
                ForEach(Segment.allCases) { s in
                    Text(s.rawValue).tag(s)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(ArtaColor.bg)
        }
        .overlay(alignment: .bottom) {
            if let flash {
                Text(flash)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.bg)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(ArtaColor.gold))
                    .padding(.bottom, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: flash)
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
    }

    // MARK: Pendientes

    @ViewBuilder
    private var pendingList: some View {
        if tasks.isEmpty && pendingOrders.isEmpty {
            emptyScroll(icon: "checkmark.seal",
                        title: "Nada por aprobar",
                        message: "Cuando alguien entregue una tarea que pediste o haya una orden de compra por autorizar, aparecerá aquí.")
        } else {
            List {
                if let refreshError { errorRow(refreshError) }
                if !tasks.isEmpty {
                    Section("Entregas por revisar (\(tasks.count))") {
                        ForEach(tasks) { task in
                            pendingTaskRow(task)
                        }
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
                if !pendingOrders.isEmpty {
                    Section("Órdenes de compra por autorizar (\(pendingOrders.count))") {
                        ForEach(pendingOrders) { row in
                            orderRow(row)
                        }
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .refreshable { await load() }
        }
    }

    private func pendingTaskRow(_ task: ArtaTask) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                router.open(AppRoute.task(task.id))
            } label: {
                TaskRow(task: task)
            }
            .buttonStyle(.plain)
            if let note = task.completionNote, !note.isEmpty {
                Text("«\(note)»")
                    .font(.footnote)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(3)
            }
            HStack(spacing: 8) {
                if !task.evidenceList.isEmpty {
                    Label("\(task.evidenceList.count)", systemImage: "paperclip")
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                }
                if let submitted = task.submittedAt {
                    Text("Entregada \(relativeTime(submitted))")
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                if busyTaskId == task.id {
                    ProgressView()
                } else {
                    Button("Corregir") { rejecting = task }
                        .buttonStyle(.bordered)
                        .tint(ArtaColor.danger)
                        .disabled(task.isEventClosed)
                    Button("Aprobar") {
                        Task { await approve(task) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(ArtaColor.gold)
                    .foregroundStyle(ArtaColor.bg)
                    .disabled(task.isEventClosed)
                }
            }
            .controlSize(.small)
        }
        .padding(.vertical, 4)
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
                        .lineLimit(1)
                    Text([row.eventName ?? "Sin evento", POInfo.rubroLabel(row.rubro)].joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(1)
                    Text(orderMeta(row))
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 4) {
                    Text(Money.mxn(row.amount?.value))
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(ArtaColor.text)
                    StatusPill(text: POInfo.statusLabel(row.status), tone: POInfo.statusTone(row.status))
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func orderMeta(_ row: PurchaseOrderRow) -> String {
        var parts: [String] = []
        if let by = row.createdBy, !by.isEmpty { parts.append("Pidió \(by)") }
        let days = Int(row.ageDays ?? 0)
        parts.append(days <= 0 ? "hoy" : (days == 1 ? "hace 1 día" : "hace \(days) días"))
        if let entity = row.entity { parts.append(EntityInfo.label(entity)) }
        return parts.joined(separator: " · ")
    }

    // MARK: Historial

    @ViewBuilder
    private var historyList: some View {
        if approvedTasks.isEmpty && decidedOrders.isEmpty {
            emptyScroll(icon: "clock.arrow.circlepath",
                        title: "Sin historial",
                        message: "Aquí verás las entregas que aprobaste y las órdenes de compra ya decididas.")
        } else {
            List {
                if let refreshError { errorRow(refreshError) }
                if !approvedTasks.isEmpty {
                    Section("Entregas aprobadas") {
                        ForEach(approvedTasks) { task in
                            Button {
                                router.open(AppRoute.task(task.id))
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    TaskRow(task: task)
                                    if let approved = task.approvedAt {
                                        Text("Aprobada \(relativeTime(approved))")
                                            .font(.caption)
                                            .foregroundStyle(ArtaColor.muted)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
                if !decidedOrders.isEmpty {
                    Section("Órdenes de compra") {
                        ForEach(decidedOrders) { row in
                            orderRow(row)
                        }
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .refreshable { await load() }
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
            .listRowBackground(Color.clear)
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
            var rows: [PurchaseOrderRow] = []
            for entity in me.eventEntities where me.authorizesPO(entity: entity) {
                rows += try await ApiClient.shared.purchaseOrders(entity: entity)
            }
            // La entrega más antigua primero: es la que lleva más tiempo esperando.
            tasks = pending.sorted { ($0.submittedAt ?? "") < ($1.submittedAt ?? "") }
            approvedTasks = requested
                .filter { $0.isDone && $0.approvedAt != nil }
                .sorted { ($0.approvedAt ?? "") > ($1.approvedAt ?? "") }
            orders = rows
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
                            .font(.largeTitle.weight(.bold))
                            .foregroundStyle(ArtaColor.text)
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
                    VStack(alignment: .leading, spacing: 8) {
                        if let event = po.event {
                            Button {
                                onOpen(AppRoute.event(event.id))
                            } label: {
                                HStack {
                                    Text("Evento").font(.subheadline).foregroundStyle(ArtaColor.muted)
                                    Spacer(minLength: 8)
                                    Text(event.name ?? "Ver evento").font(.subheadline.weight(.semibold)).foregroundStyle(ArtaColor.gold)
                                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(ArtaColor.gold)
                                }
                            }
                            .buttonStyle(.plain)
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
                    ModuleCard(title: "Conceptos") {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(lines) { line in
                                HStack(alignment: .firstTextBaseline) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(line.concept ?? "Concepto").font(.subheadline).foregroundStyle(ArtaColor.text)
                                        if let qty = line.qty?.value, let unit = line.unitPrice?.value {
                                            Text("\(qty.formatted()) × \(Money.mxn(unit))")
                                                .font(.caption)
                                                .foregroundStyle(ArtaColor.muted)
                                        }
                                    }
                                    Spacer(minLength: 8)
                                    Text(Money.mxn(line.total?.value)).font(.subheadline.weight(.semibold)).foregroundStyle(ArtaColor.text)
                                }
                            }
                        }
                    }
                }

                ModuleCard(title: "Comprobantes") {
                    let proofs = po.proofs ?? []
                    if proofs.isEmpty {
                        Text("Sin comprobantes adjuntos.").font(.subheadline).foregroundStyle(ArtaColor.muted)
                    } else {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(proofs) { proof in
                                Button {
                                    open(proof)
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "doc.text.magnifyingglass").foregroundStyle(ArtaColor.gold)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(proofName(proof)).font(.subheadline).foregroundStyle(ArtaColor.text).lineLimit(1)
                                            if let amount = proof.amount?.value {
                                                Text(Money.mxn(amount)).font(.caption).foregroundStyle(ArtaColor.muted)
                                            }
                                        }
                                        Spacer()
                                        Image(systemName: "eye").foregroundStyle(ArtaColor.muted)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                if let eventId = po.event?.id ?? row.eventId {
                    Button {
                        onOpen(AppRoute.web(path: "/events/\(eventId)?tab=ocs", title: "Órdenes de compra"))
                    } label: {
                        Label("Ver órdenes del evento en la web", systemImage: "safari")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ArtaColor.gold)
                    }
                    .buttonStyle(.plain)
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
                        HStack(spacing: 12) {
                            Button {
                                confirmReject = true
                            } label: {
                                Text("Rechazar")
                                    .font(.subheadline.weight(.semibold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .foregroundStyle(ArtaColor.danger)
                                    .background(RoundedRectangle(cornerRadius: 12).fill(ArtaColor.danger.opacity(0.14)))
                            }
                            .buttonStyle(.plain)
                            Button {
                                confirmAuthorize = true
                            } label: {
                                Text("Autorizar")
                                    .font(.subheadline.weight(.semibold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .foregroundStyle(ArtaColor.bg)
                                    .background(RoundedRectangle(cornerRadius: 12).fill(ArtaColor.gold))
                            }
                            .buttonStyle(.plain)
                        }
                        .disabled(busy)
                        .opacity(busy ? 0.6 : 1)
                    }
                }
            }
            .padding(16)
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
