import QuickLook
import SwiftUI

/// Hub del evento: Resumen, Tareas, Adendum y Testigos nativos; el resto de pestañas de la web
/// (`apps/web/app/(app)/events/[id]/page.tsx`) se abren en la vista web.
struct EventDetailView: View {
    let eventId: String

    /// Lo que se pinta aquí mismo; los demás módulos se abren en la vista web.
    enum Pane {
        case summary, tasks, adendum, testigos
    }

    @EnvironmentObject private var router: AppRouter
    @Environment(\.openURL) private var openURL
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
    /// `GET testigos/event/:id`; `nil` hasta que se abre la pestaña por primera vez.
    @State private var witnesses: [EventWitness]?
    @State private var witnessesError: String?
    @State private var previewURL: URL?
    /// Adendum o testigo cuyo archivo se está bajando para abrirlo.
    @State private var openingFileId: String?

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
                // Contabilidad y practicantes no entran por su cuenta: el API responde 403.
                if Rbac.canJoinEventChannels(profile?.role) {
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
        }
        .task { await load() }
        .quickLookPreview($previewURL)
        .sheet(isPresented: $showNewTask) {
            TaskFormSheet(mode: .create(eventId: eventId)) { created in
                tasks.insert(created, at: 0)
                pane = .tasks
            }
        }
    }

    // MARK: Contenido

    private func content(_ event: ArtaEventDetail) -> some View {
        let tabs = modules(event)
        // Una pestaña que ya no le toca (cambió el rol al recargar) cae en Resumen.
        let current = tabs.contains(where: { $0.pane == pane }) ? pane : Pane.summary
        return ScrollView {
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
                moduleBar(event, tabs: tabs, selected: current)
                switch current {
                case .summary:
                    summary(event)
                        .transition(.opacity)
                case .tasks:
                    tasksPane(event)
                        .transition(.opacity)
                case .adendum:
                    adendumPane(event)
                        .transition(.opacity)
                case .testigos:
                    testigosPane
                        .transition(.opacity)
                }
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
        let createsFormats = profile.map { Rbac.canCreateFormats($0.access, entityOf(event)) } ?? false
        var tiles: [SummaryTile] = [
            // Sin formatos, la palabra va en el lugar de la cifra (nunca una raya suelta).
            SummaryTile(id: "checklists", title: "Formatos", value: checklists.isEmpty ? "Sin formatos" : "\(avg)%",
                        detail: checklists.isEmpty ? (createsFormats ? "Se crean en la web" : "Todavía no hay") : pluralized(checklists.count, "formato", "formatos"),
                        icon: "list.clipboard", progress: checklists.isEmpty ? nil : Double(avg) / 100,
                        quiet: checklists.isEmpty) {
                openWeb(event, tab: "checklists", label: "Formatos")
            },
        ]
        if sees(.tasks, event) {
            tiles.append(SummaryTile(id: "tasks", title: "Tareas", value: "\(openTasks.count)",
                                     detail: overdue > 0 ? pluralized(overdue, "vencida", "vencidas") : (openTasks.count == 1 ? "abierta" : "abiertas"),
                                     icon: "checklist", alert: overdue > 0) {
                withAnimation(.snappy(duration: 0.25)) { pane = .tasks }
            })
        }
        if sees(.po, event) {
            tiles.append(SummaryTile(id: "ocs", title: "Por autorizar", value: "\(pendingOrders.count)",
                                     detail: Money.mxn(pendingOrders.reduce(0) { $0 + ($1.amount?.value ?? 0) }), icon: "doc.text") {
                openWeb(event, tab: "ocs", label: "Órdenes de compra")
            })
        }
        if sees(.documents, event) {
            let files = (event.files ?? []).count
            tiles.append(SummaryTile(id: "files", title: "Documentos", value: "\(files)",
                                     detail: files == 1 ? "archivo" : "archivos", icon: "folder") {
                openWeb(event, tab: "files", label: "Documentos")
            })
        }
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

            // La venta en línea se abre en el navegador: algunas boleteras no se dejan embeber.
            if let boletera = event.boleteraUrl?.moduleTrimmed, !boletera.isEmpty {
                Button {
                    openExternal(boletera)
                } label: {
                    Label("Abrir boletera en línea", systemImage: "ticket")
                }
                .buttonStyle(ArtaSecondaryButtonStyle())
                .accessibilityIdentifier("event-open-boletera")
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
            if !event.isClosed && profile?.canCreateTasks != false {
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

    // MARK: Adendum

    /// Las órdenes con esa forma de pago: a quién, a qué cuenta, cuánto y su archivo. Solo lectura:
    /// se crean y se autorizan como cualquier OC, en la web.
    private func adendumPane(_ event: ArtaEventDetail) -> some View {
        let rows = (event.purchaseOrders ?? [])
            .filter(\.isAdendum)
            .sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
        let total = rows.reduce(0.0) { $0 + ($1.amount?.value ?? 0) }
        return VStack(alignment: .leading, spacing: 12) {
            if rows.isEmpty {
                ModuleEmptyView(icon: "banknote", title: "Sin adendums", message: "Cuando se haga uno, aparecerá aquí.")
                    .frame(minHeight: 240)
            } else {
                CardSection(title: "Adendum", count: rows.count, items: rows) { po in
                    adendumRow(po)
                }
                FactRow(label: "Monto total", value: Money.mxn(total))
                    .padding(.horizontal, ArtaSpace.xs)
            }
        }
    }

    private func adendumRow(_ po: EventPurchaseOrderRef) -> some View {
        VStack(alignment: .leading, spacing: ArtaSpace.s) {
            HStack(alignment: .top, spacing: ArtaSpace.m) {
                VStack(alignment: .leading, spacing: ArtaSpace.xs) {
                    Text(adendumName(po))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.text)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    if let account = po.adendumAccount?.moduleTrimmed, !account.isEmpty {
                        Text("Cuenta \(account)")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(ArtaColor.muted)
                            .textSelection(.enabled)
                    }
                    if let created = po.createdAt {
                        Text(MDate.dayText(created))
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(ArtaColor.tertiary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .layoutPriority(1)
                VStack(alignment: .trailing, spacing: 6) {
                    Text(Money.mxn(po.amount?.value))
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(ArtaColor.text)
                        .fixedSize()
                    StatusPill(text: POInfo.statusLabel(po.status), tone: POInfo.statusTone(po.status))
                }
            }
            if let file = po.adendumFileUrl, !file.isEmpty {
                linkButton(fileLabel(po.adendumFileName, fallback: "Ver archivo"), icon: "paperclip", busy: openingFileId == po.id) {
                    openFile(file, name: po.adendumFileName, id: po.id)
                }
            }
        }
    }

    private func adendumName(_ po: EventPurchaseOrderRef) -> String {
        if let person = po.adendumPerson?.moduleTrimmed, !person.isEmpty { return person }
        if let vendor = po.vendorName?.moduleTrimmed, !vendor.isEmpty { return vendor }
        return "Sin persona"
    }

    // MARK: Testigos de publicidad

    /// La prueba de que cada anuncio salió. Solo lectura: subirlos sigue siendo del panel web.
    private var testigosPane: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let witnessesError {
                InlineErrorRow(message: witnessesError) {
                    Task { await loadWitnesses() }
                }
            }
            if let witnesses {
                if witnesses.isEmpty {
                    ModuleEmptyView(icon: "photo.on.rectangle", title: "Sin testigos todavía", message: "Cuando se suban, aparecerán aquí.")
                        .frame(minHeight: 240)
                } else {
                    ForEach(witnesses) { witness in
                        witnessCard(witness)
                    }
                }
            } else if witnessesError == nil {
                ProgressView()
                    .tint(ArtaColor.accent)
                    .frame(maxWidth: .infinity, minHeight: 160)
            }
        }
        .task {
            if witnesses == nil { await loadWitnesses() }
        }
    }

    private func witnessCard(_ witness: EventWitness) -> some View {
        VStack(alignment: .leading, spacing: ArtaSpace.s) {
            if witness.isImage, let path = witness.fileUrl, let url = ApiConfig.resolve(path) {
                Button {
                    openFile(path, name: witness.fileName ?? witness.title, id: witness.id)
                } label: {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable()
                                .scaledToFit()
                                .frame(maxWidth: .infinity, maxHeight: 280)
                        case .failure:
                            Image(systemName: "photo")
                                .font(.largeTitle)
                                .foregroundStyle(ArtaColor.muted)
                                .frame(maxWidth: .infinity, minHeight: 160)
                                .background(ArtaColor.inset)
                        default:
                            ProgressView()
                                .tint(ArtaColor.accent)
                                .frame(maxWidth: .infinity, minHeight: 160)
                                .background(ArtaColor.surface2)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: ArtaRadius.inner, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(ArtaPressStyle(scale: 0.99))
                .disabled(openingFileId != nil)
                .accessibilityLabel("Foto: \(witness.title ?? witness.mediumLabel)")
            }
            HStack(spacing: ArtaSpace.s) {
                StatusPill(text: witness.mediumLabel)
                if witness.isPublic == true {
                    StatusPill(text: "En el sitio", tone: .ok)
                }
            }
            if let title = witness.title?.moduleTrimmed, !title.isEmpty {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let note = witness.note?.moduleTrimmed, !note.isEmpty {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(ArtaColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            let meta = witnessMeta(witness)
            if !meta.isEmpty {
                Text(meta)
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(ArtaColor.tertiary)
            }
            if !witness.isImage, let file = witness.fileUrl, !file.isEmpty {
                linkButton(fileLabel(witness.fileName, fallback: "Abrir archivo"), icon: "paperclip", busy: openingFileId == witness.id) {
                    openFile(file, name: witness.fileName ?? witness.title, id: witness.id)
                }
            }
            if let link = witness.link?.moduleTrimmed, !link.isEmpty {
                linkButton("Abrir liga", icon: "arrow.up.right") {
                    openExternal(link)
                }
            }
        }
        .artaCard()
    }

    /// «12 sept 2026 · Ana López», lo que haya.
    private func witnessMeta(_ witness: EventWitness) -> String {
        var parts: [String] = []
        let day = MDate.dayText(witness.publishedAt)
        if !day.isEmpty { parts.append(day) }
        if let by = witness.createdBy?.fullName, !by.isEmpty { parts.append(by) }
        return parts.joined(separator: " · ")
    }

    private func fileLabel(_ name: String?, fallback: String) -> String {
        guard let name = name?.moduleTrimmed, !name.isEmpty else { return fallback }
        return name
    }

    /// Acción de texto de una fila (archivo o liga): discreta, con el área de toque completa.
    private func linkButton(_ title: String, icon: String, busy: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: ArtaSpace.xs) {
                if busy {
                    ProgressView().controlSize(.small).tint(ArtaColor.tertiary)
                } else {
                    Image(systemName: icon)
                }
                Text(title).lineLimit(1)
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(ArtaColor.text)
            .padding(.vertical, ArtaSpace.xs)
            .artaHitArea(dx: ArtaSpace.xs, dy: ArtaSpace.s)
        }
        .buttonStyle(ArtaPressStyle(scale: 0.97))
        .disabled(openingFileId != nil)
    }

    // MARK: Módulos del evento

    /// `Event.entity`; si una respuesta no lo trae, la entidad activa (de ahí se abrió el evento).
    private func entityOf(_ event: ArtaEventDetail) -> String {
        event.entity ?? EntityContext.entity.rawValue
    }

    private func sees(_ module: EventModule, _ event: ArtaEventDetail) -> Bool {
        profile?.sees(module, in: entityOf(event)) == true
    }

    /// Mismo orden y mismas condiciones que `modules` en la página del evento de la web (01-11-2026):
    /// Resumen, Corrida, Campaña, Formatos, OC, Convenios, Boletera, Tareas, Documentos, Adendum, Testigos.
    private func modules(_ event: ArtaEventDetail) -> [EventModuleTab] {
        let orders = event.purchaseOrders ?? []
        let pendingOrders = orders.filter { $0.status == "PENDING_AUTH" || $0.status == "AUTHORIZED" }.count
        var tabs = [EventModuleTab(key: "overview", label: "Resumen", count: 0, pane: .summary)]
        if sees(.corrida, event) { tabs.append(EventModuleTab(key: "finance", label: "Corrida", count: 0)) }
        if sees(.campaign, event) { tabs.append(EventModuleTab(key: "campaign", label: "Campaña", count: 0)) }
        if sees(.formats, event) { tabs.append(EventModuleTab(key: "checklists", label: "Formatos", count: (event.checklists ?? []).count)) }
        if sees(.po, event) { tabs.append(EventModuleTab(key: "ocs", label: "Órdenes de compra", count: pendingOrders)) }
        if sees(.convenios, event) { tabs.append(EventModuleTab(key: "sponsors", label: "Convenios", count: 0)) }
        if sees(.ticketing, event) { tabs.append(EventModuleTab(key: "ticketing", label: "Boletera", count: 0)) }
        if sees(.tasks, event) { tabs.append(EventModuleTab(key: "tasks", label: "Tareas", count: openTasks.count, pane: .tasks)) }
        if sees(.documents, event) { tabs.append(EventModuleTab(key: "files", label: "Documentos", count: (event.files ?? []).count)) }
        if sees(.adendum, event) {
            tabs.append(EventModuleTab(key: "adendum", label: "Adendum", count: orders.filter(\.isAdendum).count, pane: .adendum))
        }
        if sees(.testigos, event) {
            tabs.append(EventModuleTab(key: "testigos", label: "Testigos de publicidad", count: 0, pane: .testigos))
        }
        return tabs
    }

    /// Una sola fila en el orden del cliente: lo nativo se pinta aquí; lo de la web lleva ↗ y abre la vista web.
    private func moduleBar(_ event: ArtaEventDetail, tabs: [EventModuleTab], selected: Pane) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ArtaSpace.s) {
                ForEach(tabs) { tab in
                    EventModuleChip(tab: tab, isOn: tab.pane == selected) {
                        if let target = tab.pane {
                            Haptics.selection()
                            withAnimation(.snappy(duration: 0.22)) { pane = target }
                        } else {
                            openWeb(event, tab: tab.key, label: tab.label)
                        }
                    }
                    .accessibilityIdentifier("event-module-\(tab.key)")
                }
            }
            .padding(.horizontal, ArtaLayout.gutter)
        }
        .artaHorizontalEdgeFade(ArtaLayout.gutter)
        .padding(.horizontal, -ArtaLayout.gutter)
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
        // Tirar para actualizar con la pestaña abierta; la primera carga la pide la pestaña.
        if pane == .testigos { await loadWitnesses() }
    }

    /// Aparte del evento: si falla, lo demás sigue. Un API aún sin la ruta (404) se lee como «sin testigos».
    private func loadWitnesses() async {
        do {
            witnesses = try await ApiClient.shared.eventWitnesses(eventId)
            witnessesError = nil
        } catch {
            if error.isModuleCancellation { return }
            if let api = error as? ApiError, api.status == 404 {
                witnesses = []
                witnessesError = nil
            } else {
                witnessesError = error.userMessage
            }
        }
    }

    /// Baja el archivo con la sesión y lo abre con Vista Rápida (foto, PDF, Excel…).
    private func openFile(_ path: String, name: String?, id: String) {
        Haptics.tap()
        openingFileId = id
        Task {
            do {
                previewURL = try await ModuleFiles.download(path, name: name)
            } catch {
                if !error.isModuleCancellation { refreshError = error.userMessage }
            }
            openingFileId = nil
        }
    }

    /// Liga externa (boletera, publicación de un testigo): solo http(s), en el navegador.
    private func openExternal(_ raw: String) {
        guard let url = URL(string: raw), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else { return }
        Haptics.tap()
        openURL(url)
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

/// Un módulo del evento. `key` es la pestaña de la web (`?tab=`); con `pane` se pinta aquí mismo.
private struct EventModuleTab: Identifiable {
    let key: String
    let label: String
    let count: Int
    var pane: EventDetailView.Pane?
    var id: String { key }
}

/// Chip de un módulo: mismas formas que `FilterChip`, con su contador y ↗ si abre la vista web.
private struct EventModuleChip: View {
    let tab: EventModuleTab
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: ArtaSpace.xs) {
                Text(tab.label)
                    .lineLimit(1)
                    .fixedSize()
                if tab.count > 0 {
                    Text("\(tab.count)")
                        .monospacedDigit()
                        .opacity(0.7)
                }
                if tab.pane == nil {
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(ArtaColor.tertiary)
                }
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(isOn ? ArtaColor.onAccent : ArtaColor.muted)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(ArtaControlShape().fill(isOn ? ArtaColor.accentFill : AnyShapeStyle(ArtaColor.surface)))
            .overlay(ArtaControlShape().strokeBorder(isOn ? Color.clear : ArtaColor.lineStrong, lineWidth: 1))
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(ArtaPressStyle(scale: 0.95))
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .accessibilityHint(tab.pane == nil ? "Se abre en la vista web" : "")
    }
}
