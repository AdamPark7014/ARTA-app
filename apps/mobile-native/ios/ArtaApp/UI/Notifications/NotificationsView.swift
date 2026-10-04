import SwiftUI

/// Bandeja de avisos de todos los procesos (OC, formatos, tareas, menciones…).
struct NotificationsView: View {
    let onUnreadChange: (Int) -> Void

    @EnvironmentObject private var router: AppRouter
    @State private var items: [NotificationDto] = []
    @State private var loading = true
    @State private var error: String?

    private var unread: Int { items.filter { !$0.isRead }.count }

    var body: some View {
        List(items) { item in
            Button { open(item) } label: { NotificationRow(item: item) }
                .listRowBackground(item.isRead ? ArtaColor.bg : ArtaColor.bgElev)
                .listRowSeparatorTint(ArtaColor.line)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(ArtaColor.bg)
        .overlay {
            if loading && items.isEmpty {
                ProgressView().tint(ArtaColor.gold)
            } else if let error, items.isEmpty {
                EmptyState(icon: "wifi.exclamationmark", title: "No se pudo cargar", message: error)
            } else if items.isEmpty {
                EmptyState(icon: "bell", title: "Sin avisos", message: "Aquí verás órdenes de compra, formatos y tareas que requieren tu atención.")
            }
        }
        .refreshable { await load() }
        .navigationTitle("Avisos")
        .toolbar {
            if unread > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Leer todo") { Task { await readAll() } }
                }
            }
        }
        .task { await load() }
        .onReceive(RealtimeClient.shared.notificationsUnread) { _ in Task { await load() } }
    }

    private func load() async {
        do {
            items = try await ApiClient.shared.notifications()
            error = nil
            onUnreadChange(unread)
        } catch {
            self.error = error.userMessage
        }
        loading = false
    }

    private func readAll() async {
        do {
            try await ApiClient.shared.notificationsReadAll()
            await load()
        } catch {
            self.error = error.userMessage
        }
    }

    private func open(_ item: NotificationDto) {
        if !item.isRead {
            if let i = items.firstIndex(where: { $0.id == item.id }) { items[i].readAt = isoNow() }
            onUnreadChange(unread)
            Task { try? await ApiClient.shared.notificationRead(item.id) }
        }
        // Lo que no tiene pantalla nativa se abre en la vista web dentro de la app.
        if let target = PanelLink.target(channelId: nil, messageId: nil, url: item.linkUrl, type: item.type) {
            router.follow(target)
        }
    }
}

private struct NotificationRow: View {
    let item: NotificationDto

    private var icon: String {
        let t = item.type
        if t.hasPrefix("chat") || t.contains("mention") { return "at" }
        if t.hasPrefix("po.") { return "doc.text" }
        if t.hasPrefix("checklist") { return "checklist" }
        if t.contains("task") { return "checkmark.circle" }
        if t.contains("event") { return "calendar" }
        return "bell"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(ArtaColor.goldSoft)
                Image(systemName: icon).foregroundStyle(ArtaColor.gold)
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(item.title)
                        .font(.subheadline.weight(item.isRead ? .regular : .semibold))
                        .foregroundStyle(ArtaColor.text)
                        .lineLimit(2)
                    Spacer(minLength: 6)
                    Text(relativeTime(item.createdAt)).font(.caption).foregroundStyle(ArtaColor.muted)
                }
                if let body = item.body, !body.isEmpty {
                    Text(plainText(body)).font(.footnote).foregroundStyle(ArtaColor.muted).lineLimit(3)
                }
                if let actor = item.actor {
                    Text(actor.fullName).font(.caption2).foregroundStyle(ArtaColor.muted)
                }
            }
            if !item.isRead {
                Circle().fill(ArtaColor.gold).frame(width: 8, height: 8).padding(.top, 6)
            }
        }
        .padding(.vertical, 6)
    }
}
