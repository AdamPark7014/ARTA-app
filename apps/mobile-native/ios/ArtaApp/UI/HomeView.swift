import Combine
import SwiftUI
import UIKit

/// Con sesión. La app trabaja en una entidad a la vez (docs/entidades-arta-auditorio.md):
/// al cambiar, `HomeView` se rehace entera, así cada pantalla recarga sus listas con
/// `?entity=`, los globos se vuelven a contar y todo se repinta con el acento nuevo.
struct SignedInView: View {
    let user: UserDto
    @EnvironmentObject private var activeEntity: ActiveEntity

    var body: some View {
        ZStack {
            HomeView(user: user)
                .id(activeEntity.current)
                // Cambio de entidad: la app vieja se funde en la nueva (papel ⇄ negro) en vez de saltar.
                .transition(.opacity.animation(.easeInOut(duration: 0.32)))
        }
        .overlay(alignment: .top) {
            EntityNoticeBanner(notice: activeEntity.notice)
        }
    }
}

struct HomeView: View {
    let user: UserDto
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var activeEntity: ActiveEntity
    @State private var chatUnread = 0
    @State private var noticeUnread = 0
    @State private var lastInicioTap = Date.distantPast
    @State private var countsTask: Task<Void, Never>?

    /// Tocar la pestaña ya activa vuelve a su raíz (`AppRouter.select`); dos toques
    /// seguidos en Inicio cambian de entidad.
    private var tabSelection: Binding<AppRouter.Tab> {
        Binding(get: { router.tab }, set: { tab in
            if tab == .inicio { inicioTapped() }
            router.select(tab)
        })
    }

    /// Doble toque en la casita (como Facebook): Arta ⇄ Auditorio, solo para híbridos.
    /// El primer toque ya devolvió Inicio a su raíz; el segundo, si llega pronto, cambia.
    private func inicioTapped() {
        let now = Date()
        let isDouble = router.tab == .inicio && now.timeIntervalSince(lastInicioTap) < 0.4
        lastInicioTap = isDouble ? .distantPast : now
        if isDouble { activeEntity.toggle() }
    }

    var body: some View {
        TabView(selection: tabSelection) {
            NavigationStack(path: $router.inicioPath) {
                InicioView(user: user)
                    .navigationDestination(for: AppRoute.self) { destination($0) }
            }
            // Identificadores en la etiqueta de cada pestaña para la prueba de
            // interfaz de las capturas. Solo en la etiqueta: puestos sobre la
            // pila de navegación pisarían los de todas las pantallas de dentro.
            .tabItem { Label("Inicio", systemImage: "house").accessibilityIdentifier("tab-inicio") }
            .tag(AppRouter.Tab.inicio)

            NavigationStack(path: $router.chatPath) {
                ChatListView()
                    .navigationDestination(for: ChatRoute.self) { route in
                        switch route {
                        case let .conversation(channelId, focus):
                            ConversationView(channelId: channelId, parentId: nil, focusMessageId: focus)
                        case let .thread(channelId, rootId):
                            ConversationView(channelId: channelId, parentId: rootId, focusMessageId: nil)
                        case let .channelInfo(channelId):
                            ChannelInfoView(channelId: channelId)
                        case .saved:
                            SavedMessagesView()
                        }
                    }
            }
            .tabItem { Label("Chats", systemImage: "bubble.left.and.bubble.right").accessibilityIdentifier("tab-chats") }
            .badge(chatUnread)
            .tag(AppRouter.Tab.chats)

            NavigationStack(path: $router.tareasPath) {
                TasksView()
                    .navigationDestination(for: AppRoute.self) { destination($0) }
            }
            .tabItem { Label("Tareas", systemImage: "checklist").accessibilityIdentifier("tab-tareas") }
            .tag(AppRouter.Tab.tareas)

            NavigationStack(path: $router.avisosPath) {
                NotificationsView(onUnreadChange: { noticeUnread = $0 })
                    .navigationDestination(for: AppRoute.self) { destination($0) }
            }
            .tabItem { Label("Avisos", systemImage: "bell").accessibilityIdentifier("tab-avisos") }
            .badge(noticeUnread)
            .tag(AppRouter.Tab.avisos)

            NavigationStack(path: $router.masPath) {
                MoreView(user: user)
                    .navigationDestination(for: AppRoute.self) { destination($0) }
            }
            .tabItem { Label("Más", systemImage: "square.grid.2x2").accessibilityIdentifier("tab-mas") }
            .tag(AppRouter.Tab.mas)
        }
        .task {
            // Personas bloqueadas en el chat: el socket ignora lo que manden (docs/chat-reportar-bloquear.md).
            ChatBlocks.shared.refresh(force: true)
            await loadCounts()
        }
        // El socket manda el total de todas las entidades: a un híbrido solo le sirve
        // como señal para volver a contar la activa por HTTP.
        .onReceive(RealtimeClient.shared.chatUnread) { total in
            if activeEntity.isHybrid { scheduleCounts() } else { chatUnread = total }
        }
        .onReceive(RealtimeClient.shared.notificationsUnread) { total in
            if activeEntity.isHybrid { scheduleCounts() } else { noticeUnread = total }
        }
        .onReceive(RealtimeClient.shared.connected.filter { $0 }) { _ in Task { await loadCounts() } }
        .onChange(of: chatUnread + noticeUnread) { _, total in PushManager.shared.setBadge(total) }
    }

    /// Globos de Chats y Avisos: solo la entidad activa (`?entity=` en `ApiClient`).
    private func loadCounts() async {
        let chat = try? await ApiClient.shared.chatUnread()
        let notices = try? await ApiClient.shared.notificationsUnread()
        if let chat { chatUnread = chat }
        if let notices { noticeUnread = notices }
        // Tras cambiar de entidad la suma puede quedar igual a la inicial (0) y `onChange`
        // no saltaría: el número del ícono se fija aquí también.
        if chat != nil && notices != nil { PushManager.shared.setBadge(chatUnread + noticeUnread) }
    }

    /// Ráfagas del socket (varios mensajes seguidos) → una sola recuenta.
    private func scheduleCounts() {
        countsTask?.cancel()
        countsTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            await loadCounts()
        }
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
        case .blockedUsers:
            BlockedUsersView()
        }
    }
}
