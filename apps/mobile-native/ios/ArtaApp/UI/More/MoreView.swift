import SwiftUI
import UIKit

/// Pestaña «Más»: perfil, todos los módulos del panel web que el rol puede ver
/// (cada uno abre la vista web) y los ajustes de la app. Contrato de paridad §1.
struct MoreView: View {
    let user: UserDto

    @EnvironmentObject private var session: Session
    @EnvironmentObject private var activeEntity: ActiveEntity
    @Environment(\.openURL) private var openURL
    @State private var access: WebAccess
    @State private var confirmLogout = false
    @State private var confirmDeleteAccount = false
    @State private var busy = false
    @State private var openingSafari = false
    @State private var legalPage: SafariPage?

    init(user: UserDto) {
        self.user = user
        _access = State(initialValue: WebAccess(roleKey: user.roleKey ?? "", permissions: [], entities: []))
    }

    private var sections: [WebModuleSection] {
        // Campañas y Corridas solo en Arta: manda el negocio en el que se está trabajando.
        WebModule.visible(for: access, entity: activeEntity.current.rawValue)
    }

    var body: some View {
        List {
            Section {
                profileHeader
            }
            .listRowBackground(ArtaColor.bgElev)

            // Solo híbridos (docs/entidades-arta-auditorio.md). Al cambiar, la app se rehace en la otra entidad.
            if activeEntity.isHybrid {
                Section {
                    Picker("Entidad", selection: entitySelection) {
                        ForEach(ArtaEntity.allCases) { entity in
                            Text(entity.shortName).tag(entity)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("more-entity-picker")
                } header: {
                    ArtaSectionHeader("Entidad")
                } footer: {
                    Text("Atajo: doble toque en la pestaña Inicio.")
                }
                .listRowBackground(ArtaColor.bgElev)
            }

            ForEach(sections) { section in
                Section {
                    ForEach(section.modules) { module in
                        NavigationLink(value: AppRoute.web(path: module.path, title: module.label)) {
                            rowLabel(module.label, systemImage: module.icon)
                        }
                    }
                } header: {
                    ArtaSectionHeader(section.group)
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

            // Qué llega al teléfono, horario silencioso, No molestar y el permiso de iOS.
            Section {
                NavigationLink(value: AppRoute.notificationPreferences) {
                    rowLabel("Preferencias de avisos", systemImage: "bell.badge")
                }
                .accessibilityIdentifier("more-notification-prefs")
            } header: {
                ArtaSectionHeader("Avisos")
            }
            .listRowBackground(ArtaColor.bgElev)

            // Apple (1.2): quien bloquea en el chat puede revisar y deshacer el bloqueo.
            Section {
                NavigationLink(value: AppRoute.blockedUsers) {
                    rowLabel("Usuarios bloqueados", systemImage: "person.crop.circle.badge.xmark")
                }
                .accessibilityIdentifier("more-blocked-users")
            } header: {
                ArtaSectionHeader("Chat")
            }
            .listRowBackground(ArtaColor.bgElev)

            Section {
                Button {
                    Haptics.tap()
                    openingSafari = true
                    Task {
                        let url = await WebSession.signedURL(path: "/dashboard")
                        _ = await UIApplication.shared.open(url)
                        openingSafari = false
                    }
                } label: {
                    HStack {
                        rowLabel("Abrir en Safari", systemImage: "safari")
                        Spacer(minLength: ArtaSpace.s)
                        if openingSafari { ProgressView().tint(ArtaColor.tertiary) }
                    }
                }
                .disabled(openingSafari)
            } header: {
                ArtaSectionHeader("App")
            }
            .listRowBackground(ArtaColor.bgElev)

            // Apple (5.1.1) exige que privacidad, términos y soporte se abran
            // desde dentro de la app; se leen en hoja sin perder la pestaña.
            Section {
                legalRow("Aviso de privacidad", systemImage: "hand.raised", url: ArtaAppMeta.privacidadURL, id: "more-privacy")
                legalRow("Términos de uso", systemImage: "doc.text", url: ArtaAppMeta.terminosURL, id: "more-terms")
                legalRow("Soporte", systemImage: "questionmark.circle", url: ArtaAppMeta.soporteURL, id: "more-support")
            } header: {
                ArtaSectionHeader("Legal y soporte")
            }
            .listRowBackground(ArtaColor.bgElev)

            Section {
                Button(role: .destructive) {
                    Haptics.tap()
                    confirmLogout = true
                } label: {
                    Text(busy ? "Cerrando sesión…" : "Cerrar sesión").frame(maxWidth: .infinity)
                }
                .disabled(busy)
                .accessibilityIdentifier("more-logout")
                // Eliminación de cuenta (guideline 5.1.1(v)): se pide desde la app
                // y se completa en la web, porque las cuentas las crea quien
                // administra la organización. En Safari y no en hoja: ahí la
                // persona puede tener ya su sesión del panel.
                Button(role: .destructive) {
                    confirmDeleteAccount = true
                } label: {
                    Text("Eliminar mi cuenta").frame(maxWidth: .infinity)
                }
                .disabled(busy)
                .accessibilityIdentifier("more-delete-account")
                .confirmationDialog("¿Eliminar tu cuenta?", isPresented: $confirmDeleteAccount, titleVisibility: .visible) {
                    Button("Continuar en la web", role: .destructive) { openURL(ArtaAppMeta.eliminarCuentaURL) }
                    Button("Cancelar", role: .cancel) {}
                } message: {
                    // Baja = cuenta desactivada; lo que creó se queda en la organización (regla de Adam, 07-10-2026).
                    Text("La baja de tu cuenta se solicita en la web de ARTA: tu acceso se desactiva y lo que creaste se queda en tu equipo. Se abrirá en tu navegador.")
                }
            } footer: {
                Text("ARTA \(ArtaAppMeta.versionLabel)")
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
                    .accessibilityIdentifier("more-version")
            }
            .listRowBackground(ArtaColor.bgElev)
        }
        .scrollContentBackground(.hidden)
        .artaTabBarScrim()
        .artaScreenBackground()
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
        .sheet(item: $legalPage) { page in
            SafariView(url: page.url, onFinish: { legalPage = nil })
                .ignoresSafeArea()
        }
        .task { await loadAccess() }
        .refreshable { await loadAccess() }
    }

    private var entitySelection: Binding<ArtaEntity> {
        Binding(get: { activeEntity.current }, set: { activeEntity.select($0) })
    }

    private var profileHeader: some View {
        HStack(spacing: 16) {
            Avatar(name: user.name, size: 56)
            VStack(alignment: .leading, spacing: ArtaSpace.xs) {
                Text(user.name)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(ArtaColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let title = user.title, !title.isEmpty {
                    Text(title)
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.muted)
                        .fixedSize(horizontal: false, vertical: true)
                } else if let email = user.email {
                    Text(email)
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                StatusPill(text: WebModule.roleLabel(access.roleKey), tone: .accent)
                    .padding(.top, ArtaSpace.xxs)
                Text(activeEntity.current.brandName)
                    .font(.caption)
                    .foregroundStyle(ArtaColor.tertiary)
                    .accessibilityIdentifier("more-entity-brand")
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, ArtaSpace.s)
    }

    /// La misma fila en todo Más: texto en tinta o plata clara e ícono secundario.
    private func rowLabel(_ title: String, systemImage: String) -> some View {
        Label {
            Text(title).foregroundStyle(ArtaColor.text)
        } icon: {
            Image(systemName: systemImage).foregroundStyle(ArtaColor.muted)
        }
    }

    private func legalRow(_ title: String, systemImage: String, url: URL, id: String) -> some View {
        Button {
            legalPage = SafariPage(url: url)
        } label: {
            rowLabel(title, systemImage: systemImage)
        }
        .accessibilityIdentifier(id)
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
/// `apps/web/lib/access-matrix.ts` (`NAV_ITEMS`, `canSeeNavItem`, `visibleNavItems`);
/// los permisos, de `Data/Rbac.swift`. Si cambian allá, cambian aquí.
struct WebModule: Identifiable, Hashable {
    let path: String
    let label: String
    let icon: String
    let group: String
    var permissions: [String] = []
    var roles: [String] = []
    var entities: [String] = []
    var requiresEventOps = false
    var requiresCalendar = false

    var id: String { path }

    static let portfolioGroup = "Vistas de portafolio"

    private static let direction = ["dir_general", "dir_adjunta", "super_admin"]
    private static let admins = ["dir_general", "super_admin"]
    private static let adminPerms = ["users.manage", "everything"]
    private static let formatPerms = ["checklist.edit", "event.create", "everything"]

    /// Inicio, Chat y Tareas no están: son pestañas nativas.
    static let catalog: [WebModule] = [
        WebModule(path: "/ubicacion", label: "Ubicación del equipo", icon: "location", group: "Equipo",
                  roles: admins),

        WebModule(path: "/events/new", label: "Crear evento", icon: "plus.circle", group: "Eventos",
                  permissions: ["event.create", "everything"], requiresEventOps: true),
        WebModule(path: "/events?scope=active", label: "Eventos actuales", icon: "calendar.badge.clock", group: "Eventos",
                  requiresEventOps: true),
        WebModule(path: "/events?scope=past", label: "Eventos pasados", icon: "clock.arrow.circlepath", group: "Eventos",
                  requiresEventOps: true),
        WebModule(path: "/calendar", label: "Calendario", icon: "calendar", group: "Eventos",
                  requiresCalendar: true),

        WebModule(path: "/finanzas", label: "Finanzas", icon: "chart.line.uptrend.xyaxis", group: "Control",
                  permissions: ["finanzas.view", "everything"]),
        WebModule(path: "/purchase-orders", label: "Órdenes de compra", icon: "doc.text", group: "Control",
                  permissions: ["po.view", "po.edit", "po.authorize", "po.mark_paid", "everything"], requiresEventOps: true),
        WebModule(path: "/campaigns", label: "Campañas", icon: "megaphone", group: "Control",
                  permissions: ["campaign.view", "campaign.edit", "everything"], entities: ["ARTA"], requiresEventOps: true),
        WebModule(path: "/ticketing", label: "Boletera", icon: "ticket", group: "Control",
                  permissions: ["ticketing.view", "ticketing.edit", "everything"], requiresEventOps: true),

        WebModule(path: "/studio", label: "Studio web", icon: "paintbrush", group: "Marca",
                  permissions: ["studio.edit", "everything"], entities: ["ARTA"]),
        WebModule(path: "/site", label: "Ver sitio Arta", icon: "globe", group: "Marca",
                  entities: ["ARTA"]),

        WebModule(path: "/users", label: "Usuarios", icon: "person.2", group: "Admin",
                  permissions: ["users.manage", "users.create"], roles: admins),
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
        WebModule(path: "/testigos", label: "Testigos de publicidad", icon: "photo.on.rectangle", group: portfolioGroup,
                  permissions: ["testigos.edit", "everything"]),
        WebModule(path: "/studio/practicantes", label: "Perfiles de practicante", icon: "person.badge.plus", group: portfolioGroup,
                  permissions: ["practicantes.manage", "everything"]),
        WebModule(path: "/finance", label: "Corridas", icon: "tablecells", group: portfolioGroup,
                  permissions: ["corrida.view", "everything"], entities: ["ARTA"], requiresEventOps: true),
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
        "contabilidad": "Contabilidad y comercial",
        "practicante": "Practicante (sitio y testigos)",
        "compras": "Compras",
        "produccion": "Producción",
        "contenido": "Contenido e imágenes",
        "catering": "Catering",
    ]

    /// Roles que trabajan sobre carpetas: «Carpetas generales» vuelve al menú.
    private static let folderCentricRoles: Set<String> = ["convenios", "enlace_gobierno", "solo_carpetas"]

    /// `ROLE_SURFACED`: vistas de portafolio que para un rol son su trabajo diario y salen a «Control».
    private static let roleSurfaced: [String: Set<String>] = [
        "contabilidad": ["/advances"],
        "practicante": ["/testigos"],
    ]

    static func roleLabel(_ roleKey: String) -> String {
        if let known = roleLabels[roleKey] { return known }
        let plain = roleKey.replacingOccurrences(of: "_", with: " ").trimmingCharacters(in: .whitespaces)
        guard let first = plain.first else { return "Equipo ARTA" }
        return String(first).uppercased() + String(plain.dropFirst())
    }

    /// Módulos visibles agrupados en el orden del menú web (`visibleNavItems`).
    static func visible(for access: WebAccess, entity: String) -> [WebModuleSection] {
        // El practicante no trabaja con carpetas generales: su menú es Studio, testigos y calendario.
        let needsFolders = access.roleKey != "practicante"
            && (!canAccessEventOps(access.roleKey, entity: entity) || folderCentricRoles.contains(access.roleKey))
        let surfaced = roleSurfaced[access.roleKey] ?? []
        var order: [String] = []
        var groups: [String: [WebModule]] = [:]
        for module in catalog where canSee(module, access: access, entity: entity) {
            var group = module.group
            if module.path == "/folders" && needsFolders {
                group = "Documentos"
            } else if surfaced.contains(module.path) {
                group = "Control"
            }
            if groups[group] == nil { order.append(group) }
            groups[group, default: []].append(module)
        }
        return order.map { WebModuleSection(group: $0, modules: groups[$0] ?? []) }
    }

    private static func canSee(_ module: WebModule, access: WebAccess, entity: String) -> Bool {
        let role = access.roleKey
        let isTop = role == "super_admin" || role == "dir_general"
        if !module.entities.isEmpty && !module.entities.contains(entity) { return false }
        if module.path == "/folders" && !Rbac.canSeeGeneralFolders(role) { return false }
        if module.path == "/ubicacion" && !Rbac.canSeeTeamLocation(role) { return false }
        if module.requiresEventOps && !canAccessEventOps(role, entity: entity) { return false }
        if module.requiresCalendar && !Rbac.canSeeEventCalendar([entity], role, entity) { return false }
        if !module.roles.isEmpty && !module.roles.contains(role) && !isTop { return false }
        return hasAny(module.permissions, access: access)
    }

    /// `canAccessEventOps` de access-matrix: el menú solo mira el rol en esta entidad.
    private static func canAccessEventOps(_ role: String, entity: String) -> Bool {
        Rbac.canAccessEventOps([entity], role, entity)
    }

    /// `userHasPermission` de access-matrix.
    private static func hasAny(_ needed: [String], access: WebAccess) -> Bool {
        if needed.isEmpty { return true }
        let role = access.roleKey
        if role == "super_admin" || role == "dir_general" { return true }
        if access.permissions.contains("everything") { return true }
        return needed.contains { Rbac.hasPermission(role, access.permissions, $0) }
    }
}
