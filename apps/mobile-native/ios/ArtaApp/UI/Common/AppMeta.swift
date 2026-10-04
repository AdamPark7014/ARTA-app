import SafariServices
import SwiftUI
import UIKit

/// Enlaces legales y de soporte, y la versión de la app. Espejo de `NxAppMeta`
/// de NEXARA.
///
/// Los enlaces no son decorativos: Apple (guideline 5.1.1(i)) exige que el aviso
/// de privacidad se pueda abrir **desde dentro** de la app, no solo desde la
/// ficha de la tienda.
enum ArtaAppMeta {
    static let privacidadURL = URL(string: "https://artaproducciones.com/legal/privacidad")!
    static let terminosURL = URL(string: "https://artaproducciones.com/legal/terminos")!
    static let soporteURL = URL(string: "https://artaproducciones.com/legal/soporte")!
    /// Solicitud de eliminación de cuenta y datos (guideline 5.1.1(v)). Las
    /// cuentas las crea quien administra la organización (no hay registro desde
    /// la app), así que la baja se gestiona en la web; la app solo abre la página.
    static let eliminarCuentaURL = URL(string: "https://artaproducciones.com/legal/eliminar-cuenta")!

    static var build: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "1"
    }

    /// «1.0.0 (12)»: versión de la tienda y número de compilación, para que
    /// soporte sepa exactamente qué binario tiene la persona.
    static var versionLabel: String { "\(ApiConfig.appVersion) (\(build))" }
}

/// Página web que se abre en hoja dentro de la app (`sheet(item:)` pide
/// `Identifiable`, y `URL` no lo es).
struct SafariPage: Identifiable {
    let url: URL
    var id: URL { url }
}

/// `SFSafariViewController` para SwiftUI: la persona lee el aviso o los términos
/// sin salir de la app, con el botón «Cerrar» del sistema.
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    /// «Cerrar» lo resuelve UIKit por su cuenta; quien presenta la hoja limpia
    /// aquí su estado para que SwiftUI no la dé por abierta y se pueda reabrir.
    let onFinish: () -> Void

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.preferredControlTintColor = UIColor(ArtaColor.gold)
        controller.dismissButtonStyle = .close
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, SFSafariViewControllerDelegate {
        let parent: SafariView
        init(_ parent: SafariView) { self.parent = parent }

        func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
            parent.onFinish()
        }
    }
}
