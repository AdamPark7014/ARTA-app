import SwiftUI

/// Hub del evento: Resumen y Tareas nativos; el resto de pestañas de la web
/// (`apps/web/app/(app)/events/[id]/page.tsx`) se abren en la vista web.
struct EventDetailView: View {
    let eventId: String

    enum Pane: String, CaseIterable, Identifiable {
        case summary = "Resumen"
        case tasks = "Tareas"
        var id: String { rawValue }
    }

    @EnvironmentObject private var router: AppRouter
    @State private var event: ArtaEventDetail?
    @State private var profile: ModulesProfile?
    @State private var tasks: [ArtaTask] = []
    @State private var pane: Pane = .summary
    @State private var loading = true
    @State private var error: String?
    @State private var refreshError: String?
    @State private var openingChat = false
    @State private var chatError: String?
    @State private var showNewTask = false
    @State private var showDone = false

    private var openTasks: [ArtaTask] {
        tasks
            .filter { !$0.isDone }
            .sorted {
                let a = DueBucket.of($0), b = DueBucket.of($1)
                if a != b { return a.rawValue < b.rawValue }
                return (MDate.dueDay($0.dueAt) ?? .distantFuture) < (MDate.dueDay($1.dueAt) ?? .distantFuture)
            }
    }

    private var doneTasks: [ArtaTask] { tasks.filter(\.isDone) }

