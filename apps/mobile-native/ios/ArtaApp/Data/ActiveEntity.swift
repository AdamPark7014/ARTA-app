import Combine
import Foundation
import SwiftUI
import UIKit

// Entidad activa de la app (docs/entidades-arta-auditorio.md, «Apps móviles»).
// ARTA y Auditorio (`EXPLANADA`) son negocios distintos dentro de la misma
// organización: la app trabaja siempre en UNA de las dos. Solo los híbridos
// (dirección general, plataforma o quien tiene las dos entidades) pueden cambiar.

/// Negocio dentro de la organización.
enum ArtaEntity: String, CaseIterable, Identifiable {
    case arta = "ARTA"
    case explanada = "EXPLANADA"

    var id: String { rawValue }

    /// «Arta» / «Auditorio»: selector de Más, chip de Inicio y aviso de cambio.
    var shortName: String { self == .arta ? "Arta" : "Auditorio" }

    /// Marca completa en Inicio y en los encabezados.
    var brandName: String { self == .arta ? "Arta Producciones" : "Auditorio Explanada" }

    var other: ArtaEntity { self == .arta ? .explanada : .arta }

    /// Acento sólido (docs/diseno/SISTEMA-VISUAL.md): tinta en Arta (tema claro), plata en
    /// Auditorio (tema oscuro). El resto de los tokens vive en `ArtaColor`.
    var accent: Color { self == .arta ? Color(hex: 0x0C0C0D) : Color(hex: 0xC7CCD4) }

    /// Tono profundo del acento (bordes). Mismos valores que Android.
    var accentDeep: Color { self == .arta ? Color(hex: 0x55555C) : Color(hex: 0x9AA1AC) }

    /// Burbuja de mis mensajes: hueso un tono abajo del papel en Arta; grafito con plata en Auditorio.
    var mineBubble: Color { self == .arta ? Color(hex: 0xEAE8E2) : Color(hex: 0x1C1E22) }
}

/// Copia de la entidad activa que se puede leer desde cualquier hilo: la usan
/// `ApiClient` (parámetro `entity`) y `ArtaColor` (acento). Solo la escribe `ActiveEntity`.
enum EntityContext {
    private static let lock = NSLock()
    private static var current: ArtaEntity = .arta
    private static var scoped = false

    static var entity: ArtaEntity {
        lock.lock()
        defer { lock.unlock() }
        return current
    }

    /// Valor de `?entity=` en los listados y del campo `entity` al crear sin evento.
    /// `nil` mientras no se sepa a qué entidades tiene acceso la persona: sin el
    /// parámetro el API responde con todas las suyas.
    static var query: String? {
        lock.lock()
        defer { lock.unlock() }
        return scoped ? current.rawValue : nil
    }

    /// Respaldo mientras el API ignore `?entity=` (servidor sin la separación): se
    /// quita solo lo que trae OTRA entidad; lo que llega sin entidad (directos,
    /// avisos personales, filas viejas) se queda.
    static func keeps(_ rowEntity: String?, for requested: String?) -> Bool {
        guard let requested, let rowEntity, !rowEntity.isEmpty else { return true }
        return rowEntity == requested
    }

    fileprivate static func update(_ entity: ArtaEntity, isScoped: Bool) {
        lock.lock()
        current = entity
        scoped = isScoped
        lock.unlock()
    }
}

/// Aviso breve tras cambiar de entidad («Ahora en Auditorio»).
struct EntityNotice: Equatable, Identifiable {
    let id = UUID()
    let entity: ArtaEntity

    var text: String { "Ahora en \(entity.shortName)" }
}

/// Estado de toda la app: en qué entidad se trabaja. Se guarda por persona
/// (`UserDefaults`, `arta.entity.<id>`). Al entrar es la última usada o, si no
/// hay, la primera de `user.entities` (ARTA si tiene las dos).
@MainActor
final class ActiveEntity: ObservableObject {
    static let shared = ActiveEntity()

    @Published private(set) var current: ArtaEntity = .arta
    /// Entidades que la persona puede abrir: las dos para los híbridos, la suya para el resto.
    @Published private(set) var available: [ArtaEntity] = []
    @Published private(set) var notice: EntityNotice?

    private var userId: String?
    private var noticeTask: Task<Void, Never>?
    /// Se tocó un aviso de otra entidad antes de saber a cuáles tiene acceso la persona (arranque en frío).
    private var pendingFocus: ArtaEntity?

    private init() {}

    /// Solo los híbridos cambian; los demás quedan fijos en su única entidad.
    var isHybrid: Bool { available.count > 1 }

    private static func storageKey(_ userId: String) -> String { "arta.entity.\(userId)" }

    /// Al entrar o al confirmar la sesión con `/auth/me`.
    func configure(user: UserDto) {
        // Usuario parcial (sin entidades) de la misma persona: se queda lo que ya se sabía.
        if user.entities == nil, userId == user.id, !available.isEmpty { return }
        let role = user.roleKey ?? ""
        let own = ArtaEntity.allCases.filter { (user.entities ?? []).contains($0.rawValue) }
        let hybrid = role == "dir_general" || role == "super_admin" || own.count > 1
        let list = hybrid ? ArtaEntity.allCases : own
        let saved = UserDefaults.standard.string(forKey: Self.storageKey(user.id)).flatMap(ArtaEntity.init(rawValue:))
        let chosen: ArtaEntity
        if let pendingFocus, list.contains(pendingFocus) {
            chosen = pendingFocus
        } else if let saved, list.contains(saved) {
            chosen = saved
        } else if userId == user.id, list.contains(current) {
            chosen = current
        } else {
            chosen = list.first ?? .arta
        }
        // Con un usuario parcial (sin entidades) se sigue esperando al completo.
        if !list.isEmpty { pendingFocus = nil }
        userId = user.id
        available = list
        apply(chosen)
    }

