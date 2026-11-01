import Combine
import SwiftUI

/// Avisos de una parte de la lista («Hoy», «Ayer», «Antes»).
struct NoticeSection: Identifiable {
    let group: NoticeGroup
    let items: [NotificationDto]

    var id: String { group.rawValue }
}

/// Bandeja de avisos con dos paginaciones: «Todos» recorre `GET notifications` y «Sin leer» /
/// «Por atender» recorren `unread=1`. Las dos alimentan la misma lista (sin repetidos, de lo más
/// nuevo a lo más viejo), así marcar uno como leído se ve igual en cualquier filtro.
/// «Enviados» es otra lista con su propio modelo (`SentNoticesModel`): aquí no pinta nada.
@MainActor
final class NotificationsModel: ObservableObject {
    enum Filter: String, CaseIterable, Identifiable {
        case all, unread, action, sent

        var id: String { rawValue }

        var title: String {
            switch self {
            case .all: return "Todos"
            case .unread: return "Sin leer"
            case .action: return "Por atender"
            case .sent: return "Enviados"
            }
        }

        /// «Sin leer» y «Por atender» recorren `unread=1`.
        var usesUnreadPages: Bool { self == .unread || self == .action }
    }

    private struct Cursor {
        /// `createdAt` de la última fila de esta paginación.
        var before: String?
        var hasMore = false
        var loaded = false
    }

    private static let pageSize = 50
    /// Tope de `POST notifications/seen`.
    private static let seenBatch = 200

    @Published private(set) var items: [NotificationDto] = []
    @Published private(set) var filter: Filter = .all
    @Published private(set) var loading = true
    @Published private(set) var loadError: String?
    /// Primera página de «sin leer», al cambiar de filtro por primera vez.
    @Published private(set) var filterLoading = false
    @Published private(set) var loadingMore = false
    @Published private(set) var moreError: String?
    /// Lo que va en el globo de la pestaña y en «Sin leer · N».
    @Published private(set) var unreadTotal = 0
    @Published private(set) var flash: String?
    @Published private var allCursor = Cursor()
    @Published private var unreadCursor = Cursor()

    /// Del API, porque con páginas por cargar no se puede contar en la lista.
    private var serverUnread: Int?
    private var flashTask: Task<Void, Never>?
    private var bag = Set<AnyCancellable>()

    // Acuse de visto (docs/AVISOS.md). Nada de esto se publica: no cambia lo que se pinta.
    /// La pantalla dice que se está viendo. La lista también se trae en segundo plano (socket) y eso no cuenta.
    private var screenVisible = false
    /// Filas que la lista tiene pintadas ahora: de 50 bajadas, a la vista solo están unas cuantas.
    private var rowsInView = Set<String>()
    /// Ya mandados o en camino. Si la llamada falla se olvidan y se reintenta la próxima vez que estén a la vista.
    private var seenSent = Set<String>()
    private var seenFlush: Task<Void, Never>?

