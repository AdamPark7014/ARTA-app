import SwiftUI

/// Pantalla de inicio: lo que vence hoy, lo que espera mi visto bueno y los eventos de la semana.
struct InicioView: View {
    let user: UserDto

    @EnvironmentObject private var router: AppRouter
    @State private var profile: ModulesProfile?
    @State private var myTasks: [ArtaTask] = []
    @State private var upcoming: [ArtaEvent] = []
    @State private var taskApprovals = 0
    @State private var poApprovals = 0
    @State private var loading = true
    @State private var loaded = false
    @State private var error: String?
    @State private var refreshError: String?
    @State private var showNewTask = false

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

    private var showsApprovals: Bool {
        profile?.canAuthorizePO == true || profile?.isDirection == true || taskApprovals > 0
    }

    private var seesPurchaseOrders: Bool {
        profile?.can("po.authorize") == true || profile?.can("po.mark_paid") == true
    }

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
        .background(ArtaColor.bg)
        .navigationTitle("Inicio")
        .navigationBarTitleDisplayMode(.inline)
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
            VStack(alignment: .leading, spacing: 16) {
                greeting
                if let refreshError {
                    Label(refreshError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                }
                quickActions
                tasksCard
                if showsApprovals { approvalsCard }
                eventsCard
            }
            .padding(16)
        }
        .refreshable { await load() }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(MDate.todayTitle())
                .font(.subheadline)
                .foregroundStyle(ArtaColor.muted)
            Text(firstName.isEmpty ? "Hola" : "Hola, \(firstName)")
                .font(.largeTitle.weight(.bold))
                .foregroundStyle(ArtaColor.text)
            Text(summaryLine)
                .font(.subheadline)
                .foregroundStyle(ArtaColor.muted)
        }
    }

    private var summaryLine: String {
        let today = dueTasks.count - overdueCount
        var parts: [String] = []
        if today > 0 { parts.append(today == 1 ? "1 tarea vence hoy" : "\(today) tareas vencen hoy") }
        if overdueCount > 0 { parts.append(overdueCount == 1 ? "1 vencida" : "\(overdueCount) vencidas") }
        let approvals = taskApprovals + poApprovals
        if approvals > 0 { parts.append(approvals == 1 ? "1 aprobación pendiente" : "\(approvals) aprobaciones pendientes") }
        return parts.isEmpty ? "Todo al día por hoy." : parts.joined(separator: " · ")
    }

    private var quickActions: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            tile("Nueva tarea", icon: "plus.circle.fill") { showNewTask = true }
            tile("Mis tareas", icon: "checklist") { router.select(.tareas) }
            if showsApprovals {
                tile("Aprobaciones", icon: "checkmark.seal", badge: taskApprovals + poApprovals) {
                    router.open(AppRoute.approvals)
                }
            }
            tile("Calendario", icon: "calendar") {
                router.open(AppRoute.web(path: "/calendar", title: "Calendario"))
            }
            if seesPurchaseOrders {
                tile("Órdenes de compra", icon: "doc.text") {
                    router.open(AppRoute.web(path: "/purchase-orders", title: "Órdenes de compra"))
                }
            }
        }
    }

    private func tile(_ title: String, icon: String, badge: Int = 0, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(ArtaColor.gold)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                if badge > 0 { CountBadge(count: badge) }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(ArtaColor.bgElev))
        }
        .buttonStyle(.plain)
    }

    private var tasksCard: some View {
        ModuleCard(title: "Para hoy") {
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
                            Divider().overlay(ArtaColor.line)
                        }
                    }
                    if dueTasks.count > shown.count {
                        Button {
                            router.select(.tareas)
                        } label: {
                            Text("Ver \(dueTasks.count - shown.count) más en Tareas")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(ArtaColor.gold)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var approvalsCard: some View {
        Button {
            router.open(AppRoute.approvals)
        } label: {
            ModuleCard(title: "Esperan tu visto bueno") {
                HStack(spacing: 20) {
                    stat(taskApprovals, label: taskApprovals == 1 ? "entrega" : "entregas")
                    if profile?.canAuthorizePO == true {
                        stat(poApprovals, label: poApprovals == 1 ? "orden de compra" : "órdenes de compra")
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").foregroundStyle(ArtaColor.muted)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func stat(_ value: Int, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(.title2.weight(.bold))
                .foregroundStyle(value > 0 ? ArtaColor.gold : ArtaColor.muted)
            Text(label)
                .font(.caption)
                .foregroundStyle(ArtaColor.muted)
        }
    }

    private var eventsCard: some View {
        ModuleCard(title: "Eventos de los próximos 7 días") {
            if upcoming.isEmpty {
                Label("Sin eventos esta semana.", systemImage: "calendar")
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.muted)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(upcoming) { event in
                        Button {
                            router.open(AppRoute.event(event.id))
                        } label: {
                            EventRow(event: event)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: Datos

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
            if !me.eventEntities.isEmpty {
                events = try await ApiClient.shared.events(scope: "active")
            }
            myTasks = tasks
            upcoming = Self.nextSevenDays(events)
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

    /// Los conteos de aprobaciones no deben tumbar la pantalla si una de las listas falla.
    private func loadApprovals(_ me: ModulesProfile) async {
        var pendingTasks = Set<String>()
        if let requested = try? await ApiClient.shared.requestedTasks() {
            for task in requested where task.isPendingApproval { pendingTasks.insert(task.id) }
        }
        if me.isDirection, let team = try? await ApiClient.shared.teamTasks(status: "PENDING_APPROVAL") {
            for task in team where task.isPendingApproval { pendingTasks.insert(task.id) }
        }
        taskApprovals = pendingTasks.count

        var orders = 0
        for entity in me.eventEntities where me.authorizesPO(entity: entity) {
            if let rows = try? await ApiClient.shared.purchaseOrders(entity: entity) {
                orders += rows.filter { $0.isPending && !$0.isEventClosed }.count
            }
        }
        poApprovals = orders
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
