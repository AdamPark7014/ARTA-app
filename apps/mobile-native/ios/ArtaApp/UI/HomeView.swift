import Combine
import SwiftUI
import UIKit

struct HomeView: View {
    let user: UserDto
    @EnvironmentObject private var router: AppRouter
    @State private var chatUnread = 0
    @State private var noticeUnread = 0

    /// Tocar la pestaña ya activa vuelve a su raíz (`AppRouter.select`).
    private var tabSelection: Binding<AppRouter.Tab> {
        Binding(get: { router.tab }, set: { router.select($0) })
    }

    var body: some View {
        TabView(selection: tabSelection) {
            NavigationStack(path: $router.inicioPath) {
                InicioView(user: user)
                    .navigationDestination(for: AppRoute.self) { destination($0) }
            }
            .tabItem { Label("Inicio", systemImage: "house") }
            .tag(AppRouter.Tab.inicio)

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

            NavigationStack(path: $router.tareasPath) {
                TasksView()
                    .navigationDestination(for: AppRoute.self) { destination($0) }
            }
            .tabItem { Label("Tareas", systemImage: "checklist") }
            .tag(AppRouter.Tab.tareas)

            NavigationStack(path: $router.avisosPath) {
                NotificationsView(onUnreadChange: { noticeUnread = $0 })
                    .navigationDestination(for: AppRoute.self) { destination($0) }
            }
            .tabItem { Label("Avisos", systemImage: "bell") }
            .badge(noticeUnread)
            .tag(AppRouter.Tab.avisos)

            NavigationStack(path: $router.masPath) {
                MoreView(user: user)
                    .navigationDestination(for: AppRoute.self) { destination($0) }
            }
            .tabItem { Label("Más", systemImage: "square.grid.2x2") }
            .tag(AppRouter.Tab.mas)
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

    /// Mismas pantallas en cualquier pestaña que no sea Chats (su pila es de `ChatRoute`).
    @ViewBuilder
    private func destination(_ route: AppRoute) -> some View {
        switch route {
        case .task(let taskId):
            TaskDetailView(taskId: taskId)
        case .event(let eventId):
            EventDetailView(eventId: eventId)
        case .approvals:
            ApprovalsView()
        case let .web(path, title):
            ArtaWebView(path: path, title: title)
        case let .chat(channelId, messageId):
            ConversationView(channelId: channelId, parentId: nil, focusMessageId: messageId)
        }
    }
}