    init() {
        let rt = RealtimeClient.shared
        // Ráfagas (varios avisos seguidos, o el aviso y su lectura) → una sola recarga.
        rt.notificationsUnread.map { _ in () }
            .merge(with: rt.connected.filter { $0 }.map { _ in () })
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] in Task { await self?.load() } }
            .store(in: &bag)
        rt.notificationRead
            .sink { [weak self] event in Task { await self?.applyRemoteRead(event) } }
            .store(in: &bag)
    }

    // MARK: Lo que se ve

    var visible: [NotificationDto] {
        switch filter {
        case .all: return items
        case .unread: return items.filter { !$0.isRead }
        case .action: return items.filter { !$0.isRead && NoticeKinds.needsAction($0.type) }
        case .sent: return []
        }
    }

    var sections: [NoticeSection] {
        let byGroup = Dictionary(grouping: visible) { NoticeKinds.group($0.createdAt) }
        return NoticeGroup.allCases.compactMap { group in
            guard let rows = byGroup[group], !rows.isEmpty else { return nil }
            return NoticeSection(group: group, items: rows)
        }
    }

    /// Ya se bajó la lista al menos una vez: antes de eso el conteo local no dice nada.
    var hasLoaded: Bool { allCursor.loaded }

    /// Hay más que traer, o la primera página de este filtro falló y se puede reintentar.
    var canLoadMore: Bool {
        switch filter {
        case .all: return allCursor.hasMore
        case .unread, .action: return unreadCursor.loaded ? unreadCursor.hasMore : moreError != nil
        case .sent: return false
        }
    }

    // MARK: Carga

    /// `reset`: vuelve a la primera página (tirar para actualizar). Sin él, pone al día lo más
    /// reciente sin perder lo que ya se bajó (al volver a la pestaña o con un aviso nuevo).
    func load(reset: Bool = false, announceErrors: Bool = false) async {
        do {
            let fresh = try await ApiClient.shared.notifications(take: Self.pageSize)
            // Llegaron más de una página mientras no se veía: lo bajado antes ya no empata con esto.
            let disconnected = fresh.count == Self.pageSize && !items.isEmpty
                && !items.contains { $0.id == fresh.last?.id }
            let replace = reset || disconnected
            if replace || !allCursor.loaded {
                allCursor = Cursor(before: fresh.last?.createdAt, hasMore: fresh.count == Self.pageSize, loaded: true)
            }
            if replace {
                items = Self.sorted(fresh)
                unreadCursor = Cursor()
                scheduleSeen()
            } else {
                merge(fresh)
            }
            loadError = nil
            loading = false
            if replace && filter.usesUnreadPages { await loadFirstUnreadPage() }
            await refreshUnreadTotal()
        } catch {
            // Se canceló (salió de la pestaña): la siguiente vez que aparezca vuelve a cargar.
            if error.isModuleCancellation { return }
            if items.isEmpty {
                loadError = error.userMessage
            } else if announceErrors {
                show(error.userMessage)
            }
            loading = false
        }
    }

    func refresh() async {
        await load(reset: true, announceErrors: true)
    }

    func retry() {
        loading = true
        loadError = nil
        Task { await load() }
    }

    func select(_ next: Filter) {
        guard next != filter else { return }
        Haptics.selection()
        withAnimation(.snappy(duration: 0.22)) { filter = next }
        moreError = nil
        if next.usesUnreadPages && !unreadCursor.loaded {
            Task { await loadFirstUnreadPage() }
        }
    }

    private func loadFirstUnreadPage() async {
        filterLoading = true
        do {
            let rows = try await ApiClient.shared.notifications(take: Self.pageSize, unreadOnly: true)
            unreadCursor = Cursor(before: rows.last?.createdAt, hasMore: rows.count == Self.pageSize, loaded: true)
            merge(rows)
            moreError = nil
        } catch {
            if !error.isModuleCancellation { moreError = error.userMessage }
        }
        filterLoading = false
        updateUnreadTotal()
    }

    func loadMore() async {
        guard !loadingMore, !filterLoading, filter != .sent else { return }
        let unreadOnly = filter.usesUnreadPages
        let cursor = unreadOnly ? unreadCursor : allCursor
        if unreadOnly && !cursor.loaded {
            await loadFirstUnreadPage()
            return
        }
        guard cursor.hasMore, let before = cursor.before else { return }
        loadingMore = true
        moreError = nil
        do {
            let rows = try await ApiClient.shared.notifications(take: Self.pageSize, before: before, unreadOnly: unreadOnly)
            let next = Cursor(before: rows.last?.createdAt ?? before, hasMore: rows.count == Self.pageSize, loaded: true)
            if unreadOnly { unreadCursor = next } else { allCursor = next }
            merge(rows)
        } catch {
            if !error.isModuleCancellation { moreError = error.userMessage }
        }
        loadingMore = false
        updateUnreadTotal()
    }

    /// La fila del final entra en pantalla: en «Todos» se carga sola; en los filtros, con el botón
    /// (lo filtrado puede ser poco y la fila no volvería a aparecer).
    func footerAppeared() {
        guard filter == .all, moreError == nil else { return }
        Task { await loadMore() }
    }

    private func merge(_ rows: [NotificationDto]) {
        var byId = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        for row in rows { byId[row.id] = row }
        items = Self.sorted(Array(byId.values))
        updateUnreadTotal()
        scheduleSeen()
    }

    private static func sorted(_ rows: [NotificationDto]) -> [NotificationDto] {
        rows.sorted { a, b in
            a.createdAt == b.createdAt ? a.id > b.id : a.createdAt > b.createdAt
        }
    }

    // MARK: Visto

    /// Se ve o se dejó de ver la bandeja. Salir antes de que salga la llamada no cuenta como visto.
    func setOnScreen(_ onScreen: Bool) {
        screenVisible = onScreen
        if onScreen {
            scheduleSeen()
        } else {
            seenFlush?.cancel()
            seenFlush = nil
        }
    }

    func rowAppeared(_ id: String) {
        rowsInView.insert(id)
        scheduleSeen()
    }

    func rowDisappeared(_ id: String) {
        rowsInView.remove(id)
    }

    /// Las filas aparecen en ráfaga al pintar o al desplazar: una sola llamada, y lo que pasó de
    /// largo en un deslizón rápido no alcanza a contar.
    private func scheduleSeen() {
        guard screenVisible, seenFlush == nil else { return }
        seenFlush = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            self?.flushSeen()
        }
    }

    /// Manda lo que está a la vista justo ahora. La pestaña y la pila se preguntan aquí otra vez: una
    /// pestaña oculta puede enterarse tarde de que ya no se ve. Un error nunca se le enseña a la persona.
    private func flushSeen() {
        seenFlush = nil
        let router = AppRouter.shared
        guard screenVisible, router.tab == .avisos, router.avisosPath.isEmpty, !DemoMode.isActive else { return }
        let pending = visible.filter { row in
            rowsInView.contains(row.id) && row.seenAt == nil && row.readAt == nil && !seenSent.contains(row.id)
        }
        guard !pending.isEmpty else { return }
        let ids = pending.prefix(Self.seenBatch).map { $0.id }
        seenSent.formUnion(ids)
        Task { [weak self] in
            do {
                try await ApiClient.shared.notificationsSeen(ids)
            } catch {
                self?.seenSent.subtract(ids)
            }
        }
        if pending.count > ids.count { scheduleSeen() }
    }

    // MARK: Leídos

    /// Optimista: si el API falla, el aviso vuelve a «sin leer».
    func markRead(_ item: NotificationDto) {
        guard !item.isRead, let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        withAnimation(.easeOut(duration: 0.2)) { items[index].readAt = isoNow() }
        adjustServerUnread(by: -1)
        PushManager.removeDeliveredNotices(notificationId: item.id)
        Task {
            do {
                try await ApiClient.shared.notificationRead(item.id)
            } catch {
                if error.isModuleCancellation { return }
                if let i = items.firstIndex(where: { $0.id == item.id }) { items[i].readAt = nil }
                adjustServerUnread(by: 1)
                Haptics.error()
                show("No se pudo marcar como leído. \(error.userMessage)")
            }
        }
    }

    func readAll() {
        let previous = items
        let previousServer = serverUnread
        let stamp = isoNow()
        withAnimation(.easeOut(duration: 0.2)) {
            items = items.map { row in
                var copy = row
                if copy.readAt == nil { copy.readAt = stamp }
                return copy
            }
        }
        serverUnread = 0
        updateUnreadTotal()
        Haptics.success()
        Task {
            do {
                try await ApiClient.shared.notificationsReadAll()
            } catch {
                if error.isModuleCancellation { return }
                withAnimation(.easeOut(duration: 0.2)) { items = previous }
                serverUnread = previousServer
                updateUnreadTotal()
                Haptics.error()
                show("No se pudo marcar todo como leído. \(error.userMessage)")
            }
        }
    }

    private func applyRemoteRead(_ event: NotificationReadEvent) async {
        guard let id = event.notificationId else {
            await load(reset: true)
            return
        }
        guard let index = items.firstIndex(where: { $0.id == id }), items[index].readAt == nil else { return }
        withAnimation(.easeOut(duration: 0.2)) { items[index].readAt = isoNow() }
        adjustServerUnread(by: -1)
    }

    private func adjustServerUnread(by delta: Int) {
        if let serverUnread { self.serverUnread = max(serverUnread + delta, 0) }
        updateUnreadTotal()
    }

    /// Con todo bajado se cuenta en la lista; con páginas pendientes pregunta al API.
    private func refreshUnreadTotal() async {
        if allCursor.hasMore || unreadCursor.hasMore {
            let count = try? await ApiClient.shared.notificationsUnread()
            if let count { serverUnread = count }
        }
        updateUnreadTotal()
    }

    private func updateUnreadTotal() {
        let local = items.filter { !$0.isRead }.count
        if allCursor.hasMore || unreadCursor.hasMore, let serverUnread {
            unreadTotal = max(serverUnread, local)
        } else {
            unreadTotal = local
        }
    }

    private func show(_ text: String) {
        flashTask?.cancel()
        flash = text
        flashTask = Task {
            try? await Task.sleep(nanoseconds: 3_500_000_000)
            if !Task.isCancelled { flash = nil }
        }
    }
}

