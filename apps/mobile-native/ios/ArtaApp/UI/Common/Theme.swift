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
    /// Texto terciario: etiquetas, horas, detalle de tarjetas. Los mismos que la web tras la
    /// revisión de contraste AA (`#8b8b92` daba 3.4:1 sobre blanco; `#85858e`, 4.4:1 bajo el reflector).
    static var tertiary: Color { light ? Color(hex: 0x6B6B73) : Color(hex: 0x8A8A93) }

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
    /// Estado («REVISAR», «EN CURSO»): 10.5 como en la web y en Android.
    static let status = Font.system(size: 10.5, weight: .semibold, design: .rounded)
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
    var lines: Int

    init(_ text: String, color: Color? = nil, lines: Int = 1) {
        self.text = text
        self.color = color
        self.lines = lines
    }

    var body: some View {
        Text(text.uppercased(with: Locale(identifier: "es_MX")))
            .font(ArtaFont.cap)
            .tracking(1.5)
            .foregroundStyle(color ?? ArtaColor.tertiary)
            .lineLimit(lines)
            .fixedSize(horizontal: false, vertical: lines > 1)
    }
}

/// Encabezado de sección, el mismo en listas, hojas y tarjetas: etiqueta «cap» y, si aplica,
/// el contador en una insignia discreta. `alert` solo para alertas reales (vencidas).
struct ArtaSectionHeader: View {
    let title: String
    var count: Int?
    var alert: Bool

    init(_ title: String, count: Int? = nil, alert: Bool = false) {
        self.title = title
        self.count = count
        self.alert = alert
    }

