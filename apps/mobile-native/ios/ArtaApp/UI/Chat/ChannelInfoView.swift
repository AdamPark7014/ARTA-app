import Combine
import SwiftUI

// MARK: - Información del canal

@MainActor
final class ChannelInfoModel: ObservableObject {
    let channelId: String

    @Published private(set) var channel: ChannelDetail?
    @Published private(set) var pins: [ChatMessage] = []
    @Published private(set) var loading = true
    @Published private(set) var loadError: String?
    @Published private(set) var busy = false
    @Published var error: String?

    var myId: String { Session.shared.currentUser?.id ?? "" }

    private var bag = Set<AnyCancellable>()

    init(channelId: String) {
        self.channelId = channelId
        RealtimeClient.shared.channelsChanged
            .filter { $0 == channelId }
            .debounce(for: .milliseconds(400), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in Task { await self?.load() } }
            .store(in: &bag)
    }

    /// En línea primero, luego por nombre.
    func sortedMembers(online: Set<String>) -> [ChannelMember] {
        (channel?.allMembers ?? []).sorted { a, b in
            let oa = online.contains(a.id)
            let ob = online.contains(b.id)
            if oa != ob { return oa }
            return a.fullName.localizedCaseInsensitiveCompare(b.fullName) == .orderedAscending
        }
    }

    func load() async {
        do {
            channel = try await ApiClient.shared.channel(channelId)
            loadError = nil
            pins = (try? await ApiClient.shared.pins(channelId)) ?? []
        } catch {
            if channel == nil { loadError = error.userMessage }
        }
        loading = false
    }

    func retry() {
        loading = true
        loadError = nil
        Task { await load() }
    }

    func update(topic: String, description: String) async -> Bool {
        busy = true
        defer { busy = false }
        do {
            _ = try await ApiClient.shared.updateChannel(channelId, UpdateChannelBody(topic: topic, description: description))
            channel = try await ApiClient.shared.channel(channelId)
            return true
        } catch {
            return false
        }
    }

    func add(_ userIds: [String]) async -> Bool {
        guard !userIds.isEmpty else { return true }
        do {
            _ = try await ApiClient.shared.addMembers(channelId, userIds: userIds)
            channel = try await ApiClient.shared.channel(channelId)
            return true
        } catch {
            return false
        }
    }

    func remove(_ member: ChannelMember) {
        Task {
            do {
                try await ApiClient.shared.removeMember(channelId, userId: member.id)
                channel = try await ApiClient.shared.channel(channelId)
            } catch {
                self.error = error.userMessage
            }
        }
    }

    /// `hours` nil = siempre; `muted` false = volver a recibir avisos.
    func mute(_ muted: Bool, hours: Int?) {
        Task {
            do {
                try await ApiClient.shared.mute(channelId, muted: muted, hours: hours)
                channel = try await ApiClient.shared.channel(channelId)
            } catch {
                self.error = error.userMessage
            }
        }
    }

    func leave() async -> Bool {
        busy = true
        defer { busy = false }
        do {
            try await ApiClient.shared.leaveChannel(channelId)
            return true
        } catch {
            self.error = error.userMessage
            return false
        }
    }

    func archive() async -> Bool {
        busy = true
        defer { busy = false }
        do {
            try await ApiClient.shared.archiveChannel(channelId)
            return true
        } catch {
            self.error = error.userMessage
            return false
        }
    }

    func openDirect(_ userId: String) async -> String? {
        do {
            return try await ApiClient.shared.openDirect(userId).id
        } catch {
            self.error = error.userMessage
            return nil
        }
    }
}

struct ChannelInfoView: View {
    @StateObject private var model: ChannelInfoModel
    @EnvironmentObject private var router: AppRouter
    @ObservedObject private var presence = PresenceStore.shared
    @State private var editing = false
    @State private var adding = false
    @State private var confirmLeave = false
    @State private var confirmArchive = false

    init(channelId: String) {
        _model = StateObject(wrappedValue: ChannelInfoModel(channelId: channelId))
    }

