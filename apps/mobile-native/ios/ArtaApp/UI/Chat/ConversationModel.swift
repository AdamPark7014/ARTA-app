import Combine
import Foundation
import UIKit

/// [fraction] nil mientras se prepara (convirtiendo el video, comprimiendo la foto…).
struct UploadProgress: Equatable {
    let label: String
    let index: Int
    let total: Int
    let fraction: Double?
}

/// Pedido de desplazarse a un mensaje (búsqueda, fijados, cita). `token` hace que
/// pedir dos veces el mismo mensaje vuelva a disparar el salto.
struct JumpRequest: Equatable {
    let id: String
    let token = UUID()
}

/// Estado de una conversación o de un hilo (mismo flujo que `ConversationViewModel` en Android).
@MainActor
final class ConversationModel: ObservableObject {
    static let editWindow: TimeInterval = 60 * 60

    let channelId: String
    /// Id del mensaje raíz cuando la pantalla es un hilo.
    let parentId: String?

    @Published private(set) var channel: ChannelDetail?
    /// Orden cronológico (el más viejo primero). En un hilo, el primero es la raíz.
    @Published private(set) var messages: [ChatMessage] = []
    @Published private(set) var loading = true
    /// Falló la carga inicial: la vista muestra «Reintentar», no «Aún no hay mensajes».
    @Published private(set) var loadError: String?
    @Published private(set) var loadingOlder = false
    @Published private(set) var hasMore = false
    /// Hay mensajes más nuevos sin cargar (se abrió alrededor de un mensaje viejo).
    @Published private(set) var hasNewer = false
    @Published private(set) var loadingNewer = false
    /// Primer mensaje sin leer al abrir (separador «Mensajes nuevos»); se fija una sola vez.
    @Published private(set) var unreadMarkerId: String?
    @Published private(set) var unreadAtOpen = 0
    @Published private(set) var typing: [String] = []
    @Published private(set) var upload: UploadProgress?
    var uploading: Bool { upload != nil }
    @Published var error: String?
    @Published var focusMessageId: String?
    @Published var jumpRequest: JumpRequest?

    var myId: String { Session.shared.currentUser?.id ?? "" }

    private var typingUntil: [String: (name: String, until: Date)] = [:]
    private var typingTimer: Timer?
    private var lastTypingSent = Date.distantPast
    private var visible = false
    private var started = false
    private var bag = Set<AnyCancellable>()

    init(channelId: String, parentId: String?, focusMessageId: String?) {
        self.channelId = channelId
        self.parentId = parentId
        self.focusMessageId = focusMessageId
    }

    /// Una sola vez por pantalla; al volver de un hilo se conserva lo cargado.
    func start() {
        guard !started else { return }
        started = true
        RealtimeClient.shared.join(channelId)
        subscribe()
        Task { await loadInitial() }
    }

    deinit {
        let id = channelId
        // Las salas llevan cuenta: el hilo y su canal comparten sala.
        Task { @MainActor in RealtimeClient.shared.leave(id) }
    }

    private func loadInitial() async {
        loading = true
        loadError = nil
        do {
            let detail = try await ApiClient.shared.channel(channelId)
            channel = detail
            if let parentId {
                let t = try await ApiClient.shared.thread(parentId)
                messages = [t.root] + t.replies
                hasMore = false
                hasNewer = false
            } else {
                let page: MessagePage
                if let focus = focusMessageId {
                    page = try await ApiClient.shared.messages(channelId, around: focus, limit: 60)
                } else {
                    page = try await ApiClient.shared.messages(channelId, limit: 50)
                }
                messages = page.messages
                hasMore = page.hasMore ?? false
                hasNewer = focusMessageId != nil ? (page.hasNewer ?? false) : false
                if focusMessageId == nil { computeUnreadMarker(lastReadAt: detail.lastReadAt) }
            }
            error = nil
            if let focus = focusMessageId {
                focusMessageId = nil
                jumpRequest = JumpRequest(id: focus)
            }
            markReadIfVisible()
        } catch {
            loadError = error.userMessage
        }
        loading = false
    }

