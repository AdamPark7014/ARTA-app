import SwiftUI
import UIKit

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

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}

// MARK: - Tema por entidad

/// Sistema visual aprobado (docs/diseno/SISTEMA-VISUAL.md): monocromo y opuesto.
/// ARTA = claro, papel y tinta, esquinas redondeadas y botones píldora.
/// Auditorio = oscuro, negro con brillo de reflector, plata y esquinas rectas.
///
/// Todo se lee de la entidad activa (`EntityContext`) al pintar: al cambiar de
/// entidad la app entera se rehace (`SignedInView`) y la raíz fija el esquema de
/// color (`preferredColorScheme`) para que hojas, alertas y teclados coincidan.
enum ArtaTheme {
    /// ARTA (y el login, que es ARTA neutro) es claro; Auditorio es oscuro.
    static var isLight: Bool { EntityContext.entity == .arta }

    static func colorScheme(for entity: ArtaEntity) -> ColorScheme { entity == .arta ? .light : .dark }
}

/// Tokens de color (mismos valores que la web y Android). Los nombres viejos se
/// conservan: `bg` = fondo, `bgElev` = superficie de tarjeta, `muted` = texto secundario.
enum ArtaColor {
    private static var light: Bool { ArtaTheme.isLight }

    /// Fondo de pantalla. En Auditorio lleva además el brillo de `ArtaScreenBackground`.
    static var bg: Color { light ? Color(hex: 0xF7F6F3) : Color(hex: 0x08080A) }
    /// Superficie de tarjetas, filas de lista y barras.
    static var bgElev: Color { light ? Color(hex: 0xFFFFFF) : Color(hex: 0x111114) }
    static var surface: Color { bgElev }
    /// Superficie suave: campos, menús y la barra para escribir.
    static var surfaceSoft: Color { light ? Color(hex: 0xFCFBF9) : Color(hex: 0x131316) }
    /// Relleno neutro: segmentado, chips apagados, esqueletos, botones redondos secundarios.
    static var surface2: Color { light ? Color(hex: 0xEFEDE8) : Color(hex: 0x18181C) }
    /// Bloques dentro de una tarjeta o burbuja (código, citas, archivos).
    static var inset: Color { light ? Color(hex: 0x0C0C0D, opacity: 0.05) : Color(hex: 0x000000, opacity: 0.32) }

    static var text: Color { light ? Color(hex: 0x0C0C0D) : Color(hex: 0xF2F2F4) }
    /// Texto secundario.
    static var muted: Color { light ? Color(hex: 0x55555C) : Color(hex: 0xA1A1AA) }
    static var secondary: Color { muted }
    /// Texto terciario: etiquetas, horas, detalle de tarjetas.
    static var tertiary: Color { light ? Color(hex: 0x8B8B92) : Color(hex: 0x85858E) }

    static var line: Color { light ? Color(hex: 0x0C0C0D, opacity: 0.07) : Color(hex: 0xFFFFFF, opacity: 0.07) }
    static var lineStrong: Color { light ? Color(hex: 0x0C0C0D, opacity: 0.12) : Color(hex: 0xFFFFFF, opacity: 0.12) }

    /// Acento (acción principal) en color sólido: tinta en ARTA, plata en Auditorio.
    /// Para rellenos de botones y estados se usa `accentFill` (en Auditorio, el degradado plata).
    static var accent: Color { EntityContext.entity.accent }
    /// Fondo tenue del acento (menciones, reacciones propias, avisos).
    static var accentSoft: Color { light ? Color(hex: 0x0C0C0D, opacity: 0.06) : Color(hex: 0xC7CCD4, opacity: 0.12) }
    /// Texto e íconos sobre el acento.
    static var onAccent: Color { light ? Color(hex: 0xFFFFFF) : Color(hex: 0x0A0A0B) }
    /// Tono profundo del acento (bordes).
    static var accentDeep: Color { EntityContext.entity.accentDeep }