    var body: some View {
        content
            .background(ArtaColor.bg)
            .navigationTitle(model.channel?.isDirect == true ? "Detalles" : "Información")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                presence.refresh()
                await model.load()
            }
            .alert("Algo falló", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
                Button("Entendido", role: .cancel) { model.error = nil }
            } message: {
                Text(model.error ?? "")
            }
            .sheet(isPresented: $editing) {
                EditChannelSheet(
                    initialTopic: model.channel?.topic ?? "",
                    initialDetails: model.channel?.description ?? ""
                ) { topic, details in
                    await model.update(topic: topic, description: details)
                }
            }
            .sheet(isPresented: $adding) {
                AddMembersSheet(existing: Set((model.channel?.allMembers ?? []).map(\.id))) { ids in
                    await model.add(ids)
                }
            }
            .confirmationDialog(leaveTitle, isPresented: $confirmLeave, titleVisibility: .visible) {
                Button("Salir", role: .destructive) {
                    Task { if await model.leave() { router.chatPath = [] } }
                }
            } message: {
                Text(model.channel?.isPrivate == true ? "Para volver, alguien tendrá que agregarte." : "Puedes volver a unirte desde «Explorar canales».")
            }
            .confirmationDialog("¿Archivar este canal?", isPresented: $confirmArchive, titleVisibility: .visible) {
                Button("Archivar", role: .destructive) {
                    Task { if await model.archive() { router.chatPath = [] } }
                }
            } message: {
                Text("Nadie podrá escribir en él y desaparecerá de la lista.")
            }
    }

    private var leaveTitle: String {
        model.channel?.isGroup == true ? "¿Salir del grupo?" : "¿Salir del canal?"
    }

    @ViewBuilder
    private var content: some View {
        if let ch = model.channel {
            list(ch)
        } else if model.loading {
            ChatSkeleton()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ChatErrorState(message: model.loadError ?? "No se pudo cargar la conversación.") { model.retry() }
        }
    }

    private func list(_ ch: ChannelDetail) -> some View {
        List {
            Section { header(ch) }
                .listRowBackground(Color.clear)
            if !ch.isDirect { aboutSection(ch) }
            notificationsSection(ch)
            pinsSection
            Section {
                NavigationLink(value: ChatRoute.saved) {
                    Label("Mensajes guardados", systemImage: "bookmark")
                        .foregroundStyle(ArtaColor.text)
                }
            }
            .listRowBackground(ArtaColor.bgElev)
            membersSection(ch)
            if !ch.isDirect && !ch.isOrgDefault { dangerSection(ch) }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await model.load() }
    }

    // MARK: Secciones

    private func header(_ ch: ChannelDetail) -> some View {
        VStack(spacing: 10) {
            avatar(ch)
            Text(ch.displayName)
                .font(.title3.weight(.semibold))
                .foregroundStyle(ArtaColor.text)
                .multilineTextAlignment(.center)
            Text(kindLabel(ch))
                .font(.subheadline)
                .foregroundStyle(ch.isDirect && presence.isOnline(ch.peer?.id) ? ArtaColor.online : ArtaColor.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private func avatar(_ ch: ChannelDetail) -> some View {
        if ch.isGroup {
            let others = ch.allMembers.filter { $0.id != model.myId }.map(\.fullName)
            StackedAvatars(names: others.isEmpty ? groupMemberNames(ch.name) : others, size: 64)
        } else if ch.isDirect {
            Avatar(name: ch.displayName, size: 72)
                .overlay(alignment: .bottomTrailing) {
                    if presence.isOnline(ch.peer?.id) { PresenceDot(online: true, size: 16) }
                }
        } else {
            Avatar(name: ch.displayName, size: 72, channel: true)
        }
    }

    private func kindLabel(_ ch: ChannelDetail) -> String {
        if ch.isDirect {
            if presence.isOnline(ch.peer?.id) { return "en línea" }
            return ch.peer?.title ?? "Mensaje directo"
        }
        let count = ch.memberCount ?? ch.allMembers.count
        let people = count == 1 ? "1 persona" : "\(count) personas"
        if ch.isGroup { return "Grupo · \(people)" }
        if ch.isEvent { return "Canal del evento · \(people)" }
        return (ch.isPrivate ? "Canal privado" : "Canal público") + " · \(people)"
    }

    private func aboutSection(_ ch: ChannelDetail) -> some View {
        Section {
            aboutRow("Tema", ch.topic, empty: "Sin tema")
            aboutRow("Descripción", ch.description, empty: "Sin descripción")
            if ch.mayPost {
                Button { editing = true } label: {
                    Label("Editar tema y descripción", systemImage: "pencil")
                        .foregroundStyle(ArtaColor.gold)
                }
            }
        } header: {
            Text("Acerca de")
        }
        .listRowBackground(ArtaColor.bgElev)
    }

    private func aboutRow(_ title: String, _ value: String?, empty: String) -> some View {
        let text = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(ArtaColor.muted)
            if text.isEmpty {
                Text(empty).foregroundStyle(ArtaColor.muted)
            } else {
                ChatRichText(source: text)
            }
        }
        .padding(.vertical, 2)
    }

    private func notificationsSection(_ ch: ChannelDetail) -> some View {
        Section {
            if ch.isMuted {
                Label(muteLabel(ch), systemImage: "bell.slash.fill")
                    .foregroundStyle(ArtaColor.muted)
                Button { model.mute(false, hours: nil) } label: {
                    Label("Quitar silencio", systemImage: "bell")
                        .foregroundStyle(ArtaColor.gold)
                }
            } else {
                Menu {
                    Button("8 horas") { model.mute(true, hours: 8) }
                    Button("1 semana") { model.mute(true, hours: 24 * 7) }
                    Button("Siempre") { model.mute(true, hours: nil) }
                } label: {
                    Label("Silenciar", systemImage: "bell.slash")
                        .foregroundStyle(ArtaColor.text)
                }
            }
        } header: {
            Text("Notificaciones")
        }
        .listRowBackground(ArtaColor.bgElev)
    }

    private func muteLabel(_ ch: ChannelDetail) -> String {
        guard let until = parseDate(ch.mutedUntil) else { return "Silenciado" }
        return "Silenciado hasta " + until.formatted(date: .abbreviated, time: .shortened)
    }

    private var pinsSection: some View {
        Section {
            if model.pins.isEmpty {
                Text("Nada fijado todavía.")
                    .foregroundStyle(ArtaColor.muted)
            } else {
                ForEach(model.pins) { m in
                    Button { openPin(m) } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(m.author.fullName)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(ArtaColor.gold)
                                Spacer()
                                Text(relativeTime(m.createdAt))
                                    .font(.caption)
                                    .foregroundStyle(ArtaColor.muted)
                            }
                            Text(plainText(m.text.isEmpty ? (m.attachment?.name ?? "Adjunto") : m.text))
                                .font(.subheadline)
                                .foregroundStyle(ArtaColor.text)
                                .lineLimit(3)
                        }
                    }
                }
            }
        } header: {
            Text(model.pins.isEmpty ? "Fijados" : "Fijados (\(model.pins.count))")
        }
        .listRowBackground(ArtaColor.bgElev)
    }

    /// Si se llegó desde la conversación, se regresa a ella y salta al mensaje; si no, se abre enfocada.
    private func openPin(_ m: ChatMessage) {
        if let root = m.parentId {
            router.chatPath.append(.thread(channelId: model.channelId, rootId: root))
            return
        }
        let path = router.chatPath
        if path.count >= 2, case let .conversation(id, _) = path[path.count - 2], id == model.channelId {
            router.chatJump = ChatJump(channelId: model.channelId, messageId: m.id)
            router.chatPath.removeLast()
        } else {
            router.chatPath.append(.conversation(channelId: model.channelId, focusMessageId: m.id))
        }
    }

    private func membersSection(_ ch: ChannelDetail) -> some View {
        let members = model.sortedMembers(online: presence.online)
        let count = ch.memberCount ?? members.count
        return Section {
            if ch.mayManage && !ch.isDirect && !ch.isOrgDefault {
                Button { adding = true } label: {
                    Label("Agregar personas", systemImage: "person.badge.plus")
                        .foregroundStyle(ArtaColor.gold)
                }
            }
            ForEach(members) { member in
                memberRow(member, in: ch)
                    .swipeActions(edge: .trailing) {
                        if canRemove(member, in: ch) {
                            Button(role: .destructive) { model.remove(member) } label: {
                                Label("Quitar", systemImage: "person.badge.minus")
                            }
                        }
                    }
            }
        } header: {
            Text(count == 1 ? "1 miembro" : "\(count) miembros")
        }
        .listRowBackground(ArtaColor.bgElev)
    }

    private func canRemove(_ member: ChannelMember, in ch: ChannelDetail) -> Bool {
        ch.mayManage && !ch.isDirect && !ch.isOrgDefault && member.id != model.myId
    }

    private func memberRow(_ member: ChannelMember, in ch: ChannelDetail) -> some View {
        let online = presence.isOnline(member.id)
        let isMe = member.id == model.myId
        return Button {
            Task {
                if let id = await model.openDirect(member.id) {
                    router.chatPath.append(.conversation(channelId: id, focusMessageId: nil))
                }
            }
        } label: {
            HStack(spacing: 12) {
                Avatar(name: member.fullName, size: 36)
                    .overlay(alignment: .bottomTrailing) {
                        if online { PresenceDot(online: true, size: 10) }
                    }
                VStack(alignment: .leading, spacing: 2) {
                    Text(isMe ? "\(member.fullName) (tú)" : member.fullName)
                        .foregroundStyle(ArtaColor.text)
                        .lineLimit(1)
                    if online {
                        Text("en línea")
                            .font(.caption)
                            .foregroundStyle(ArtaColor.online)
                    } else if let title = member.title, !title.isEmpty {
                        Text(title)
                            .font(.caption)
                            .foregroundStyle(ArtaColor.muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                if let role = roleLabel(member.role) {
                    Text(role)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ArtaColor.gold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(ArtaColor.goldSoft))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isMe || ch.isDirect)
        .accessibilityHint(isMe || ch.isDirect ? "" : "Abre un mensaje directo")
    }

    private func roleLabel(_ role: String?) -> String? {
        switch (role ?? "").uppercased() {
        case "OWNER": return "Creador"
        case "ADMIN", "MODERATOR": return "Moderador"
        default: return nil
        }
    }

    private func dangerSection(_ ch: ChannelDetail) -> some View {
        Section {
            Button(role: .destructive) { confirmLeave = true } label: {
                Label(ch.isGroup ? "Salir del grupo" : "Salir del canal", systemImage: "rectangle.portrait.and.arrow.right")
                    .foregroundStyle(ArtaColor.danger)
            }
            if ch.mayManage && !ch.isGroup {
                Button(role: .destructive) { confirmArchive = true } label: {
                    Label("Archivar canal", systemImage: "archivebox")
                        .foregroundStyle(ArtaColor.danger)
                }
            }
        }
        .listRowBackground(ArtaColor.bgElev)
        .disabled(model.busy)
    }
}

// MARK: - Editar tema y descripción

private struct EditChannelSheet: View {
    let initialTopic: String
    let initialDetails: String
    var onSave: @MainActor (String, String) async -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var topic = ""
    @State private var details = ""
    @State private var loaded = false
    @State private var saving = false
    @State private var failed = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("De qué se habla aquí", text: $topic, axis: .vertical)
                        .lineLimit(1...3)
                } header: {
                    Text("Tema")
                } footer: {
                    Text("Se ve debajo del nombre, en el encabezado de la conversación.")
                }
                .listRowBackground(ArtaColor.bgElev)
                Section {
                    TextField("Para qué es esta conversación", text: $details, axis: .vertical)
                        .lineLimit(3...8)
                } header: {
                    Text("Descripción")
                }
                .listRowBackground(ArtaColor.bgElev)
                if failed {
                    Section {
                        Text("No se pudo guardar. Intenta de nuevo.")
                            .foregroundStyle(ArtaColor.danger)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .tint(ArtaColor.gold)
            .navigationTitle("Editar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Guardar") { save() }
                            .fontWeight(.semibold)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear {
            guard !loaded else { return }
            loaded = true
            topic = initialTopic
            details = initialDetails
        }
    }

    private func save() {
        saving = true
        failed = false
        let t = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        let d = details.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            let ok = await onSave(t, d)
            saving = false
            if ok { dismiss() } else { failed = true }
        }
    }
}

// MARK: - Agregar personas

private struct AddMembersSheet: View {
    let existing: Set<String>
    var onAdd: @MainActor ([String]) async -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var selected: [Colleague] = []
    @State private var saving = false
    @State private var failed = false

    var body: some View {
        NavigationStack {
            List {
                PeoplePickerSections(selected: $selected, excluded: existing)
                if failed {
                    Section {
                        Text("No se pudo agregar. Intenta de nuevo.")
                            .foregroundStyle(ArtaColor.danger)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .navigationTitle("Agregar personas")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Agregar") { add() }
                            .fontWeight(.semibold)
                            .disabled(selected.isEmpty)
                    }
                }
            }
        }
        .presentationDetents([.large])
    }

    private func add() {
        saving = true
        failed = false
        let ids = selected.map(\.id)
        Task {
            let ok = await onAdd(ids)
            saving = false
            if ok { dismiss() } else { failed = true }
        }
    }
}

// MARK: - Buscador de personas

/// Buscador de compañeros para dentro de un `List`. Con `onPick` es de un toque (directo);
/// sin él marca varios en `selected`, hasta `limit`.
struct PeoplePickerSections: View {
    @Binding var selected: [Colleague]
    let excluded: Set<String>
    let limit: Int?
    let onPick: ((Colleague) -> Void)?
    @ObservedObject private var presence = PresenceStore.shared
    @State private var query = ""
    @State private var people: [Colleague] = []
    @State private var searching = false
    @State private var error: String?

    init(selected: Binding<[Colleague]>, excluded: Set<String> = [], limit: Int? = nil, onPick: ((Colleague) -> Void)? = nil) {
        _selected = selected
        self.excluded = excluded
        self.limit = limit
        self.onPick = onPick
    }

    private var visible: [Colleague] {
        let me = Session.shared.currentUser?.id ?? ""
        return people.filter { $0.id != me && !excluded.contains($0.id) }
    }

    var body: some View {
        Section {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(ArtaColor.muted)
                TextField("Nombre o correo", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .foregroundStyle(ArtaColor.text)
                if searching { ProgressView().controlSize(.small) }
            }
            .task(id: query) { await search() }
            if onPick == nil && !selected.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(selected) { person in
                            Button { toggle(person) } label: {
                                HStack(spacing: 4) {
                                    Text(person.fullName).lineLimit(1)
                                    Image(systemName: "xmark").font(.caption2.weight(.bold))
                                }
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(ArtaColor.gold)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Capsule().fill(ArtaColor.goldSoft))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Quitar a \(person.fullName)")
                        }
                    }
                }
            }
        } footer: {
            if let limit, onPick == nil {
                Text("\(selected.count) de \(limit) personas")
            }
        }
        .listRowBackground(ArtaColor.bgElev)
        Section {
            ForEach(visible) { person in
                Button { toggle(person) } label: { row(person) }
                    .buttonStyle(.plain)
            }
            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(ArtaColor.danger)
            } else if visible.isEmpty && !searching {
                Text(query.isEmpty ? "Escribe un nombre para buscar." : "Nadie coincide con «\(query)».")
                    .font(.footnote)
                    .foregroundStyle(ArtaColor.muted)
            }
        }
        .listRowBackground(ArtaColor.bgElev)
    }

    private func row(_ person: Colleague) -> some View {
        let isSelected = selected.contains { $0.id == person.id }
        return HStack(spacing: 12) {
            Avatar(name: person.fullName, size: 36)
                .overlay(alignment: .bottomTrailing) {
                    if presence.isOnline(person.id) { PresenceDot(online: true, size: 10) }
                }
            VStack(alignment: .leading, spacing: 2) {
                Text(person.fullName)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(1)
                if let subtitle = person.title ?? person.email {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if onPick == nil {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isSelected ? ArtaColor.gold : ArtaColor.muted)
            }
        }
        .contentShape(Rectangle())
    }

    private func toggle(_ person: Colleague) {
        if let onPick {
            onPick(person)
            return
        }
        if let index = selected.firstIndex(where: { $0.id == person.id }) {
            selected.remove(at: index)
        } else if let limit, selected.count >= limit {
            Haptics.warning()
        } else {
            selected.append(person)
            Haptics.tap()
        }
    }

    private func search() async {
        try? await Task.sleep(nanoseconds: 250_000_000)
        guard !Task.isCancelled else { return }
        searching = true
        defer { searching = false }
        do {
            let q = query.trimmingCharacters(in: .whitespaces)
            people = try await ApiClient.shared.colleagues(q.isEmpty ? nil : q)
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.userMessage }
        }
    }
}

