import Combine
import SwiftUI

@MainActor
final class ChatListModel: ObservableObject {
    @Published private(set) var channels: [ChannelSummary] = []
    @Published private(set) var loading = true
    @Published var error: String?
    @Published var actionError: String?
    @Published var query = ""
    @Published var unreadOnly = false
    @Published private(set) var results: [ChatMessage] = []
    @Published private(set) var searching = false
    @Published private(set) var searchError: String?
    @Published private(set) var dndUntil: Date?

    private var bag = Set<AnyCancellable>()
    private let reloadSubject = PassthroughSubject<Void, Never>()
    private var searchTask: Task<Void, Never>?

    init() {
        // Ráfagas de actividad (varios mensajes seguidos) → una sola recarga.
        reloadSubject
            .debounce(for: .milliseconds(400), scheduler: DispatchQueue.main)
            .sink { [weak self] in Task { await self?.load() } }
            .store(in: &bag)
        let rt = RealtimeClient.shared
        rt.activity.map { _ in () }
            .merge(with: rt.channelsChanged.map { _ in () }, rt.connected.filter { $0 }.map { _ in () })
            .sink { [weak self] in self?.reloadSubject.send(()) }
            .store(in: &bag)
        $query
            .removeDuplicates()
            .debounce(for: .milliseconds(350), scheduler: DispatchQueue.main)
            .sink { [weak self] q in self?.runSearch(q) }
            .store(in: &bag)
    }

    var trimmedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }
    /// Búsqueda de mensajes en el API desde 2 caracteres; antes solo se filtran nombres.
    var searchesMessages: Bool { trimmedQuery.count >= 2 }

    // MARK: Secciones (tipo Slack)

    private var joined: [ChannelSummary] {
        channels.filter { $0.joined && (!unreadOnly || $0.unread > 0) }
    }

    private static func byName(_ a: ChannelSummary, _ b: ChannelSummary) -> Bool {
        a.displayName.localizedCaseInsensitiveCompare(b.displayName) == .orderedAscending
    }

    private static func byRecency(_ a: ChannelSummary, _ b: ChannelSummary) -> Bool {
        (a.lastMessageAt ?? "") > (b.lastMessageAt ?? "")
    }

    var channelSection: [ChannelSummary] {
        joined.filter { !$0.isDirect && !$0.isGroup && !$0.isEvent }.sorted(by: Self.byName)
    }

    var eventSection: [ChannelSummary] {
        joined.filter { $0.isEvent && !$0.isDirect && !$0.isGroup }.sorted(by: Self.byRecency)
    }

    var directSection: [ChannelSummary] {
        joined.filter { $0.isDirect || $0.isGroup }.sorted(by: Self.byRecency)
    }

    /// Canales públicos donde no estoy: abrirlos me une (el API une al entrar).
    var explore: [ChannelSummary] {
        guard !unreadOnly else { return [] }
        return channels.filter { !$0.joined && !$0.isDirect && !$0.isGroup }.sorted(by: Self.byName)
    }

    var visibleCount: Int { channelSection.count + eventSection.count + directSection.count + explore.count }

    var channelMatches: [ChannelSummary] {
        let q = trimmedQuery.lowercased()
        guard !q.isEmpty else { return [] }
        return channels
            .filter { $0.displayName.lowercased().contains(q) || ($0.topic?.lowercased().contains(q) ?? false) }
            .sorted { a, b in
                if a.joined != b.joined { return a.joined }
                return Self.byRecency(a, b)
            }
    }

    // MARK: Carga

    func load() async {
        do {
            channels = try await ApiClient.shared.channels()
            error = nil
        } catch {
            if channels.isEmpty { self.error = error.userMessage }
        }
        loading = false
    }

    func retry() {
        loading = true
        error = nil
        Task { await load() }
    }

    private func runSearch(_ raw: String) {
        searchTask?.cancel()
        let q = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else {
            results = []
            searching = false
            searchError = nil
            return
        }
        searching = true
        searchTask = Task {
            do {
                let found = try await ApiClient.shared.search(q)
                guard !Task.isCancelled else { return }
                results = found
                searchError = nil
            } catch {
                guard !Task.isCancelled else { return }
                searchError = error.userMessage
            }
            searching = false
        }
    }

    // MARK: No molestar

    var dndActive: Bool { (dndUntil ?? .distantPast) > Date() }

    func loadPrefs() async {
        guard let prefs = try? await ApiClient.shared.chatPrefs() else { return }
        dndUntil = parseDate(prefs.dndUntil)
    }

    func setDnd(_ until: Date?) {
        let previous = dndUntil
        dndUntil = until
        Haptics.tap()
        Task {
            do {
                try await ApiClient.shared.setDnd(until: until.map(isoString))
            } catch {
                dndUntil = previous
                actionError = error.userMessage
            }
        }
    }

    static func tomorrowMorning() -> Date {
        let cal = Calendar.current
        let tomorrow = cal.date(byAdding: .day, value: 1, to: Date()) ?? Date().addingTimeInterval(86_400)
        return cal.date(bySettingHour: 8, minute: 0, second: 0, of: tomorrow) ?? tomorrow
    }
}