    /// Se tocó un aviso de esa entidad: la pantalla que abre debe verse y cargar en ella. Al
    /// arrancar en frío todavía no se saben las entidades de la persona: espera a `configure`.
    func focus(on entity: ArtaEntity) {
        if available.isEmpty {
            pendingFocus = entity
        } else {
            select(entity)
        }
    }

    /// Cambio pedido por la persona (doble toque en Inicio, chip de Inicio o selector de Más).
    func select(_ entity: ArtaEntity) {
        guard entity != current, available.contains(entity) else { return }
        // Las pilas abiertas son de la otra entidad: cada pestaña vuelve a su raíz.
        AppRouter.shared.resetStacks()
        apply(entity)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        announce(entity)
    }

    func toggle() {
        guard isHybrid else { return }
        select(current.other)
    }

    /// Cierre de sesión: la preferencia guardada de cada persona se conserva.
    func reset() {
        noticeTask?.cancel()
        notice = nil
        userId = nil
        pendingFocus = nil
        available = []
        apply(.arta)
    }

    private func apply(_ entity: ArtaEntity) {
        // Primero la copia para hilos: lo que se repinta o se recarga al publicar ya la ve.
        EntityContext.update(entity, isScoped: !available.isEmpty)
        // Barras de UIKit (navegación, pestañas, segmentados): las que se crean al rehacerse la app.
        ArtaAppearance.apply(entity)
        if current != entity { current = entity }
        if let userId, !available.isEmpty {
            UserDefaults.standard.set(entity.rawValue, forKey: Self.storageKey(userId))
        }
    }

    private func announce(_ entity: ArtaEntity) {
        noticeTask?.cancel()
        let next = EntityNotice(entity: entity)
        notice = next
        UIAccessibility.post(notification: .announcement, argument: next.text)
        noticeTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            guard !Task.isCancelled, self?.notice == next else { return }
            self?.notice = nil
        }
    }
}

// MARK: - Piezas de interfaz

/// Aviso arriba de la pantalla tras cambiar de entidad (propuesta visual): en Arta,
/// píldora negra con texto blanco; en Auditorio, plata con texto negro. Compacto y centrado
/// (no tapa la marca ni el chip del encabezado) y entra con un resorte. No intercepta toques.
struct EntityNoticeBanner: View {
    let notice: EntityNotice?

    var body: some View {
        VStack {
            if let notice {
                let light = notice.entity == .arta
                HStack(spacing: 8) {
                    Image(systemName: "arrow.left.arrow.right")
                        .font(.system(size: 12, weight: .semibold))
                    Text(notice.text)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .lineLimit(1)
                }
                .foregroundStyle(light ? Color.white : Color(hex: 0x0A0A0B))
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(
                    Group {
                        if light {
                            Capsule(style: .continuous).fill(Color(hex: 0x0C0C0D))
                        } else {
                            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(ArtaColor.silver)
                        }
                    }
                )
                .shadow(color: .black.opacity(light ? 0.22 : 0.6), radius: light ? 12 : 17, x: 0, y: light ? 8 : 14)
                .padding(.top, 6)
                .transition(.move(edge: .top).combined(with: .opacity).combined(with: .scale(scale: 0.92, anchor: .top)))
                .accessibilityIdentifier("entity-notice")
            }
        }
        .frame(maxWidth: .infinity)
        .animation(.spring(response: 0.38, dampingFraction: 0.78), value: notice)
        .allowsHitTesting(false)
    }
}

/// Chip de la entidad en el encabezado de Inicio («● Arta» / «● Auditorio»). Para los
/// híbridos, tocarlo cambia.
struct EntityChip: View {
    @EnvironmentObject private var activeEntity: ActiveEntity

    var body: some View {
        let entity = activeEntity.current
        if activeEntity.isHybrid {
            Button {
                activeEntity.toggle()
            } label: {
                chipBody(entity, switchable: true)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("inicio-entity-chip")
            .accessibilityLabel(entity.brandName)
            .accessibilityHint("Cambia a \(entity.other.shortName)")
        } else {
            chipBody(entity, switchable: false)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(entity.brandName)
                .accessibilityIdentifier("inicio-entity-chip")
        }
    }

    private func chipBody(_ entity: ArtaEntity, switchable: Bool) -> some View {
        let light = entity == .arta
        let shape = ArtaControlShape()
        return HStack(spacing: 6) {
            Circle()
                .fill(light ? Color.white : Color(hex: 0xC7CCD4))
                .frame(width: 5, height: 5)
            Text(entity.shortName)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
            if switchable {
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 9, weight: .bold))
                    .opacity(0.6)
            }
        }
        .foregroundStyle(light ? Color.white : Color(hex: 0xC7CCD4))
        .padding(.horizontal, 11)
        .padding(.vertical, 6)
        .background(shape.fill(light ? Color(hex: 0x0C0C0D) : Color.white.opacity(0.04)))
        .overlay(shape.strokeBorder(light ? Color.clear : Color.white.opacity(0.1), lineWidth: 1))
        // La píldora mide ~28 pt; el dedo alcanza 44 sin moverla.
        .contentShape(ArtaHitArea(dx: ArtaSpace.xs, dy: ArtaSpace.s))
    }
}
