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
        List {
            Section {
                ForEach(items) { item in
                    Button { open(item) } label: { NotificationRow(item: item) }
                        .listRowBackground(Color.clear)
                        .listRowSeparatorTint(ArtaColor.line)
                }
            }
            // Sin la línea suelta arriba del primer aviso (bajo el título).
            .listSectionSeparator(.hidden, edges: .top)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .artaTabBarScrim()
        .artaScreenBackground()
        .overlay {
            if loading && items.isEmpty {
                NotificationsSkeleton()
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
                Circle().fill(ArtaColor.surface2)
                Circle().strokeBorder(ArtaColor.line, lineWidth: 1)
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(item.isRead ? ArtaColor.muted : ArtaColor.text)
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(item.title)
                        .font(.subheadline.weight(item.isRead ? .regular : .semibold))
                        .foregroundStyle(ArtaColor.text)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .layoutPriority(1)
                    Spacer(minLength: 6)
                    Text(relativeTime(item.createdAt))
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(ArtaColor.tertiary)
                        .fixedSize()
                }
                if let body = item.body, !body.isEmpty {
                    Text(plainText(body))
                        .font(.footnote)
                        .monospacedDigit()
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let actor = item.actor {
                    Text(actor.fullName).font(.caption2).foregroundStyle(ArtaColor.tertiary)
                }
            }
            // Punto de «sin leer» siempre en su columna: las filas leídas no se corren.
            Circle()
                .fill(item.isRead ? Color.clear : ArtaColor.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 6)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 6)
    }
}

/// Esqueleto de avisos mientras llega la primera carga.
private struct NotificationsSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            ForEach(0..<6, id: \.self) { i in
                HStack(alignment: .top, spacing: 12) {
                    Circle().fill(ArtaColor.surface2).frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: 8) {
                        SkeletonBar(width: CGFloat(160 + (i * 43) % 80), height: 12)
                        SkeletonBar(width: CGFloat(220 + (i * 31) % 60), height: 9)
                        SkeletonBar(width: 90, height: 8)
                    }
                    Spacer(minLength: 0)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, ArtaLayout.gutter)
        .padding(.top, ArtaSpace.l)
        .artaShimmer()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(ArtaScreenBackground())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando avisos")
    }
}