struct ChatListView: View {
    @StateObject private var model = ChatListModel()
    @EnvironmentObject private var router: AppRouter
    @ObservedObject private var presence = PresenceStore.shared
    @State private var composing = false
    /// Borradores por canal (texto con tokens), releídos al volver a la lista.
    @State private var drafts: [String: String] = [:]
    @AppStorage("chat.list.channelsOpen") private var channelsOpen = true
    @AppStorage("chat.list.eventsOpen") private var eventsOpen = true
    @AppStorage("chat.list.directOpen") private var directOpen = true
    @AppStorage("chat.list.exploreOpen") private var exploreOpen = false

    var body: some View {
        List {
            if model.trimmedQuery.isEmpty {
                conversationSections
            } else {
                searchSections
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(ArtaColor.bg)
        .overlay { overlay }
        .searchable(text: $model.query, prompt: "Buscar mensajes y conversaciones")
        .refreshable { await model.load() }
        .navigationTitle("Chats")
        .toolbar { toolbar }
        .sheet(isPresented: $composing) {
            NewConversationSheet { channelId in
                composing = false
                router.openChat(channelId)
            }
        }
        .alert("Algo falló", isPresented: Binding(get: { model.actionError != nil }, set: { if !$0 { model.actionError = nil } })) {
            Button("Entendido", role: .cancel) { model.actionError = nil }
        } message: {
            Text(model.actionError ?? "")
        }
        .task {
            presence.refresh()
            ChatBlocks.shared.refresh()
            await model.load()
            await model.loadPrefs()
        }
        .onAppear { refreshDrafts() }
        .onChange(of: model.channels) { _, _ in refreshDrafts() }
    }

    private func refreshDrafts() {
        var out: [String: String] = [:]
        for channel in model.channels {
            let draft = ChatDrafts.load(channelId: channel.id, parentId: nil)
            if !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { out[channel.id] = draft }
        }
        drafts = out
    }

    // MARK: Encabezado

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                Section("No molestar") {
                    if model.dndActive {
                        Button { model.setDnd(nil) } label: { Label("Desactivar", systemImage: "bell") }
                    }
                    Button("1 hora") { model.setDnd(Date().addingTimeInterval(3_600)) }
                    Button("8 horas") { model.setDnd(Date().addingTimeInterval(8 * 3_600)) }
                    Button("Hasta mañana a las 8:00") { model.setDnd(ChatListModel.tomorrowMorning()) }
                }
                Button { router.chatPath.append(.saved) } label: {
                    Label("Mensajes guardados", systemImage: "bookmark")
                }
                Toggle(isOn: $model.unreadOnly) {
                    Label("Solo no leídos", systemImage: "envelope.badge")
                }
            } label: {
                Image(systemName: model.dndActive ? "moon.fill" : "line.3.horizontal.decrease.circle")
                    .foregroundStyle(model.dndActive || model.unreadOnly ? ArtaColor.gold : ArtaColor.text)
            }
            .accessibilityLabel("Opciones de chat")
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button { composing = true } label: { Image(systemName: "square.and.pencil") }
                .accessibilityLabel("Nueva conversación")
        }
    }

    // MARK: Lista

    @ViewBuilder
    private var conversationSections: some View {
        if model.dndActive { dndBanner }
        section("Canales", items: model.channelSection, open: $channelsOpen)
        section("Eventos", items: model.eventSection, open: $eventsOpen)
        section("Mensajes directos", items: model.directSection, open: $directOpen)
        if !model.explore.isEmpty {
            Section {
                if exploreOpen {
                    ForEach(model.explore) { channel in
                        NavigationLink(value: ChatRoute.conversation(channelId: channel.id, focusMessageId: nil)) {
                            ExploreRow(channel: channel)
                        }
                        .listRowBackground(ArtaColor.bg)
                        .listRowSeparatorTint(ArtaColor.line)
                    }
                }
            } header: {
                sectionHeader("Explorar canales (\(model.explore.count))", unread: 0, open: $exploreOpen)
            }
        }
    }

    @ViewBuilder
    private func section(_ title: String, items: [ChannelSummary], open: Binding<Bool>) -> some View {
        if !items.isEmpty {
            Section {
                if open.wrappedValue {
                    ForEach(items) { channel in row(channel) }
                }
            } header: {
                sectionHeader(title, unread: items.reduce(0) { $0 + ($1.isMuted ? 0 : $1.unread) }, open: open)
            }
        }
    }

    private func sectionHeader(_ title: String, unread: Int, open: Binding<Bool>) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { open.wrappedValue.toggle() }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .rotationEffect(.degrees(open.wrappedValue ? 90 : 0))
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if !open.wrappedValue && unread > 0 { CountBadge(count: unread, muted: false) }
            }
            .foregroundStyle(ArtaColor.muted)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .textCase(nil)
        .accessibilityLabel(open.wrappedValue ? "Contraer \(title)" : "Expandir \(title)")
    }

    private func row(_ channel: ChannelSummary) -> some View {
        NavigationLink(value: ChatRoute.conversation(channelId: channel.id, focusMessageId: nil)) {
            ChannelRow(channel: channel, online: presence.isOnline(channel.peer?.id), draft: drafts[channel.id])
        }
        // Para la prueba de interfaz de las capturas (abre el canal de un evento).
        .accessibilityIdentifier(channel.isEvent ? "chat-event-\(channel.id)" : "chat-row-\(channel.id)")
        .listRowBackground(ArtaColor.bg)
        .listRowSeparatorTint(ArtaColor.line)
    }

    private var dndBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "moon.fill")
                .foregroundStyle(ArtaColor.gold)
            Text(dndText)
                .font(.footnote)
                .foregroundStyle(ArtaColor.text)
            Spacer(minLength: 8)
            Button("Desactivar") { model.setDnd(nil) }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ArtaColor.gold)
                .buttonStyle(.plain)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 10).fill(ArtaColor.goldSoft))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    private var dndText: String {
        guard let until = model.dndUntil else { return "No molestar activado" }
        let sameDay = Calendar.current.isDateInToday(until)
        return "No molestar hasta " + until.formatted(date: sameDay ? .omitted : .abbreviated, time: .shortened)
    }

    // MARK: Búsqueda

    @ViewBuilder
    private var searchSections: some View {
        let matches = Array(model.channelMatches.prefix(8))
        if !matches.isEmpty {
            Section {
                ForEach(matches) { channel in row(channel) }
            } header: {
                Text("Conversaciones")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.muted)
                    .textCase(nil)
            }
        }
        if model.searchesMessages {
            Section {
                if model.searching && model.results.isEmpty {
                    HStack {
                        Spacer()
                        ProgressView().tint(ArtaColor.gold)
                        Spacer()
                    }
                    .listRowBackground(ArtaColor.bg)
                } else if let failure = model.searchError {
                    Text(failure)
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                        .listRowBackground(ArtaColor.bg)
                } else if model.results.isEmpty {
                    Text("Ningún mensaje coincide con «\(model.trimmedQuery)».")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.muted)
                        .listRowBackground(ArtaColor.bg)
                } else {
                    ForEach(model.results) { message in
                        Button { openResult(message) } label: {
                            SearchResultRow(message: message, query: model.trimmedQuery)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(ArtaColor.bg)
                        .listRowSeparatorTint(ArtaColor.line)
                    }
                }
            } header: {
                Text("Mensajes")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.muted)
                    .textCase(nil)
            }
        }
    }

    private func openResult(_ m: ChatMessage) {
        let channelId = m.channel?.id ?? m.channelId
        if let root = m.parentId {
            router.chatPath.append(.thread(channelId: channelId, rootId: root))
        } else {
            router.chatPath.append(.conversation(channelId: channelId, focusMessageId: m.id))
        }
    }

    // MARK: Estados

    @ViewBuilder
    private var overlay: some View {
        if model.loading && model.channels.isEmpty {
            ChatListSkeleton()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(ArtaColor.bg)
        } else if let error = model.error, model.channels.isEmpty {
            ChatErrorState(message: error) { model.retry() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(ArtaColor.bg)
        } else if model.trimmedQuery.isEmpty && model.visibleCount == 0 {
            EmptyState(
                icon: model.unreadOnly ? "checkmark.circle" : "bubble.left.and.bubble.right",
                title: model.unreadOnly ? "Todo al día" : "Sin conversaciones",
                message: model.unreadOnly ? "No tienes mensajes sin leer." : "Toca el lápiz para escribirle a alguien."
            )
        }
    }
}