    var body: some View {
        HStack(alignment: .center, spacing: ArtaSpace.s) {
            CapLabel(title, color: alert ? ArtaColor.danger : nil, lines: 2)
            if let count { QuietCount(count: count) }
            Spacer(minLength: 0)
        }
        .textCase(nil)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Contador discreto (encabezados, filas de menú): relleno neutro y texto secundario, para no
/// competir con los estados «llenos», que sí piden acción.
struct QuietCount: View {
    let count: Int

    var body: some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.system(size: 10.5, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(ArtaColor.muted)
            .padding(.horizontal, 6)
            .frame(minWidth: 18, minHeight: 18)
            .background(ArtaControlShape(squareRadius: 3).fill(ArtaColor.surface2))
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
/// `compact`: la versión chica de las filas (aprobar, corregir).
struct ArtaPrimaryButtonStyle: ButtonStyle {
    var fullWidth = true
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        ArtaButtonBody(configuration: configuration, kind: .primary, fullWidth: fullWidth, compact: compact)
    }
}

/// Acción secundaria: superficie con borde de línea fuerte.
struct ArtaSecondaryButtonStyle: ButtonStyle {
    var fullWidth = true
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        ArtaButtonBody(configuration: configuration, kind: .secondary, fullWidth: fullWidth, compact: compact)
    }
}

/// Acción destructiva (rechazar, pedir corrección): discreta, igual que la secundaria pero con
/// el texto en el color de peligro; nunca un relleno teñido. Siempre pasa por una confirmación.
struct ArtaDestructiveButtonStyle: ButtonStyle {
    var fullWidth = true
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        ArtaButtonBody(configuration: configuration, kind: .destructive, fullWidth: fullWidth, compact: compact)
    }
}

private enum ArtaButtonKind { case primary, secondary, destructive }

private struct ArtaButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let kind: ArtaButtonKind
    let fullWidth: Bool
    let compact: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let shape = ArtaControlShape()
        configuration.label
            .font(.system(textStyle, design: .rounded).weight(.semibold))
            .foregroundStyle(foreground)
            .lineLimit(1)
            .padding(.horizontal, compact ? 14 : 18)
            .padding(.vertical, compact ? 8 : 13)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(shape.fill(fill))
            .overlay(shape.strokeBorder(border, lineWidth: 1))
            .shadow(
                color: kind == .primary && isEnabled && !compact && ArtaTheme.isLight ? Color(hex: 0x0C0C0D, opacity: 0.18) : .clear,
                radius: 8, x: 0, y: 5
            )
            // Los compactos miden ~34 pt: el dedo alcanza 44 sin agrandar lo que se dibuja.
            .contentShape(compact ? AnyShape(ArtaHitArea(dy: 5)) : AnyShape(shape))
            .opacity(configuration.isPressed ? 0.82 : 1)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .animation(.easeOut(duration: 0.18), value: isEnabled)
    }

    private var textStyle: Font.TextStyle { compact ? .footnote : .subheadline }

    /// Apagado a propósito, no un negro deslavado: relleno neutro, texto terciario y sin sombra.
    private var foreground: Color {
        guard isEnabled else { return ArtaColor.tertiary }
        switch kind {
        case .primary: return ArtaColor.onAccent
        case .secondary: return ArtaColor.text
        case .destructive: return ArtaColor.danger
        }
    }

    private var fill: AnyShapeStyle {
        if kind == .primary { return isEnabled ? ArtaColor.accentFill : AnyShapeStyle(ArtaColor.surface2) }
        return AnyShapeStyle(ArtaColor.surface)
    }

    private var border: Color {
        if kind == .primary { return .clear }
        return isEnabled ? ArtaColor.lineStrong : ArtaColor.line
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

/// Vacío, error o «sin resultados»: el mismo estilo en toda la app (ícono en un círculo
/// de superficie con línea fina, título 600, mensaje secundario y, si aplica, una acción).
struct EmptyState: View {
    let icon: String
    let title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: ArtaSpace.m) {
            ZStack {
                Circle().fill(ArtaColor.surface2)
                Circle().strokeBorder(ArtaColor.line, lineWidth: 1)
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(ArtaColor.muted)
            }
            .frame(width: 60, height: 60)
            .padding(.bottom, ArtaSpace.xs)
            .accessibilityHidden(true)
            Text(title)
                .font(.headline)
                .foregroundStyle(ArtaColor.text)
                .multilineTextAlignment(.center)
            if let message, !message.isEmpty {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: 300)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(ArtaPrimaryButtonStyle(fullWidth: false))
                    .padding(.top, ArtaSpace.xs)
            }
        }
        .padding(ArtaSpace.xxxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Espaciado y márgenes (grilla de 4 pt)

enum ArtaSpace {
    static let xxs: CGFloat = 2
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 20
    static let xxl: CGFloat = 24
    static let xxxl: CGFloat = 32
}

enum ArtaLayout {
    /// Margen lateral de pantalla: el mismo que usa el sistema en listas, buscador y
    /// barras (20 pt en los iPhone anchos —Plus y Pro Max—, 16 en los demás). Así las
    /// pantallas propias y las listas del sistema quedan alineadas al mismo borde.
    @MainActor static var gutter: CGFloat {
        UIScreen.main.bounds.width >= 414 ? 20 : 16
    }

    /// Lo que se desvanece arriba de la barra de pestañas (y el aire extra que deja el
    /// contenido para que lo último nunca quede bajo el desvanecido).
    static let bottomFade: CGFloat = 28

    /// Aire al final de las pantallas con pestañas. Explorando con datos de muestra, además, lo
    /// que ocupa la pastilla de `DemoBanner`: lo último nunca se queda debajo de ella.
    static var scrollBottomMargin: CGFloat {
        bottomFade + (DemoMode.enteredFromLogin ? 52 : 0)
    }
}

// MARK: - Área de toque

/// Área de toque más grande que lo que se dibuja: el dedo pide 44 pt aunque el control mida menos.
struct ArtaHitArea: Shape {
    var dx: CGFloat = 0
    var dy: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        Path(rect.insetBy(dx: -dx, dy: -dy))
    }
}

extension View {
    /// En la etiqueta del botón (no en el botón): amplía el toque sin mover el diseño.
    /// Solo dentro de un desplazamiento vertical: un `ScrollView` horizontal recorta los toques a su alto.
    func artaHitArea(dx: CGFloat = 0, dy: CGFloat = 0) -> some View {
        contentShape(ArtaHitArea(dx: dx, dy: dy))
    }
}

// MARK: - Bordes de desplazamiento

/// Desvanecido del fondo bajo la barra de pestañas flotante: lo que se desplaza se funde
/// con el papel (o el negro) antes de llegar a la barra y no asoma cortado alrededor de
/// ella. No intercepta toques.
struct ArtaBottomScrim: View {
    var fade: CGFloat = ArtaLayout.bottomFade

