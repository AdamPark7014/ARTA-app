import SwiftUI
import UIKit
import UserNotifications

/// Qué llega al teléfono (Más › Preferencias de avisos y la barra de Avisos). Se guarda por persona
/// en el API, así que vale en todos sus dispositivos; la pestaña Avisos recibe todo, siempre.
/// Cada cambio se ve al instante y se regresa si el servidor no lo acepta.
struct NotificationPreferencesView: View {
    @Environment(\.scenePhase) private var scenePhase

    @State private var prefs: NotificationPrefs?
    /// Lo último que el servidor confirmó: a dónde se regresa si un cambio falla.
    @State private var confirmed: NotificationPrefs?
    @State private var loading = true
    @State private var loadError: String?
    @State private var saveError: String?
    @State private var saveTask: Task<Void, Never>?
    @State private var permission: UNAuthorizationStatus?
    @State private var dndUntil: Date?
    @State private var requestingPermission = false

    var body: some View {
        Group {
            if prefs != nil {
                form
            } else if loading {
                ModuleSkeletonList(rows: 5)
            } else {
                ModuleErrorView(message: loadError ?? "No se pudieron cargar tus preferencias.") {
                    loading = true
                    loadError = nil
                    Task { await load() }
                }
            }
        }
        .artaScreenBackground()
        .navigationTitle("Preferencias de avisos")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadPermission()
            if prefs == nil { await load() }
        }
        // Al volver de Ajustes de iOS el permiso pudo cambiar.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await loadPermission() } }
        }
    }

    // MARK: Vista

    private var form: some View {
        List {
            if let saveError {
                InlineErrorRow(message: saveError)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                    .listRowSeparator(.hidden)
                    .accessibilityIdentifier("notice-prefs-error")
            }
            permissionSection
            channelsSection
            quietHoursSection
            doNotDisturbSection
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .tint(ArtaColor.accent)
        .refreshable {
            await load()
            await loadPermission()
        }
        .artaTabBarScrim()
    }

    // MARK: Permiso de iOS

    private enum PermissionState {
        case on, off, undecided, demo, checking
    }

    private var permissionState: PermissionState {
        if DemoMode.isActive { return .demo }
        guard let permission else { return .checking }
        switch permission {
        case .authorized, .provisional, .ephemeral: return .on
        case .denied: return .off
        case .notDetermined: return .undecided
        @unknown default: return .on
        }
    }

    @ViewBuilder
    private var permissionSection: some View {
        Section {
            switch permissionState {
            case .on:
                permissionRow(icon: "bell.badge", title: "Avisos permitidos", detail: "iOS te los muestra según lo que elijas aquí abajo.", status: "Activos", tone: .info)
                settingsButton(prominent: false)
            case .off:
                permissionRow(icon: "bell.slash", title: "Avisos apagados en iOS", detail: "No te llegará nada a este teléfono hasta que los permitas en Ajustes.", status: "Apagados", tone: .warn)
                settingsButton(prominent: true)
            case .undecided:
                permissionRow(icon: "bell", title: "Aún no los has permitido", detail: "Permítelos para enterarte de lo que espera tu decisión.", status: "Pendiente", tone: .warn)
                Button {
                    Task { await askPermission() }
                } label: {
                    HStack(spacing: ArtaSpace.s) {
                        if requestingPermission { ProgressView().tint(ArtaColor.tertiary) }
                        Text("Permitir avisos")
                    }
                }
                .buttonStyle(ArtaPrimaryButtonStyle())
                .disabled(requestingPermission)
                .accessibilityIdentifier("notice-prefs-allow")
            case .demo:
                permissionRow(icon: "sparkles", title: "Modo de muestra", detail: "Con datos de muestra no llegan avisos a este teléfono. Puedes probar las opciones de abajo.", status: nil, tone: .neutral)
            case .checking:
                HStack {
                    Spacer()
                    ProgressView().tint(ArtaColor.tertiary)
                    Spacer()
                }
                .frame(minHeight: 44)
            }
        } header: {
            ArtaSectionHeader("Este teléfono")
        }
        .listRowBackground(ArtaColor.bgElev)
    }

    private func permissionRow(icon: String, title: String, detail: String, status: String?, tone: PillTone) -> some View {
        HStack(alignment: .top, spacing: ArtaSpace.m) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(ArtaColor.muted)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: ArtaSpace.xs)
            if let status { StatusPill(text: status, tone: tone) }
        }
        .padding(.vertical, ArtaSpace.xxs)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("notice-prefs-permission")
    }

    @ViewBuilder
    private func settingsButton(prominent: Bool) -> some View {
        let button = Button {
            Haptics.tap()
            if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                UIApplication.shared.open(url)
            }
        } label: {
            Label(prominent ? "Abrir Ajustes" : "Ajustes de iOS", systemImage: "gearshape")
        }
        .accessibilityIdentifier("notice-prefs-settings")
        if prominent {
            button.buttonStyle(ArtaPrimaryButtonStyle())
        } else {
            button.buttonStyle(ArtaSecondaryButtonStyle())
        }
    }

    // MARK: Categorías

    private var channelsSection: some View {
        Section {
            ForEach(NoticeChannel.allCases) { channel in
                Toggle(isOn: channelBinding(channel)) {
                    HStack(alignment: .top, spacing: ArtaSpace.m) {
                        NoticeIcon(channel: channel, size: 32)
                        VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
                            Text(channel.label)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ArtaColor.text)
                            Text(channel.hint)
                                .font(.caption)
                                .foregroundStyle(ArtaColor.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.vertical, ArtaSpace.xxs)
                }
                .accessibilityIdentifier("notice-pref-\(channel.rawValue)")
            }
        } header: {
            ArtaSectionHeader("Qué te avisamos")
        } footer: {
            Text("Lo que llega a todos tus dispositivos. La pestaña Avisos siempre lo guarda todo.")
        }
        .listRowBackground(ArtaColor.bgElev)
    }

    private func channelBinding(_ channel: NoticeChannel) -> Binding<Bool> {
        Binding(
            get: { !(prefs?.muted.contains(channel.rawValue) ?? false) },
            set: { on in
                guard var next = prefs else { return }
                next.muted.removeAll { $0 == channel.rawValue }
                if !on { next.muted.append(channel.rawValue) }
                Haptics.selection()
                apply(next)
            }
        )
    }

    // MARK: Horario silencioso

    private var quietHoursSection: some View {
        Section {
            Toggle(isOn: quietEnabledBinding.animation(.easeOut(duration: 0.2))) {
                VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
                    Text("Horario silencioso")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ArtaColor.text)
                    Text("De noche solo llega lo urgente; el chat y lo demás te esperan a la mañana.")
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, ArtaSpace.xxs)
            }
            .accessibilityIdentifier("notice-pref-quiet")
            if prefs?.quietHours.enabled == true {
                DatePicker("De", selection: timeBinding(\.start), displayedComponents: .hourAndMinute)
                    .environment(\.locale, Locale(identifier: "es_MX"))
                    .accessibilityIdentifier("notice-pref-quiet-start")
                DatePicker("A", selection: timeBinding(\.end), displayedComponents: .hourAndMinute)
                    .environment(\.locale, Locale(identifier: "es_MX"))
                    .accessibilityIdentifier("notice-pref-quiet-end")
            }
        } header: {
            ArtaSectionHeader("Horario")
        } footer: {
            if let quiet = prefs?.quietHours, quiet.enabled {
                Text(quiet.start == quiet.end
                     ? "Con la misma hora de inicio y de fin, el horario no se aplica."
                     : "Se mide en la hora de Puebla, en todos tus dispositivos.")
            }
        }
        .listRowBackground(ArtaColor.bgElev)
    }

    private var quietEnabledBinding: Binding<Bool> {
        Binding(
            get: { prefs?.quietHours.enabled ?? false },
            set: { on in
                guard var next = prefs else { return }
                next.quietHours.enabled = on
                Haptics.selection()
                apply(next)
            }
        )
    }

    /// El selector puede pasar por varias horas al girar: se guarda cuando se detiene.
    private func timeBinding(_ keyPath: WritableKeyPath<NotificationQuietHours, String>) -> Binding<Date> {
        Binding(
            get: { Self.date(from: prefs?.quietHours[keyPath: keyPath] ?? "00:00") },
            set: { value in
                guard var next = prefs else { return }
                let text = Self.hhmm(from: value)
                guard next.quietHours[keyPath: keyPath] != text else { return }
                next.quietHours[keyPath: keyPath] = text
                apply(next, waitForMore: true)
            }
        )
    }

    private static func date(from hhmm: String) -> Date {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        let cal = Calendar.current
        return cal.date(
            bySettingHour: parts.first ?? 0,
            minute: parts.count > 1 ? parts[1] : 0,
            second: 0,
            of: Date()
        ) ?? Date()
    }

    private static func hhmm(from date: Date) -> String {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02ld:%02ld", parts.hour ?? 0, parts.minute ?? 0)
    }

    // MARK: No molestar

    private var dndActive: Bool { (dndUntil ?? .distantPast) > Date() }

    private var doNotDisturbSection: some View {
        Section {
            Menu {
                if dndActive {
                    Button { setDnd(nil) } label: { Label("Desactivar", systemImage: "bell") }
                }
                Button("1 hora") { setDnd(Date().addingTimeInterval(3_600)) }
                Button("8 horas") { setDnd(Date().addingTimeInterval(8 * 3_600)) }
                Button("Hasta mañana a las 8:00") { setDnd(ChatListModel.tomorrowMorning()) }
            } label: {
                HStack(spacing: ArtaSpace.m) {
                    Image(systemName: dndActive ? "moon.fill" : "moon")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(dndActive ? ArtaColor.accent : ArtaColor.muted)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
                        Text("No molestar")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ArtaColor.text)
                        Text(dndText)
                            .font(.caption)
                            .foregroundStyle(ArtaColor.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: ArtaSpace.s)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(ArtaColor.tertiary)
                }
                .padding(.vertical, ArtaSpace.xxs)
                .contentShape(Rectangle())
            }
            .accessibilityIdentifier("notice-pref-dnd")
        } footer: {
            Text("Por un rato no llega nada, ni lo urgente. Se quita solo.")
        }
        .listRowBackground(ArtaColor.bgElev)
    }

    private var dndText: String {
        guard dndActive, let until = dndUntil else { return "Desactivado" }
        let sameDay = Calendar.current.isDateInToday(until)
        return "Hasta " + until.formatted(date: sameDay ? .omitted : .abbreviated, time: .shortened)
    }

    private func setDnd(_ until: Date?) {
        let previous = dndUntil
        dndUntil = until
        saveError = nil
        Haptics.selection()
        Task {
            do {
                try await ApiClient.shared.setDnd(until: until.map(isoString))
            } catch {
                if error.isModuleCancellation { return }
                dndUntil = previous
                saveError = error.userMessage
                Haptics.error()
            }
        }
    }

    // MARK: Datos

    private func load() async {
        do {
            let fresh = try await ApiClient.shared.notificationPreferences()
            prefs = fresh
            confirmed = fresh
            loadError = nil
            // No molestar es aparte: si falla, el resto de la pantalla sigue.
            let chat = try? await ApiClient.shared.chatPrefs()
            if let chat { dndUntil = parseDate(chat.dndUntil) }
        } catch {
            if error.isModuleCancellation { return }
            if prefs == nil {
                loadError = error.userMessage
            } else {
                saveError = error.userMessage
            }
        }
        loading = false
    }

    /// Se ve de inmediato. `waitForMore`: espera a que dejen de cambiar el valor antes de mandarlo.
    /// Cada envío lleva las preferencias completas, así que el último siempre manda.
    private func apply(_ next: NotificationPrefs, waitForMore: Bool = false) {
        prefs = next
        saveError = nil
        saveTask?.cancel()
        saveTask = Task {
            if waitForMore {
                try? await Task.sleep(nanoseconds: 600_000_000)
                if Task.isCancelled { return }
            }
            do {
                let saved = try await ApiClient.shared.saveNotificationPreferences(next)
                if Task.isCancelled { return }
                prefs = saved
                confirmed = saved
            } catch {
                if Task.isCancelled || error.isModuleCancellation { return }
                prefs = confirmed
                saveError = error.userMessage
                Haptics.error()
            }
        }
    }

    private func loadPermission() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permission = settings.authorizationStatus
    }

    private func askPermission() async {
        requestingPermission = true
        await PushManager.shared.requestPermissionAndRegister()
        await loadPermission()
        requestingPermission = false
    }
}