// MARK: - Filas

private struct ChannelRow: View {
    let channel: ChannelSummary
    let online: Bool
    let draft: String?

    private var bold: Bool { channel.unread > 0 && !channel.isMuted }

    var body: some View {
        HStack(spacing: 12) {
            avatar
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    if channel.isPrivate && !channel.isGroup {
                        Image(systemName: "lock.fill").font(.caption2).foregroundStyle(ArtaColor.muted)
                    }
                    if channel.isAnnouncement {
                        Image(systemName: "megaphone.fill").font(.caption2).foregroundStyle(ArtaColor.muted)
                    }
                    Text(channel.displayName)
                        .font(.body.weight(bold ? .bold : .regular))
                        .foregroundStyle(channel.isMuted ? ArtaColor.muted : ArtaColor.text)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(relativeTime(channel.lastMessageAt))
                        .font(.caption)
                        .foregroundStyle(bold ? ArtaColor.gold : ArtaColor.muted)
                }
                HStack(spacing: 6) {
                    preview
                        .font(.subheadline)
                        .lineLimit(2)
                    Spacer(minLength: 4)
                    if channel.isMuted {
                        Image(systemName: "bell.slash.fill").font(.caption).foregroundStyle(ArtaColor.muted)
                    }
                    if channel.unread > 0 { CountBadge(count: channel.unread, muted: channel.isMuted) }
                }
            }
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var avatar: some View {
        if channel.isGroup {
            StackedAvatars(names: groupMemberNames(channel.name), size: 50)
        } else if channel.isDirect {
            Avatar(name: channel.displayName, size: 50)
                .overlay(alignment: .bottomTrailing) { PresenceDot(online: online, size: 14) }
        } else {
            Avatar(name: channel.displayName, size: 50, channel: true)
        }
    }

