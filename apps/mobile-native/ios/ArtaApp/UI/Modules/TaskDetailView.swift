import PhotosUI
import QuickLook
import SwiftUI
import UniformTypeIdentifiers

/// Detalle de una tarea con las mismas acciones que la web, según permiso y estado
/// (`apps/api/src/tasks/task-workflow.ts`).
struct TaskDetailView: View {
    let taskId: String

    @EnvironmentObject private var router: AppRouter
    @Environment(\.dismiss) private var dismiss
    @State private var task: ArtaTask?
    @State private var profile: ModulesProfile?
    @State private var loading = true
    @State private var error: String?
    @State private var busy = false
    @State private var actionError: String?
    @State private var showDeliver = false
    @State private var showReject = false
    @State private var showEdit = false
    @State private var confirmDelete = false
    @State private var previewURL: URL?
    @State private var showImporter = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var uploading = false

    private var me: String? { profile?.id }

    var body: some View {
        Group {
            if let task {
                detail(task)
            } else if loading {
                ModuleSkeletonList(rows: 4)
            } else {
                ModuleErrorView(message: error ?? "No se encontró la tarea.") {
                    Task { await load(showSkeleton: true) }
                }
            }
        }
        .background(ArtaColor.bg)
        .navigationTitle("Tarea")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let task { menu(task) }
            }
        }
        .task { await load() }
        .quickLookPreview($previewURL)
        .sheet(isPresented: $showDeliver) {
            if let task {
                DeliverTaskSheet(task: task) { updated in
                    self.task = updated
                }
            }
        }
        .sheet(isPresented: $showReject) {
            if let task {
                RejectTaskSheet(task: task) { updated in
                    self.task = updated
                }
            }
        }
        .sheet(isPresented: $showEdit) {
            if let task {
                TaskFormSheet(mode: .edit(task)) { updated in
                    self.task = updated
                }
            }
        }
        .confirmationDialog("¿Eliminar esta tarea?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Eliminar", role: .destructive) {
                Task { await deleteTask() }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Se borra para todos sus responsables. No se puede deshacer.")
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            if case let .success(urls) = result {
                let files = urls.compactMap { ModuleFiles.read($0) }
                Task { await upload(files) }
            }
        }
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var files: [PickedFile] = []
                for item in items {
                    if let file = await ModuleFiles.photo(item) { files.append(file) }
                }
                photoItems = []
                await upload(files)
            }
        }
    }

    // MARK: Permisos (mismas reglas que el API)

    private func canReview(_ t: ArtaTask) -> Bool {
        t.isPendingApproval && (t.createdById == me || profile?.isDirection == true)
    }

    private func canDeliver(_ t: ArtaTask) -> Bool {
        t.needsApproval && t.isAssignee(me) && !t.isDone && !t.isPendingApproval
    }

    /// El API exige entrega con evidencia cuando quien la tiene debe pasar por visto bueno.
    private func canMarkDone(_ t: ArtaTask) -> Bool {
        !t.isDone && !t.isPendingApproval && !(t.needsApproval && t.isAssignee(me))
    }

    private func canReopen(_ t: ArtaTask) -> Bool { t.isDone || t.isPendingApproval }

    private func canAttach(_ t: ArtaTask) -> Bool {
        t.isAssignee(me) || t.createdById == me || profile?.isDirection == true
    }

    // MARK: Vista

    private func detail(_ t: ArtaTask) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                headerCard(t)
                if let actionError {
                    Label(actionError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                actionsCard(t)
                if let detailText = t.detail, !detailText.isEmpty {
                    ModuleCard(title: "Detalle") {
                        Text(detailText).font(.body).foregroundStyle(ArtaColor.text).textSelection(.enabled)
                    }
                }
                deliveryCard(t)
                peopleCard(t)
                evidenceCard(t)
                historyCard(t)
            }
            .padding(16)
        }
        .refreshable { await load() }
    }

    private func headerCard(_ t: ArtaTask) -> some View {
        ModuleCard {
            VStack(alignment: .leading, spacing: 10) {
                Text(t.title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ArtaColor.text)
                    .textSelection(.enabled)
                HStack(spacing: 8) {
                    StatusPill(text: TaskInfo.statusLabel(t.status), tone: TaskInfo.statusTone(t.status))
                    if !t.isDone, let due = MDate.dueText(t.dueAt) {
                        Text(due)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(DueBucket.of(t) == .overdue ? ArtaColor.danger : ArtaColor.muted)
                    }
                }
                if let event = t.event {
                    Button {
                        router.open(AppRoute.event(event.id))
                    } label: {
                        Label(event.name ?? "Evento", systemImage: "calendar")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ArtaColor.gold)
                    }
                    .buttonStyle(.plain)
                } else {
                    Label("Sin evento", systemImage: "calendar").font(.subheadline).foregroundStyle(ArtaColor.muted)
                }
                if let module = t.module, !module.isEmpty {
                    FactRow(label: "Módulo", value: module)
                }
                if let by = t.createdBy {
                    FactRow(label: "Pidió", value: by.name)
                }
                if let created = t.createdAt, !created.isEmpty {
                    FactRow(label: "Creada", value: MDate.stampText(created))
                }
                if !t.isDone, let note = t.rejectionNote, !note.isEmpty {
                    Label("Corrección pedida: \(note)", systemImage: "exclamationmark.bubble.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                }
            }
        }
    }

    @ViewBuilder
    private func actionsCard(_ t: ArtaTask) -> some View {
        if t.isEventClosed {
            Label("Evento cerrado: la tarea queda en solo lectura.", systemImage: "lock.fill")
                .font(.footnote)
                .foregroundStyle(ArtaColor.muted)
        } else {
            VStack(spacing: 8) {
                if canReview(t) {
                    actionButton("Aprobar entrega", icon: "checkmark.seal.fill", prominent: true) {
                        Task { await approve() }
                    }
                    actionButton("Pedir corrección", icon: "arrow.uturn.left", tint: ArtaColor.danger) {
                        showReject = true
                    }
                }
                if canDeliver(t) {
                    actionButton("Entregar con evidencia", icon: "tray.and.arrow.up.fill", prominent: true) {
                        showDeliver = true
                    }
                }
                if canMarkDone(t) {
                    actionButton("Marcar hecha", icon: "checkmark.circle", prominent: true) {
                        Task { await setStatus("DONE") }
                    }
                }
                if canReopen(t) && !canReview(t) {
                    actionButton("Reabrir", icon: "arrow.counterclockwise") {
                        Task { await setStatus("OPEN") }
                    }
                }
            }
            .disabled(busy)
            .opacity(busy ? 0.6 : 1)
        }
    }

    private func actionButton(_ title: String, icon: String, prominent: Bool = false, tint: Color = ArtaColor.gold, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(prominent ? ArtaColor.bg : tint)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 12).fill(prominent ? tint : tint.opacity(0.14)))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func deliveryCard(_ t: ArtaTask) -> some View {
        let hasNote = !(t.completionNote ?? "").isEmpty
        if hasNote || t.submittedAt != nil || t.approvedAt != nil {
            ModuleCard(title: "Entrega") {
                VStack(alignment: .leading, spacing: 8) {
                    if let note = t.completionNote, !note.isEmpty {
                        Text(note).font(.body).foregroundStyle(ArtaColor.text).textSelection(.enabled)
                    }
                    if let submitted = t.submittedAt {
                        FactRow(label: "Entregada", value: MDate.stampText(submitted))
                    }
                    if t.isDone, let approved = t.approvedAt {
                        FactRow(label: "Aprobada", value: [t.approvedBy?.name, MDate.stampText(approved)].compactMap { $0 }.joined(separator: " · "))
                    }
                }
            }
        }
    }

    private func peopleCard(_ t: ArtaTask) -> some View {
        ModuleCard(title: "Responsables") {
            if t.people.isEmpty {
                Text("Sin asignar").font(.subheadline).foregroundStyle(ArtaColor.muted)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(t.people.enumerated()), id: \.element.id) { index, person in
                        HStack(spacing: 12) {
                            Avatar(name: person.name, size: 32)
                            Text(person.name).font(.subheadline).foregroundStyle(ArtaColor.text)
                            Spacer()
                            if index == 0 && t.people.count > 1 {
                                StatusPill(text: "Principal", tone: .gold)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func evidenceCard(_ t: ArtaTask) -> some View {
        let attach = canAttach(t) && !t.isEventClosed
        if !t.evidenceList.isEmpty || attach {
            ModuleCard(title: "Evidencias y archivos") {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(t.evidenceList) { ev in
                        Button {
                            open(ev)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: fileIcon(ev.fileUrl)).foregroundStyle(ArtaColor.gold).frame(width: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(ev.displayName).font(.subheadline).foregroundStyle(ArtaColor.text).lineLimit(1)
                                    Text([ev.uploadedBy?.name, MDate.stampText(ev.createdAt)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.caption)
                                        .foregroundStyle(ArtaColor.muted)
                                    if let note = ev.note, !note.isEmpty {
                                        Text(note).font(.caption).foregroundStyle(ArtaColor.muted).lineLimit(2)
                                    }
                                }
                                Spacer()
                                Image(systemName: "eye").foregroundStyle(ArtaColor.muted)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    if t.evidenceList.isEmpty {
                        Text("Todavía no hay archivos.").font(.subheadline).foregroundStyle(ArtaColor.muted)
                    }
                    if attach {
                        HStack(spacing: 12) {
                            PhotosPicker(selection: $photoItems, maxSelectionCount: 5, matching: .images) {
                                Label("Foto", systemImage: "photo")
                            }
                            Button {
                                showImporter = true
                            } label: {
                                Label("Archivo", systemImage: "doc.badge.plus")
                            }
                            Spacer()
                            if uploading { ProgressView().tint(ArtaColor.gold) }
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.gold)
                        .disabled(uploading)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func historyCard(_ t: ArtaTask) -> some View {
        if !t.activityList.isEmpty {
            ModuleCard(title: "Historial") {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(t.activityList) { item in
                        HStack(alignment: .top, spacing: 10) {
                            Circle().fill(ArtaColor.gold).frame(width: 8, height: 8).padding(.top, 6)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(TaskInfo.actionLabel(item.action)).font(.subheadline.weight(.semibold)).foregroundStyle(ArtaColor.text)
                                Text([item.actor?.name ?? "Sistema", MDate.stampText(item.createdAt)].filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(ArtaColor.muted)
                                if let extra = TaskInfo.activityDetail(item) {
                                    Text(extra).font(.footnote).foregroundStyle(ArtaColor.text)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func menu(_ t: ArtaTask) -> some View {
        Menu {
            if !t.isEventClosed {
                Button {
                    showEdit = true
                } label: {
                    Label("Editar", systemImage: "pencil")
                }
                if !t.isDone && !t.isPendingApproval && t.status != "IN_PROGRESS" {
                    Button {
                        Task { await setStatus("IN_PROGRESS") }
                    } label: {
                        Label("Marcar en curso", systemImage: "play.circle")
                    }
                }
                if !t.isDone && !t.isPendingApproval {
                    Button {
                        Task { await setStatus(t.status == "BLOCKED" ? "OPEN" : "BLOCKED") }
                    } label: {
                        Label(t.status == "BLOCKED" ? "Desbloquear" : "Bloquear",
                              systemImage: t.status == "BLOCKED" ? "lock.open" : "exclamationmark.octagon")
                    }
                }
                if canReopen(t) {
                    Button {
                        Task { await setStatus("OPEN") }
                    } label: {
                        Label("Reabrir", systemImage: "arrow.counterclockwise")
                    }
                }
            }
            if let event = t.event {
                Button {
                    router.open(AppRoute.event(event.id))
                } label: {
                    Label("Abrir evento", systemImage: "calendar")
                }
            }
            if !t.isEventClosed {
                Divider()
                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label("Eliminar", systemImage: "trash")
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        .accessibilityLabel("Más acciones")
    }

    private func fileIcon(_ path: String) -> String {
        switch (path as NSString).pathExtension.lowercased() {
        case "jpg", "jpeg", "png", "gif", "webp", "heic": return "photo"
        case "pdf": return "doc.richtext"
        case "xls", "xlsx", "csv": return "tablecells"
        default: return "doc"
        }
    }

    // MARK: Acciones

    private func load(showSkeleton: Bool = false) async {
        if showSkeleton {
            loading = true
            error = nil
        }
        do {
            profile = try await ModulesProfileStore.shared.load()
            task = try await ApiClient.shared.task(taskId)
            error = nil
        } catch {
            if !error.isModuleCancellation { self.error = error.userMessage }
        }
        loading = false
    }

    private func run(_ op: () async throws -> ArtaTask) async {
        busy = true
        actionError = nil
        do {
            task = try await op()
            Haptics.success()
        } catch {
            Haptics.error()
            actionError = error.userMessage
        }
        busy = false
    }

    private func setStatus(_ status: String) async {
        let id = taskId
        await run { try await ApiClient.shared.updateTask(id, UpdateTaskBody(status: status)) }
    }

    private func approve() async {
        let id = taskId
        await run { try await ApiClient.shared.approveTask(id) }
    }

    private func deleteTask() async {
        busy = true
        do {
            try await ApiClient.shared.deleteTask(taskId)
            Haptics.success()
            dismiss()
        } catch {
            Haptics.error()
            actionError = error.userMessage
        }
        busy = false
    }

    private func upload(_ files: [PickedFile]) async {
        guard !files.isEmpty else { return }
        uploading = true
        actionError = nil
        do {
            for file in files {
                _ = try await ApiClient.shared.uploadTaskEvidence(taskId, data: file.data, filename: file.name, mime: file.mime)
            }
            task = try await ApiClient.shared.task(taskId)
            Haptics.success()
        } catch {
            Haptics.error()
            actionError = error.userMessage
        }
        uploading = false
    }

    private func open(_ evidence: TaskEvidence) {
        Task {
            do {
                previewURL = try await ModuleFiles.download(evidence.fileUrl, name: evidence.label)
            } catch {
                actionError = error.userMessage
            }
        }
    }
}

// MARK: - Entregar

/// Entrega con evidencia: nota escrita y/o archivos (al menos uno de los dos, o archivos ya subidos).
struct DeliverTaskSheet: View {
    let task: ArtaTask
    let onDone: (ArtaTask) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var files: [PickedFile] = []
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showImporter = false
    @State private var sending = false
    @State private var error: String?

    private var canSend: Bool {
        !note.moduleTrimmed.isEmpty || !files.isEmpty || !task.evidenceList.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(task.title).font(.headline).foregroundStyle(ArtaColor.text)
                        if let by = task.createdBy {
                            Text("Pidió \(by.name)").font(.footnote).foregroundStyle(ArtaColor.muted)
                        }
                    }
                }
                .listRowBackground(ArtaColor.bgElev)

                if let rejection = task.rejectionNote, !rejection.isEmpty {
                    Section {
                        Label("Corrección pedida: \(rejection)", systemImage: "exclamationmark.bubble.fill")
                            .font(.footnote)
                            .foregroundStyle(Color(hex: 0xF59E0B))
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }

                Section("¿Qué hiciste?") {
                    TextField("Describe lo realizado, referencias, números, contactos…", text: $note, axis: .vertical)
                        .lineLimit(4...10)
                }
                .listRowBackground(ArtaColor.bgElev)

                Section {
                    ForEach(files) { file in
                        HStack {
                            Image(systemName: file.mime.hasPrefix("image/") ? "photo" : "doc").foregroundStyle(ArtaColor.gold)
                            Text(file.name).lineLimit(1)
                            Spacer()
                            Text(fileSize(Int64(file.data.count))).font(.caption).foregroundStyle(ArtaColor.muted)
                        }
                    }
                    .onDelete { files.remove(atOffsets: $0) }
                    PhotosPicker(selection: $photoItems, maxSelectionCount: 5, matching: .images) {
                        Label("Agregar foto", systemImage: "photo.badge.plus")
                    }
                    Button {
                        showImporter = true
                    } label: {
                        Label("Agregar archivo (PDF, Excel…)", systemImage: "doc.badge.plus")
                    }
                } header: {
                    Text("Evidencia")
                } footer: {
                    if !task.evidenceList.isEmpty {
                        Text("Ya hay \(task.evidenceList.count) archivo(s) adjunto(s) en esta tarea.")
                    }
                }
                .listRowBackground(ArtaColor.bgElev)

                if let error {
                    Section {
                        Text(error).foregroundStyle(ArtaColor.danger)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .tint(ArtaColor.gold)
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .navigationTitle("Entregar tarea")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if sending {
                        ProgressView()
                    } else {
                        Button("Enviar") {
                            Task { await send() }
                        }
                        .disabled(!canSend)
                    }
                }
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
                if case let .success(urls) = result {
                    files.append(contentsOf: urls.compactMap { ModuleFiles.read($0) })
                }
            }
            .onChange(of: photoItems) { _, items in
                guard !items.isEmpty else { return }
                Task {
                    for item in items {
                        if let file = await ModuleFiles.photo(item) { files.append(file) }
                    }
                    photoItems = []
                }
            }
            .interactiveDismissDisabled(sending)
        }
    }

    private func send() async {
        guard canSend else {
            error = "Agrega una nota o al menos un archivo de evidencia."
            return
        }
        sending = true
        error = nil
        do {
            // Se quita cada archivo al subirlo: si falla la entrega, reintentar no lo duplica.
            while let file = files.first {
                _ = try await ApiClient.shared.uploadTaskEvidence(task.id, data: file.data, filename: file.name, mime: file.mime)
                files.removeFirst()
            }
            let updated = try await ApiClient.shared.submitTask(task.id, note: note.moduleTrimmed)
            Haptics.success()
            onDone(updated)
            dismiss()
        } catch {
            Haptics.error()
            self.error = error.userMessage
        }
        sending = false
    }
}

// MARK: - Pedir corrección

struct RejectTaskSheet: View {
    let task: ArtaTask
    let onDone: (ArtaTask) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var sending = false
    @State private var error: String?
    @State private var confirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(task.title).font(.headline).foregroundStyle(ArtaColor.text)
                    if let delivered = task.completionNote, !delivered.isEmpty {
                        Text("Entrega: \(delivered)").font(.footnote).foregroundStyle(ArtaColor.muted)
                    }
                }
                .listRowBackground(ArtaColor.bgElev)

                Section {
                    TextField("Qué falta o qué corregir…", text: $note, axis: .vertical)
                        .lineLimit(3...8)
                } header: {
                    Text("Motivo")
                } footer: {
                    Text("La tarea vuelve a «En curso» y a sus responsables les llega el aviso con tu motivo.")
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
            .navigationTitle("Pedir corrección")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if sending {
                        ProgressView()
                    } else {
                        Button("Rechazar") { confirm = true }
                            .disabled(note.moduleTrimmed.isEmpty)
                    }
                }
            }
            .confirmationDialog("¿Rechazar la entrega?", isPresented: $confirm, titleVisibility: .visible) {
                Button("Rechazar entrega", role: .destructive) {
                    Task { await send() }
                }
                Button("Cancelar", role: .cancel) {}
            }
            .interactiveDismissDisabled(sending)
        }
    }

    private func send() async {
        let reason = note.moduleTrimmed
        guard !reason.isEmpty else { return }
        sending = true
        error = nil
        do {
            let updated = try await ApiClient.shared.rejectTask(task.id, note: reason)
            Haptics.warning()
            onDone(updated)
            dismiss()
        } catch {
            Haptics.error()
            self.error = error.userMessage
        }
        sending = false
    }
}
