import SwiftUI

/// Pantalla de inicio según la propuesta aprobada (docs/diseno/SISTEMA-VISUAL.md): marca y
/// chip de la entidad, fecha y saludo, dos cifras, «Hoy» como línea de tiempo cuando hay
/// evento, lo que espera mi visto bueno con su estado (lleno = requiere acción, borde =
/// informativo), mis pendientes, accesos y la semana. Todo de la entidad activa (el chip la
/// muestra y, a los híbridos, la cambia). Solo usa lo que ya se cargaba: sin rutas nuevas.
struct InicioView: View {
    let user: UserDto

    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var activeEntity: ActiveEntity
    @State private var profile: ModulesProfile?
    @State private var myTasks: [ArtaTask] = []
    /// Eventos activos de la entidad (la semana y el próximo show salen de aquí).
    @State private var activeEvents: [ArtaEvent] = []
    @State private var approvalTasks: [ArtaTask] = []
    @State private var approvalOrders: [PurchaseOrderRow] = []
    @State private var approvalAdvances: [AdvanceRow] = []
    @State private var loading = true
    @State private var loaded = false
    @State private var error: String?
    @State private var refreshError: String?
    @State private var showNewTask = false
    @ScaledMetric(relativeTo: .largeTitle) private var greetingSize: CGFloat = 30
    @ScaledMetric(relativeTo: .title) private var figureSize: CGFloat = 28

    private var isLight: Bool { activeEntity.current == .arta }

    private var firstName: String {
        let full = (profile?.fullName ?? user.fullName ?? "").moduleTrimmed
        return full.split(separator: " ").first.map(String.init) ?? ""
    }

    private var openTasks: [ArtaTask] { myTasks.filter { !$0.isDone } }

    private var dueTasks: [ArtaTask] {
        let buckets: [DueBucket] = [.overdue, .today]
        return openTasks
            .filter { buckets.contains(DueBucket.of($0)) }
            .sorted { (MDate.dueDay($0.dueAt) ?? .distantFuture) < (MDate.dueDay($1.dueAt) ?? .distantFuture) }
    }

    private var overdueCount: Int { openTasks.filter { DueBucket.of($0) == .overdue }.count }
    private var dueTodayCount: Int { openTasks.filter { DueBucket.of($0) == .today }.count }

    private var taskApprovals: Int { approvalTasks.count }
    private var poApprovals: Int { approvalOrders.count }
    private var advanceApprovals: Int { approvalAdvances.count }
    private var totalApprovals: Int { taskApprovals + poApprovals + advanceApprovals }

    private var showsApprovals: Bool {
        profile?.canAuthorizePO == true || profile?.isDirection == true || taskApprovals > 0 || advanceApprovals > 0
    }

    private var seesPurchaseOrders: Bool {
        profile?.can("po.authorize") == true || profile?.can("po.mark_paid") == true
    }

    private var upcoming: [ArtaEvent] { Self.nextSevenDays(activeEvents) }