    func retryLoad() {
        guard !loading else { return }
        Task { await loadInitial() }
    }

    private func computeUnreadMarker(lastReadAt: String?) {
        guard parentId == nil, unreadMarkerId == nil, let readAt = parseDate(lastReadAt) else { return }
        let me = myId
        let unread = messages.filter { m in
            guard m.author.id != me, !m.isSystem, let at = parseDate(m.createdAt) else { return false }
            return at > readAt
        }
        unreadMarkerId = unread.first?.id
        unreadAtOpen = unread.count
    }

    private func belongsHere(_ m: ChatMessage) -> Bool {
        guard m.channelId == channelId else { return false }
        if let parentId { return m.parentId == parentId || m.id == parentId }
        return m.parentId == nil
    }

    private func subscribe() {
        let rt = RealtimeClient.shared
        rt.messages.sink { [weak self] m in
            // Persona bloqueada: lo que manda no se muestra ni cuenta (docs/chat-reportar-bloquear.md).
            if let self, m.author.id != self.myId, ChatBlocks.shared.isBlocked(m.author.id) { return }
            guard let self, self.belongsHere(m) else {
                // Respuesta de hilo: sube el contador del mensaje raíz en la vista del canal.
                if let self, self.parentId == nil, m.channelId == self.channelId, let root = m.parentId {
                    self.bumpReplies(root, by: 1)
                }
                return
            }
            self.typingUntil[m.author.id] = nil
            self.publishTyping()
            // Viendo mensajes viejos: lo nuevo se trae al bajar (botón «↓»), sin dejar huecos.
            if self.hasNewer && m.author.id != self.myId { return }
            self.upsert(m)
            if m.author.id != self.myId { self.markReadIfVisible() }
        }.store(in: &bag)

        rt.updated.sink { [weak self] m in
            guard let self, m.channelId == self.channelId else { return }
            if let i = self.messages.firstIndex(where: { $0.id == m.id }) {
                var next = m
                // `saved` es por persona: lo que llega por el socket no lo sabe.
                next.saved = self.messages[i].saved
                self.messages[i] = next
            }
        }.store(in: &bag)

        rt.deleted.sink { [weak self] d in
            guard let self, d.channelId == self.channelId else { return }
            self.applyDeleted(d.messageId)
            if self.parentId == nil, let root = d.parentId { self.bumpReplies(root, by: -1) }
        }.store(in: &bag)

        rt.typing.sink { [weak self] t in
            guard let self, t.channelId == self.channelId, t.userId != self.myId,
                  !ChatBlocks.shared.isBlocked(t.userId) else { return }
            self.typingUntil[t.userId] = (t.fullName, Date().addingTimeInterval(5))
            self.publishTyping()
            self.scheduleTypingExpiry()
        }.store(in: &bag)

        rt.reads.sink { [weak self] r in
            guard let self, r.channelId == self.channelId, var ch = self.channel, var members = ch.members else { return }
            if let i = members.firstIndex(where: { $0.id == r.userId }) {
                members[i].lastReadAt = r.at
                ch.members = members
                self.channel = ch
            }
        }.store(in: &bag)

        rt.channelsChanged.sink { [weak self] id in
            guard let self, id == self.channelId else { return }
            Task { await self.reloadChannel() }
        }.store(in: &bag)

        // Reconexión (el socket ya volvió a unirse a la sala): pudo llegar algo mientras tanto.
        rt.connected.dropFirst().filter { $0 }.sink { [weak self] _ in
            guard let self else { return }
            Task { await self.catchUp() }
        }.store(in: &bag)

        // Bloqueo hecho aquí o en otra pantalla: sus mensajes salen de la vista abierta.
        ChatBlocks.shared.$ids.sink { [weak self] ids in
            self?.hideAuthors(ids)
        }.store(in: &bag)
    }

