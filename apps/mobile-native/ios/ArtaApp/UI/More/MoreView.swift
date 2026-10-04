import SwiftUI
import UIKit

/// Pestaña «Más»: perfil, todos los módulos del panel web que el rol puede ver
/// (cada uno abre la vista web) y los ajustes de la app. Contrato de paridad §1.
struct MoreView: View {
    let user: UserDto

    @EnvironmentObject private var session: Session
    @State private var access: WebAccess
    @State private var confirmLogout = false
    @State private var busy = false

    init(user: UserDto) {
        self.user = user
        _access = State(initialValue: WebAccess(roleKey: user.roleKey ?? "", permissions: [], entities: []))
    }

    private var sections: [WebModuleSection] {
        WebModule.visible(for: access, entity: WebModule.appEntity)
    }

    var body: some View {
        List {
            Section {
                profileHeader
            }
            .listRowBackground(ArtaColor.bgElev)

            ForEach(sections) { section in
                Section(section.group) {
                    ForEach(section.modules) { module in
                        NavigationLink(value: AppRoute.web(path: module.path, title: module.label)) {
                            Label {
                                Text(module.label).foregroundStyle(ArtaColor.text)
                            } icon: {
                                Image(systemName: module.icon).foregroundStyle(ArtaColor.gold)
                            }
                        }
                    }
                }
                .listRowBackground(ArtaColor.bgElev)
            }

            if !PushManager.shared.firebaseEnabled {
                Section {
                    Label("Esta compilación no tiene Firebase configurado: no llegarán avisos push.", systemImage: "bell.slash")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.muted)
                }
                .listRowBackground(ArtaColor.bgElev)
            }

            Section("App") {
                Button {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Label("Ajustes de avisos", systemImage: "bell.badge")
                }
                Button {
                    Task {
                        let url = await WebSession.signedURL(path: "/dashboard")
                        _ = await UIApplication.shared.open(url)
                    }
                } label: {
                    Label("Abrir en Safari", systemImage: "safari")
                }
            }
            .listRowBackground(ArtaColor.bgElev)

            Section {
                Button(role: .destructive) {
                    confirmLogout = true
                } label: {
                    Text(busy ? "Cerrando sesión…" : "Cerrar sesión").frame(maxWidth: .infinity)
                }
                .disabled(busy)
            } footer: {
                Text("ARTA \(ApiConfig.appVersion) (\(Self.build))")
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
            }
            .listRowBackground(ArtaColor.bgElev)
        }
        .scrollContentBackground(.hidden)
        .background(ArtaColor.bg)
        .navigationTitle("Más")
        .confirmationDialog("¿Cerrar sesión en este teléfono?", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("Cerrar sesión", role: .destructive) {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                busy = true
                Task { await session.logout() }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Dejarás de recibir avisos de ARTA aquí hasta que vuelvas a entrar.")
        }
        .task { await loadAccess() }
        .refreshable { await loadAccess() }
    }

    private var profileHeader: some View {
        HStack(spacing: 16) {
            Avatar(name: user.name, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text(user.name)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(ArtaColor.text)
                if let title = user.title, !title.isEmpty {
                    Text(title).font(.subheadline).foregroundStyle(ArtaColor.muted)
                } else if let email = user.email {
                    Text(email).font(.subheadline).foregroundStyle(ArtaColor.muted)
                }
                Text(WebModule.roleLabel(access.roleKey))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ArtaColor.gold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(ArtaColor.goldSoft))
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
    }

    private static var build: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "1"
    }

    /// `UserDto` no trae permisos extra ni entidades; `/auth/me` sí.
    private func loadAccess() async {
        guard let res: MeAccessResponse = try? await ApiClient.shared.get("auth/me") else { return }
        access = WebAccess(
            roleKey: res.user.roleKey ?? user.roleKey ?? "",
            permissions: res.user.permissions ?? [],
            entities: res.user.entities ?? []
        )
    }
}

private struct MeAccessResponse: Decodable {
    let user: MeAccess
}

private struct MeAccess: Decodable {
    var roleKey: String?
    var permissions: [String]?
    var entities: [String]?
}

struct WebAccess: Equatable {
    var roleKey: String
    var permissions: [String]
    var entities: [String]
}

struct WebModuleSection: Identifiable {
    let group: String
    let modules: [WebModule]

    var id: String { group }
}

/// Un módulo del menú lateral de la web. Catálogo y reglas copiados de
/// `apps/web/lib/access-matrix.ts` (`NAV_ITEMS`, `canSeeNavItem`, `visibleNavItems`)
/// y `packages/rbac/src/roles.ts`; si cambian allá, cambian aquí.
struct WebModule: Identifiable, Hashable {
    let path: String
    let label: String
    let icon: String
    let group: String
    var permissions: [String] = []
    var roles: [String] = []
    var entities: [String] = []
    var requiresEventOps = false

    var id: String { path }

    static let portfolioGroup = "Vistas de portafolio"

