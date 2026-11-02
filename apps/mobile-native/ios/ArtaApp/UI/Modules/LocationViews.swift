import SwiftUI
import UIKit

/// La hoja de aceptar la ubicación (docs/UBICACION.md). La app nunca se bloquea por esto (Apple 5.1.1):
/// con «Ahora no» sigue igual y vuelve a preguntar a otro día.
struct LocationConsentSheet: View {
    @ObservedObject private var tracker = LocationTracker.shared
    @State private var busy = false
    @State private var errorMessage: String?
    @State private var privacyPage: SafariPage?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ArtaSpace.l) {
                Text("Compartir tu ubicación")
                    .font(ArtaFont.display(24, weight: .semibold))
                    .foregroundStyle(ArtaColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Para coordinar al equipo, ARTA registra:")
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.muted)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(alignment: .leading, spacing: ArtaSpace.m) {
                    row("clock", "Tu ubicación cada media hora, de 10:00 a 18:00, hora de Puebla.")
                    row("iphone", "Solo mientras la app está abierta. Si está cerrada, te recordamos abrirla.")
                    row("eye", "Solo la ve dirección general.")
                    row("trash", "Se borra a los 90 días.")
                }

                Button {
                    privacyPage = SafariPage(url: ArtaAppMeta.privacidadURL)
                } label: {
                    Label("Aviso de privacidad", systemImage: "hand.raised")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.text)
                        .artaHitArea(dx: ArtaSpace.s, dy: ArtaSpace.m)
                }
                .buttonStyle(ArtaPressStyle(scale: 0.97))
                .accessibilityIdentifier("location-privacy")

                if let errorMessage {
                    InlineErrorRow(message: errorMessage)
                }

                VStack(spacing: ArtaSpace.s) {
                    Button {
                        accept()
                    } label: {
                        Text(busy ? "Guardando…" : "Aceptar")
                    }
                    .buttonStyle(ArtaPrimaryButtonStyle())
                    .disabled(busy)
                    .accessibilityIdentifier("location-accept")

                    Button {
                        Haptics.tap()
                        tracker.showsConsent = false
                    } label: {
                        Text("Ahora no")
                    }
                    .buttonStyle(ArtaSecondaryButtonStyle())
                    .disabled(busy)
                    .accessibilityIdentifier("location-later")
                }

                Text("Si eliges «Ahora no», la app sigue igual y te preguntamos otro día.")
                    .font(.caption)
                    .foregroundStyle(ArtaColor.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, ArtaSpace.xl)
            .padding(.top, ArtaSpace.xxl)
            .padding(.bottom, ArtaSpace.l)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(ArtaColor.bgElev)
        .accessibilityIdentifier("location-sheet")
        .sheet(item: $privacyPage) { page in
            SafariView(url: page.url, onFinish: { privacyPage = nil })
                .ignoresSafeArea()
        }
    }

    private func row(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.m) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(ArtaColor.muted)
                .frame(width: 22)
                .accessibilityHidden(true)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(ArtaColor.text)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func accept() {
        Haptics.tap()
        busy = true
        errorMessage = nil
        Task {
            let failure = await tracker.acceptConsent()
            busy = false
            errorMessage = failure
        }
    }
}

/// Aviso discreto en Inicio: permiso negado o ubicación apagada, con el camino a Ajustes.
struct LocationNoticeRow: View {
    let problem: LocationState

    private var message: String {
        problem == .off ? "La ubicación de tu teléfono está apagada." : "ARTA no tiene permiso para ver tu ubicación."
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.s) {
            Label(message, systemImage: "location.slash")
                .font(.footnote)
                .foregroundStyle(ArtaColor.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                Haptics.tap()
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            } label: {
                Text("Ir a Ajustes")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(ArtaColor.text)
                    .fixedSize()
                    .artaHitArea(dx: ArtaSpace.s, dy: ArtaSpace.m)
            }
            .buttonStyle(ArtaPressStyle(scale: 0.96))
            .accessibilityIdentifier("location-settings")
        }
        .padding(.horizontal, ArtaSpace.xs)
    }
}
