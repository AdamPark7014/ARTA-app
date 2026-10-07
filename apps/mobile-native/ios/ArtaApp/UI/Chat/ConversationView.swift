import PhotosUI
import QuickLook
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct ConversationView: View {
    @StateObject private var model: ConversationModel
    @EnvironmentObject private var router: AppRouter
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var presence = PresenceStore.shared
    @ObservedObject private var blocks = ChatBlocks.shared

    @State private var draft = ""
    /// «@Nombre» visible en el borrador → id, para mandar el token `[@Nombre](user:id)`.
    @State private var mentionMap: [String: String] = [:]
    @State private var editing: ChatMessage?
    @State private var replyingTo: ChatMessage?
    @State private var actionTarget: ChatMessage?
    @State private var confirmDelete: ChatMessage?
    /// Reportar y bloquear (docs/chat-reportar-bloquear.md).
    @State private var reportTarget: ChatMessage?
    @State private var blockTarget: BlockTarget?
    /// Aviso breve arriba de los mensajes («Gracias. Un administrador…»).
    @State private var flash: String?
    @State private var showPins = false
    @State private var pinned: [ChatMessage] = []
    @State private var showPhotos = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showFiles = false
    @State private var showCamera = false
    @State private var gallery: GalleryRequest?
    @State private var videoURL: URL?
    @State private var previewURL: URL?
    @State private var shareURL: URL?
    @StateObject private var recorder = VoiceRecorder()
    @State private var olderAnchor: String?
    @State private var onScreen = false
    @State private var highlighted: String?
    @State private var atBottom = true
    @State private var newBelow = 0
    @State private var draftLoaded = false
    @State private var didInitialScroll = false
    @FocusState private var composerFocused: Bool

    private static let bottomId = "conversation-bottom"
    private static let unreadId = "unread-divider"
    private static let composerIcon: CGFloat = 30

    init(channelId: String, parentId: String?, focusMessageId: String?) {
        _model = StateObject(wrappedValue: ConversationModel(channelId: channelId, parentId: parentId, focusMessageId: focusMessageId))
    }

    private var inThread: Bool { model.parentId != nil }
    private var isDirect: Bool { model.channel?.isDirect ?? false }
    private var isPeerOnline: Bool { presence.isOnline(model.channel?.peer?.id) }

    var body: some View {
        VStack(spacing: 0) {
            content
                .fullScreenCover(item: Binding(get: { videoURL.map(IdentifiedURL.init) }, set: { videoURL = $0?.url })) { item in
                    VideoScreen(url: item.url)
                }
                .sheet(item: $actionTarget) { m in
                    MessageActionsSheet(
                        message: m,
                        myId: model.myId,
                        canThread: !inThread,
                        canEdit: model.canEdit(m),
                        canDelete: model.canDelete(m),
                        canReport: model.canReport(m),
                        canBlock: model.canBlock(m)
                    ) { action in
                        actionTarget = nil
                        if case .react(let emoji) = action {
                            model.react(m, emoji)
                            Haptics.react()
                        } else {
                            // Esperar a que cierre la hoja antes de abrir otra cosa (diálogo, teclado).
                            later(0.35) { perform(action, on: m) }
                        }
                    }
                }
                .overlay(alignment: .top) { flashBanner }
                .animation(.easeInOut(duration: 0.2), value: flash)
                .confirmationDialog(
                    blockTitle,
                    isPresented: Binding(get: { blockTarget != nil }, set: { if !$0 { blockTarget = nil } }),
                    titleVisibility: .visible,
                    presenting: blockTarget
                ) { target in
                    Button("Bloquear", role: .destructive) { confirmBlock(target) }
                    Button("Cancelar", role: .cancel) {}
                } message: { _ in
                    Text("No verás sus mensajes y no podrá escribirte por mensaje directo. Puedes desbloquearlo en Más › Usuarios bloqueados.")
                }
            composerArea
                .fullScreenCover(isPresented: $showCamera) {
                    CameraPicker { result in
                        showCamera = false
                        if let result { sendCamera(result) }
                    }
                    .ignoresSafeArea()
                }
                .sheet(item: Binding(get: { shareURL.map(IdentifiedURL.init) }, set: { shareURL = $0?.url })) { item in
                    ActivityView(items: [item.url])
                        .presentationDetents([.medium, .large])
                }
        }
        .background(ArtaColor.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .onAppear {
            onScreen = true
            model.start()
            model.onVisible(scenePhase == .active)
            loadDraft()
            presence.refresh()
            blocks.refresh()
        }
        .onDisappear {
            onScreen = false
            model.onVisible(false)
            ChatAudioPlayer.shared.stop()
            recorder.cancel()
        }
        .onChange(of: scenePhase) { _, phase in
            if onScreen { model.onVisible(phase == .active) }
        }
        .alert("Algo falló", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("Entendido", role: .cancel) { model.error = nil }
        } message: {
            Text(model.error ?? "")
        }
        .confirmationDialog("¿Eliminar este mensaje?", isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }), titleVisibility: .visible) {
            Button("Eliminar para todos", role: .destructive) {
                if let m = confirmDelete { model.delete(m) }
                confirmDelete = nil
            }
        }
        .sheet(isPresented: $showPins) { pinsSheet }
        .sheet(item: $reportTarget) { m in
            ReportMessageSheet(message: m) {
                show("Gracias. Un administrador lo revisará en menos de 24 horas.")
            }
        }
        .fullScreenCover(item: $gallery) { request in
            ImageGallery(request: request)
        }
        .quickLookPreview($previewURL)
        .photosPicker(isPresented: $showPhotos, selection: $photoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            photoItems = []
            sendPicked(items)
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls): sendDocuments(urls)
            case .failure(let error): model.error = error.userMessage
            }
        }
    }

    /// Cargando (esqueleto), error con «Reintentar», o la lista (con su estado vacío).
    @ViewBuilder
    private var content: some View {
        if model.loading && model.messages.isEmpty {
            ChatSkeleton()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let failure = model.loadError, model.messages.isEmpty {
            ChatErrorState(message: failure) { model.retryLoad() }
        } else {
            messageList
        }
    }

    /// La pila de Chats es de `ChatRoute`; desde otra pestaña se abre en Chats.
    private func pushChat(_ route: ChatRoute) {
        if router.tab == .chats {
            router.chatPath.append(route)
        } else {
            router.tab = .chats
            router.chatPath = [.conversation(channelId: model.channelId, focusMessageId: nil), route]
        }
    }

    // MARK: Encabezado

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            if inThread {
                titleBlock
            } else {
                Button { pushChat(.channelInfo(channelId: model.channelId)) } label: { titleBlock }
                    .buttonStyle(.plain)
                    .accessibilityHint("Abre la información de la conversación")
            }
        }
        if !inThread {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { pushChat(.channelInfo(channelId: model.channelId)) } label: {
                        Label(isDirect ? "Detalles" : "Información del canal", systemImage: "info.circle")
                    }
                    Button {
                        showPins = true
                        Task { pinned = await model.pins() }
                    } label: { Label("Mensajes fijados", systemImage: "pin") }
                    Button { pushChat(.saved) } label: { Label("Mensajes guardados", systemImage: "bookmark") }
                    if model.channel?.isMuted == true {
                        Button { model.mute(false, hours: nil) } label: { Label("Quitar silencio", systemImage: "bell") }
                    } else {
                        Menu {
                            Button("8 horas") { model.mute(true, hours: 8) }
                            Button("1 semana") { model.mute(true, hours: 24 * 7) }
                            Button("Siempre") { model.mute(true, hours: nil) }
                        } label: { Label("Silenciar", systemImage: "bell.slash") }
                    }
                    // Directo 1:1: bloquear o desbloquear a la otra persona.
                    if let peer = model.directPeer {
                        if blocks.isBlocked(peer.id) {
                            Button { unblockPeer(peer) } label: {
                                Label("Desbloquear", systemImage: "person.crop.circle.badge.checkmark")
                            }
                            .accessibilityIdentifier("chat-header-unblock")
                        } else {
                            Button(role: .destructive) {
                                blockTarget = BlockTarget(id: peer.id, name: peer.fullName)
                            } label: {
                                Label("Bloquear", systemImage: "hand.raised")
                            }
                            .accessibilityIdentifier("chat-header-block")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Más opciones")
            }
        }
    }

    private var titleBlock: some View {
        HStack(spacing: 8) {
            if !inThread { headerAvatar }
            VStack(alignment: inThread ? .center : .leading, spacing: 1) {
                Text(inThread ? "Hilo" : (model.channel?.displayName ?? "…"))
                    .font(.headline)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(1)
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(subtitleColor)
                        .lineLimit(1)
                }
            }
        }
        .frame(maxWidth: 260)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var headerAvatar: some View {
        if let ch = model.channel {
            if ch.isGroup {
                let others = ch.allMembers.filter { $0.id != model.myId }.map(\.fullName)
                StackedAvatars(names: others.isEmpty ? groupMemberNames(ch.name) : others, size: 30)
            } else if ch.isDirect {
                Avatar(name: ch.displayName, size: 30)
                    .overlay(alignment: .bottomTrailing) {
                        if isPeerOnline { PresenceDot(online: true, size: 10) }
                    }
            } else {
                Avatar(name: ch.displayName, size: 30, channel: true)
            }
        }
    }

    private var subtitleColor: Color {
        if !model.typing.isEmpty { return ArtaColor.gold }
        if !inThread && isDirect && isPeerOnline { return ArtaColor.online }
        return ArtaColor.muted
    }

    /// Única indicación de «escribiendo…»: aquí, sin barra que empuje el composer.
    private var subtitle: String {
        if !model.typing.isEmpty {
            return model.typing.count == 1 ? "\(model.typing[0]) está escribiendo…" : "Varios están escribiendo…"
        }
        if inThread { return model.channel?.displayName ?? "" }
        guard let ch = model.channel else { return "" }
        if ch.isDirect { return isPeerOnline ? "en línea" : (ch.peer?.title ?? "Mensaje directo") }
        if let topic = ch.topic, !topic.isEmpty { return topic }
        var parts: [String] = []
        if let n = ch.memberCount, n > 0 { parts.append(n == 1 ? "1 miembro" : "\(n) miembros") }
        if ch.isMuted { parts.append("silenciado") }
        return parts.joined(separator: " · ")
    }

    // MARK: Mensajes

    private enum RowKind {
        case day(Date)
        case unread
        case message(ChatMessage, showAuthor: Bool, seen: String?)
        case threadDivider(Int)
    }

    private struct Row: Identifiable {
        let id: String
        let kind: RowKind
    }

    private var rows: [Row] {
        var out: [Row] = []
        var lastDay: Date?
        var prev: ChatMessage?
        let me = model.myId
        let lastMine = model.messages.last(where: { $0.author.id == me && !$0.pending && !$0.failed && !$0.isDeleted && !$0.isSystem })?.id
        for (index, m) in model.messages.enumerated() {
            if let day = dayKey(m.createdAt), day != lastDay {
                out.append(Row(id: "day-\(Int(day.timeIntervalSince1970))", kind: .day(day)))
                lastDay = day
                prev = nil
            }
            if m.id == model.unreadMarkerId {
                out.append(Row(id: Self.unreadId, kind: .unread))
                prev = nil
            }
            var grouped = false
            if let p = prev, p.author.id == m.author.id, !p.isSystem, m.replyTo == nil,
               let a = parseDate(p.createdAt), let b = parseDate(m.createdAt), b.timeIntervalSince(a) < 300 {
                grouped = true
            }
            let seen = m.id == lastMine ? model.seenLabel(m) : nil
            out.append(Row(id: m.id, kind: .message(m, showAuthor: !grouped, seen: seen)))
            // Solo si la raíz sigue en la lista (puede salir si se bloqueó a quien la escribió).
            if inThread && index == 0 && m.id == model.parentId {
                out.append(Row(id: "thread-divider", kind: .threadDivider(model.messages.count - 1)))
                prev = nil
            } else {
                prev = m
            }
        }
        return out
    }

    private var messageList: some View {
        GeometryReader { geo in
            let maxBubble = max(200, geo.size.width * 0.78)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 2) {
                        if model.hasMore {
                            ProgressView()
                                .tint(ArtaColor.gold)
                                .padding(12)
                                .onAppear {
                                    olderAnchor = model.messages.first?.id
                                    model.loadOlder()
                                }
                        }
                        ForEach(rows) { row in
                            rowView(row, maxBubble: maxBubble).id(row.id)
                        }
                        if model.hasNewer {
                            ProgressView()
                                .tint(ArtaColor.gold)
                                .padding(12)
                                .onAppear { model.loadNewer() }
                        }
                        Color.clear
                            .frame(height: 1)
                            .id(Self.bottomId)
                            .onAppear {
                                atBottom = true
                                newBelow = 0
                            }
                            .onDisappear { atBottom = false }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                }
                .defaultScrollAnchor(.bottom)
                // `.interactively` + el ancla abajo colgaba la app al arrastrar la conversación con el
                // teclado abierto (el teclado sigue al dedo, el ancla corrige el desplazamiento, y así
                // sin fin; iOS 26, corrida 37651715359). Al empezar a desplazar se baja de una vez.
                .scrollDismissesKeyboard(.immediately)
                .overlay {
                    if model.messages.isEmpty && !model.loading && model.loadError == nil {
                        EmptyState(icon: "hand.wave", title: "Aún no hay mensajes", message: "Escribe el primero.")
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    jumpButton(proxy).animation(.easeOut(duration: 0.2), value: atBottom)
                }
                .onChange(of: model.messages.last?.id) { _, id in
                    guard id != nil, let last = model.messages.last else { return }
                    if atBottom || last.author.id == model.myId {
                        withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(Self.bottomId, anchor: .bottom) }
                    } else if !model.hasNewer {
                        newBelow += 1
                    }
                }
                .onChange(of: model.loadingOlder) { was, now in
                    if was && !now, let anchor = olderAnchor { proxy.scrollTo(anchor, anchor: .top) }
                }
                .onChange(of: model.loading) { _, loading in
                    guard !loading, !didInitialScroll else { return }
                    didInitialScroll = true
                    guard model.unreadMarkerId != nil, model.jumpRequest == nil else { return }
                    let unread = model.unreadAtOpen
                    later(0.15) {
                        proxy.scrollTo(Self.unreadId, anchor: .top)
                        newBelow = unread
                    }
                }
                .onChange(of: model.jumpRequest) { _, request in
                    guard let request else { return }
                    model.jumpRequest = nil
                    highlighted = request.id
                    later(0.15) {
                        withAnimation { proxy.scrollTo(request.id, anchor: .center) }
                    }
                    later(2.5) {
                        withAnimation { if highlighted == request.id { highlighted = nil } }
                    }
                }
                .onChange(of: router.chatJump) { _, jump in
                    guard let jump, jump.channelId == model.channelId, !inThread else { return }
                    router.chatJump = nil
                    model.jump(to: jump.messageId)
                }
            }
        }
    }

    // DispatchQueue.main.asyncAfter recibe un closure @Sendable en el SDK de iOS 18;
    // un Task en el MainActor evita avisos de aislamiento al tocar estado de la vista.
    private func later(_ seconds: Double, _ work: @escaping @MainActor () -> Void) {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            work()
        }
    }

    /// «↓» para volver abajo; con mensajes nuevos debajo, «↓ N nuevos».
    @ViewBuilder
    private func jumpButton(_ proxy: ScrollViewProxy) -> some View {
        if !atBottom || model.hasNewer {
            Button {
                newBelow = 0
                if model.hasNewer {
                    Task {
                        await model.loadLatest()
                        try? await Task.sleep(nanoseconds: 150_000_000)
                        proxy.scrollTo(Self.bottomId, anchor: .bottom)
                    }
                } else {
                    withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(Self.bottomId, anchor: .bottom) }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.down")
                    if newBelow > 0 { Text(newBelow == 1 ? "1 nuevo" : "\(newBelow) nuevos") }
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(newBelow > 0 ? ArtaColor.bg : ArtaColor.text)
                .padding(.horizontal, newBelow > 0 ? 14 : 12)
                .padding(.vertical, 10)
                .background(Capsule().fill(newBelow > 0 ? ArtaColor.gold : ArtaColor.surface2))
                .overlay(Capsule().stroke(ArtaColor.line, lineWidth: newBelow > 0 ? 0 : 1))
                .shadow(color: .black.opacity(0.35), radius: 6, y: 2)
            }
            .buttonStyle(.plain)
            .padding(14)
            .transition(.scale.combined(with: .opacity))
            .accessibilityLabel(newBelow > 0 ? "Ir a los \(newBelow) mensajes nuevos" : "Ir al final")
        }
    }

    @ViewBuilder
    private func rowView(_ row: Row, maxBubble: CGFloat) -> some View {
        switch row.kind {
        case .day(let day):
            Text(dayLabel(day))
                .font(.caption.weight(.medium))
                .foregroundStyle(ArtaColor.muted)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(ArtaColor.bgElev))
                .padding(.vertical, 8)
        case .unread:
            HStack(spacing: 8) {
                Rectangle().fill(ArtaColor.gold.opacity(0.6)).frame(height: 1)
                Text("Mensajes nuevos")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ArtaColor.gold)
                    .fixedSize()
                Rectangle().fill(ArtaColor.gold.opacity(0.6)).frame(height: 1)
            }
            .padding(.vertical, 8)
        case .threadDivider(let count):
            HStack {
                Rectangle().fill(ArtaColor.line).frame(height: 1)
                Text(count == 1 ? "1 respuesta" : "\(count) respuestas")
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
                    .fixedSize()
                Rectangle().fill(ArtaColor.line).frame(height: 1)
            }
            .padding(.vertical, 8)
        case let .message(m, showAuthor, seen):
            if m.isSystem {
                Text(plainText(m.text))
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            } else {
                let interactive = !m.pending && !m.failed && !m.isDeleted
                MessageBubble(
                    message: m,
                    mine: m.author.id == model.myId,
                    showAuthor: showAuthor,
                    showName: !isDirect,
                    read: m.author.id == model.myId && model.readers(m) > 0,
                    seenLabel: seen,
                    highlighted: highlighted == m.id,
                    showReplies: !inThread,
                    myId: model.myId,
                    maxWidth: maxBubble,
                    onReact: { emoji in
                        model.react(m, emoji)
                        Haptics.react()
                    },
                    onMoreReactions: { openActions(m) },
                    onThread: { pushChat(.thread(channelId: model.channelId, rootId: m.id)) },
                    onRetry: { model.retry(m) },
                    onDiscard: { model.discard(m) },
                    onImage: { openImage($0) },
                    onVideo: { videoURL = $0 },
                    onFile: { openFile($0) },
                    onQuote: { model.jump(to: $0) }
                )
                .padding(.top, showAuthor ? 6 : 0)
                .modifier(SwipeToReply(enabled: interactive) { startReply(m) })
                .simultaneousGesture(
                    LongPressGesture(minimumDuration: 0.4).onEnded { _ in openActions(m) },
                    including: m.pending ? .subviews : .all
                )
                .accessibilityAction(named: "Acciones del mensaje") { openActions(m) }
                .accessibilityAction(named: "Responder citando") { if interactive { startReply(m) } }
            }
        }
    }

    private func openActions(_ m: ChatMessage) {
        Haptics.longPress()
        actionTarget = m
    }

    private func perform(_ action: MessageAction, on m: ChatMessage) {
        switch action {
        case .react(let emoji):
            model.react(m, emoji)
            Haptics.react()
        case .reply:
            startReply(m)
        case .thread:
            pushChat(.thread(channelId: model.channelId, rootId: m.id))
        case .copy:
            UIPasteboard.general.string = plainText(m.text)
        case .save:
            model.toggleSave(m)
        case .pin:
            model.togglePin(m)
        case .share:
            if let a = m.attachment { share(a) }
        case .edit:
            startEditing(m)
        case .delete:
            confirmDelete = m
        case .report:
            reportTarget = m
        case .block:
            blockTarget = BlockTarget(id: m.author.id, name: m.author.fullName)
        }
    }

    // MARK: Reportar y bloquear (docs/chat-reportar-bloquear.md)

    private var blockTitle: String {
        guard let target = blockTarget else { return "¿Bloquear?" }
        return "¿Bloquear a \(target.displayName)?"
    }

    /// Sus mensajes desaparecen de esta pantalla en cuanto el API confirma (`ChatBlocks.ids`).
    private func confirmBlock(_ target: BlockTarget) {
        Task {
            if await model.block(target.id, name: target.name) {
                Haptics.success()
                show("Bloqueaste a \(target.displayName)")
            }
        }
    }

    private func unblockPeer(_ peer: ChatPeer) {
        Task {
            if await model.unblock(peer.id) {
                Haptics.success()
                show("Desbloqueaste a \(peer.fullName)")
            }
        }
    }

    private func show(_ text: String) {
        flash = text
        later(3) {
            if flash == text { flash = nil }
        }
    }

    @ViewBuilder
    private var flashBanner: some View {
        if let flash {
            Text(flash)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ArtaColor.bg)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 14).fill(ArtaColor.gold))
                .shadow(color: .black.opacity(0.35), radius: 6, y: 2)
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .transition(.move(edge: .top).combined(with: .opacity))
                .onTapGesture { self.flash = nil }
                .accessibilityIdentifier("chat-flash")
        }
    }

    private func openImage(_ url: URL) {
        let urls = model.messages.compactMap { m -> URL? in
            guard !m.isDeleted, let a = m.attachment, a.isImage else { return nil }
            return ApiConfig.resolve(a.url)
        }
        let list = urls.contains(url) ? urls : [url]
        gallery = GalleryRequest(urls: list, start: list.firstIndex(of: url) ?? 0)
    }

    // MARK: Redactar

    private var mentionQuery: String? {
        guard let range = draft.range(of: #"(^|\s)@([^\s@]{0,30})$"#, options: .regularExpression) else { return nil }
        let match = draft[range]
        guard let at = match.firstIndex(of: "@") else { return nil }
        return String(match[match.index(after: at)...])
    }

    @ViewBuilder
    private var composerArea: some View {
        if let ch = model.channel, !ch.mayPost {
            Text("Solo dirección publica en este canal.")
                .font(.footnote)
                .foregroundStyle(ArtaColor.muted)
                .frame(maxWidth: .infinity)
                .padding(14)
                .background(ArtaColor.bgElev)
        } else {
            VStack(spacing: 0) {
                if let q = mentionQuery {
                    let people = model.mentionCandidates(q)
                    if !people.isEmpty {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(people) { person in
                                    Button { insertMention(person) } label: {
                                        HStack(spacing: 10) {
                                            Avatar(name: person.fullName, size: 28)
                                                .overlay(alignment: .bottomTrailing) {
                                                    if presence.isOnline(person.id) { PresenceDot(online: true, size: 9) }
                                                }
                                            Text(person.fullName).foregroundStyle(ArtaColor.text)
                                            Spacer()
                                        }
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .frame(maxHeight: 180)
                    }
                }
                if let editing {
                    contextBar(
                        icon: "pencil",
                        title: "Editando mensaje",
                        detail: plainText(editing.text),
                        cancelLabel: "Cancelar edición",
                        onCancel: cancelEditing
                    )
                } else if let reply = replyingTo {
                    contextBar(
                        icon: "arrowshape.turn.up.left.fill",
                        title: "Respondiendo a \(reply.author.fullName)",
                        detail: replyExcerpt(reply),
                        cancelLabel: "Cancelar respuesta",
                        onCancel: { replyingTo = nil }
                    )
                }
                if let upload = model.upload { UploadBar(progress: upload) }
                if draft.count > chatMessageLimit - 500 {
                    Text("\(draft.count) / \(chatMessageLimit)")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(draft.count >= chatMessageLimit ? ArtaColor.danger : ArtaColor.muted)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.horizontal, 16)
                        .padding(.top, 4)
                }
                if recorder.isRecording {
                    RecordingBar(recorder: recorder, onCancel: { recorder.cancel() }, onSend: finishRecording)
                } else {
                    composerRow
                }
            }
            .background(ArtaColor.bgElev)
            .overlay(alignment: .top) { Rectangle().fill(ArtaColor.line).frame(height: 0.5) }
        }
    }

    private func contextBar(icon: String, title: String, detail: String, cancelLabel: String, onCancel: @escaping () -> Void) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 15))
                .foregroundStyle(ArtaColor.gold)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption.weight(.semibold)).foregroundStyle(ArtaColor.gold).lineLimit(1)
                Text(detail).font(.caption).foregroundStyle(ArtaColor.muted).lineLimit(1)
            }
            Spacer()
            Button(action: onCancel) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(ArtaColor.muted)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(cancelLabel)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .overlay(alignment: .leading) { Rectangle().fill(ArtaColor.gold).frame(width: 3) }
    }

    private func replyExcerpt(_ m: ChatMessage) -> String {
        if !m.text.isEmpty { return plainText(m.text) }
        return m.attachment?.name ?? "Adjunto"
    }

    private var draftIsEmpty: Bool { draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private var composerRow: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if editing == nil {
                // Se puede seguir adjuntando mientras sube lo anterior: entra a la cola.
                Menu {
                    if CameraPicker.isAvailable {
                        Button { showCamera = true } label: { Label("Cámara", systemImage: "camera") }
                    }
                    Button { showPhotos = true } label: { Label("Fotos y videos", systemImage: "photo.on.rectangle") }
                    Button { showFiles = true } label: { Label("Documento", systemImage: "doc") }
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: Self.composerIcon))
                        .foregroundStyle(model.uploading ? ArtaColor.gold : ArtaColor.muted)
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel("Adjuntar")
            }
            TextField(inThread ? "Responder en el hilo" : "Mensaje", text: $draft, axis: .vertical)
                .lineLimit(1...6)
                .focused($composerFocused)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(minHeight: 36)
                .background(RoundedRectangle(cornerRadius: 18).fill(ArtaColor.surface2))
                .foregroundStyle(ArtaColor.text)
                .tint(ArtaColor.gold)
                .onChange(of: draft) { _, value in onDraftChange(value) }
            if editing == nil && draftIsEmpty {
                Button(action: startRecording) {
                    Image(systemName: "mic.circle.fill")
                        .font(.system(size: Self.composerIcon))
                        .foregroundStyle(ArtaColor.gold)
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel("Grabar nota de voz")
            } else {
                Button(action: submit) {
                    Image(systemName: editing == nil ? "arrow.up.circle.fill" : "checkmark.circle.fill")
                        .font(.system(size: Self.composerIcon))
                        .foregroundStyle(draftIsEmpty ? ArtaColor.muted : ArtaColor.gold)
                        .frame(width: 36, height: 36)
                }
                .disabled(draftIsEmpty)
                .accessibilityLabel(editing == nil ? "Enviar" : "Guardar")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    private func onDraftChange(_ value: String) {
        if value.count > chatMessageLimit {
            draft = String(value.prefix(chatMessageLimit))
            return
        }
        if !value.isEmpty && editing == nil { model.onTyping() }
        if editing == nil && draftLoaded {
            ChatDrafts.save(resolvedDraft(), channelId: model.channelId, parentId: model.parentId)
        }
    }

    private func loadDraft() {
        guard !draftLoaded else { return }
        let saved = ChatDrafts.load(channelId: model.channelId, parentId: model.parentId)
        if !saved.isEmpty { setDraft(fromTokens: saved) }
        draftLoaded = true
    }

    /// Texto con tokens `[@Nombre](user:id)` → borrador visible con «@Nombre» y su mapa de ids.
    private func setDraft(fromTokens text: String) {
        var map: [String: String] = [:]
        if let regex = try? NSRegularExpression(pattern: #"\[@([^\]]{1,80})\]\(user:([\w-]{1,64})\)"#) {
            let ns = text as NSString
            for match in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
                map[ns.substring(with: match.range(at: 1))] = ns.substring(with: match.range(at: 2))
            }
        }
        mentionMap = map
        draft = plainText(text)
    }

    private func insertMention(_ person: ChannelMember) {
        guard let range = draft.range(of: #"@([^\s@]{0,30})$"#, options: .regularExpression) else { return }
        draft.replaceSubrange(range, with: "@\(person.fullName) ")
        mentionMap[person.fullName] = person.id
    }

    /// Borrador con «@Nombre» convertidos al token que entiende el API.
    private func resolvedDraft() -> String {
        var text = draft
        for (name, id) in mentionMap.sorted(by: { $0.key.count > $1.key.count }) {
            text = text.replacingOccurrences(of: "@\(name)", with: mentionToken(name: name, userId: id))
        }
        return text
    }

    private func takeDraft() -> String {
        let text = resolvedDraft()
        draft = ""
        mentionMap = [:]
        ChatDrafts.save("", channelId: model.channelId, parentId: model.parentId)
        return text
    }

    private func takeReply() -> ChatMessage? {
        let reply = replyingTo
        replyingTo = nil
        return reply
    }

    private func submit() {
        if let editing {
            model.edit(editing, resolvedDraft())
            cancelEditing()
            return
        }
        let reply = takeReply()
        model.send(takeDraft(), replyTo: reply)
        Haptics.send()
    }

    private func startReply(_ m: ChatMessage) {
        if editing != nil { cancelEditing() }
        replyingTo = m
        composerFocused = true
    }

    private func startEditing(_ m: ChatMessage) {
        replyingTo = nil
        editing = m
        setDraft(fromTokens: m.text)
        composerFocused = true
    }

    /// Al salir de la edición vuelve el borrador que había (no se guardó mientras se editaba).
    private func cancelEditing() {
        editing = nil
        draft = ""
        mentionMap = [:]
        let saved = ChatDrafts.load(channelId: model.channelId, parentId: model.parentId)
        if !saved.isEmpty { setDraft(fromTokens: saved) }
    }

    // MARK: Adjuntos

    /// Varias fotos y videos de la galería: cada uno en su mensaje.
    private func sendPicked(_ items: [PhotosPickerItem]) {
        let jobs: [@Sendable () async throws -> PreparedUpload] = items.map { item in
            let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
            return { @Sendable in
                if isVideo {
                    guard let movie = try await item.loadTransferable(type: PickedMovie.self) else {
                        throw MediaError("No se pudo leer el video")
                    }
                    return try await MediaPrep.video(at: movie.url, ownsSource: true)
                }
                guard let data = try await item.loadTransferable(type: Data.self) else {
                    throw MediaError("No se pudo leer la foto")
                }
                return try await MediaPrep.photo(data: data)
            }
        }
        let reply = takeReply()
        model.sendFiles(jobs, caption: takeDraft(), replyTo: reply)
    }

    private func sendDocuments(_ urls: [URL]) {
        let jobs: [@Sendable () async throws -> PreparedUpload] = urls.map { url in
            { @Sendable in try await MediaPrep.document(at: url) }
        }
        let reply = takeReply()
        model.sendFiles(jobs, caption: takeDraft(), replyTo: reply)
    }

    private func sendCamera(_ result: CameraPicker.Result) {
        let job: @Sendable () async throws -> PreparedUpload
        switch result {
        case .photo(let image):
            job = { @Sendable in try await MediaPrep.photo(image: image) }
        case .video(let url):
            job = { @Sendable in try await MediaPrep.video(at: url, ownsSource: true) }
        }
        let reply = takeReply()
        model.sendFiles([job], caption: takeDraft(), replyTo: reply)
    }

    private func startRecording() {
        Task {
            do {
                try await recorder.start()
            } catch {
                model.error = error.userMessage
            }
        }
    }

    private func finishRecording() {
        guard let url = recorder.stop() else {
            model.error = "Mantén la grabación al menos un segundo."
            return
        }
        let reply = takeReply()
        model.sendFiles([{ @Sendable in MediaPrep.voice(url) }], caption: "", replyTo: reply)
        Haptics.send()
    }

    private func share(_ attachment: ChatAttachment) {
        guard let url = ApiConfig.resolve(attachment.url) else { return }
        Task {
            do {
                shareURL = try await ApiClient.shared.download(url, suggestedName: attachment.name)
            } catch {
                model.error = error.userMessage
            }
        }
    }

    private func openFile(_ attachment: ChatAttachment) {
        guard let url = ApiConfig.resolve(attachment.url) else { return }
        Task {
            do {
                previewURL = try await ApiClient.shared.download(url, suggestedName: attachment.name)
            } catch {
                model.error = error.userMessage
            }
        }
    }

    // MARK: Fijados

    private var pinsSheet: some View {
        NavigationStack {
            List(pinned) { m in
                Button {
                    showPins = false
                    model.jump(to: m.id)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(m.author.fullName).font(.subheadline.weight(.semibold)).foregroundStyle(ArtaColor.gold)
                            Spacer()
                            Text(relativeTime(m.createdAt)).font(.caption).foregroundStyle(ArtaColor.muted)
                        }
                        Text(plainText(m.text.isEmpty ? (m.attachment?.name ?? "Adjunto") : m.text))
                            .font(.subheadline)
                            .foregroundStyle(ArtaColor.text)
                            .lineLimit(3)
                    }
                }
                .listRowBackground(ArtaColor.bgElev)
            }
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .overlay {
                if pinned.isEmpty { EmptyState(icon: "pin", title: "Nada fijado", message: "Mantén presionado un mensaje para fijarlo.") }
            }
            .navigationTitle("Fijados")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { showPins = false } } }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Bloquear

