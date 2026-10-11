import SwiftUI

@main
struct ArtaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var session = Session.shared
    @StateObject private var router = AppRouter.shared
    /// Arta o Auditorio: acento, datos y marca de toda la app.
    @StateObject private var activeEntity = ActiveEntity.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(router)
                .environmentObject(activeEntity)
                .preferredColorScheme(.dark)
                .tint(activeEntity.current.accent)
                .task { await session.restore() }
                .onOpenURL { url in
                    if let target = PanelLink.target(url: url) { router.follow(target, fromLink: true) }
                }
                .onChange(of: scenePhase) { _, phase in
                    guard session.currentUser != nil else { return }
                    switch phase {
                    case .active: RealtimeClient.shared.connect()
                    case .background: RealtimeClient.shared.pause()
                    default: break
                    }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        Group {
            switch session.state {
            case .loading:
                ZStack {
                    ArtaColor.bg.ignoresSafeArea()
                    ProgressView().tint(ArtaColor.gold)
                }
            case .signedOut:
                LoginView()
            case .signedIn(let user):
                SignedInView(user: user)
            }
        }
        .animation(.default, value: session.state)
    }
}
