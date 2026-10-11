import SwiftUI

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

/// Paleta de la marca ARTA (misma que `ArtaColors` en Android y la web).
///
/// El acento depende de la entidad activa (docs/entidades-arta-auditorio.md):
/// dorado `#C9A962` en Arta, plateado `#C7CCD4` en Auditorio. `gold` conserva su
/// nombre porque todas las pantallas lo usan como «el acento»; se lee al pintar,
/// y la app entera se rehace al cambiar de entidad (`SignedInView`).
enum ArtaColor {
    static let bg = Color(hex: 0x09090B)
    static let bgElev = Color(hex: 0x111113)
    static let surface2 = Color(hex: 0x1A1A1D)
    static let line = Color(hex: 0x27272A)
    static let text = Color(hex: 0xFAFAFA)
    static let muted = Color(hex: 0xA1A1AA)
    /// Acento de la entidad activa.
    static var gold: Color { EntityContext.entity.accent }
    static var goldSoft: Color { gold.opacity(0.16) }
    /// Tono profundo del acento (en Auditorio, `#9AA1AC`).
    static var accentDeep: Color { EntityContext.entity.accentDeep }
    static let danger = Color(hex: 0xEF4444)
    static let read = Color(hex: 0x53BDEB)
    static var mine: Color { EntityContext.entity.mineBubble }
}

struct Avatar: View {
    let name: String
    var size: CGFloat = 44
    var channel = false

    var body: some View {
        ZStack {
            Circle().fill(channel ? ArtaColor.surface2 : ArtaColor.gold)
            Text(channel ? "#" : initials(of: name))
                .font(.system(size: size * 0.38, weight: .bold))
                .foregroundStyle(channel ? ArtaColor.gold : ArtaColor.bg)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct CountBadge: View {
    let count: Int
    var muted = false

    var body: some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.caption2.weight(.bold))
            .foregroundStyle(ArtaColor.bg)
            .padding(.horizontal, 6)
            .frame(minWidth: 20, minHeight: 20)
            .background(Capsule().fill(muted ? ArtaColor.muted : ArtaColor.gold))
    }
}

struct EmptyState: View {
    let icon: String
    let title: String
    var message: String?

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 40)).foregroundStyle(ArtaColor.muted)
            Text(title).font(.headline).foregroundStyle(ArtaColor.text)
            if let message { Text(message).font(.subheadline).foregroundStyle(ArtaColor.muted).multilineTextAlignment(.center) }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
