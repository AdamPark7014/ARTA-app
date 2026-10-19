import SwiftUI

/// Franja fija sobre la barra de pestañas mientras se explora con datos de muestra
/// (`DemoMode.enteredFromLogin`). «Salir» vuelve a la pantalla de entrada. Va como
/// pastilla, nunca como banda sólida detrás de la barra de estado: Apple rechazó a
/// NEXARA (2.3.10) por una franja así en las capturas.
struct DemoBanner: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        HStack(spacing: ArtaSpace.s) {
            Image(systemName: "sparkles")
                .font(.caption.weight(.semibold))
            Text("Modo demostración · datos ficticios")
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            Spacer(minLength: ArtaSpace.s)
            Button {
                Task { await session.logout() }
            } label: {
                Text("Salir")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, ArtaSpace.m)
                    .padding(.vertical, 5)
                    .background(Color(uiColor: .systemBackground).opacity(0.22), in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("demo-exit")
        }
        .foregroundStyle(Color(uiColor: .systemBackground))
        .padding(.horizontal, ArtaSpace.m)
        .padding(.vertical, ArtaSpace.s)
        .background(ArtaColor.text.opacity(0.92), in: Capsule())
        .padding(.horizontal, ArtaSpace.l)
        // Encima de la barra de pestañas (49 pt) y de su línea.
        .padding(.bottom, 58)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("demo-banner")
    }
}

/// Las secciones de «Más» abren el panel web con la sesión real; en el modo de
/// muestra no hay sesión que compartir, así que se explica en vez de enseñar el
/// login de la web.
struct DemoWebUnavailableView: View {
    let title: String?

    var body: some View {
        VStack(spacing: ArtaSpace.m) {
            Image(systemName: "rectangle.on.rectangle.slash")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(ArtaColor.muted)
            Text(title ?? "Panel web")
                .font(ArtaFont.display(20, weight: .semibold))
                .foregroundStyle(ArtaColor.text)
            Text("Esta sección abre el panel web de tu organización con tu sesión. En el modo de muestra no está disponible; con una cuenta se abre aquí mismo, sin volver a iniciar sesión.")
                .font(.subheadline)
                .foregroundStyle(ArtaColor.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(ArtaSpace.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .artaScreenBackground()
        .navigationTitle(title ?? "Panel web")
        .navigationBarTitleDisplayMode(.inline)
    }
}