/// A quién se va a bloquear (menú de un mensaje o encabezado de un directo).
private struct BlockTarget: Identifiable, Equatable {
    let id: String
    let name: String

    var displayName: String {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return n.isEmpty ? "esta persona" : n
    }
}

// MARK: - Deslizar para responder

/// Arrastrar la burbuja hacia la derecha responde citando (como WhatsApp/Slack móvil).
private struct SwipeToReply: ViewModifier {
    let enabled: Bool
    var onReply: () -> Void
    @State private var dx: CGFloat = 0
    @State private var armed = false

    private static let threshold: CGFloat = 60

    func body(content: Content) -> some View {
        content
            .offset(x: dx)
            .background(alignment: .leading) {
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.gold)
                    .opacity(Double(min(1, dx / Self.threshold)))
                    .scaleEffect(armed ? 1.15 : 0.85)
                    .padding(.leading, 4)
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 20)
                    .onChanged { value in
                        let w = value.translation.width
                        guard w > 0, w > abs(value.translation.height) * 1.6 else { return }
                        dx = min(90, w * 0.7)
                        if dx >= Self.threshold && !armed {
                            armed = true
                            Haptics.react()
                        }
                    }
                    .onEnded { _ in
                        if armed { onReply() }
                        armed = false
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { dx = 0 }
                    },
                including: enabled ? .all : .subviews
            )
    }
}