// MARK: - Mensajes guardados

@MainActor
final class SavedMessagesModel: ObservableObject {
    private static let pageSize = 50

    @Published private(set) var items: [SavedItem] = []
    @Published private(set) var loading = true
    @Published private(set) var loadError: String?
    @Published private(set) var hasMore = false
    @Published var error: String?
    private var loadingMore = false

    func load() async {
        do {
            let page = try await ApiClient.shared.saved(limit: Self.pageSize)
            items = page
            hasMore = page.count >= Self.pageSize
            loadError = nil
        } catch {
            if items.isEmpty { loadError = error.userMessage }
        }
        loading = false
    }

    func retry() {
        loading = true
        loadError = nil
        Task { await load() }
    }

    func loadMore() {
        guard hasMore, !loadingMore, let last = items.last else { return }
        loadingMore = true
        Task {
            do {
                let page = try await ApiClient.shared.saved(before: last.savedAt, limit: Self.pageSize)
                let known = Set(items.map(\.id))
                items += page.filter { !known.contains($0.id) }
                hasMore = page.count >= Self.pageSize
            } catch {
                hasMore = false
            }
            loadingMore = false
        }
    }

    func unsave(_ item: SavedItem) {
        items.removeAll { $0.id == item.id }
        Task {
            do {
                // El endpoint alterna: si quedó guardado (ya se había quitado en otro lado), se recarga.
                if try await ApiClient.shared.toggleSave(item.message.id) { await load() }
            } catch {
                self.error = error.userMessage
                await load()
            }
        }
    }
}

