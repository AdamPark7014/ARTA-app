import Combine
import SwiftUI

@MainActor
final class ChatListModel: ObservableObject {
    enum Filter: String, CaseIterable, Identifiable {
        case all = "Todos"
        case unread = "No leídos"
        case direct = "Directos"
        case channels = "Canales"
        var id: String { rawValue }
    }

    @Published private(set) var channels: [ChannelSummary] = []
    @Published private(set) var loading = true
    @Published var error: String?
    @Published var query = ""
    @Published var filter: Filter = .all

    private var bag = Set<AnyCancellable>()
    private let reloadSubject = PassthroughSubject<Void, Never>()

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
    }

    var visible: [ChannelSummary] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return channels.filter { c in
            let matchesFilter: Bool
            switch filter {
            case .all: matchesFilter = true
            case .unread: matchesFilter = c.unread > 0
            case .direct: matchesFilter = c.isDirect
            case .channels: matchesFilter = !c.isDirect
            }
            guard matchesFilter else { return false }
            guard !q.isEmpty else { return true }
            return c.displayName.lowercased().contains(q) || (c.topic?.lowercased().contains(q) ?? false)
        }
    }

    func load() async {
        do {
            let list = try await ApiClient.shared.channels()
            channels = list.filter { $0.isMember ?? true }.sorted {
                ($0.lastMessageAt ?? "") > ($1.lastMessageAt ?? "")
            }
            error = nil
        } catch {
            if channels.isEmpty { self.error = error.userMessage }
        }
        loading = false
    }
}

struct ChatListView: View {
    @StateObject private var model = ChatListModel()
    @EnvironmentObject private var router: AppRouter
    @State private var composing = false

    var body: some View {
        List {
            Picker("Filtro", selection: $model.filter) {
                ForEach(ChatListModel.Filter.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)

            ForEach(model.visible) { channel in
                NavigationLink(value: ChatRoute.conversation(channelId: channel.id, focusMessageId: nil)) {
                    ChannelRow(channel: channel)
                }
                .listRowBackground(ArtaColor.bg)
                .listRowSeparatorTint(ArtaColor.line)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(ArtaColor.bg)
        .overlay {
            if model.loading && model.channels.isEmpty {
                ProgressView().tint(ArtaColor.gold)
            } else if let error = model.error {
                EmptyState(icon: "wifi.exclamationmark", title: "No se pudo cargar", message: error)
            } else if model.visible.isEmpty {
                EmptyState(
                    icon: "bubble.left.and.bubble.right",
                    title: model.query.isEmpty ? "Sin conversaciones" : "Sin resultados",
                    message: model.query.isEmpty ? "Toca el lápiz para escribirle a alguien." : nil
                )
            }
        }
        .searchable(text: $model.query, prompt: "Buscar")
        .refreshable { await model.load() }
        .navigationTitle("Chats")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { composing = true } label: { Image(systemName: "square.and.pencil") }
                    .accessibilityLabel("Mensaje nuevo")
            }
        }
        .sheet(isPresented: $composing) {
            NewMessageSheet { channelId in
                composing = false
                router.openChat(channelId)
            }
        }
        .task { await model.load() }
    }
}

private struct ChannelRow: View {
    let channel: ChannelSummary

    var body: some View {
        HStack(spacing: 12) {
            Avatar(name: channel.displayName, size: 50, channel: !channel.isDirect)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if channel.isPrivate { Image(systemName: "lock.fill").font(.caption2).foregroundStyle(ArtaColor.muted) }
                    if channel.isAnnouncement { Image(systemName: "megaphone.fill").font(.caption2).foregroundStyle(ArtaColor.muted) }
                    Text(channel.displayName)
                        .font(.body.weight(channel.unread > 0 ? .semibold : .regular))
                        .foregroundStyle(ArtaColor.text)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(relativeTime(channel.lastMessageAt))
                        .font(.caption)
                        .foregroundStyle(channel.unread > 0 && !channel.isMuted ? ArtaColor.gold : ArtaColor.muted)
                }
                HStack(spacing: 6) {
                    Text(plainText(channel.lastMessagePreview ?? channel.topic ?? ""))
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(2)
                    Spacer(minLength: 4)
                    if channel.isMuted { Image(systemName: "bell.slash.fill").font(.caption).foregroundStyle(ArtaColor.muted) }
                    if channel.unread > 0 { CountBadge(count: channel.unread, muted: channel.isMuted) }
                }
            }
        }
        .padding(.vertical, 6)
    }
}

/// Buscar a un compañero y abrir (o crear) el directo con él.
struct NewMessageSheet: View {
    let onOpen: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var people: [Colleague] = []
    @State private var busyId: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List(people) { person in
                Button {
                    open(person)
                } label: {
                    HStack(spacing: 12) {
                        Avatar(name: person.fullName, size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(person.fullName).foregroundStyle(ArtaColor.text)
                            if let title = person.title ?? person.email {
                                Text(title).font(.caption).foregroundStyle(ArtaColor.muted)
                            }
                        }
                        Spacer()
                        if busyId == person.id { ProgressView() }
                    }
                }
                .listRowBackground(ArtaColor.bgElev)
            }
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .overlay {
                if let error { EmptyState(icon: "exclamationmark.triangle", title: "Algo falló", message: error) }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Nombre o correo")
            .navigationTitle("Mensaje nuevo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            }
            .task(id: query) {
                try? await Task.sleep(nanoseconds: 250_000_000)
                guard !Task.isCancelled else { return }
                do {
                    let q = query.trimmingCharacters(in: .whitespaces)
                    people = try await ApiClient.shared.colleagues(q.isEmpty ? nil : q)
                    error = nil
                } catch is CancellationError {
                } catch {
                    self.error = error.userMessage
                }
            }
        }
        .presentationDetents([.large])
    }

    private func open(_ person: Colleague) {
        guard busyId == nil else { return }
        busyId = person.id
        Task {
            do {
                let channel = try await ApiClient.shared.openDirect(person.id)
                onOpen(channel.id)
            } catch {
                self.error = error.userMessage
            }
            busyId = nil
        }
    }
}