    @ViewBuilder
    private var preview: some View {
        if let draft, !draft.isEmpty {
            Text("Borrador: ").foregroundColor(ArtaColor.danger) + Text(plainText(draft)).foregroundColor(ArtaColor.muted)
        } else {
            Text(plainText(channel.lastMessagePreview ?? channel.topic ?? ""))
                .foregroundStyle(bold ? ArtaColor.text : ArtaColor.muted)
        }
    }
}

private struct ExploreRow: View {
    let channel: ChannelSummary

    private var subtitle: String {
        if let topic = channel.topic, !topic.isEmpty { return plainText(topic) }
        if let n = channel.memberCount { return n == 1 ? "1 miembro" : "\(n) miembros" }
        return "Canal público"
    }

    var body: some View {
        HStack(spacing: 12) {
            Avatar(name: channel.displayName, size: 40, channel: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(channel.displayName)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text("Unirse")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ArtaColor.gold)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .overlay(Capsule().stroke(ArtaColor.gold, lineWidth: 1))
        }
        .padding(.vertical, 3)
    }
}

private struct SearchResultRow: View {
    let message: ChatMessage
    let query: String

    private var highlighted: AttributedString {
        let text: String
        if message.isDeleted {
            text = "Mensaje eliminado"
        } else {
            text = plainText(message.text.isEmpty ? (message.attachment?.name ?? "Adjunto") : message.text)
        }
        var out = AttributedString(text)
        guard !query.isEmpty else { return out }
        var start = out.startIndex
        while start < out.endIndex, let range = out[start...].range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) {
            out[range].foregroundColor = ArtaColor.gold
            out[range].font = Font.subheadline.weight(.semibold)
            start = range.upperBound
        }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(message.channel?.label ?? "Conversación")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ArtaColor.gold)
                    .lineLimit(1)
                if message.parentId != nil {
                    Text("· en un hilo")
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                }
                Spacer(minLength: 4)
                Text(relativeTime(message.createdAt))
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
            }
            HStack(alignment: .top, spacing: 10) {
                Avatar(name: message.author.fullName, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(message.author.fullName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.text)
                    Text(highlighted)
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(3)
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

/// Esqueleto de la lista mientras llega la primera carga.
private struct ChatListSkeleton: View {
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 18) {
            ForEach(0..<8, id: \.self) { i in
                HStack(spacing: 12) {
                    Circle()
                        .fill(ArtaColor.surface2)
                        .frame(width: 50, height: 50)
                    VStack(alignment: .leading, spacing: 8) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(ArtaColor.surface2)
                            .frame(width: CGFloat(110 + (i * 37) % 90), height: 12)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(ArtaColor.surface2)
                            .frame(width: CGFloat(170 + (i * 53) % 80), height: 10)
                    }
                    Spacer()
                }
            }
        }
        .padding(16)
        .opacity(pulse ? 0.45 : 1)
        .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
        .onAppear { pulse = true }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando conversaciones")
    }
}