struct SavedMessagesView: View {
    @StateObject private var model = SavedMessagesModel()
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        content
            .background(ArtaColor.bg)
            .navigationTitle("Guardados")
            .navigationBarTitleDisplayMode(.inline)
            .task { await model.load() }
            .alert("Algo falló", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
                Button("Entendido", role: .cancel) { model.error = nil }
            } message: {
                Text(model.error ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        if model.loading && model.items.isEmpty {
            ChatSkeleton()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let failure = model.loadError, model.items.isEmpty {
            ChatErrorState(message: failure) { model.retry() }
        } else if model.items.isEmpty {
            EmptyState(icon: "bookmark", title: "Sin mensajes guardados", message: "Mantén presionado un mensaje y toca «Guardar» para tenerlo a la mano.")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List {
                ForEach(model.items) { item in
                    Button { open(item) } label: { SavedRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowBackground(ArtaColor.bg)
                        .listRowSeparatorTint(ArtaColor.line)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) { model.unsave(item) } label: {
                                Label("Quitar", systemImage: "bookmark.slash")
                            }
                        }
                        .onAppear {
                            if item.id == model.items.last?.id { model.loadMore() }
                        }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .refreshable { await model.load() }
        }
    }

    private func open(_ item: SavedItem) {
        let m = item.message
        let channelId = item.channel?.id ?? m.channelId
        if let root = m.parentId {
            router.chatPath.append(.thread(channelId: channelId, rootId: root))
        } else {
            router.chatPath.append(.conversation(channelId: channelId, focusMessageId: m.id))
        }
    }
}

private struct SavedRow: View {
    let item: SavedItem

    private var preview: String {
        let m = item.message
        if m.isDeleted { return "Mensaje eliminado" }
        return plainText(m.text.isEmpty ? (m.attachment?.name ?? "Adjunto") : m.text)
    }

    var body: some View {
        let m = item.message
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "bookmark.fill")
                    .font(.caption2)
                    .foregroundStyle(ArtaColor.gold)
                Text(item.channel?.label ?? "Conversación")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ArtaColor.gold)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(relativeTime(m.createdAt))
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
            }
            HStack(alignment: .top, spacing: 10) {
                Avatar(name: m.author.fullName, size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(m.author.fullName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.text)
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(3)
                }
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}