    var body: some View {
        Group {
            if let event {
                content(event)
            } else if loading {
                ModuleSkeletonList(rows: 4)
            } else {
                ModuleErrorView(message: error ?? "No se encontró el evento.") {
                    loading = true
                    Task { await load() }
                }
            }
        }
        .background(ArtaColor.bg)
        .navigationTitle(event?.name ?? "Evento")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await openChat() }
                } label: {
                    if openingChat {
                        ProgressView()
                    } else {
                        Image(systemName: "bubble.left.and.bubble.right")
                    }
                }
                .disabled(openingChat || event == nil)
                .accessibilityLabel("Chat del evento")
            }
        }
        .task { await load() }
        .sheet(isPresented: $showNewTask) {
            TaskFormSheet(mode: .create(eventId: eventId)) { created in
                tasks.insert(created, at: 0)
                pane = .tasks
            }
        }
    }

    // MARK: Contenido

    private func content(_ event: ArtaEventDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header(event)
                if let message = chatError ?? refreshError {
                    Label(message, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                }
                Picker("Sección", selection: $pane) {
                    ForEach(Pane.allCases) { p in
                        Text(p.rawValue).tag(p)
                    }
                }
                .pickerStyle(.segmented)
                if pane == .summary {
                    summary(event)
                } else {
                    tasksPane(event)
                }
                moreCard(event)
            }
            .padding(16)
        }
        .refreshable { await load() }
    }

    private func header(_ event: ArtaEventDetail) -> some View {
        ModuleCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    StatusPill(text: EventInfo.statusLabel(event.status), tone: EventInfo.statusTone(event.status))
                    if let entity = event.entity {
                        StatusPill(text: EntityInfo.label(entity), tone: .gold)
                    }
                    Spacer(minLength: 4)
                    if !event.isClosed, let countdown = MDate.countdown(event.startsAt) {
                        Text(countdown)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ArtaColor.gold)
                    }
                }
                Text(event.name)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(ArtaColor.text)
                    .textSelection(.enabled)
                if let artist = event.artist, !artist.isEmpty, artist != event.name {
                    Text(artist)
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.muted)
                }
                Label(MDate.eventWhen(event.startsAt, event.endsAt), systemImage: "calendar")
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.text)
                let place = [event.venue, event.city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !place.isEmpty {
                    Label(place, systemImage: "mappin.and.ellipse")
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.text)
                }
                if let schedule = event.schedule, !schedule.isEmpty {
                    Label(schedule, systemImage: "clock")
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.text)
                }
                if let functions = event.functions, functions > 0 {
                    Label(functions == 1 ? "1 función" : "\(functions) funciones", systemImage: "ticket")
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.text)
                }
                if event.isClosed {
                    Label("Evento cerrado: solo lectura.", systemImage: "lock.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.muted)
                }
            }
        }
    }

    // MARK: Resumen

    private func summary(_ event: ArtaEventDetail) -> some View {
        let checklists = event.checklists ?? []
        let progress = checklists.compactMap(\.progressPct)
        let avg = progress.isEmpty ? 0 : Int((progress.reduce(0, +) / Double(progress.count)).rounded())
        let orders = event.purchaseOrders ?? []
        let pendingOrders = orders.filter { $0.status == "PENDING_AUTH" }
        let overdue = openTasks.filter { DueBucket.of($0) == .overdue }.count
        return VStack(alignment: .leading, spacing: 16) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                Button {
                    openWeb(event, tab: "checklists", label: "Formatos")
                } label: {
                    tile("Formatos", value: checklists.isEmpty ? "—" : "\(avg)%",
                         detail: checklists.count == 1 ? "1 formato" : "\(checklists.count) formatos", icon: "list.clipboard")
                }
                .buttonStyle(.plain)
                Button {
                    pane = .tasks
                } label: {
                    tile("Tareas", value: "\(openTasks.count)",
                         detail: overdue > 0 ? "\(overdue) vencida(s)" : "abiertas", icon: "checklist",
                         alert: overdue > 0)
                }
                .buttonStyle(.plain)
                if canPo {
                    Button {
                        openWeb(event, tab: "ocs", label: "Órdenes de compra")
                    } label: {
                        tile("Por autorizar", value: "\(pendingOrders.count)",
                             detail: Money.mxn(pendingOrders.reduce(0) { $0 + ($1.amount?.value ?? 0) }), icon: "doc.text")
                    }
                    .buttonStyle(.plain)
                }
                Button {
                    openWeb(event, tab: "files", label: "Documentos")
                } label: {
                    tile("Documentos", value: "\((event.files ?? []).count)", detail: "archivos", icon: "folder")
                }
                .buttonStyle(.plain)
            }

            ModuleCard(title: "Ficha") {
                VStack(alignment: .leading, spacing: 8) {
                    if let promoter = event.promoter, !promoter.isEmpty {
                        FactRow(label: "Promotor", value: promoter)
                    }
                    if let artist = event.artist, !artist.isEmpty {
                        FactRow(label: "Artista", value: artist)
                    }
                    if let venue = event.venue, !venue.isEmpty {
                        FactRow(label: "Lugar", value: venue)
                    }
                    if let city = event.city, !city.isEmpty {
                        FactRow(label: "Ciudad", value: city)
                    }
                    if let starts = event.startsAt {
                        FactRow(label: "Inicio", value: MDate.stampText(starts))
                    }
                    if let ends = event.endsAt {
                        FactRow(label: "Fin", value: MDate.stampText(ends))
                    }
                    if let by = event.createdBy {
                        FactRow(label: "Creó", value: by.name)
                    }
                }
            }

            if let description = event.description, !description.isEmpty {
                ModuleCard(title: "Descripción") {
                    Text(description).font(.body).foregroundStyle(ArtaColor.text).textSelection(.enabled)
                }
            }

            if let notes = event.notes, !notes.isEmpty {
                ModuleCard(title: "Notas") {
                    Text(notes).font(.body).foregroundStyle(ArtaColor.text).textSelection(.enabled)
                }
            }

            if !checklists.isEmpty {
                ModuleCard(title: "Formatos") {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(checklists) { checklist in
                            Button {
                                router.open(AppRoute.web(path: "/events/\(event.id)?tab=checklists&checklist=\(checklist.id)",
                                                         title: checklist.title ?? "Formato"))
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text(checklist.title ?? "Formato")
                                            .font(.subheadline)
                                            .foregroundStyle(ArtaColor.text)
                                            .lineLimit(1)
                                        Spacer(minLength: 8)
                                        Text("\(Int(checklist.progressPct ?? 0))%")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(ArtaColor.muted)
                                    }
                                    ProgressView(value: min(max((checklist.progressPct ?? 0) / 100, 0), 1))
                                        .tint(ArtaColor.gold)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func tile(_ title: String, value: String, detail: String, icon: String, alert: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(ArtaColor.muted)
                .lineLimit(1)
            Text(value)
                .font(.title2.weight(.bold))
                .foregroundStyle(alert ? ArtaColor.danger : ArtaColor.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(detail)
                .font(.caption)
                .foregroundStyle(alert ? ArtaColor.danger : ArtaColor.muted)
                .lineLimit(1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(ArtaColor.bgElev))
    }

    // MARK: Tareas del evento

    private func tasksPane(_ event: ArtaEventDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if !event.isClosed {
                Button {
                    Haptics.tap()
                    showNewTask = true
                } label: {
                    Label("Nueva tarea del evento", systemImage: "plus.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.bg)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(RoundedRectangle(cornerRadius: 12).fill(ArtaColor.gold))
                }
                .buttonStyle(.plain)
            }
            if tasks.isEmpty {
                ModuleEmptyView(icon: "checklist", title: "Sin tareas", message: "Las tareas ligadas a este evento aparecerán aquí.")
                    .frame(minHeight: 240)
            } else {
                ModuleCard(title: "Abiertas (\(openTasks.count))") {
                    if openTasks.isEmpty {
                        Text("Todo hecho.").font(.subheadline).foregroundStyle(ArtaColor.muted)
                    } else {
                        taskList(openTasks)
                    }
                }
                if !doneTasks.isEmpty {
                    Button {
                        withAnimation { showDone.toggle() }
                    } label: {
                        Label(showDone ? "Ocultar hechas" : "Ver hechas (\(doneTasks.count))",
                              systemImage: showDone ? "chevron.up" : "chevron.down")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ArtaColor.gold)
                    }
                    .buttonStyle(.plain)
                    if showDone {
                        ModuleCard(title: "Hechas") {
                            taskList(doneTasks)
                        }
                    }
                }
            }
        }
    }

    private func taskList(_ list: [ArtaTask]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(list) { task in
                Button {
                    router.open(AppRoute.task(task.id))
                } label: {
                    TaskRow(task: task, showEvent: false)
                }
                .buttonStyle(.plain)
                if task.id != list.last?.id {
                    Divider().overlay(ArtaColor.line)
                }
            }
        }
    }

    // MARK: Pestañas de la web

    private var canPo: Bool {
        guard let p = profile else { return false }
        return p.can("checklist.edit") || p.can("po.authorize") || p.can("po.mark_paid")
    }

    /// Mismas condiciones que `modules` en la página del evento de la web.
    private func webTabs(_ event: ArtaEventDetail) -> [EventWebTab] {
        let p = profile
        let canChecklistEdit = p?.can("checklist.edit") == true
        let canSeeFinance = p?.can("finance.view") == true || p?.can("finance.edit") == true
        let canSeeCampaign = p?.can("campaign.view") == true || p?.can("campaign.edit") == true
        let canTicketing = p?.can("ticketing.edit") == true
        let pendingOrders = (event.purchaseOrders ?? []).filter { $0.status == "PENDING_AUTH" || $0.status == "AUTHORIZED" }.count
        var tabs: [EventWebTab] = [
            EventWebTab(key: "checklists", label: "Formatos", icon: "list.clipboard", count: (event.checklists ?? []).count),
        ]
        if canPo { tabs.append(EventWebTab(key: "ocs", label: "Órdenes de compra", icon: "doc.text", count: pendingOrders)) }
        if canSeeFinance { tabs.append(EventWebTab(key: "finance", label: "Corrida", icon: "chart.bar", count: 0)) }
        if canSeeCampaign { tabs.append(EventWebTab(key: "campaign", label: "Campaña", icon: "megaphone", count: 0)) }
        if canChecklistEdit || canSeeCampaign { tabs.append(EventWebTab(key: "sponsors", label: "Convenios", icon: "person.2", count: 0)) }
        if canTicketing { tabs.append(EventWebTab(key: "ticketing", label: "Boletera", icon: "ticket", count: 0)) }
        tabs.append(EventWebTab(key: "files", label: "Documentos", icon: "folder", count: (event.files ?? []).count))
        return tabs
    }

    private func moreCard(_ event: ArtaEventDetail) -> some View {
        ModuleCard(title: "Más del evento") {
            VStack(alignment: .leading, spacing: 0) {
                let tabs = webTabs(event)
                ForEach(tabs) { tab in
                    Button {
                        openWeb(event, tab: tab.key, label: tab.label)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: tab.icon)
                                .foregroundStyle(ArtaColor.gold)
                                .frame(width: 24)
                            Text(tab.label)
                                .font(.subheadline)
                                .foregroundStyle(ArtaColor.text)
                            Spacer()
                            if tab.count > 0 {
                                CountBadge(count: tab.count, muted: true)
                            }
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(ArtaColor.muted)
                        }
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if tab.id != tabs.last?.id {
                        Divider().overlay(ArtaColor.line)
                    }
                }
            }
        }
    }

    private func openWeb(_ event: ArtaEventDetail, tab: String, label: String) {
        Haptics.tap()
        router.open(AppRoute.web(path: "/events/\(event.id)?tab=\(tab)", title: label))
    }

    // MARK: Datos

    private func load() async {
        do {
            let me = try await ModulesProfileStore.shared.load()
            profile = me
            let detail = try await ApiClient.shared.event(eventId)
            event = detail
            tasks = (try? await ApiClient.shared.eventTasks(eventId)) ?? detail.tasks ?? []
            error = nil
            refreshError = nil
        } catch {
            if !error.isModuleCancellation {
                if event != nil { refreshError = error.userMessage } else { self.error = error.userMessage }
            }
        }
        loading = false
    }

    private func openChat() async {
        openingChat = true
        chatError = nil
        do {
            let channelId = try await ApiClient.shared.openEventChannel(eventId)
            Haptics.tap()
            router.open(AppRoute.chat(channelId: channelId, messageId: nil))
        } catch {
            Haptics.error()
            chatError = error.userMessage
        }
        openingChat = false
    }
}

private struct EventWebTab: Identifiable {
    let key: String
    let label: String
    let icon: String
    let count: Int
    var id: String { key }
}