    var body: some View {
        Group {
            if !loaded && loading {
                ModuleSkeletonList(rows: 5)
            } else if !loaded, let error {
                ModuleErrorView(message: error) {
                    Task { await load(showSkeleton: true) }
                }
            } else {
                content
            }
        }
        .artaScreenBackground()
        .navigationTitle("Inicio")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // La marca y el chip van en el encabezado de la pantalla, no en la barra.
            ToolbarItem(placement: .principal) {
                Color.clear.frame(width: 1, height: 1).accessibilityHidden(true)
            }
        }
        .task {
            if !loaded { await load() }
        }
        .sheet(isPresented: $showNewTask) {
            TaskFormSheet(mode: .create(eventId: nil)) { _ in
                Task { await load() }
            }
        }
    }

    // MARK: Contenido

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                header
                    .padding(.bottom, 10)
                greeting
                if let refreshError {
                    Label(refreshError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                }
                kpiRow
                    .padding(.top, 6)
                if !timeline.isEmpty { todayCard }
                if showsApprovals { approvalsCard }
                tasksCard
                shortcuts
                    .padding(.top, 4)
                eventsCard
            }
            .padding(.horizontal, 16)
            // La barra de navegación queda vacía (la marca va aquí): el encabezado sube a su altura.
            .padding(.top, -24)
            .padding(.bottom, 24)
        }
        .refreshable { await load() }
    }

    // MARK: Encabezado y saludo

    private var header: some View {
        HStack(alignment: .center) {
            brandMark
            Spacer(minLength: 12)
            EntityChip()
        }
    }

    /// ARTA: el logotipo real (tinta). Auditorio: «EXPLANADA» en plata.
    @ViewBuilder
    private var brandMark: some View {
        if isLight {
            Image("ArtaWordmark")
                .resizable()
                .renderingMode(.template)
                .scaledToFit()
                .frame(height: 25)
                .foregroundStyle(ArtaColor.text)
                .accessibilityLabel("Arta Producciones")
        } else {
            Text("EXPLANADA")
                .font(.system(size: 19, weight: .heavy, design: .rounded))
                .tracking(1.4)
                .foregroundStyle(ArtaColor.silver)
                .accessibilityLabel("Auditorio Explanada")
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 4) {
            CapLabel(MDate.todayTitle())
            Text(greetingText)
                .tracking(-0.6)
                .foregroundStyle(ArtaColor.text)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .accessibilityIdentifier("inicio-greeting")
        }
    }

    /// «Hola, **José Luis**»: ligero con el nombre en 600.
    private var greetingText: AttributedString {
        var hello = AttributedString(firstName.isEmpty ? "Hola" : "Hola, ")
        hello.font = ArtaFont.display(greetingSize, weight: .light)
        guard !firstName.isEmpty else { return hello }
        var name = AttributedString(firstName)
        name.font = ArtaFont.display(greetingSize, weight: .semibold)
        return hello + name
    }

    // MARK: Cifras

    /// ARTA: por aprobar (o el próximo evento) y lo que vence hoy. Auditorio: el próximo show
    /// y lo que espera aprobación (o lo que vence hoy).
    private var kpiRow: some View {
        HStack(alignment: .top, spacing: 12) {
            if isLight {
                if showsApprovals { approvalsKPI } else { nextEventKPI }
                dueKPI
            } else {
                nextEventKPI
                if showsApprovals { approvalsKPI } else { dueKPI }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var approvalsKPI: some View {
        var parts: [String] = []
        if poApprovals > 0 { parts.append("\(poApprovals) OC") }
        if advanceApprovals > 0 { parts.append(advanceApprovals == 1 ? "1 anticipo" : "\(advanceApprovals) anticipos") }
        if taskApprovals > 0 { parts.append(taskApprovals == 1 ? "1 entrega" : "\(taskApprovals) entregas") }
        return kpi(
            "Por aprobar",
            value: "\(totalApprovals)",
            detail: parts.isEmpty ? "Nada pendiente" : parts.joined(separator: " · "),
            id: "inicio-kpi-approvals"
        ) {
            router.open(AppRoute.approvals)
        }
    }

    private var dueKPI: some View {
        let open = openTasks.count
        var detail = open == 0 ? "Sin pendientes" : "de \(open) abiertas"
        if overdueCount > 0 { detail = (overdueCount == 1 ? "1 vencida" : "\(overdueCount) vencidas") + " · " + detail }
        return kpi("Vencen hoy", value: "\(dueTodayCount)", detail: detail, id: "inicio-kpi-due") {
            router.select(.tareas)
        }
    }

    private var nextEventKPI: some View {
        let label = isLight ? "Próximo evento" : "Próximo show"
        guard let event = nextEvent, let start = parseDate(event.startsAt) else {
            return kpi(label, value: "—", detail: "Sin fechas próximas", silver: true, id: "inicio-kpi-next") {
                router.open(AppRoute.web(path: "/calendar", title: "Calendario"))
            }
        }
        let now = Date()
        let end = parseDate(event.endsAt) ?? start
        let days = MDate.daysFromToday(start)
        let value: String
        if start <= now && now <= end {
            value = "En curso"
        } else if days <= 0 {
            value = "Hoy"
        } else if days == 1 {
            value = "Mañana"
        } else {
            value = "\(days) días"
        }
        let who = (event.artist?.moduleTrimmed).flatMap { $0.isEmpty ? nil : $0 } ?? event.name
        return kpi(label, value: value, detail: who + " · " + MDate.dayMonthText(start), silver: true, id: "inicio-kpi-next") {
            router.open(AppRoute.event(event.id))
        }
    }

    /// Tarjeta de cifra: etiqueta, cifra ligera tabular y detalle en terciario.
    private func kpi(
        _ label: String,
        value: String,
        detail: String?,
        silver: Bool = false,
        id: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                CapLabel(label)
                Text(value)
                    .font(ArtaFont.figure(figureSize))
                    .tracking(-0.8)
                    .foregroundStyle(silver ? ArtaColor.figureStyle : AnyShapeStyle(ArtaColor.text))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(ArtaColor.tertiary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .artaCard(padding: 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    // MARK: Hoy

    private struct TimelineItem: Identifiable {
        let id: String
        let time: Date?
        let title: String
        let detail: String?
        /// Relleno = ya empezó o en curso; contorno = pendiente.
        let active: Bool
        let route: AppRoute
    }

    /// Eventos que ocupan el día de hoy (empiezan hoy o siguen en curso).
    private var todayEvents: [ArtaEvent] {
        activeEvents
            .filter { event in
                guard let start = parseDate(event.startsAt) else { return false }
                let end = parseDate(event.endsAt) ?? start
                return MDate.daysFromToday(start) <= 0 && MDate.daysFromToday(end) >= 0
            }
            .sorted { (parseDate($0.startsAt) ?? .distantFuture) < (parseDate($1.startsAt) ?? .distantFuture) }
    }

    /// Solo si hay evento hoy: su inicio y su cierre, y mis tareas que vencen hoy a una hora.
    private var timeline: [TimelineItem] {
        let events = todayEvents
        guard !events.isEmpty else { return [] }
        let now = Date()
        var items: [TimelineItem] = []
        for event in events {
            guard let start = parseDate(event.startsAt) else { continue }
            let end = parseDate(event.endsAt)
            let running = start <= now && (end.map { now <= $0 } ?? false)
            var detail: [String] = []
            if let venue = event.venue?.moduleTrimmed, !venue.isEmpty { detail.append(venue) }
            if running { detail.append("en curso") }
            items.append(TimelineItem(
                id: "start-\(event.id)",
                time: MDate.daysFromToday(start) == 0 ? start : nil,
                title: event.name,
                detail: detail.isEmpty ? nil : detail.joined(separator: " · "),
                active: start <= now,
                route: .event(event.id)
            ))
            if let end, MDate.daysFromToday(end) == 0, end.timeIntervalSince(start) >= 60 {
                items.append(TimelineItem(
                    id: "end-\(event.id)",
                    time: end,
                    title: "Cierre",
                    detail: event.name,
                    active: end <= now,
                    route: .event(event.id)
                ))
            }
        }
        for task in openTasks where DueBucket.of(task) == .today && MDate.dueHasTime(task.dueAt) {
            guard let due = parseDate(task.dueAt) else { continue }
            items.append(TimelineItem(
                id: "task-\(task.id)",
                time: due,
                title: task.title,
                detail: task.event?.name ?? "Tarea",
                active: false,
                route: .task(task.id)
            ))
        }
        return items.sorted { ($0.time ?? .distantPast) < ($1.time ?? .distantPast) }
    }

    private var todayCard: some View {
        let items = timeline
        return PanelCard(title: "Hoy", trailing: todayEvents.count == 1 ? todayEvents.first?.name : "\(todayEvents.count) eventos") {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(items) { item in
                    Button {
                        router.open(item.route)
                    } label: {
                        timelineRow(item)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("inicio-today-\(item.id)")
                }
            }
        }
    }

    private func timelineRow(_ item: TimelineItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(item.time.map(MDate.timeText) ?? "—")
                .font(.caption.monospacedDigit())
                .foregroundStyle(ArtaColor.tertiary)
                .frame(width: 42, alignment: .leading)
                .padding(.top, 1)
            TimelineDot(active: item.active)
                .padding(.top, 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let detail = item.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(ArtaColor.tertiary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }

    // MARK: Aprobaciones

    private struct ApprovalItem: Identifiable {
        let id: String
        let title: String
        let detail: String
        let amount: String?
        let status: String
        let tone: PillTone
        let route: AppRoute
    }

    private var approvalItems: [ApprovalItem] {
        var out: [ApprovalItem] = []
        for order in approvalOrders {
            let rubro = order.rubro?.isEmpty == false ? " · " + POInfo.rubroLabel(order.rubro).lowercased() : ""
            out.append(ApprovalItem(
                id: "po-\(order.id)",
                title: "Orden de compra" + rubro,
                detail: Self.joined([order.vendorName, order.eventName]),
                amount: Money.mxn(order.amount?.value),
                status: "Autorizar",
                tone: .warn,
                route: .approvals
            ))
        }
        for advance in approvalAdvances {
            let label = advance.label?.moduleTrimmed ?? ""
            out.append(ApprovalItem(
                id: "adv-\(advance.id)",
                title: label.isEmpty ? "Anticipo" : "Anticipo · " + label,
                detail: Self.joined([advance.uploadedBy?.name, advance.event?.name]),
                amount: Money.mxn(advance.amount?.value),
                status: advance.isPending ? "Revisar" : "Por pagar",
                tone: advance.isPending ? .warn : .info,
                route: .approvals
            ))
        }
        for task in approvalTasks {
            out.append(ApprovalItem(
                id: "task-\(task.id)",
                title: "Entrega de tarea",
                detail: Self.joined([task.title, task.event?.name]),
                amount: nil,
                status: "Revisar",
                tone: .warn,
                route: .task(task.id)
            ))
        }
        return out
    }

    private var approvalsCard: some View {
        let items = Array(approvalItems.prefix(4))
        return PanelCard(
            title: "Esperan tu visto bueno",
            trailing: "Ver todo",
            trailingId: "inicio-approvals-card",
            trailingAction: { router.open(AppRoute.approvals) }
        ) {
            if items.isEmpty {
                Text("Nada espera tu visto bueno por ahora.")
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.muted)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(items) { item in
                        if item.id != items.first?.id {
                            Rectangle().fill(ArtaColor.line).frame(height: 1)
                        }
                        Button {
                            router.open(item.route)
                        } label: {
                            approvalRow(item)
                        }
                        .buttonStyle(.plain)
                    }
                    if approvalItems.count > items.count {
                        Text("y \(approvalItems.count - items.count) más")
                            .font(.footnote)
                            .foregroundStyle(ArtaColor.tertiary)
                            .padding(.top, 8)
                    }
                }
            }
        }
    }

    private func approvalRow(_ item: ApprovalItem) -> some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(1)
                if !item.detail.isEmpty {
                    Text(item.detail)
                        .font(.caption)
                        .foregroundStyle(ArtaColor.tertiary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            if let amount = item.amount {
                Text(amount)
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(1)
            }
            StatusPill(text: item.status, tone: item.tone)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    // MARK: Pendientes

    private var tasksCard: some View {
        PanelCard(title: "Para hoy", trailing: "Tareas", trailingId: "inicio-tasks-all", trailingAction: { router.select(.tareas) }) {
            if dueTasks.isEmpty {
                Label(openTasks.isEmpty
                      ? "Sin pendientes. Todo al día."
                      : "Nada vence hoy. Tienes \(openTasks.count) pendiente(s) más adelante.",
                      systemImage: "checkmark.circle")
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.muted)
            } else {
                let shown = Array(dueTasks.prefix(6))
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(shown) { task in
                        Button {
                            router.open(AppRoute.task(task.id))
                        } label: {
                            TaskRow(task: task)
                        }
                        .buttonStyle(.plain)
                        if task.id != shown.last?.id {
                            Rectangle().fill(ArtaColor.line).frame(height: 1)
                        }
                    }
                    if dueTasks.count > shown.count {
                        Button {
                            router.select(.tareas)
                        } label: {
                            Text("Ver \(dueTasks.count - shown.count) más en Tareas")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(ArtaColor.accent)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: Accesos

    private var shortcuts: some View {
        VStack(alignment: .leading, spacing: 10) {
            CapLabel("Accesos")
                .padding(.leading, 4)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                tile("Nueva tarea", icon: "plus", id: "inicio-new-task", primary: true) { showNewTask = true }
                tile("Mis tareas", icon: "checklist", id: "inicio-my-tasks") { router.select(.tareas) }
                if showsApprovals {
                    tile("Aprobaciones", icon: "checkmark.seal", id: "inicio-approvals", badge: totalApprovals) {
                        router.open(AppRoute.approvals)
                    }
                }
                tile("Calendario", icon: "calendar", id: "inicio-calendar") {
                    router.open(AppRoute.web(path: "/calendar", title: "Calendario"))
                }
                if seesPurchaseOrders {
                    tile("Órdenes de compra", icon: "doc.text", id: "inicio-purchase-orders") {
                        router.open(AppRoute.web(path: "/purchase-orders", title: "Órdenes de compra"))
                    }
                }
            }
        }
    }

    /// `id`: identificador de accesibilidad (lo usan las pruebas de interfaz de las capturas).
    private func tile(
        _ title: String,
        icon: String,
        id: String,
        badge: Int = 0,
        primary: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: primary ? .semibold : .regular))
                    .frame(width: 20)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                if badge > 0 { CountBadge(count: badge) }
            }
            .foregroundStyle(primary ? ArtaColor.onAccent : ArtaColor.text)
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                if primary {
                    RoundedRectangle(cornerRadius: ArtaRadius.card, style: .continuous).fill(ArtaColor.accentFill)
                } else {
                    ArtaCardBackground()
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    // MARK: Semana

    private var eventsCard: some View {
        PanelCard(
            title: "Próximos 7 días",
            trailing: "Calendario",
            trailingId: "inicio-events-calendar",
            trailingAction: { router.open(AppRoute.web(path: "/calendar", title: "Calendario")) }
        ) {
            if upcoming.isEmpty {
                Label("Sin eventos esta semana.", systemImage: "calendar")
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.muted)
            } else {
                let rows = upcoming
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(rows) { event in
                        if event.id != rows.first?.id {
                            Rectangle().fill(ArtaColor.line).frame(height: 1)
                        }
                        Button {
                            router.open(AppRoute.event(event.id))
                        } label: {
                            EventRow(event: event)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("inicio-event-\(event.id)")
                    }
                }
            }
        }
    }

    // MARK: Datos

    private var nextEvent: ArtaEvent? {
        let now = Date()
        return activeEvents
            .filter { event in
                guard let start = parseDate(event.startsAt) else { return false }
                let end = parseDate(event.endsAt) ?? start
                return end >= now || MDate.daysFromToday(start) >= 0
            }
            .min { (parseDate($0.startsAt) ?? .distantFuture) < (parseDate($1.startsAt) ?? .distantFuture) }
    }

    private static func joined(_ parts: [String?]) -> String {
        parts.compactMap { $0?.moduleTrimmed }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func load(showSkeleton: Bool = false) async {
        if showSkeleton {
            loading = true
            error = nil
        }
        do {
            let me = try await ModulesProfileStore.shared.load(expectedUserId: user.id)
            profile = me
            let tasks = try await ApiClient.shared.myTasks()
            var events: [ArtaEvent] = []
            if let entity = me.activeEventEntity {
                events = try await ApiClient.shared.events(scope: "active", entity: entity)
            }
            myTasks = tasks
            activeEvents = events
            await loadApprovals(me)
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

    /// Lo que espera mi visto bueno. Una lista que falla no tumba la pantalla.
    private func loadApprovals(_ me: ModulesProfile) async {
        var pending: [String: ArtaTask] = [:]
        if let requested = try? await ApiClient.shared.requestedTasks() {
            for task in requested where task.isPendingApproval { pending[task.id] = task }
        }
        if me.isDirection, let team = try? await ApiClient.shared.teamTasks(status: "PENDING_APPROVAL") {
            for task in team where task.isPendingApproval { pending[task.id] = task }
        }
        approvalTasks = pending.values.sorted { ($0.submittedAt ?? "") > ($1.submittedAt ?? "") }

        // Solo las órdenes de la entidad activa.
        var orders: [PurchaseOrderRow] = []
        if let entity = me.activeEventEntity, me.authorizesPO(entity: entity),
           let rows = try? await ApiClient.shared.purchaseOrders(entity: entity) {
            orders = rows.filter { $0.isPending && !$0.isEventClosed }
        }
        approvalOrders = orders

        // 404 mientras el API no tenga la ruta: cuenta 0.
        let advances = (try? await ApiClient.shared.pendingAdvances()) ?? []
        approvalAdvances = advances.filter { $0.isPending || $0.isApproved }
    }

    /// En curso o que empiezan entre hoy y dentro de 7 días.
    private static func nextSevenDays(_ events: [ArtaEvent]) -> [ArtaEvent] {
        events
            .filter { event in
                guard let start = parseDate(event.startsAt) else { return false }
                let startDay = MDate.daysFromToday(start)
                if (0...7).contains(startDay) { return true }
                if startDay < 0, let end = parseDate(event.endsAt) { return MDate.daysFromToday(end) >= 0 }
                return false
            }
            .sorted { (parseDate($0.startsAt) ?? .distantFuture) < (parseDate($1.startsAt) ?? .distantFuture) }
    }
}

/// Punto de la línea de tiempo: relleno = hecho o en curso; contorno = pendiente.
/// En Auditorio, el relleno plata lleva un brillo.
struct TimelineDot: View {
    let active: Bool

    var body: some View {
        let light = ArtaTheme.isLight
        Circle()
            .fill(active ? ArtaColor.accentFill : AnyShapeStyle(ArtaColor.bg))
            .overlay(Circle().strokeBorder(ArtaColor.accent, lineWidth: 2))
            .frame(width: 9, height: 9)
            .shadow(color: active && !light ? Color(hex: 0xC7CCD4, opacity: 0.5) : .clear, radius: 5)
    }
}