    /// Quita de la pantalla los mensajes (y el «escribiendo…») de personas bloqueadas.
    private func hideAuthors(_ blocked: Set<String>) {
        guard !blocked.isEmpty else { return }
        let me = myId
        let visible = messages.filter { $0.author.id == me || !blocked.contains($0.author.id) }
        if visible.count != messages.count { messages = visible }
        if typingUntil.keys.contains(where: { blocked.contains($0) }) {
            typingUntil = typingUntil.filter { !blocked.contains($0.key) }
            publishTyping()
        }
    }

    func reloadChannel() async {
        if let ch = try? await ApiClient.shared.channel(channelId) { channel = ch }
    }

    private func catchUp() async {
        guard !hasNewer, let last = messages.last(where: { !$0.pending && !$0.failed }) else { return }
        if let parentId {
            if let t = try? await ApiClient.shared.thread(parentId) { ([t.root] + t.replies).forEach(upsert) }
        } else if let page = try? await ApiClient.shared.messages(channelId, after: last.id, limit: 200) {
            page.messages.forEach(upsert)
        }
        markReadIfVisible()
    }

    private func upsert(_ m: ChatMessage) {
        var list = messages
        if let i = list.firstIndex(where: { $0.id == m.id }) {
            var next = m
            if next.saved == nil { next.saved = list[i].saved }
            list[i] = next
        } else if let cid = m.clientId, let i = list.firstIndex(where: { $0.clientId == cid && $0.pending }) {
            list[i] = m
        } else {
            list.append(m)
        }
        messages = list.sorted { a, b in
            let pa = a.pending || a.failed, pb = b.pending || b.failed
            if pa != pb { return !pa }
            if a.createdAt != b.createdAt { return a.createdAt < b.createdAt }
            return a.id < b.id
        }
    }

    private func bumpReplies(_ rootId: String, by delta: Int) {
        guard let i = messages.firstIndex(where: { $0.id == rootId }) else { return }
        messages[i].replyCount = max(0, messages[i].replies + delta)
    }

    /// Con hilo (o la raíz del hilo abierto) queda «Mensaje eliminado»; si no, desaparece.
    private func applyDeleted(_ id: String) {
        guard let i = messages.firstIndex(where: { $0.id == id }) else { return }
        if messages[i].replies > 0 || id == parentId {
            messages[i].deleted = true
            messages[i].body = ""
            messages[i].attachment = nil
            messages[i].reactions = nil
            messages[i].pinnedAt = nil
        } else {
            messages.remove(at: i)
        }
    }

    private func publishTyping() {
        let now = Date()
        typingUntil = typingUntil.filter { $0.value.until > now }
        typing = typingUntil.values.map(\.name).sorted()
    }