/// Bandeja de avisos de todos los procesos (OC, formatos, tareas, menciones…): por día, con filtro
/// arriba, ícono lleno si espera algo de quien lo lee y deslizar para marcar como leído.
struct NotificationsView: View {
    let onUnreadChange: (Int) -> Void

    @EnvironmentObject private var router: AppRouter
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = NotificationsModel()
    /// Aquí y no dentro de «Enviados»: al cambiar de filtro no se pierde lo ya bajado.
    @StateObject private var sent = SentNoticesModel()
    /// «hace 5 min» sigue siendo cierto mientras la pantalla está abierta.
    @State private var now = Date()

    private static let minuteTicker = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    /// La bandeja se está viendo: su pestaña, sin nada encima y con la app en primer plano.
    private var isOnScreen: Bool {
        scenePhase == .active && router.tab == .avisos && router.avisosPath.isEmpty
    }

    var body: some View {
        content
            .artaScreenBackground(glow: false)
            .safeAreaInset(edge: .top, spacing: 0) { filterBar }
            .navigationTitle("Avisos")
            // Con el filtro fijo arriba el título grande no se muestra (igual que Tareas).
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if model.unreadTotal > 0 && model.filter != .sent {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Leer todo") { model.readAll() }
                            .accessibilityIdentifier("notice-read-all")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Haptics.tap()
                        router.open(AppRoute.notificationPreferences)
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                    .accessibilityLabel("Preferencias de avisos")
                    .accessibilityIdentifier("notice-prefs")
                }
            }
            .task {
                now = Date()
                await model.load()
                // Sin red no se toca el globo: se queda el último que dio el servidor.
                if model.hasLoaded { onUnreadChange(model.unreadTotal) }
            }
            .onChange(of: model.unreadTotal) { _, total in onUnreadChange(total) }
            .onReceive(Self.minuteTicker) { now = $0 }
            .onAppear { model.setOnScreen(isOnScreen) }
            .onDisappear { model.setOnScreen(false) }
            .onChange(of: isOnScreen) { _, visible in model.setOnScreen(visible) }
            // `initial`: si el aviso abre la app, la pantalla nace con el pedido ya hecho.
            .onChange(of: router.wantsSentNotices, initial: true) { _, wanted in
                guard wanted else { return }
                router.wantsSentNotices = false
                model.select(.sent)
            }
    }

    // MARK: Contenido

    @ViewBuilder
    private var content: some View {
        if model.filter == .sent {
            SentNoticesView(model: sent, now: now) { row in openSent(row) }
        } else if model.loading && model.items.isEmpty {
            NotificationsSkeleton()
        } else if let error = model.loadError, model.items.isEmpty {
            ModuleErrorView(message: error) { model.retry() }
        } else {
            list
        }
    }

    private var list: some View {
        List {
            ForEach(model.sections) { section in
                Section {
                    ForEach(section.items) { item in row(item) }
                } header: {
                    ArtaSectionHeader(section.group.rawValue)
                        .padding(.horizontal, ArtaLayout.gutter)
                        .padding(.vertical, ArtaSpace.s)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        // Al quedar fijo arriba tapa lo que sube, sin la barra gris del sistema.
                        .background(ArtaColor.bg)
                        .listRowInsets(EdgeInsets())
                }
            }
            if model.canLoadMore { footer }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .overlay { emptyOverlay }
        .refreshable { await model.refresh() }
        .artaTabBarScrim(glow: false)
        .flashToast(model.flash)
    }

    private func row(_ item: NotificationDto) -> some View {
        Button {
            open(item)
        } label: {
            NotificationRow(item: item, now: now)
        }
        .listRowBackground(Color.clear)
        .listRowSeparatorTint(ArtaColor.line)
        .listRowInsets(EdgeInsets(top: ArtaSpace.m, leading: ArtaLayout.gutter, bottom: ArtaSpace.m, trailing: ArtaLayout.gutter))
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            if !item.isRead {
                Button {
                    Haptics.selection()
                    model.markRead(item)
                } label: {
                    Label("Leído", systemImage: "checkmark")
                }
                // El sistema pinta blanco encima: sobre la plata de Auditorio no se leería.
                .tint(ArtaTheme.isLight ? ArtaColor.accent : ArtaColor.surface2)
            }
        }
        .accessibilityIdentifier("notice-row-\(item.id)")
        .onAppear { model.rowAppeared(item.id) }
        .onDisappear { model.rowDisappeared(item.id) }
    }

    private var footer: some View {
        Button {
            Task { await model.loadMore() }
        } label: {
            VStack(spacing: ArtaSpace.xs) {
                if let failure = model.moreError {
                    Text(failure)
                        .font(.caption)
                        .foregroundStyle(ArtaColor.danger)
                        .multilineTextAlignment(.center)
                }
                HStack(spacing: ArtaSpace.s) {
                    if model.loadingMore || model.filterLoading { ProgressView().tint(ArtaColor.tertiary) }
                    Text(footerTitle)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ArtaColor.muted)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(model.loadingMore || model.filterLoading)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .onAppear { model.footerAppeared() }
        .accessibilityIdentifier("notice-load-more")
    }

    private var footerTitle: String {
        if model.loadingMore || model.filterLoading { return "Cargando…" }
        return model.moreError == nil ? "Ver avisos anteriores" : "Reintentar"
    }

    /// Vacío según el filtro. Si aún hay páginas por traer se queda el botón del final.
    @ViewBuilder
    private var emptyOverlay: some View {
        if model.visible.isEmpty && !model.canLoadMore {
            Group {
                if model.filterLoading {
                    ProgressView().tint(ArtaColor.tertiary)
                } else {
                    switch model.filter {
                    case .all:
                        EmptyState(icon: "bell", title: "Sin avisos por ahora", message: "Aquí verás órdenes de compra, formatos y tareas que requieren tu atención.")
                    case .unread:
                        EmptyState(icon: "checkmark.circle", title: "Todo al día", message: "No tienes avisos sin leer.")
                    case .action:
                        EmptyState(icon: "checkmark.seal", title: "Nada por atender", message: "Cuando algo espere tu decisión aparecerá aquí.")
                    case .sent:
                        EmptyView()
                    }
                }
            }
            // Tirar para actualizar también funciona sobre el vacío.
            .allowsHitTesting(false)
        }
    }

    private var filterBar: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: ArtaSpace.s) {
                    ForEach(NotificationsModel.Filter.allCases) { item in
                        FilterChip(title: chipTitle(item), isOn: model.filter == item) {
                            model.select(item)
                        }
                        .accessibilityIdentifier("notice-filter-\(item.rawValue)")
                        .id(item)
                    }
                }
                .padding(.horizontal, ArtaLayout.gutter)
            }
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            // Con cuatro filtros, «Enviados» puede quedar cortado al abrirlo desde un aviso.
            .onChange(of: model.filter) { _, next in
                withAnimation(.snappy(duration: 0.22)) { proxy.scrollTo(next, anchor: .center) }
            }
        }
        .artaHorizontalEdgeFade(ArtaLayout.gutter)
        .padding(.vertical, ArtaSpace.xxs)
        .background(ArtaColor.bg)
    }

    private func chipTitle(_ item: NotificationsModel.Filter) -> String {
        guard item == .unread, model.unreadTotal > 0 else { return item.title }
        return "\(item.title) · \(model.unreadTotal > 99 ? "99+" : String(model.unreadTotal))"
    }

    private func open(_ item: NotificationDto) {
        model.markRead(item)
        // Lo que no tiene pantalla nativa se abre en la vista web dentro de la app.
        if let target = PanelLink.target(channelId: nil, messageId: nil, url: item.linkUrl, type: item.type) {
            router.follow(target)
        }
    }

    /// Sin tipo: quien pidió una autorización no es quien aprueba, así que va a su liga y no a Aprobaciones.
    private func openSent(_ row: SentNotice) {
        if let target = PanelLink.target(channelId: nil, messageId: nil, url: row.linkUrl, type: nil) {
            router.follow(target)
        }
    }
}

