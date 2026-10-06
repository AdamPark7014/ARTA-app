import SwiftUI

/// Más › Usuarios bloqueados (docs/chat-reportar-bloquear.md): a quién bloqueé en el
/// chat (`GET chat/blocks`), con «Desbloquear». Comparte la lista con `ChatBlocks`,
/// así que lo que se desbloquea aquí vuelve a verse en las conversaciones.
struct BlockedUsersView: View {
    @ObservedObject private var blocks = ChatBlocks.shared
    @State private var loading = true
    @State private var loadError: String?
    @State private var actionError: String?
    @State private var busyId: String?

    var body: some View {
        Group {
            if loading && !blocks.loaded {
                ModuleSkeletonList(rows: 3)
            } else if let loadError, !blocks.loaded {
                ModuleErrorView(message: loadError) {
                    Task { await load() }
                }
            } else if blocks.users.isEmpty {
                ScrollView {
                    VStack(spacing: 12) {
                        if let actionError { errorLabel(actionError) }
                        ModuleEmptyView(
                            icon: "person.crop.circle.badge.checkmark",
                            title: "No has bloqueado a nadie",
                            message: "Para bloquear a alguien, mantén presionado uno de sus mensajes en el chat."
                        )
                        .frame(minHeight: 420)
                    }
                }
                .refreshable { await load() }
            } else {
                List {
                    if let actionError {
                        errorLabel(actionError)
                            .listRowBackground(Color.clear)
                    }
                    Section {
                        ForEach(blocks.users) { user in
                            row(user)
                        }
                    } footer: {
                        Text("No ves sus mensajes y no pueden escribirte por mensaje directo.")
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .refreshable { await load() }
            }
        }
        .background(ArtaColor.bg)
        .navigationTitle("Usuarios bloqueados")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func row(_ user: BlockedUser) -> some View {
        HStack(spacing: 12) {
            Avatar(name: user.displayName, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName)
                    .font(.body)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(1)
                if let since = sinceText(user) {
                    Text(since)
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if busyId == user.id {
                ProgressView()
            } else {
                Button("Desbloquear") {
                    Task { await unblock(user) }
                }
                .buttonStyle(.bordered)
                .tint(ArtaColor.gold)
                .controlSize(.small)
                .disabled(busyId != nil)
                .accessibilityIdentifier("blocked-unblock-\(user.id)")
            }
        }
        .padding(.vertical, 4)
    }

    /// «6 de octubre de 2026», como Android.
    private static let blockedDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "d 'de' MMMM 'de' yyyy"
        return f
    }()

    private func sinceText(_ user: BlockedUser) -> String? {
        guard let date = parseDate(user.blockedAt) else { return nil }
        return "Bloqueado el " + Self.blockedDate.string(from: date)
    }

    private func errorLabel(_ text: String) -> some View {
        Label(text, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote)
            .foregroundStyle(ArtaColor.danger)
            .padding(.horizontal, 16)
    }

    private func load() async {
        do {
            try await blocks.load()
            loadError = nil
        } catch {
            if !error.isModuleCancellation { loadError = error.userMessage }
        }
        loading = false
    }

    private func unblock(_ user: BlockedUser) async {
        busyId = user.id
        actionError = nil
        do {
            try await blocks.unblock(user.id)
            Haptics.success()
        } catch {
            if !error.isModuleCancellation {
                Haptics.error()
                actionError = error.userMessage
            }
        }
        busyId = nil
    }
}