    /// Plata metálica de Auditorio (`linear-gradient(135deg, #f1f3f6, #c7ccd4 55%, #9aa1ac)`).
    static var silver: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: Color(hex: 0xF1F3F6), location: 0),
                .init(color: Color(hex: 0xC7CCD4), location: 0.55),
                .init(color: Color(hex: 0x9AA1AC), location: 1),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    /// Relleno de la acción principal y de los estados «lleno»: tinta o plata.
    static var accentFill: AnyShapeStyle { light ? AnyShapeStyle(accent) : AnyShapeStyle(silver) }

    /// Cifras y marca en Auditorio: plata; en ARTA, el texto.
    static var figureStyle: AnyShapeStyle { light ? AnyShapeStyle(text) : AnyShapeStyle(silver) }

    // Semánticos: solo para errores y alertas reales, nunca de decoración.
    static var danger: Color { light ? Color(hex: 0xB42318) : Color(hex: 0xF97066) }
    static var ok: Color { light ? Color(hex: 0x067647) : Color(hex: 0x47CD89) }
    static var warn: Color { light ? Color(hex: 0xB54708) : Color(hex: 0xFDB022) }

    /// Enlaces, palomitas de leído e información: monocromo (tinta o plata clara).
    static var read: Color { light ? Color(hex: 0x0C0C0D) : Color(hex: 0xE4E7EC) }

    /// Burbuja de mis mensajes.
    static var mine: Color { EntityContext.entity.mineBubble }

    /// Sombra de tarjetas en ARTA (en Auditorio no hay sombra, hay línea).
    static var shadow: Color { light ? Color(hex: 0x0C0C0D, opacity: 0.05) : .clear }
}

/// Radios: ARTA redondo (tarjetas 16, controles píldora), Auditorio recto (6 y 4).
enum ArtaRadius {
    private static var light: Bool { ArtaTheme.isLight }

    /// Tarjetas y paneles.
    static var card: CGFloat { light ? 16 : 6 }
    /// Bloques dentro de tarjetas, campos y botones anchos.
    static var inner: CGFloat { light ? 12 : 4 }
    /// Ítems de menú, celdas del calendario, archivos.
    static var item: CGFloat { light ? 10 : 4 }
    /// Detalles chicos (miniaturas, código).
    static var small: CGFloat { light ? 8 : 3 }
    /// Controles: botones, chips, estados (píldora en ARTA; `RoundedRectangle` la recorta a la mitad del alto).
    static var control: CGFloat { light ? 999 : 4 }
    /// Etiquetas de estado y contadores.
    static var pill: CGFloat { light ? 999 : 3 }
    /// Burbujas del chat.
    static var bubble: CGFloat { light ? 18 : 6 }
    /// Campo para escribir del chat (crece con el texto: no puede ser píldora).
    static var composer: CGFloat { light ? 20 : 4 }

    static var buttonShape: ButtonBorderShape { light ? .capsule : .roundedRectangle(radius: 4) }
}

/// Forma de los controles: píldora en ARTA, rectángulo de 4 px (3 en estados y
/// contadores: `squareRadius`) en Auditorio.
struct ArtaControlShape: InsettableShape {
    var squareRadius: CGFloat = 4
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: insetAmount, dy: insetAmount)
        if ArtaTheme.isLight { return Capsule(style: .continuous).path(in: r) }
        return RoundedRectangle(cornerRadius: squareRadius, style: .continuous).path(in: r)
    }

    func inset(by amount: CGFloat) -> ArtaControlShape {
        var copy = self
        copy.insetAmount += amount
        return copy
    }
}

// MARK: - Tipografía (SF Pro Rounded: `.fontDesign(.rounded)` en la raíz)

enum ArtaFont {
    /// Etiqueta en mayúsculas (10–11 px, 600, tracking 1.6).
    static let cap = Font.system(size: 10.5, weight: .semibold, design: .rounded)
    /// Estado («REVISAR», «EN CURSO»).
    static let status = Font.system(size: 10, weight: .semibold, design: .rounded)
    /// Título de panel (600).
    static let panelTitle = Font.system(size: 15, weight: .semibold, design: .rounded)
    /// Título de pantalla y saludo: ligero, con el nombre en 600.
    static func display(_ size: CGFloat, weight: Font.Weight = .light) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
    /// Cifra de tarjeta: ligera y tabular.
    static func figure(_ size: CGFloat) -> Font {
        .system(size: size, weight: .light, design: .rounded).monospacedDigit()
    }
}

/// Etiqueta «cap»: mayúsculas chicas con espaciado, en terciario.
struct CapLabel: View {
    let text: String
    var color: Color?

    init(_ text: String, color: Color? = nil) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased(with: Locale(identifier: "es_MX")))
            .font(ArtaFont.cap)
            .tracking(1.5)
            .foregroundStyle(color ?? ArtaColor.tertiary)
            .lineLimit(1)
    }
}

// MARK: - Fondos y tarjetas

/// Fondo de pantalla: papel en ARTA; en Auditorio, negro con el brillo plata del reflector arriba.
struct ArtaScreenBackground: View {
    var glow = true

    var body: some View {
        ArtaColor.bg
            .overlay(alignment: .top) {
                if glow && !ArtaTheme.isLight {
                    RadialGradient(
                        colors: [Color(hex: 0xC7CCD4, opacity: 0.15), Color(hex: 0xC7CCD4, opacity: 0)],
                        center: UnitPoint(x: 0.6, y: 0),
                        startRadius: 0,
                        endRadius: 320
                    )
                    .frame(height: 360)
                    .allowsHitTesting(false)
                }
            }
            .ignoresSafeArea()
    }
}

