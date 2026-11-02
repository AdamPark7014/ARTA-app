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
                // Sistema visual (docs/diseno/SISTEMA-VISUAL.md): Arta claro, Auditorio oscuro.
                // El esquema va en la raíz para que hojas, alertas, teclados y selectores coincidan.
                .preferredColorScheme(ArtaTheme.colorScheme(for: activeEntity.current))
                .tint(activeEntity.current.accent)
                // SF Pro Rounded en toda la app («letras redondeadas amigables»).
                .fontDesign(.rounded)
                .buttonBorderShape(activeEntity.current == .arta ? .capsule : .roundedRectangle(radius: 4))
                .task { await session.restore() }
                .onOpenURL { url in
                    if let target = PanelLink.target(url: url) { router.follow(target, fromLink: true) }
                }
                .onChange(of: scenePhase) { _, phase in
                    guard session.currentUser != nil else { return }
                    switch phase {
                    case .active:
                        RealtimeClient.shared.connect()
                        LocationTracker.shared.appBecameActive()
                    case .background:
                        RealtimeClient.shared.pause()
                        LocationTracker.shared.appEnteredBackground()
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
                    ArtaScreenBackground()
                    ProgressView().tint(ArtaColor.tertiary)
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