    /// Panel de esta app: arta.* = ARTA, auditorio.* = EXPLANADA (como `entityFromHost`).
    static var appEntity: String {
        (ApiConfig.origin.host ?? "").lowercased().hasPrefix("auditorio.") ? "EXPLANADA" : "ARTA"
    }

    private static let direction = ["dir_general", "dir_adjunta", "super_admin"]
    private static let admins = ["dir_general", "super_admin"]
    private static let adminPerms = ["users.manage", "everything"]
    private static let formatPerms = ["checklist.edit", "event.create", "everything"]

    /// Inicio, Chat y Tareas no están: son pestañas nativas.
    static let catalog: [WebModule] = [
        WebModule(path: "/events/new", label: "Crear evento", icon: "plus.circle", group: "Eventos",
                  permissions: ["event.create", "everything"], requiresEventOps: true),
        WebModule(path: "/events?scope=active", label: "Eventos actuales", icon: "calendar.badge.clock", group: "Eventos",
                  requiresEventOps: true),
        WebModule(path: "/events?scope=past", label: "Eventos pasados", icon: "clock.arrow.circlepath", group: "Eventos",
                  requiresEventOps: true),
        WebModule(path: "/calendar", label: "Calendario", icon: "calendar", group: "Eventos",
                  requiresEventOps: true),

        WebModule(path: "/purchase-orders", label: "Órdenes de compra", icon: "doc.text", group: "Control",
                  permissions: ["po.authorize", "po.mark_paid", "everything"], requiresEventOps: true),
        WebModule(path: "/campaigns", label: "Campañas", icon: "megaphone", group: "Control",
                  permissions: ["campaign.view", "campaign.edit", "everything"], requiresEventOps: true),
        WebModule(path: "/ticketing", label: "Boletera", icon: "ticket", group: "Control",
                  permissions: ["ticketing.edit", "everything"], requiresEventOps: true),

        WebModule(path: "/studio", label: "Studio web", icon: "paintbrush", group: "Marca",
                  permissions: ["studio.edit", "everything"], entities: ["ARTA"]),
        WebModule(path: "/site", label: "Ver sitio Arta", icon: "globe", group: "Marca",
                  entities: ["ARTA"]),

        WebModule(path: "/users", label: "Usuarios", icon: "person.2", group: "Admin",
                  permissions: adminPerms, roles: admins),
        WebModule(path: "/settings", label: "Configuración", icon: "gearshape", group: "Admin",
                  permissions: adminPerms, roles: direction),
        WebModule(path: "/organizations", label: "Organizaciones", icon: "building.2", group: "Admin",
                  permissions: adminPerms, roles: admins),
        WebModule(path: "/security", label: "Seguridad", icon: "lock.shield", group: "Admin"),
        WebModule(path: "/audit", label: "Auditoría", icon: "list.bullet.clipboard", group: "Admin",
                  permissions: adminPerms, roles: direction),
        WebModule(path: "/webhooks", label: "Webhooks", icon: "arrow.triangle.branch", group: "Admin",
                  permissions: adminPerms, roles: direction),
        WebModule(path: "/digests", label: "Resúmenes", icon: "envelope.open", group: "Admin",
                  permissions: adminPerms, roles: direction),

        WebModule(path: "/checklists", label: "Plantillas", icon: "checklist", group: portfolioGroup,
                  permissions: ["checklist.edit", "everything"], requiresEventOps: true),
        WebModule(path: "/folders", label: "Carpetas generales", icon: "folder", group: portfolioGroup,
                  permissions: ["folders.edit", "checklist.edit", "everything"]),
        WebModule(path: "/finance", label: "Finanzas", icon: "chart.line.uptrend.xyaxis", group: portfolioGroup,
                  permissions: ["finance.view", "finance.edit", "everything"], requiresEventOps: true),
        WebModule(path: "/advances", label: "Anticipos", icon: "banknote", group: portfolioGroup,
                  permissions: ["checklist.edit", "finance.view", "finance.edit", "everything"], requiresEventOps: true),
        WebModule(path: "/hospitality", label: "Hospedaje", icon: "bed.double", group: portfolioGroup,
                  permissions: formatPerms, requiresEventOps: true),
        WebModule(path: "/transport", label: "Transportación", icon: "bus", group: portfolioGroup,
                  permissions: formatPerms, requiresEventOps: true),
        WebModule(path: "/catering", label: "Catering", icon: "fork.knife", group: portfolioGroup,
                  permissions: formatPerms, requiresEventOps: true),
        WebModule(path: "/press", label: "Rueda de prensa", icon: "mic", group: portfolioGroup,
                  permissions: formatPerms, requiresEventOps: true),
        WebModule(path: "/arts", label: "Artes", icon: "paintpalette", group: portfolioGroup,
                  permissions: formatPerms, requiresEventOps: true),
        WebModule(path: "/pendones", label: "Pendones", icon: "flag", group: portfolioGroup,
                  permissions: formatPerms, requiresEventOps: true),
        WebModule(path: "/risk", label: "Riesgo", icon: "exclamationmark.triangle", group: portfolioGroup,
                  permissions: formatPerms, requiresEventOps: true),
        WebModule(path: "/maintenance", label: "Mantenimiento", icon: "wrench.and.screwdriver", group: portfolioGroup,
                  permissions: formatPerms, entities: ["EXPLANADA"], requiresEventOps: true),
        WebModule(path: "/vendor", label: "PIN proveedores", icon: "key", group: portfolioGroup,
                  permissions: ["vendor.pin", "everything"], requiresEventOps: true),
    ]

