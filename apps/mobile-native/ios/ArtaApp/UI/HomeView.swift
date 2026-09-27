import Combine
import SwiftUI
import UIKit

struct HomeView: View {
    let user: UserDto
    @EnvironmentObject private var router: AppRouter
    @State private var chatUnread = 0
    @State private var noticeUnread = 0

    var body: some View {
        TabView(selection: $router.tab) {
            NavigationStack(path: $router.chatPath) {
                ChatListView()
                    .navigationDestination(for: ChatRoute.self) { route in
                        switch route {
                        case let .conversation(channelId, focus):
                            ConversationView(channelId: channelId, parentId: nil, focusMessageId: focus)
                        case let .thread(channelId, rootId):
                            ConversationView(channelId: channelId, parentId: rootId, focusMessageId: nil)
                        }
                    }
            }
            .tabItem { Label("Chats", systemImage: "bubble.left.and.bubble.right") }
            .badge(chatUnread)
            .tag(AppRouter.Tab.chats)

            NavigationStack {
                NotificationsView(onUnreadChange: { noticeUnread = $0 })
            }
            .tabItem { Label("Avisos", systemImage: "bell") }
            .badge(noticeUnread)
            .tag(AppRouter.Tab.notices)

            NavigationStack {
                ProfileView(user: user)
            }
            .tabItem { Label("Perfil", systemImage: "person.crop.circle") }
            .tag(AppRouter.Tab.profile)
        }
        .task { await loadCounts() }
        .onReceive(RealtimeClient.shared.chatUnread) { chatUnread = $0 }
        .onReceive(RealtimeClient.shared.notificationsUnread) { noticeUnread = $0 }
        .onReceive(RealtimeClient.shared.connected.filter { $0 }) { _ in Task { await loadCounts() } }
        .onChange(of: chatUnread + noticeUnread) { _, total in PushManager.shared.setBadge(total) }
    }

    private func loadCounts() async {
        if let n = try? await ApiClient.shared.chatUnread() { chatUnread = n }
        if let n = try? await ApiClient.shared.notificationsUnread() { noticeUnread = n }
    }
}

struct ProfileView: View {
    let user: UserDto
    @EnvironmentObject private var session: Session
    @State private var busy = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    Avatar(name: user.name, size: 64)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(user.name).font(.title3.weight(.semibold))
                        if let email = user.email { Text(email).font(.subheadline).foregroundStyle(ArtaColor.muted) }
                        if let title = user.title, !title.isEmpty { Text(title).font(.footnote).foregroundStyle(ArtaColor.muted) }
                    }
                }
                .padding(.vertical, 8)
            }
            .listRowBackground(ArtaColor.bgElev)

            if !PushManager.shared.firebaseEnabled {
                Section {
                    Label("Esta compilación no tiene Firebase configurado: no llegarán avisos push.", systemImage: "bell.slash")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.muted)
                }
                .listRowBackground(ArtaColor.bgElev)
            }

            Section {
                Link(destination: ApiConfig.origin) {
                    Label("Abrir el panel web", systemImage: "safari")
                }
                Button {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Label("Ajustes de avisos", systemImage: "bell.badge")
                }
            }
            .listRowBackground(ArtaColor.bgElev)

            Section {
                Button(role: .destructive) {
                    busy = true
                    Task { await session.logout() }
                } label: {
                    Text(busy ? "Cerrando sesión…" : "Cerrar sesión").frame(maxWidth: .infinity)
                }
                .disabled(busy)
            } footer: {
                Text("ARTA \(ApiConfig.appVersion)").frame(maxWidth: .infinity)
            }
            .listRowBackground(ArtaColor.bgElev)
        }
        .scrollContentBackground(.hidden)
        .background(ArtaColor.bg)
        .navigationTitle("Perfil")
    }
}