// MARK: - Nueva conversación

/// Directo (un toque), grupo (de 2 a 8 personas además de mí) o canal (nombre, tema, privado, miembros).
struct NewConversationSheet: View {
    enum Mode: String, CaseIterable, Identifiable {
        case direct = "Directo"
        case group = "Grupo"
        case channel = "Canal"
        var id: String { rawValue }
    }

    let onOpen: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode = .direct
    @State private var selected: [Colleague] = []
    @State private var name = ""
    @State private var topic = ""
    @State private var isPrivate = false
    @State private var busy = false
    @State private var error: String?

    private static let groupLimit = 8

    private var canCreate: Bool {
        switch mode {
        case .direct: return false
        case .group: return selected.count >= 2 && selected.count <= Self.groupLimit
        case .channel: return !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private var pickHandler: ((Colleague) -> Void)? {
        guard mode == .direct else { return nil }
        return { person in openDirect(person) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Tipo", selection: $mode) {
                        ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                if mode == .channel {
                    Section {
                        TextField("Nombre del canal", text: $name)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("Tema (opcional)", text: $topic)
                        Toggle("Privado", isOn: $isPrivate)
                            .tint(ArtaColor.gold)
                    } header: {
                        Text("Canal")
                    } footer: {
                        Text(isPrivate ? "Solo lo ven las personas que agregues." : "Cualquiera de la organización puede encontrarlo y unirse.")
                    }
                    .listRowBackground(ArtaColor.bgElev)
                } else if mode == .group {
                    Section {
                        Text("Elige de 2 a \(Self.groupLimit) personas.")
                            .font(.footnote)
                            .foregroundStyle(ArtaColor.muted)
                    }
                    .listRowBackground(Color.clear)
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(ArtaColor.danger)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
                PeoplePickerSections(
                    selected: $selected,
                    limit: mode == .group ? Self.groupLimit : nil,
                    onPick: pickHandler
                )
            }
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .tint(ArtaColor.gold)
            .navigationTitle("Nueva conversación")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView()
                    } else if mode != .direct {
                        Button(mode == .group ? "Crear grupo" : "Crear canal") { create() }
                            .fontWeight(.semibold)
                            .disabled(!canCreate)
                    }
                }
            }
            .onChange(of: mode) { _, newMode in
                error = nil
                if newMode == .group && selected.count > Self.groupLimit {
                    selected = Array(selected.prefix(Self.groupLimit))
                }
            }
        }
        .presentationDetents([.large])
    }

    private func openDirect(_ person: Colleague) {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            do {
                let channel = try await ApiClient.shared.openDirect(person.id)
                onOpen(channel.id)
            } catch {
                self.error = error.userMessage
            }
            busy = false
        }
    }

    private func create() {
        guard canCreate, !busy else { return }
        busy = true
        error = nil
        let ids = selected.map(\.id)
        let creatingGroup = mode == .group
        let channelName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let channelTopic = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        let kind = isPrivate ? "PRIVATE" : "PUBLIC"
        Task {
            do {
                let detail: ChannelDetail
                if creatingGroup {
                    detail = try await ApiClient.shared.groupDm(ids)
                } else {
                    detail = try await ApiClient.shared.createChannel(CreateChannelBody(
                        name: channelName,
                        kind: kind,
                        topic: channelTopic.isEmpty ? nil : channelTopic,
                        description: nil,
                        memberIds: ids.isEmpty ? nil : ids
                    ))
                }
                Haptics.success()
                onOpen(detail.id)
            } catch {
                self.error = error.userMessage
            }
            busy = false
        }
    }
}