/// Tarjeta: blanca con sombra suave en ARTA; en Auditorio superficie oscura con línea fina y brillo arriba.
struct ArtaCardBackground: View {
    var radius: CGFloat?

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius ?? ArtaRadius.card, style: .continuous)
        if ArtaTheme.isLight {
            shape
                .fill(ArtaColor.surface)
                .overlay(shape.strokeBorder(Color(hex: 0x0C0C0D, opacity: 0.06), lineWidth: 1))
                .shadow(color: Color(hex: 0x0C0C0D, opacity: 0.04), radius: 1, x: 0, y: 1)
                .shadow(color: Color(hex: 0x0C0C0D, opacity: 0.05), radius: 13, x: 0, y: 10)
        } else {
            shape
                .fill(ArtaColor.surface)
                .overlay(
                    shape.fill(LinearGradient(
                        colors: [Color.white.opacity(0.03), Color.white.opacity(0.005)],
                        startPoint: .top,
                        endPoint: .bottom
                    ))
                )
                .overlay(shape.strokeBorder(Color.white.opacity(0.07), lineWidth: 1))
                .overlay(alignment: .top) {
                    // `inset 0 1px 0 rgba(255,255,255,.05)`: filo de luz arriba.
                    Rectangle()
                        .fill(Color.white.opacity(0.05))
                        .frame(height: 1)
                        .padding(.horizontal, radius ?? ArtaRadius.card)
                }
        }
    }
}

extension View {
    /// Tarjeta del sistema con su relleno interior.
    func artaCard(padding: CGFloat = 16, radius: CGFloat? = nil) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ArtaCardBackground(radius: radius))
    }

    /// Fondo de pantalla de la entidad (con el brillo en Auditorio).
    func artaScreenBackground(glow: Bool = true) -> some View {
        background(ArtaScreenBackground(glow: glow))
    }
}

// MARK: - Botones

/// Acción principal: tinta con texto blanco (píldora) o plata con texto negro (4 px).
struct ArtaPrimaryButtonStyle: ButtonStyle {
    var fullWidth = true

    func makeBody(configuration: Configuration) -> some View {
        ArtaButtonBody(configuration: configuration, primary: true, fullWidth: fullWidth)
    }
}

/// Acción secundaria: superficie con borde de línea fuerte.
struct ArtaSecondaryButtonStyle: ButtonStyle {
    var fullWidth = true

    func makeBody(configuration: Configuration) -> some View {
        ArtaButtonBody(configuration: configuration, primary: false, fullWidth: fullWidth)
    }
}

private struct ArtaButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let primary: Bool
    let fullWidth: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let shape = ArtaControlShape()
        configuration.label
            .font(.system(.subheadline, design: .rounded).weight(.semibold))
            .foregroundStyle(primary ? ArtaColor.onAccent : ArtaColor.text)
            .lineLimit(1)
            .padding(.horizontal, 18)
            .padding(.vertical, 13)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(shape.fill(primary ? ArtaColor.accentFill : AnyShapeStyle(ArtaColor.surface)))
            .overlay(shape.strokeBorder(primary ? Color.clear : ArtaColor.lineStrong, lineWidth: 1))
            .shadow(
                color: primary && ArtaTheme.isLight ? Color(hex: 0x0C0C0D, opacity: 0.18) : .clear,
                radius: 8, x: 0, y: 5
            )
            .contentShape(shape)
            .opacity(isEnabled ? (configuration.isPressed ? 0.82 : 1) : 0.45)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Piezas comunes

struct Avatar: View {
    let name: String
    var size: CGFloat = 44
    var channel = false

    var body: some View {
        ZStack {
            if channel {
                Circle().fill(ArtaColor.surface2)
                Circle().strokeBorder(ArtaColor.line, lineWidth: 1)
            } else {
                Circle().fill(ArtaColor.accentFill)
            }
            Text(channel ? "#" : initials(of: name))
                .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
                .foregroundStyle(channel ? ArtaColor.text : ArtaColor.onAccent)
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
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(muted ? ArtaColor.muted : ArtaColor.onAccent)
            .padding(.horizontal, 6)
            .frame(minWidth: 20, minHeight: 20)
            .background(
                ArtaControlShape(squareRadius: 3)
                    .fill(muted ? AnyShapeStyle(ArtaColor.surface2) : ArtaColor.accentFill)
            )
    }
}

struct EmptyState: View {
    let icon: String
    let title: String
    var message: String?

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(ArtaColor.tertiary)
            Text(title).font(.headline).foregroundStyle(ArtaColor.text)
            if let message {
                Text(message).font(.subheadline).foregroundStyle(ArtaColor.muted).multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