    var body: some View {
        GeometryReader { proxy in
            let inset = proxy.safeAreaInsets.bottom
            // Parte del degradado entra bajo la barra; el resto, sólido hasta el borde.
            let overlap = min(inset, 22)
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                LinearGradient(
                    stops: [
                        .init(color: ArtaColor.bg.opacity(0), location: 0),
                        .init(color: ArtaColor.bg.opacity(0.78), location: 0.55),
                        .init(color: ArtaColor.bg, location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: fade + overlap)
                ArtaColor.bg.frame(height: max(inset - overlap, 0))
            }
            .ignoresSafeArea(.container, edges: .bottom)
        }
        // Con el teclado arriba, el desvanecido se queda abajo (tapado), no sube con él.
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Franja bajo la barra de estado: lo que sube al desplazarse se desvanece antes de la hora y
/// las señales, en vez de quedar encimado a ellas. Usa el mismo fondo de la pantalla (con el
/// brillo del Auditorio) para que no se note la orilla. No intercepta toques.
struct ArtaStatusBarScrim: View {
    /// Igual que el fondo de la pantalla: con o sin el brillo del Auditorio.
    var glow = true

    var body: some View {
        ArtaScreenBackground(glow: glow)
            .mask(alignment: .top) {
                LinearGradient(
                    stops: [
                        .init(color: .black, location: 0),
                        .init(color: .black, location: 0.58),
                        .init(color: .clear, location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: Self.height)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    /// Alto de la barra de estado más el desvanecido (59–62 pt en los iPhone con isla).
    @MainActor private static var height: CGFloat {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let status = scene?.statusBarManager?.statusBarFrame.height ?? 0
        return (status > 0 ? status : 54) + 16
    }
}

extension View {
    /// Pantallas con la barra de pestañas visible: desvanecido abajo y aire para que el
    /// último bloque se pueda leer completo al final del desplazamiento; arriba, nada se
    /// encima a la barra de estado.
    func artaTabBarScrim(glow: Bool = true) -> some View {
        self
            .contentMargins(.bottom, ArtaLayout.scrollBottomMargin, for: .scrollContent)
            .overlay(alignment: .bottom) { ArtaBottomScrim() }
            .overlay(alignment: .top) { ArtaStatusBarScrim(glow: glow) }
    }

    /// Filas horizontales (chips): los bordes se desvanecen en vez de cortar una etiqueta
    /// a la mitad contra el borde de la pantalla.
    func artaHorizontalEdgeFade(_ width: CGFloat = ArtaSpace.l) -> some View {
        mask {
            HStack(spacing: 0) {
                LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing)
                    .frame(width: width)
                Rectangle().fill(.black)
                LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: width)
            }
        }
    }
}

// MARK: - Línea fina

/// Separador de 1 pt en el color de línea, con sangría para no cruzar la tarjeta de lado a lado.
struct ArtaDivider: View {
    var leading: CGFloat = 0

    var body: some View {
        Rectangle()
            .fill(ArtaColor.line)
            .frame(height: 1)
            .padding(.leading, leading)
            .accessibilityHidden(true)
    }
}

// MARK: - Estado presionado

/// Tarjetas, mosaicos y filas tocables: se hunden apenas (escala y tono) con un resorte corto.
struct ArtaPressStyle: ButtonStyle {
    var scale: CGFloat = 0.98

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .opacity(configuration.isPressed ? 0.86 : 1)
            .animation(.spring(response: 0.26, dampingFraction: 0.72), value: configuration.isPressed)
    }
}

// MARK: - Esqueleto con brillo

/// Brillo que recorre los marcadores de carga: blanco suave sobre papel en ARTA, reflejo
/// plata tenue en Auditorio. Con «Reducir movimiento», queda quieto.
struct ArtaShimmer: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay {
                if !reduceMotion {
                    GeometryReader { geo in
                        let width = geo.size.width
                        let band = max(width * 0.45, 120)
                        LinearGradient(
                            colors: [.clear, highlight, .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: band)
                        .offset(x: -band + phase * (width + band))
                    }
                    .mask { content }
                    .allowsHitTesting(false)
                }
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 1.35).repeatForever(autoreverses: false)) { phase = 1 }
            }
    }

    private var highlight: Color {
        ArtaTheme.isLight ? Color.white.opacity(0.75) : Color(hex: 0xC7CCD4, opacity: 0.1)
    }
}

extension View {
    func artaShimmer() -> some View { modifier(ArtaShimmer()) }
}

/// Marcador de carga (barra redondeada en el relleno neutro).
struct SkeletonBar: View {
    var width: CGFloat?
    var height: CGFloat = 10

    var body: some View {
        RoundedRectangle(cornerRadius: min(height / 2, ArtaRadius.small), style: .continuous)
            .fill(ArtaColor.surface2)
            .frame(width: width, height: height)
    }
}

// MARK: - Texto

/// «1 pendiente» / «3 pendientes».
func pluralized(_ count: Int, _ one: String, _ many: String) -> String {
    "\(count) \(count == 1 ? one : many)"
}
