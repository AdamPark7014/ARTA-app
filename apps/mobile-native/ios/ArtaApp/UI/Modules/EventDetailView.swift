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
    /// «Mencionado en el chat» (docs/CHAT-V2-CONTRATO.md §9). Sin ninguno, la sección no aparece.
    @State private var backlinks: [ChatBacklink] = []

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
        .artaScreenBackground()
        .navigationTitle(event?.name ?? "Evento")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Nombres largos: se achican un poco antes de cortarse (el nombre completo va en la tarjeta).
            ToolbarItem(placement: .principal) {
                Text(event?.name ?? "Evento")
                    .font(.headline)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .accessibilityAddTraits(.isHeader)
            }
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
                if let chatError {
                    InlineErrorRow(message: chatError) {
                        Task { await openChat() }
                    }
                } else if let refreshError {
                    InlineErrorRow(message: refreshError) {
                        Task { await load() }
                    }
                }
                Picker("Sección", selection: $pane.animation(.snappy(duration: 0.22))) {
                    ForEach(Pane.allCases) { p in
                        Text(p.rawValue).tag(p)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: pane) { _, _ in Haptics.selection() }
                if pane == .summary {
                    summary(event)
                        .transition(.opacity)
                } else {
                    tasksPane(event)
                        .transition(.opacity)
                }
                moreCard(event)
            }
            .padding(.horizontal, ArtaLayout.gutter)
            .padding(.vertical, ArtaSpace.l)
        }
        .refreshable { await load() }
        .artaTabBarScrim()
    }

    private func header(_ event: ArtaEventDetail) -> some View {
        ModuleCard {
            VStack(alignment: .leading, spacing: ArtaSpace.s) {
                HStack(spacing: ArtaSpace.s) {
                    StatusPill(text: EventInfo.statusLabel(event.status), tone: EventInfo.statusTone(event.status))
                    if let entity = event.entity {
                        StatusPill(text: EntityInfo.label(entity), tone: .accent)
                    }
                    Spacer(minLength: ArtaSpace.xs)
                    if !event.isClosed, let countdown = MDate.countdown(event.startsAt) {
                        Text(countdown)
                            .font(.caption.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(ArtaColor.text)
                    }
                }
                VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
                    Text(event.name)
                        .font(ArtaFont.display(24, weight: .semibold))
                        .tracking(-0.4)
                        .foregroundStyle(ArtaColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                    if let artist = event.artist, !artist.isEmpty, artist != event.name {
                        Text(artist)
                            .font(.subheadline)
                            .foregroundStyle(ArtaColor.muted)
                    }
                }
                .padding(.bottom, ArtaSpace.xs)
                // Ícono en columna fija: fecha, lugar, horario y funciones arrancan en la misma orilla.
                InfoLine(icon: "calendar", text: MDate.eventWhen(event.startsAt, event.endsAt))
                let place = [event.venue, event.city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !place.isEmpty {
                    InfoLine(icon: "mappin.and.ellipse", text: place)
                }
                if let schedule = event.schedule, !schedule.isEmpty {
                    InfoLine(icon: "clock", text: schedule)
                }
                if let functions = event.functions, functions > 0 {
                    InfoLine(icon: "ticket", text: functions == 1 ? "1 función" : "\(functions) funciones")
                }
                if event.isClosed {
                    InfoLine(icon: "lock", text: "Evento cerrado: solo lectura.", color: ArtaColor.muted)
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
        var tiles: [SummaryTile] = [
            // Sin formatos, la palabra va en el lugar de la cifra (nunca una raya suelta).
            SummaryTile(id: "checklists", title: "Formatos", value: checklists.isEmpty ? "Sin formatos" : "\(avg)%",
                        detail: checklists.isEmpty ? "Se crean en la web" : pluralized(checklists.count, "formato", "formatos"),
                        icon: "list.clipboard", progress: checklists.isEmpty ? nil : Double(avg) / 100,
                        quiet: checklists.isEmpty) {
                openWeb(event, tab: "checklists", label: "Formatos")
            },
            SummaryTile(id: "tasks", title: "Tareas", value: "\(openTasks.count)",
                        detail: overdue > 0 ? pluralized(overdue, "vencida", "vencidas") : (openTasks.count == 1 ? "abierta" : "abiertas"),
                        icon: "checklist", alert: overdue > 0) {
                withAnimation(.snappy(duration: 0.25)) { pane = .tasks }
            },
        ]
        if canPo {
            tiles.append(SummaryTile(id: "ocs", title: "Por autorizar", value: "\(pendingOrders.count)",
                                     detail: Money.mxn(pendingOrders.reduce(0) { $0 + ($1.amount?.value ?? 0) }), icon: "doc.text") {
                openWeb(event, tab: "ocs", label: "Órdenes de compra")
            })
        }
        let files = (event.files ?? []).count
        tiles.append(SummaryTile(id: "files", title: "Documentos", value: "\(files)",
                                 detail: files == 1 ? "archivo" : "archivos", icon: "folder") {
            openWeb(event, tab: "files", label: "Documentos")
        })
        let rows = stride(from: 0, to: tiles.count, by: 2).map { Array(tiles[$0..<min($0 + 2, tiles.count)]) }
        return VStack(alignment: .leading, spacing: ArtaSpace.l) {
            // Renglones de dos tarjetas del mismo alto (con o sin barra de avance).
            VStack(spacing: ArtaSpace.m) {
                ForEach(rows, id: \.first?.id) { row in
                    HStack(spacing: ArtaSpace.m) {
                        ForEach(row) { item in
                            Button(action: item.action) {
                                tile(item.title, value: item.value, detail: item.detail, icon: item.icon,
                                     alert: item.alert, progress: item.progress, quiet: item.quiet)
                            }
                            .buttonStyle(ArtaPressStyle())
                        }
                        if row.count == 1 {
                            Color.clear.frame(maxWidth: .infinity)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
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
                                VStack(alignment: .leading, spacing: ArtaSpace.s) {
                                    HStack(alignment: .firstTextBaseline) {
                                        Text(checklist.title ?? "Formato")
                                            .font(.subheadline)
                                            .foregroundStyle(ArtaColor.text)
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)
                                        Spacer(minLength: ArtaSpace.s)
                                        Text("\(Int(checklist.progressPct ?? 0))%")
                                            .font(.caption.weight(.semibold))
                                            .monospacedDigit()
                                            .foregroundStyle(ArtaColor.muted)
                                    }
                                    // La misma barra de 3 pt de las tarjetas de cifra.
                                    ProgressBar(value: (checklist.progressPct ?? 0) / 100)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(ArtaPressStyle(scale: 0.99))
                        }
                    }
                }
            }

            if !backlinks.isEmpty {
                ChatBacklinksCard(links: backlinks)
            }
        }
    }

    /// Tarjeta de cifra (sistema visual): etiqueta, cifra ligera tabular, detalle y, si aplica,
    /// barra de avance de 3 px.
    /// Igual que las de Inicio: sin ícono junto a la etiqueta (los íconos de distinto alto
    /// desalineaban las etiquetas de un renglón).
    private func tile(_ title: String, value: String, detail: String, icon: String, alert: Bool = false, progress: Double? = nil, quiet: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            CapLabel(title)
            Text(value)
                .font(ArtaFont.figure(26))
                .tracking(-0.6)
                // Color solo en alertas, y nunca en la cifra: lo avisa el detalle de abajo.
                .foregroundStyle(quiet ? ArtaColor.muted : ArtaColor.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if let progress {
                ProgressBar(value: progress)
                    .padding(.vertical, 2)
            }
            Spacer(minLength: 0)
            Text(detail)
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(alert ? ArtaColor.danger : ArtaColor.tertiary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .artaCard(padding: ArtaSpace.l)
        .contentShape(Rectangle())
    }

    // MARK: Tareas del evento

    private func tasksPane(_ event: ArtaEventDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if !event.isClosed {
                Button {
                    Haptics.tap()
                    showNewTask = true
                } label: {
                    Label("Nueva tarea del evento", systemImage: "plus")
                }
                .buttonStyle(ArtaPrimaryButtonStyle())
            }
            if tasks.isEmpty {
                ModuleEmptyView(icon: "checklist", title: "Sin tareas", message: "Las tareas ligadas a este evento aparecerán aquí.")
                    .frame(minHeight: 240)
            } else {
                ModuleCard(title: "Abiertas", count: openTasks.count) {
                    if openTasks.isEmpty {
                        Text("Todo hecho.").font(.subheadline).foregroundStyle(ArtaColor.muted)
                    } else {
                        taskList(openTasks)
                    }
                }
                if !doneTasks.isEmpty {
                    Button {
                        Haptics.selection()
                        withAnimation(.snappy(duration: 0.25)) { showDone.toggle() }
                    } label: {
                        Label(showDone ? "Ocultar hechas" : "Ver hechas (\(doneTasks.count))",
                              systemImage: showDone ? "chevron.up" : "chevron.down")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ArtaColor.accent)
                            .artaHitArea(dx: ArtaSpace.s, dy: ArtaSpace.m)
                    }
                    .buttonStyle(ArtaPressStyle(scale: 0.97))
                    if showDone {
                        ModuleCard(title: "Hechas", count: doneTasks.count) {
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
                .buttonStyle(ArtaPressStyle(scale: 0.99))
                if task.id != list.last?.id {
                    ArtaDivider(leading: 36)
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
                                .foregroundStyle(ArtaColor.accent)
                                .frame(width: 24)
                            Text(tab.label)
                                .font(.subheadline)
                                .foregroundStyle(ArtaColor.text)
                            Spacer()
                            if tab.count > 0 {
                                QuietCount(count: tab.count)
                            }
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(ArtaColor.tertiary)
                        }
                        .padding(.vertical, ArtaSpace.m)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(ArtaPressStyle(scale: 0.99))
                    if tab.id != tabs.last?.id {
                        ArtaDivider(leading: 36)
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
        // API viejo o sin acceso: la sección simplemente no aparece.
        if let links = try? await ApiClient.shared.refBacklinks(kind: ChatRefKind.event.rawValue, id: eventId) {
            backlinks = links
        }
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

/// Tarjeta de cifra del resumen del evento.
private struct SummaryTile: Identifiable {
    let id: String
    let title: String
    let value: String
    let detail: String
    let icon: String
    var alert = false
    var progress: Double?
    /// Sin dato: la palabra va en secundario, no con el peso de una cifra.
    var quiet = false
    let action: () -> Void
}

private struct EventWebTab: Identifiable {
    let key: String
    let label: String
    let icon: String
    let count: Int
    var id: String { key }
}
