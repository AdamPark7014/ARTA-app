import SwiftUI

/// Tareas: mismas vistas que la web (`/tasks/mine`, `/tasks/requested`, `/tasks/workload`),
/// agrupadas por vencimiento.
struct TasksView: View {
    enum Scope: String, CaseIterable, Identifiable {
        case mine, requested, team

        var id: String { rawValue }

        var title: String {
            switch self {
            case .mine: return "Mis tareas"
            case .requested: return "Pedidas por mí"
            case .team: return "Todas"
            }
        }
    }

    enum Filter: String, CaseIterable, Identifiable {
        case open, overdue, blocked, approval, done, all

        var id: String { rawValue }

        var title: String {
            switch self {
            case .open: return "Pendientes"
            case .overdue: return "Vencidas"
            case .blocked: return "Bloqueadas"
            case .approval: return "Por aprobar"
            case .done: return "Hechas"
            case .all: return "Todas"
            }
        }
    }

    struct DueGroup {
        let bucket: DueBucket
        let tasks: [ArtaTask]
    }

    @EnvironmentObject private var router: AppRouter
    @State private var profile: ModulesProfile?
    @State private var scope: Scope = .mine
    @State private var filter: Filter = .open
    @State private var query = ""
    @State private var tasks: [ArtaTask] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showCreate = false
    @State private var flash: String?

    private var scopes: [Scope] { profile?.seesTeamTasks == true ? Scope.allCases : [.mine, .requested] }