    /// `ROLE_PERMISSIONS` de `@arta/rbac` (dir_adjunta tiene todo menos `users.manage`).
    private static let rolePermissions: [String: Set<String>] = [
        "super_admin": ["everything"],
        "dir_general": ["everything"],
        "gerente_arta": [
            "finance.edit", "finance.view", "campaign.edit", "campaign.view", "po.authorize", "po.mark_paid",
            "event.create", "event.close", "checklist.edit", "studio.edit", "ticketing.edit", "folders.edit", "vendor.pin",
        ],
        "dir_auditorio": [
            "finance.view", "campaign.view", "po.authorize", "po.mark_paid", "event.create", "event.close",
            "checklist.edit", "studio.edit", "ticketing.edit", "folders.edit", "vendor.pin",
        ],
        "logistica": ["campaign.edit", "campaign.view", "checklist.edit", "event.create", "ticketing.edit", "finance.view", "folders.edit"],
        "convenios": ["checklist.edit", "finance.view", "campaign.view", "folders.edit"],
        "enlace_gobierno": ["checklist.edit", "finance.view", "po.mark_paid", "event.create", "folders.edit"],
        "solo_carpetas": [],
    ]

    private static let roleLabels: [String: String] = [
        "super_admin": "Administración de plataforma",
        "dir_general": "Dirección general",
        "dir_adjunta": "Dirección adjunta",
        "gerente_arta": "Gerencia Arta",
        "dir_auditorio": "Dirección Auditorio",
        "logistica": "Logística y producción",
        "convenios": "Convenios y patrocinios",
        "enlace_gobierno": "Enlace gobierno y pagos",
        "solo_carpetas": "Solo carpetas",
    ]

    /// Roles que trabajan sobre carpetas: «Carpetas generales» vuelve al menú.
    private static let folderCentricRoles: Set<String> = ["convenios", "enlace_gobierno", "solo_carpetas"]

    static func roleLabel(_ roleKey: String) -> String {
        if let known = roleLabels[roleKey] { return known }
        let plain = roleKey.replacingOccurrences(of: "_", with: " ").trimmingCharacters(in: .whitespaces)
        guard let first = plain.first else { return "Equipo ARTA" }
        return String(first).uppercased() + String(plain.dropFirst())
    }

    /// Módulos visibles agrupados en el orden del menú web (`visibleNavItems`).
    static func visible(for access: WebAccess, entity: String) -> [WebModuleSection] {
        let needsFolders = !canAccessEventOps(access.roleKey, entity: entity) || folderCentricRoles.contains(access.roleKey)
        var order: [String] = []
        var groups: [String: [WebModule]] = [:]
        for module in catalog where canSee(module, access: access, entity: entity) {
            let group = module.path == "/folders" && needsFolders ? "Documentos" : module.group
            if groups[group] == nil { order.append(group) }
            groups[group, default: []].append(module)
        }
        return order.map { WebModuleSection(group: $0, modules: groups[$0] ?? []) }
    }

    private static func canSee(_ module: WebModule, access: WebAccess, entity: String) -> Bool {
        let role = access.roleKey
        let isTop = role == "super_admin" || role == "dir_general"
        if !module.entities.isEmpty && !module.entities.contains(entity) { return false }
        if module.requiresEventOps && !canAccessEventOps(role, entity: entity) { return false }
        if !module.roles.isEmpty && !module.roles.contains(role) && !isTop { return false }
        return hasAny(module.permissions, access: access)
    }

    private static func canAccessEventOps(_ role: String, entity: String) -> Bool {
        if role == "super_admin" || role == "dir_general" { return true }
        if role == "solo_carpetas" { return false }
        if role == "dir_auditorio" && entity == "ARTA" { return false }
        return true
    }

    private static func hasAny(_ needed: [String], access: WebAccess) -> Bool {
        if needed.isEmpty { return true }
        let role = access.roleKey
        if role == "super_admin" || role == "dir_general" { return true }
        if access.permissions.contains("everything") { return true }
        let fromRole = rolePermissions[role] ?? []
        return needed.contains { permission in
            if role == "dir_adjunta" && permission != "users.manage" { return true }
            if fromRole.contains("everything") || fromRole.contains(permission) { return true }
            return access.permissions.contains(permission)
        }
    }
}