// MARK: - Fila

private struct NotificationRow: View {
    let item: NotificationDto
    let now: Date

    private var channel: NoticeChannel { NoticeChannel.of(item.type) }

    private var meta: String {
        let age = NoticeKinds.age(item.createdAt, now: now)
        return age.isEmpty ? channel.label : "\(channel.label) · \(age)"
    }

    var body: some View {
        HStack(alignment: .top, spacing: ArtaSpace.m) {
            NoticeIcon(channel: channel, filled: NoticeKinds.needsAction(item.type), symbol: NoticeKinds.symbol(item.type))
            VStack(alignment: .leading, spacing: ArtaSpace.xs) {
                Text(item.title)
                    .font(.subheadline.weight(item.isRead ? .regular : .semibold))
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let text = item.body, !text.isEmpty {
                    Text(plainText(text))
                        .font(.footnote)
                        .monospacedDigit()
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: ArtaSpace.s) {
                    Text(meta)
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(ArtaColor.tertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                    if let count = item.bundleCount, count > 1 {
                        QuietCount(count: count)
                            .accessibilityLabel("\(count) avisos juntos")
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // Punto de «sin leer» siempre en su columna: las filas leídas no se corren.
            Circle()
                .fill(item.isRead ? Color.clear : ArtaColor.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 6)
                .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(item.isRead ? "" : "Sin leer")
    }
}

/// Ícono de la categoría: lleno si el aviso espera algo de quien lo lee, contorno si es para
/// enterarse. Círculo en ARTA; cuadrado de 4 pt en Auditorio.
struct NoticeIcon: View {
    let channel: NoticeChannel
    var filled = false
    var size: CGFloat = 36
    /// Ícono propio del tipo (`NoticeKinds.symbol`); sin él, el de la categoría.
    var symbol: String? = nil

    var body: some View {
        let shape = ArtaControlShape()
        Image(systemName: symbol ?? channel.icon)
            .font(.system(size: size * 0.42, weight: .medium))
            .foregroundStyle(filled ? ArtaColor.onAccent : ArtaColor.muted)
            .frame(width: size, height: size)
            .background(shape.fill(filled ? ArtaColor.accentFill : AnyShapeStyle(Color.clear)))
            .overlay(shape.strokeBorder(filled ? Color.clear : ArtaColor.lineStrong, lineWidth: 1))
            .accessibilityHidden(true)
    }
}

/// Esqueleto de avisos mientras llega la primera carga (bandeja y «Enviados»).
struct NotificationsSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            SkeletonBar(width: 44, height: 9)
            ForEach(0..<6, id: \.self) { i in
                HStack(alignment: .top, spacing: ArtaSpace.m) {
                    ArtaControlShape().fill(ArtaColor.surface2).frame(width: 36, height: 36)
                    VStack(alignment: .leading, spacing: 8) {
                        SkeletonBar(width: CGFloat(160 + (i * 43) % 80), height: 12)
                        SkeletonBar(width: CGFloat(220 + (i * 31) % 60), height: 9)
                        SkeletonBar(width: 90, height: 8)
                    }
                    Spacer(minLength: 0)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, ArtaLayout.gutter)
        .padding(.top, ArtaSpace.m)
        .artaShimmer()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando avisos")
    }
}
