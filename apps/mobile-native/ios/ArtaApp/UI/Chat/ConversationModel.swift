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
    @Published private(set) var loadingOlder = false
    @Published private(set) var hasMore = false
    @Published private(set) var typing: [String] = []
    @Published private(set) var upload: UploadProgress?
    var uploading: Bool { upload != nil }
    @Published var error: String?
    @Published var focusMessageId: String?

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
        do {
            channel = try await ApiClient.shared.channel(channelId)
            if let parentId {
                let t = try await ApiClient.shared.thread(parentId)
                messages = [t.root] + t.replies
                hasMore = false
            } else {
                let page: MessagePage
                if let focus = focusMessageId {
                    page = try await ApiClient.shared.messages(channelId, around: focus, limit: 60)
                } else {
                    page = try await ApiClient.shared.messages(channelId, limit: 50)
                }
                messages = page.messages
                hasMore = page.hasMore ?? false
            }
            error = nil
            markReadIfVisible()
        } catch {
            self.error = error.userMessage
        }
        loading = false
    }

    private func belongsHere(_ m: ChatMessage) -> Bool {
        guard m.channelId == channelId else { return false }
        if let parentId { return m.parentId == parentId || m.id == parentId }
        return m.parentId == nil
    }

    private func subscribe() {
        let rt = RealtimeClient.shared
        rt.messages.sink { [weak self] m in
            guard let self, self.belongsHere(m) else {
                // Respuesta de hilo: sube el contador del mensaje raíz en la vista del canal.
                if let self, self.parentId == nil, m.channelId == self.channelId, let root = m.parentId {
                    self.bumpReplies(root)
                }
                return
            }
            self.upsert(m)
            self.typingUntil[m.author.id] = nil
            self.publishTyping()
            if m.author.id != self.myId { self.markReadIfVisible() }
        }.store(in: &bag)

        rt.updated.sink { [weak self] m in
            guard let self, m.channelId == self.channelId else { return }
            if let i = self.messages.firstIndex(where: { $0.id == m.id }) { self.messages[i] = m }
        }.store(in: &bag)

        rt.deleted.sink { [weak self] d in
            guard let self, d.channelId == self.channelId else { return }
            self.messages.removeAll { $0.id == d.messageId }
        }.store(in: &bag)

        rt.typing.sink { [weak self] t in
            guard let self, t.channelId == self.channelId, t.userId != self.myId else { return }
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
            Task { if let ch = try? await ApiClient.shared.channel(self.channelId) { self.channel = ch } }
        }.store(in: &bag)

        // Reconexión (el socket ya volvió a unirse a la sala): pudo llegar algo mientras tanto.
        rt.connected.dropFirst().filter { $0 }.sink { [weak self] _ in
            guard let self else { return }
            Task { await self.catchUp() }
        }.store(in: &bag)
    }

    private func catchUp() async {
        guard let last = messages.last(where: { !$0.pending && !$0.failed }) else { return }
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
            list[i] = m
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

    private func bumpReplies(_ rootId: String) {
        guard let i = messages.firstIndex(where: { $0.id == rootId }) else { return }
        messages[i].replyCount = messages[i].replies + 1
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

    func onTyping() {
        let now = Date()
        guard now.timeIntervalSince(lastTypingSent) >= 3 else { return }
        lastTypingSent = now
        RealtimeClient.shared.sendTyping(channelId)
    }

    // MARK: Enviar

    func send(_ body: String, attachment: UploadResult? = nil) {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || attachment != nil else { return }
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
                    clientId: m.clientId
                ))
                if messages.contains(where: { $0.id == saved.id }) {
                    messages.removeAll { $0.clientId == m.clientId && $0.pending }
                } else if let i = messages.firstIndex(where: { $0.clientId == m.clientId }) {
                    messages[i] = saved
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
    /// El texto escrito va como pie del primero. Se preparan y suben en orden.
    func sendFiles(_ items: [@Sendable () async throws -> PreparedUpload], caption: String) {
        guard !items.isEmpty else { return }
        for (i, item) in items.enumerated() {
            uploadQueue.append((item, i == 0 ? caption : ""))
        }
        queuedTotal += items.count
        guard !draining else { return }
        draining = true
        Task { await drainUploads() }
    }

    private var uploadQueue: [(prepare: @Sendable () async throws -> PreparedUpload, caption: String)] = []
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
                send(next.caption, attachment: uploaded)
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

    func edit(_ m: ChatMessage, _ body: String) {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != m.text else { return }
        mutate { try await ApiClient.shared.edit(m.id, body: text) }
    }

    func delete(_ m: ChatMessage) {
        Task {
            do {
                try await ApiClient.shared.deleteMessage(m.id)
                messages.removeAll { $0.id == m.id }
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

    func canEdit(_ m: ChatMessage) -> Bool {
        guard m.author.id == myId, m.attachment == nil, !m.pending, !m.failed, let at = parseDate(m.createdAt) else { return false }
        return Date().timeIntervalSince(at) < Self.editWindow
    }

    func canDelete(_ m: ChatMessage) -> Bool {
        !m.pending && (m.author.id == myId || (channel?.mayManage ?? false))
    }

    /// ✓✓ cuando todos los demás miembros ya leyeron hasta ese mensaje (en directos, la otra persona).
    func readByAll(_ m: ChatMessage) -> Bool {
        let others = (channel?.allMembers ?? []).filter { $0.id != myId }
        guard !others.isEmpty, let at = parseDate(m.createdAt) else { return false }
        return others.allSatisfy { member in
            guard let read = parseDate(member.lastReadAt) else { return false }
            return read >= at
        }
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
