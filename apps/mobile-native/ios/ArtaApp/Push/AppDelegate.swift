import UIKit

/// APNs/FCM. La entrada SwiftUI sigue siendo `ArtaApp.swift`.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // El delegado de UNUserNotificationCenter debe quedar puesto antes de que
        // termine el arranque para recibir el toque que abrió la app.
        PushManager.shared.configure()
        if ApiClient.shared.hasSession() {
            application.registerForRemoteNotifications()
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushManager.shared.didRegister(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs: fallo de registro - \(error.localizedDescription)")
    }

    /// Push silencioso (`content-available`): `chat.read` y globo.
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        PushManager.shared.handleSilent(userInfo)
        completionHandler(.noData)
    }
}