    var body: some View {
        content
            .background(ArtaColor.bg)
            .safeAreaInset(edge: .top, spacing: 0) { header }
            .navigationTitle("Tareas")
            .searchable(text: $query, prompt: "Buscar tarea, persona, evento…")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreate = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Nueva tarea")
                }
            }
            .sheet(isPresented: $showCreate) {
                TaskFormSheet(mode: .create(eventId: nil)) { created in
                    if belongsToScope(created) { tasks.insert(created, at: 0) }
                    showFlash(created.people.isEmpty
                        ? "Tarea creada"
                        : "Tarea asignada a \(created.people.map(\.name).joined(separator: ", "))")
                }
            }
            .task { await load() }
            .onChange(of: scope) { _, _ in
                Task { await load(resetting: true) }
            }
    }

    // MARK: Contenido

    @ViewBuilder
    private var content: some View {
        if loading && tasks.isEmpty {
            ModuleSkeletonList()
        } else if let error, tasks.isEmpty {
            ModuleErrorView(message: error) {
                Task { await load(resetting: true) }
            }
        } else {
            List {
                if let flash {
                    Label(flash, systemImage: "checkmark.circle.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.gold)
                        .listRowBackground(ArtaColor.goldSoft)
                }
                ForEach(groups, id: \.bucket) { group in
                    Section {
                        ForEach(group.tasks) { task in
                            Button {
                                router.open(AppRoute.task(task.id))
                            } label: {
                                TaskRow(task: task)
                            }
                            .listRowBackground(ArtaColor.bgElev)
                        }
                    } header: {
                        HStack {
                            Text(group.bucket.title)
                            Spacer()
                            Text("\(group.tasks.count)")
                        }
                        .foregroundStyle(group.bucket == .overdue ? ArtaColor.danger : ArtaColor.muted)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .overlay {
                if groups.isEmpty { emptyView }
            }
            .refreshable { await load() }
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Picker("Vista", selection: $scope) {
                ForEach(scopes) { s in
                    Text(s.title).tag(s)
                }
            }
            .pickerStyle(.segmented)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Filter.allCases) { f in
                        chip(f)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(ArtaColor.bg)
    }

    private func chip(_ f: Filter) -> some View {
        let on = f == filter
        return Button {
            filter = f
            Haptics.tap()
        } label: {
            Text(f.title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(on ? ArtaColor.bg : ArtaColor.text)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(on ? ArtaColor.gold : ArtaColor.surface2))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var emptyView: some View {
        if !query.moduleTrimmed.isEmpty || (filter != .open && !tasks.isEmpty) {
            ModuleEmptyView(icon: "line.3.horizontal.decrease.circle", title: "Sin resultados", message: "Prueba otro filtro o limpia la búsqueda.")
        } else {
            switch scope {
            case .mine:
                ModuleEmptyView(icon: "checkmark.circle", title: "Sin tareas pendientes", message: "Cuando alguien te asigne una tarea, aparecerá aquí.")
            case .requested:
                ModuleEmptyView(icon: "paperplane", title: "No has pedido apoyo todavía", message: "Toca + para pedirle una tarea a alguien del equipo.")
            case .team:
                ModuleEmptyView(icon: "person.3", title: "El equipo no tiene tareas abiertas")
            }
        }
    }

    // MARK: Datos

    private var filtered: [ArtaTask] {
        var list = tasks
        switch filter {
        case .open: list = list.filter { !$0.isDone }
        case .overdue: list = list.filter { DueBucket.of($0) == .overdue }
        case .blocked: list = list.filter { $0.status == "BLOCKED" }
        case .approval: list = list.filter { $0.isPendingApproval }
        case .done: list = list.filter { $0.isDone }
        case .all: break
        }
        let q = query.moduleTrimmed.lowercased()
        if !q.isEmpty { list = list.filter { matches($0, q) } }
        return list
    }

    private func matches(_ t: ArtaTask, _ q: String) -> Bool {
        if t.title.lowercased().contains(q) { return true }
        if (t.module ?? "").lowercased().contains(q) { return true }
        if (t.detail ?? "").lowercased().contains(q) { return true }
        if (t.event?.name ?? "").lowercased().contains(q) { return true }
        return t.people.contains { $0.name.lowercased().contains(q) }
    }

    private var groups: [DueGroup] {
        let byBucket = Dictionary(grouping: filtered) { DueBucket.of($0) }
        return DueBucket.allCases.compactMap { bucket in
            guard let items = byBucket[bucket], !items.isEmpty else { return nil }
            let sorted = items.sorted { ($0.dueAt ?? "~") < ($1.dueAt ?? "~") }
            return DueGroup(bucket: bucket, tasks: sorted)
        }
    }

    private func belongsToScope(_ t: ArtaTask) -> Bool {
        guard let me = profile?.id else { return false }
        switch scope {
        case .team: return true
        case .mine: return t.isAssignee(me)
        case .requested: return t.createdById == me && !t.isAssignee(me)
        }
    }

    private func load(resetting: Bool = false) async {
        if resetting {
            loading = true
            tasks = []
            error = nil
        }
        let requested = scope
        do {
            let p = try await ModulesProfileStore.shared.load()
            profile = p
            if requested == .team && !p.seesTeamTasks {
                scope = .mine
                return
            }
            let list: [ArtaTask]
            switch requested {
            case .mine: list = try await ApiClient.shared.myTasks()
            case .requested: list = try await ApiClient.shared.requestedTasks()
            case .team: list = try await ApiClient.shared.teamTasks()
            }
            // Si la persona cambió de vista mientras cargaba, esta respuesta ya no aplica.
            guard requested == scope else { return }
            tasks = list
            error = nil
        } catch {
            if !error.isModuleCancellation { self.error = error.userMessage }
        }
        loading = false
    }

    private func showFlash(_ text: String) {
        Haptics.success()
        flash = text
        Task {
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if flash == text { flash = nil }
        }
    }
}

// MARK: - Fila

struct TaskRow: View {
    let task: ArtaTask
    var showEvent = true

    private var overdue: Bool { DueBucket.of(task) == .overdue }

    private var icon: String {
        if task.isDone { return "checkmark.circle.fill" }
        if task.isPendingApproval { return "hourglass.circle" }
        if task.status == "BLOCKED" { return "exclamationmark.octagon" }
        return "circle"
    }

    private var iconColor: Color {
        if task.isDone { return Color(hex: 0x22C55E) }
        if task.status == "BLOCKED" || overdue { return ArtaColor.danger }
        if task.isPendingApproval { return Color(hex: 0xF59E0B) }
        return ArtaColor.muted
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(iconColor)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .strikethrough(task.isDone, color: ArtaColor.muted)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(task.isDone ? ArtaColor.muted : ArtaColor.text)
                    .lineLimit(2)
                HStack(spacing: 4) {
                    if !task.isDone, let due = MDate.dueText(task.dueAt) {
                        Text(due).foregroundStyle(overdue ? ArtaColor.danger : ArtaColor.muted)
                    }
                    if showEvent, let name = task.event?.name, !name.isEmpty {
                        Text("· \(name)").foregroundStyle(ArtaColor.muted)
                    }
                }
                .font(.caption)
                .lineLimit(1)
                PeopleLine(names: task.people.map(\.name))
                if !task.isDone, let note = task.rejectionNote, !note.isEmpty {
                    Text("Corrección: \(note)")
                        .font(.caption)
                        .foregroundStyle(ArtaColor.danger)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 4)
            if let engagement = TaskInfo.engagement(task) {
                StatusPill(text: engagement.0, tone: engagement.1)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

// MARK: - Crear / editar

struct TaskFormSheet: View {
    enum Mode {
        case create(eventId: String?)
        case edit(ArtaTask)
    }

    let mode: Mode
    let onSaved: (ArtaTask) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var detail = ""
    @State private var module = ""
    @State private var eventId: String? = nil
    @State private var assigneeIds: [String] = []
    @State private var hasDue = false
    @State private var withTime = false
    @State private var dueDate = Date()
    @State private var directory: [DirectoryPerson] = []
    @State private var events: [ArtaEvent] = []
    @State private var saving = false
    @State private var error: String?
    @State private var showPeople = false
    @State private var didPrefill = false

    private var isCreate: Bool {
        if case .create = mode { return true }
        return false
    }

    private var fixedEventId: String? {
        if case let .create(id) = mode { return id }
        return nil
    }

    private var dueComponents: DatePickerComponents { withTime ? [.date, .hourAndMinute] : .date }

    private var assigneeSummary: String {
        if assigneeIds.isEmpty { return "Sin asignar" }
        let names = assigneeIds.map { id in directory.first(where: { $0.id == id })?.name ?? knownName(id) }
        return names.joined(separator: ", ")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Qué hay que hacer", text: $title, axis: .vertical)
                        .lineLimit(1...3)
                    TextField("Detalle (opcional)", text: $detail, axis: .vertical)
                        .lineLimit(3...8)
                }
                .listRowBackground(ArtaColor.bgElev)

                Section {
                    Button {
                        showPeople = true
                    } label: {
                        HStack {
                            Text(assigneeSummary)
                                .foregroundStyle(assigneeIds.isEmpty ? ArtaColor.muted : ArtaColor.text)
                                .lineLimit(2)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(ArtaColor.muted)
                        }
                    }
                } header: {
                    Text("Responsables")
                } footer: {
                    Text("La primera persona queda como responsable principal. A cada quien le llega el aviso.")
                }
                .listRowBackground(ArtaColor.bgElev)

                if isCreate && fixedEventId == nil {
                    Section("Evento") {
                        Picker("Evento", selection: $eventId) {
                            Text("Sin evento").tag(String?.none)
                            ForEach(events) { ev in
                                Text(ev.name).tag(Optional(ev.id))
                            }
                        }
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }

                Section("Vencimiento") {
                    Toggle("Con fecha", isOn: $hasDue.animation())
                    if hasDue {
                        Toggle("Con hora", isOn: $withTime.animation())
                        DatePicker("Fecha", selection: $dueDate, displayedComponents: dueComponents)
                            .environment(\.locale, Locale(identifier: "es_MX"))
                    }
                }
                .tint(ArtaColor.gold)
                .listRowBackground(ArtaColor.bgElev)

                Section("Módulo") {
                    TextField("producción / campaña…", text: $module)
                }
                .listRowBackground(ArtaColor.bgElev)

                if let error {
                    Section {
                        Text(error).foregroundStyle(ArtaColor.danger)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .navigationTitle(isCreate ? "Nueva tarea" : "Editar tarea")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button(isCreate ? "Asignar" : "Guardar") {
                            Task { await save() }
                        }
                        .disabled(title.moduleTrimmed.isEmpty)
                    }
                }
            }
            .sheet(isPresented: $showPeople) {
                AssigneePickerSheet(directory: directory, selection: $assigneeIds)
            }
            .onAppear(perform: prefill)
            .task { await loadOptions() }
            .interactiveDismissDisabled(saving)
        }
    }

    private func knownName(_ id: String) -> String {
        if case let .edit(task) = mode, let p = task.people.first(where: { $0.id == id }) { return p.name }
        return "Persona"
    }

    private func prefill() {
        guard !didPrefill else { return }
        didPrefill = true
        guard case let .edit(task) = mode else { return }
        title = task.title
        detail = task.detail ?? ""
        module = task.module ?? ""
        assigneeIds = task.allAssigneeIds
        if let due = task.dueAt, let day = MDate.dueDay(due) {
            hasDue = true
            withTime = MDate.dueHasTime(due)
            dueDate = withTime ? (parseDate(due) ?? day) : day
        }
    }

    private func loadOptions() async {
        if directory.isEmpty, let people = try? await ApiClient.shared.directory() {
            directory = people
        }
        if isCreate && fixedEventId == nil && events.isEmpty, let list = try? await ApiClient.shared.events() {
            // El API no deja crear tareas en eventos cerrados o cancelados.
            events = list
                .filter { $0.status != "CLOSED" && $0.status != "CANCELLED" }
                .sorted { ($0.startsAt ?? "~") < ($1.startsAt ?? "~") }
        }
    }

    /// Solo fecha: `AAAA-MM-DD` (igual que la web). Con hora: ISO completo.
    private var dueValue: String? {
        guard hasDue else { return nil }
        if withTime { return ISO8601DateFormatter().string(from: dueDate) }
        return MDate.ymdString(dueDate)
    }

    private func save() async {
        let cleanTitle = title.moduleTrimmed
        guard !cleanTitle.isEmpty else { return }
        saving = true
        error = nil
        do {
            let saved: ArtaTask
            switch mode {
            case let .create(fixed):
                let body = CreateTaskBody(
                    title: cleanTitle,
                    detail: detail.moduleTrimmed.isEmpty ? nil : detail.moduleTrimmed,
                    module: module.moduleTrimmed.isEmpty ? nil : module.moduleTrimmed,
                    assigneeIds: assigneeIds,
                    eventId: fixed ?? eventId,
                    dueAt: dueValue
                )
                saved = try await ApiClient.shared.createTask(body)
            case let .edit(task):
                let body = UpdateTaskBody(
                    title: cleanTitle,
                    detail: detail.moduleTrimmed,
                    module: module.moduleTrimmed,
                    assigneeIds: assigneeIds,
                    dueAt: .some(dueValue)
                )
                saved = try await ApiClient.shared.updateTask(task.id, body)
            }
            Haptics.success()
            onSaved(saved)
            dismiss()
        } catch {
            Haptics.error()
            self.error = error.userMessage
        }
        saving = false
    }
}

/// Elegir 1 o más responsables, en orden (la primera es la principal).
struct AssigneePickerSheet: View {
    let directory: [DirectoryPerson]
    @Binding var selection: [String]

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filtered: [DirectoryPerson] {
        let q = query.moduleTrimmed.lowercased()
        guard !q.isEmpty else { return directory }
        return directory.filter { $0.name.lowercased().contains(q) || ($0.title ?? "").lowercased().contains(q) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(filtered) { person in
                    Button {
                        toggle(person.id)
                    } label: {
                        row(person)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .overlay {
                if directory.isEmpty { ProgressView().tint(ArtaColor.gold) }
            }
            .searchable(text: $query, prompt: "Buscar persona")
            .navigationTitle("Responsables")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if !selection.isEmpty {
                        Button("Quitar todos") { selection = [] }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func row(_ person: DirectoryPerson) -> some View {
        HStack(spacing: 12) {
            Avatar(name: person.name, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(person.name).foregroundStyle(ArtaColor.text)
                if let title = person.title, !title.isEmpty {
                    Text(title).font(.caption).foregroundStyle(ArtaColor.muted)
                }
            }
            Spacer()
            if let index = selection.firstIndex(of: person.id) {
                if index == 0 { StatusPill(text: "Principal", tone: .gold) }
                Image(systemName: "checkmark.circle.fill").foregroundStyle(ArtaColor.gold)
            } else {
                Image(systemName: "circle").foregroundStyle(ArtaColor.muted)
            }
        }
        .contentShape(Rectangle())
    }

    private func toggle(_ id: String) {
        Haptics.tap()
        if let index = selection.firstIndex(of: id) {
            selection.remove(at: index)
        } else {
            selection.append(id)
        }
    }
}