    private func scheduleTypingExpiry() {
        typingTimer?.invalidate()
        typingTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
            Task { @MainActor in
                guard let self else { timer.invalidate(); return }
                self.publishTyping()
                if self.typingUntil.isEmpty { timer.invalidate() }
            }
        }
    }

    func onVisible(_ isVisible: Bool) {
        guard visible != isVisible else { return }
        visible = isVisible
        if isVisible {
            ActiveConversation.shared.open(channelId)
            markReadIfVisible()
        } else {
            ActiveConversation.shared.close(channelId)
        }
    }

    private func markReadIfVisible() {
        guard visible, parentId == nil else { return }
        let id = channelId
        Task { try? await ApiClient.shared.markRead(id) }
    }

    func loadOlder() {
        guard parentId == nil, !loadingOlder, hasMore, let oldest = messages.first(where: { !$0.pending }) else { return }
        loadingOlder = true
        Task {
            do {
                let page = try await ApiClient.shared.messages(channelId, before: oldest.id, limit: 50)
                let known = Set(messages.map(\.id))
                messages = page.messages.filter { !known.contains($0.id) } + messages
                hasMore = page.hasMore ?? false
            } catch {
                self.error = error.userMessage
            }
            loadingOlder = false
        }
    }

    func loadNewer() {
        guard parentId == nil, hasNewer, !loadingNewer,
              let newest = messages.last(where: { !$0.pending && !$0.failed }) else { return }
        loadingNewer = true
        Task {
            do {
                let page = try await ApiClient.shared.messages(channelId, after: newest.id, limit: 50)
                page.messages.forEach(upsert)
                hasNewer = page.hasNewer ?? (page.messages.count >= 50)
            } catch {
                self.error = error.userMessage
            }
            loadingNewer = false
        }
    }

    /// Vuelve a lo más reciente (tras saltar a un mensaje viejo).
    func loadLatest() async {
        guard parentId == nil else { return }
        do {
            let page = try await ApiClient.shared.messages(channelId, limit: 50)
            let local = messages.filter { $0.pending || $0.failed }
            messages = page.messages + local
            hasMore = page.hasMore ?? false
            hasNewer = false
            markReadIfVisible()
        } catch {
            self.error = error.userMessage
        }
    }

    /// Desplazarse a un mensaje; si no está cargado, se trae la página alrededor de él.
    func jump(to id: String) {
        if messages.contains(where: { $0.id == id }) {
            jumpRequest = JumpRequest(id: id)
            return
        }
        guard parentId == nil else { return }
        Task {
            do {
                let page = try await ApiClient.shared.messages(channelId, around: id, limit: 60)
                let local = messages.filter { $0.pending || $0.failed }
                messages = page.messages + local
                hasMore = page.hasMore ?? false
                hasNewer = page.hasNewer ?? true
                jumpRequest = JumpRequest(id: id)
            } catch {
                self.error = error.userMessage
            }
        }
    }

    func onTyping() {
        let now = Date()
        guard now.timeIntervalSince(lastTypingSent) >= 3 else { return }
        lastTypingSent = now
        RealtimeClient.shared.sendTyping(channelId)
    }

    // MARK: Enviar

    static func replyRef(_ m: ChatMessage) -> ChatReplyRef {
        ChatReplyRef(
            id: m.id,
            authorId: m.author.id,
            authorName: m.author.fullName,
            excerpt: String(plainText(m.text).prefix(140)),
            kind: m.kind,
            attachmentName: m.attachment?.name,
            deleted: m.deleted
        )
    }

    func send(_ body: String, attachment: UploadResult? = nil, replyTo: ChatMessage? = nil) {
        let text = String(body.trimmingCharacters(in: .whitespacesAndNewlines).prefix(chatMessageLimit))
        guard !text.isEmpty || attachment != nil else { return }
        if hasNewer { Task { await loadLatest() } }
        let me = Session.shared.currentUser
        let clientId = "i-\(UUID().uuidString)"
        let optimistic = ChatMessage(
            id: clientId,
            channelId: channelId,
            parentId: parentId,
            kind: attachment == nil ? "TEXT" : "FILE",
            body: text,
            attachment: attachment.map { ChatAttachment(url: $0.url, name: $0.name, mime: $0.mime, size: $0.size) },
            createdAt: isoNow(),
            author: ChatAuthor(id: me?.id ?? "", fullName: me?.name ?? ""),
            clientId: clientId,
            replyTo: replyTo.map(Self.replyRef),
            pending: true
        )
        messages.append(optimistic)
        post(optimistic)
    }

    private func post(_ m: ChatMessage) {
        Task {
            do {
                let saved = try await ApiClient.shared.post(channelId, PostMessageBody(
                    body: m.text.isEmpty ? nil : m.text,
                    parentId: parentId,
                    attachmentUrl: m.attachment?.url,
                    attachmentName: m.attachment?.name,
                    attachmentMime: m.attachment?.mime,
                    attachmentSize: m.attachment?.size,
                    clientId: m.clientId,
                    replyToId: m.replyTo?.id
                ))
                var result = saved
                // El API viejo no devuelve `replyTo`: se conserva la cita local.
                if result.replyTo == nil { result.replyTo = m.replyTo }
                if messages.contains(where: { $0.id == result.id }) {
                    messages.removeAll { $0.clientId == m.clientId && $0.pending }
                } else if let i = messages.firstIndex(where: { $0.clientId == m.clientId }) {
                    messages[i] = result
                }
            } catch {
                if let i = messages.firstIndex(where: { $0.clientId == m.clientId }) {
                    messages[i].pending = false
                    messages[i].failed = true
                }
                self.error = error.userMessage
            }
        }
    }

    func retry(_ m: ChatMessage) {
        guard let i = messages.firstIndex(where: { $0.clientId == m.clientId }) else { return }
        messages[i].pending = true
        messages[i].failed = false
        post(messages[i])
    }

    func discard(_ m: ChatMessage) {
        messages.removeAll { $0.clientId == m.clientId && $0.failed }
    }

    /// Fotos, videos, notas de voz o documentos: un mensaje por archivo, como WhatsApp.
    /// El texto escrito (y la cita) van en el primero. Se preparan y suben en orden.
    func sendFiles(_ items: [@Sendable () async throws -> PreparedUpload], caption: String, replyTo: ChatMessage? = nil) {
        guard !items.isEmpty else { return }
        for (i, item) in items.enumerated() {
            uploadQueue.append((item, i == 0 ? caption : "", i == 0 ? replyTo : nil))
        }
        queuedTotal += items.count
        guard !draining else { return }
        draining = true
        Task { await drainUploads() }
    }

    private var uploadQueue: [(prepare: @Sendable () async throws -> PreparedUpload, caption: String, replyTo: ChatMessage?)] = []
    private var queuedTotal = 0
    private var queuedDone = 0
    private var draining = false

    private func drainUploads() async {
        while !uploadQueue.isEmpty {
            let next = uploadQueue.removeFirst()
            let index = queuedDone + 1
            upload = UploadProgress(label: "archivo", index: index, total: queuedTotal, fraction: nil)
            var prepared: PreparedUpload?
            do {
                let p = try await next.prepare()
                prepared = p
                let label = p.label
                upload = UploadProgress(label: label, index: index, total: queuedTotal, fraction: 0)
                let uploaded = try await ApiClient.shared.uploadFile("chat/upload", fileURL: p.fileURL, filename: p.filename, mime: p.mime) { [weak self] fraction in
                    Task { @MainActor in
                        guard let self, let current = self.upload, current.index == index else { return }
                        if let shown = current.fraction, Int(shown * 100) == Int(fraction * 100) { return }
                        self.upload = UploadProgress(label: label, index: index, total: self.queuedTotal, fraction: fraction)
                    }
                }
                send(next.caption, attachment: uploaded, replyTo: next.replyTo)
            } catch {
                self.error = error.userMessage
            }
            prepared?.dispose()
            queuedDone += 1
        }
        queuedTotal = 0
        queuedDone = 0
        draining = false
        upload = nil
    }

    // MARK: Acciones sobre mensajes

    func react(_ m: ChatMessage, _ emoji: String) { mutate { try await ApiClient.shared.react(m.id, emoji: emoji) } }

    func togglePin(_ m: ChatMessage) { mutate { try await ApiClient.shared.pin(m.id) } }

    func toggleSave(_ m: ChatMessage) {
        Task {
            do {
                let saved = try await ApiClient.shared.toggleSave(m.id)
                if let i = messages.firstIndex(where: { $0.id == m.id }) { messages[i].saved = saved }
                Haptics.success()
            } catch {
                self.error = error.userMessage
            }
        }
    }

    func edit(_ m: ChatMessage, _ body: String) {
        let text = String(body.trimmingCharacters(in: .whitespacesAndNewlines).prefix(chatMessageLimit))
        guard !text.isEmpty, text != m.text else { return }
        mutate { try await ApiClient.shared.edit(m.id, body: text) }
    }

    func delete(_ m: ChatMessage) {
        Task {
            do {
                try await ApiClient.shared.deleteMessage(m.id)
                applyDeleted(m.id)
            } catch {
                self.error = error.userMessage
            }
        }
    }

    private func mutate(_ call: @escaping () async throws -> ChatMessage) {
        Task {
            do { upsert(try await call()) } catch { self.error = error.userMessage }
        }
    }

    /// `hours` nil = siempre; `muted` false = volver a recibir avisos.
    func mute(_ muted: Bool, hours: Int?) {
        Task {
            do {
                try await ApiClient.shared.mute(channelId, muted: muted, hours: hours)
                channel = try await ApiClient.shared.channel(channelId)
            } catch {
                self.error = error.userMessage
            }
        }
    }

    func pins() async -> [ChatMessage] { (try? await ApiClient.shared.pins(channelId)) ?? [] }

    // MARK: Reportar y bloquear (docs/chat-reportar-bloquear.md)

    /// Mensaje ya enviado de otra persona (no del sistema).
    func canReport(_ m: ChatMessage) -> Bool {
        !m.pending && !m.failed && !m.isDeleted && !m.isSystem && !m.author.id.isEmpty && m.author.id != myId
    }

    func canBlock(_ m: ChatMessage) -> Bool {
        !m.pending && !m.failed && !m.isSystem && !m.author.id.isEmpty && m.author.id != myId
    }

    /// La otra persona de un directo 1:1 (no de grupo): «Bloquear» / «Desbloquear» del encabezado.
    var directPeer: ChatPeer? {
        guard parentId == nil, let ch = channel, ch.isDirect, !ch.isGroup, let peer = ch.peer,
              !peer.id.isEmpty, peer.id != myId else { return nil }
        return peer
    }

    /// `true` si se bloqueó. Sus mensajes los quita `hideAuthors` al cambiar `ChatBlocks.ids`.
    func block(_ userId: String, name: String) async -> Bool {
        do {
            try await ChatBlocks.shared.block(userId, name: name)
            return true
        } catch {
            self.error = error.userMessage
            return false
        }
    }

    /// `true` si se desbloqueó; en el canal se vuelve a cargar lo último para que reaparezcan sus mensajes.
    func unblock(_ userId: String) async -> Bool {
        do {
            try await ChatBlocks.shared.unblock(userId)
            if parentId == nil { await loadLatest() }
            return true
        } catch {
            self.error = error.userMessage
            return false
        }
    }

    func canEdit(_ m: ChatMessage) -> Bool {
        guard m.author.id == myId, m.attachment == nil, !m.pending, !m.failed, !m.isDeleted,
              let at = parseDate(m.createdAt) else { return false }
        return Date().timeIntervalSince(at) < Self.editWindow
    }

    func canDelete(_ m: ChatMessage) -> Bool {
        !m.pending && !m.isDeleted && (m.author.id == myId || (channel?.mayManage ?? false))
    }

    /// Cuántas de las otras personas ya leyeron hasta ese mensaje (por su `lastReadAt`).
    func readers(_ m: ChatMessage) -> Int {
        guard let at = parseDate(m.createdAt) else { return 0 }
        return (channel?.allMembers ?? []).filter { member in
            guard member.id != myId, let read = parseDate(member.lastReadAt) else { return false }
            return read >= at
        }.count
    }

    /// «Visto» en directos, «Visto por N» en grupos y canales (no exige que lean todos).
    func seenLabel(_ m: ChatMessage) -> String? {
        let n = readers(m)
        guard n > 0 else { return nil }
        if channel?.isDirect == true { return "Visto" }
        return "Visto por \(n)"
    }

    /// Miembros que se pueden mencionar con «@».
    func mentionCandidates(_ query: String) -> [ChannelMember] {
        let q = query.lowercased()
        return (channel?.allMembers ?? [])
            .filter { $0.id != myId && (q.isEmpty || $0.fullName.lowercased().contains(q)) }
            .prefix(6)
            .map { $0 }
    }
}