// MARK: - Burbuja

struct MessageBubble: View {
    let message: ChatMessage
    let mine: Bool
    let showAuthor: Bool
    let showName: Bool
    let read: Bool
    let seenLabel: String?
    let highlighted: Bool
    let showReplies: Bool
    let myId: String
    let maxWidth: CGFloat
    var onReact: (String) -> Void
    var onMoreReactions: () -> Void
    var onThread: () -> Void
    var onRetry: () -> Void
    var onDiscard: () -> Void
    var onImage: (URL) -> Void
    var onVideo: (URL) -> Void
    var onFile: (ChatAttachment) -> Void
    var onQuote: (String) -> Void

    private var linkURL: String? {
        guard !message.isDeleted, message.attachment == nil, !message.pending else { return nil }
        return ChatMarkdown.firstURL(in: message.text)
    }

    /// Mensaje corto de una línea: la hora va en la misma línea que el texto.
    private var inlineMeta: Bool {
        guard !message.isDeleted, message.attachment == nil, message.replyTo == nil, linkURL == nil else { return false }
        let text = message.text
        guard !text.isEmpty, !text.contains("\n"), !text.contains("```") else { return false }
        return plainText(text).count <= 28
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if mine {
                Spacer(minLength: 0)
            } else if showName {
                if showAuthor { Avatar(name: message.author.fullName, size: 30) } else { Color.clear.frame(width: 30, height: 1) }
            }
            VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
                bubble
                if !message.allReactions.isEmpty && !message.isDeleted { reactions }
                if showReplies && message.replies > 0 {
                    Button(action: onThread) {
                        Text(message.replies == 1 ? "1 respuesta ›" : "\(message.replies) respuestas ›")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ArtaColor.gold)
                    }
                    .buttonStyle(.plain)
                }
                if message.failed {
                    HStack(spacing: 12) {
                        Text("No se envió").foregroundStyle(ArtaColor.danger)
                        Button("Reintentar", action: onRetry).foregroundStyle(ArtaColor.gold)
                        Button("Descartar", action: onDiscard).foregroundStyle(ArtaColor.muted)
                    }
                    .font(.caption)
                }
                if let seenLabel {
                    Text(seenLabel)
                        .font(.caption2)
                        .foregroundStyle(ArtaColor.muted)
                }
            }
            .frame(maxWidth: maxWidth, alignment: mine ? .trailing : .leading)
            if !mine { Spacer(minLength: 0) }
        }
    }

    private var bubble: some View {
        BubbleStack(spacing: 4) {
            if showName && showAuthor && !mine {
                Text(message.author.fullName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ArtaColor.gold)
            }
            if message.pinnedAt != nil && !message.isDeleted {
                Label("Fijado", systemImage: "pin.fill")
                    .font(.caption2)
                    .foregroundStyle(ArtaColor.muted)
            }
            if let ref = message.replyTo, !message.isDeleted {
                QuoteBlock(ref: ref)
                    .onTapGesture { onQuote(ref.id) }
            }
            if message.isDeleted {
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    Label("Mensaje eliminado", systemImage: "nosign")
                        .font(.subheadline.italic())
                        .foregroundStyle(ArtaColor.muted)
                    meta
                }
            } else if inlineMeta {
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    ChatRichText(source: message.text)
                    meta
                }
            } else {
                if let attachment = message.attachment {
                    AttachmentContent(attachment: attachment, mine: mine, onImage: onImage, onVideo: onVideo, onFile: onFile)
                }
                if !message.text.isEmpty {
                    ChatRichText(source: message.text)
                }
                if let linkURL {
                    LinkPreviewCard(url: linkURL)
                }
                meta
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 16).fill(message.isDeleted ? Color.clear : (mine ? ArtaColor.mine : ArtaColor.bgElev)))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(bubbleStroke, lineWidth: highlighted ? 1.5 : 1))
        .opacity(message.pending ? 0.75 : 1)
    }

    private var bubbleStroke: Color {
        if highlighted { return ArtaColor.gold }
        return message.isDeleted ? ArtaColor.line : Color.clear
    }

    private var meta: some View {
        HStack(spacing: 4) {
            if message.isSaved && !message.isDeleted {
                Image(systemName: "bookmark.fill").foregroundStyle(ArtaColor.gold).accessibilityLabel("Guardado")
            }
            if message.editedAt != nil && !message.isDeleted { Text("editado") }
            Text(messageTime(message.createdAt))
            if mine && !message.isDeleted { tick }
        }
        .font(.caption2)
        .foregroundStyle(ArtaColor.muted)
        .fixedSize()
    }

    @ViewBuilder
    private var tick: some View {
        if message.pending {
            Image(systemName: "clock")
        } else if message.failed {
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(ArtaColor.danger)
        } else if read {
            Text("✓✓").foregroundStyle(ArtaColor.read).accessibilityLabel("Leído")
        } else {
            Text("✓").accessibilityLabel("Enviado")
        }
    }

    private var reactions: some View {
        FlowLayout(spacing: 6) {
            ForEach(message.allReactions, id: \.emoji) { r in
                let reacted = r.userIds?.contains(myId) ?? false
                Button { onReact(r.emoji) } label: {
                    HStack(spacing: 4) {
                        Text(r.emoji)
                        Text("\(r.count)").font(.caption.weight(.semibold))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(reacted ? ArtaColor.goldSoft : ArtaColor.surface2))
                    .overlay(Capsule().stroke(reacted ? ArtaColor.gold : Color.clear))
                    .foregroundStyle(ArtaColor.text)
                }
                .buttonStyle(.plain)
                .contextMenu {
                    if let users = r.users, !users.isEmpty {
                        ForEach(users, id: \.id) { u in
                            Text(u.id == myId ? "Tú" : u.fullName)
                        }
                    } else {
                        Text(r.count == 1 ? "1 persona" : "\(r.count) personas")
                    }
                }
                .accessibilityLabel("\(r.emoji) \(r.count)")
            }
            Button(action: onMoreReactions) {
                Image(systemName: "face.smiling")
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(ArtaColor.surface2))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Agregar reacción")
        }
    }
}

// MARK: - Piezas

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, width: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            width = max(width, x - spacing)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// Columna de la burbuja: el contenido alineado a la izquierda y la última
/// fila (hora y palomitas) a la derecha, con el ancho del contenido y no el de la pantalla.
struct BubbleStack: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let limit = ProposedViewSize(width: proposal.width, height: nil)
        let sizes = subviews.map { $0.sizeThatFits(limit) }
        let width = min(sizes.map(\.width).max() ?? 0, proposal.width ?? .infinity)
        let height = sizes.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, sizes.count - 1))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let limit = ProposedViewSize(width: bounds.width, height: nil)
        var y = bounds.minY
        for (index, view) in subviews.enumerated() {
            let size = view.sizeThatFits(limit)
            let x = index == subviews.count - 1 ? bounds.maxX - size.width : bounds.minX
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: size.width, height: size.height))
            y += size.height + spacing
        }
    }
}

struct TypingDots: View {
    var body: some View {
        TimelineView(.animation) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(ArtaColor.gold)
                        .frame(width: 5, height: 5)
                        .opacity(0.3 + 0.7 * abs(sin(t * 3 + Double(i) * 0.6)))
                }
            }
        }
    }
}

struct IdentifiedURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
