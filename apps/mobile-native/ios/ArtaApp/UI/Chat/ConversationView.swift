import PhotosUI
import QuickLook
import SwiftUI
import UIKit
import UniformTypeIdentifiers

private let quickReactions = ["👍", "❤️", "😂", "😮", "🙏", "✅"]

struct ConversationView: View {
    @StateObject private var model: ConversationModel
    @EnvironmentObject private var router: AppRouter
    @Environment(\.scenePhase) private var scenePhase

    @State private var draft = ""
    /// «@Nombre» visible en el borrador → id, para mandar el token `[@Nombre](user:id)`.
    @State private var mentionMap: [String: String] = [:]
    @State private var editing: ChatMessage?
    @State private var confirmDelete: ChatMessage?
    @State private var showPins = false
    @State private var pinned: [ChatMessage] = []
    @State private var showPhotos = false
    @State private var photoItem: PhotosPickerItem?
    @State private var showFiles = false
    @State private var viewerURL: URL?
    @State private var previewURL: URL?
    @State private var olderAnchor: String?
    @State private var onScreen = false
    @State private var highlighted: String?
    @FocusState private var composerFocused: Bool

    init(channelId: String, parentId: String?, focusMessageId: String?) {
        _model = StateObject(wrappedValue: ConversationModel(channelId: channelId, parentId: parentId, focusMessageId: focusMessageId))
    }

    private var inThread: Bool { model.parentId != nil }
    private var isDirect: Bool { model.channel?.isDirect ?? false }

    var body: some View {
        VStack(spacing: 0) {
            messageList
            if !model.typing.isEmpty { typingBar }
            composerArea
        }
        .background(ArtaColor.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .onAppear {
            onScreen = true
            model.start()
            model.onVisible(scenePhase == .active)
        }
        .onDisappear {
            onScreen = false
            model.onVisible(false)
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
        .fullScreenCover(item: Binding(get: { viewerURL.map(IdentifiedURL.init) }, set: { viewerURL = $0?.url })) { item in
            ImageViewer(url: item.url)
        }
        .quickLookPreview($previewURL)
        .photosPicker(isPresented: $showPhotos, selection: $photoItem, matching: .images)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            photoItem = nil
            Task { await sendPhoto(item) }
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .image]) { result in
            if case .success(let url) = result { sendFile(url) }
        }
    }

    // MARK: Encabezado

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            VStack(spacing: 1) {
                Text(inThread ? "Hilo" : (model.channel?.displayName ?? "…"))
                    .font(.headline)
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(model.typing.isEmpty ? ArtaColor.muted : ArtaColor.gold)
                    .lineLimit(1)
            }
        }
        if !inThread {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        showPins = true
                        Task { pinned = await model.pins() }
                    } label: { Label("Mensajes fijados", systemImage: "pin") }
                    if model.channel?.isMuted == true {
                        Button { model.mute(false, hours: nil) } label: { Label("Quitar silencio", systemImage: "bell") }
                    } else {
                        Menu {
                            Button("8 horas") { model.mute(true, hours: 8) }
                            Button("1 semana") { model.mute(true, hours: 24 * 7) }
                            Button("Siempre") { model.mute(true, hours: nil) }
                        } label: { Label("Silenciar", systemImage: "bell.slash") }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
    }

    private var subtitle: String {
        if !model.typing.isEmpty {
            return model.typing.count == 1 ? "\(model.typing[0]) está escribiendo…" : "Varios están escribiendo…"
        }
        if inThread { return model.channel?.displayName ?? "" }
        guard let ch = model.channel else { return "" }
        if ch.isDirect { return ch.peer?.title ?? "Mensaje directo" }
        var parts: [String] = []
        if let n = ch.memberCount, n > 0 { parts.append(n == 1 ? "1 miembro" : "\(n) miembros") }
        if ch.isMuted { parts.append("silenciado") }
        return parts.joined(separator: " · ")
    }

    // MARK: Mensajes

    private enum RowKind {
        case day(Date)
        case message(ChatMessage, showAuthor: Bool)
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
        for (index, m) in model.messages.enumerated() {
            if let day = dayKey(m.createdAt), day != lastDay {
                out.append(Row(id: "day-\(Int(day.timeIntervalSince1970))", kind: .day(day)))
                lastDay = day
                prev = nil
            }
            var grouped = false
            if let p = prev, p.author.id == m.author.id, !p.isSystem,
               let a = parseDate(p.createdAt), let b = parseDate(m.createdAt), b.timeIntervalSince(a) < 300 {
                grouped = true
            }
            out.append(Row(id: m.id, kind: .message(m, showAuthor: !grouped)))
            if inThread && index == 0 {
                out.append(Row(id: "thread-divider", kind: .threadDivider(model.messages.count - 1)))
                prev = nil
            } else {
                prev = m
            }
        }
        return out
    }

    private var messageList: some View {
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
                        rowView(row).id(row.id)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .overlay {
                if model.loading {
                    ProgressView().tint(ArtaColor.gold)
                } else if model.messages.isEmpty {
                    EmptyState(icon: "hand.wave", title: "Aún no hay mensajes", message: "Escribe el primero.")
                }
            }
            .onChange(of: model.messages.last?.id) { _, id in
                guard let id else { return }
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(id, anchor: .bottom) }
            }
            .onChange(of: model.loadingOlder) { was, now in
                if was && !now, let anchor = olderAnchor { proxy.scrollTo(anchor, anchor: .top) }
            }
            .onChange(of: model.loading) { _, loading in
                guard !loading, let focus = model.focusMessageId else { return }
                highlighted = focus
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { proxy.scrollTo(focus, anchor: .center) }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                    withAnimation { highlighted = nil }
                    model.focusMessageId = nil
                }
            }
        }
    }

    @ViewBuilder
    private func rowView(_ row: Row) -> some View {
        switch row.kind {
        case .day(let day):
            Text(dayLabel(day))
                .font(.caption.weight(.medium))
                .foregroundStyle(ArtaColor.muted)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(ArtaColor.bgElev))
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
        case let .message(m, showAuthor):
            if m.isSystem {
                Text(plainText(m.text))
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            } else {
                MessageBubble(
                    message: m,
                    mine: m.author.id == model.myId,
                    showAuthor: showAuthor,
                    showName: !isDirect,
                    read: m.author.id == model.myId && model.readByAll(m),
                    highlighted: highlighted == m.id,
                    showReplies: !inThread,
                    myId: model.myId,
                    onReact: { model.react(m, $0) },
                    onThread: { router.chatPath.append(.thread(channelId: model.channelId, rootId: m.id)) },
                    onRetry: { model.retry(m) },
                    onDiscard: { model.discard(m) },
                    onImage: { viewerURL = $0 },
                    onFile: { openFile($0) }
                )
                .padding(.top, showAuthor ? 6 : 0)
                .contextMenu { messageMenu(m) }
            }
        }
    }

    @ViewBuilder
    private func messageMenu(_ m: ChatMessage) -> some View {
        if !m.pending && !m.failed {
            ControlGroup {
                ForEach(quickReactions.prefix(4), id: \.self) { emoji in
                    Button(emoji) { model.react(m, emoji) }
                }
            }
            Menu("Más reacciones") {
                ForEach(quickReactions.dropFirst(4), id: \.self) { emoji in
                    Button(emoji) { model.react(m, emoji) }
                }
            }
            if !inThread {
                Button { router.chatPath.append(.thread(channelId: model.channelId, rootId: m.id)) } label: {
                    Label("Responder en hilo", systemImage: "arrowshape.turn.up.left")
                }
            }
        }
        if !m.text.isEmpty {
            Button { UIPasteboard.general.string = plainText(m.text) } label: { Label("Copiar texto", systemImage: "doc.on.doc") }
        }
        if !m.pending && !m.failed {
            Button { model.togglePin(m) } label: {
                Label(m.pinnedAt != nil ? "Desfijar" : "Fijar en la conversación", systemImage: m.pinnedAt != nil ? "pin.slash" : "pin")
            }
        }
        if model.canEdit(m) {
            Button { startEditing(m) } label: { Label("Editar", systemImage: "pencil") }
        }
        if model.canDelete(m) {
            Button(role: .destructive) { confirmDelete = m } label: { Label("Eliminar", systemImage: "trash") }
        }
    }

    private var typingBar: some View {
        HStack(spacing: 6) {
            TypingDots()
            Text(model.typing.count == 1 ? "\(model.typing[0]) está escribiendo…" : "Varios están escribiendo…")
                .font(.caption)
                .foregroundStyle(ArtaColor.muted)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
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
            Text("Solo quienes administran este canal pueden escribir aquí.")
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
                                            Text(person.fullName).foregroundStyle(ArtaColor.text)
                                            Spacer()
                                        }
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                    }
                                }
                            }
                        }
                        .frame(maxHeight: 180)
                        .background(ArtaColor.bgElev)
                    }
                }
                if let editing {
                    HStack {
                        Image(systemName: "pencil").foregroundStyle(ArtaColor.gold)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Editando mensaje").font(.caption.weight(.semibold)).foregroundStyle(ArtaColor.gold)
                            Text(plainText(editing.text)).font(.caption).foregroundStyle(ArtaColor.muted).lineLimit(1)
                        }
                        Spacer()
                        Button { cancelEditing() } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(ArtaColor.muted) }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(ArtaColor.bgElev)
                }
                HStack(alignment: .bottom, spacing: 8) {
                    if editing == nil {
                        Menu {
                            Button { showPhotos = true } label: { Label("Foto", systemImage: "photo") }
                            Button { showFiles = true } label: { Label("Documento PDF", systemImage: "doc") }
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 28))
                                .foregroundStyle(ArtaColor.muted)
                        }
                        .disabled(model.uploading)
                    }
                    TextField(inThread ? "Responder en el hilo" : "Mensaje", text: $draft, axis: .vertical)
                        .lineLimit(1...6)
                        .focused($composerFocused)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 20).fill(ArtaColor.surface2))
                        .foregroundStyle(ArtaColor.text)
                        .onChange(of: draft) { _, value in
                            if !value.isEmpty && editing == nil { model.onTyping() }
                        }
                    if model.uploading {
                        ProgressView().tint(ArtaColor.gold).frame(width: 32, height: 32)
                    } else {
                        Button(action: submit) {
                            Image(systemName: editing == nil ? "arrow.up.circle.fill" : "checkmark.circle.fill")
                                .font(.system(size: 32))
                                .foregroundStyle(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? ArtaColor.muted : ArtaColor.gold)
                        }
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityLabel(editing == nil ? "Enviar" : "Guardar")
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(ArtaColor.bgElev)
            }
        }
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
        return text
    }

    private func submit() {
        if let editing {
            model.edit(editing, resolvedDraft())
            cancelEditing()
            return
        }
        model.send(takeDraft())
    }

    private func startEditing(_ m: ChatMessage) {
        editing = m
        var map: [String: String] = [:]
        if let regex = try? NSRegularExpression(pattern: #"\[@([^\]]{1,80})\]\(user:([\w-]{1,64})\)"#) {
            let ns = m.text as NSString
            for match in regex.matches(in: m.text, range: NSRange(location: 0, length: ns.length)) {
                map[ns.substring(with: match.range(at: 1))] = ns.substring(with: match.range(at: 2))
            }
        }
        mentionMap = map
        draft = plainText(m.text)
        composerFocused = true
    }

    private func cancelEditing() {
        editing = nil
        draft = ""
        mentionMap = [:]
    }

    // MARK: Adjuntos

    private func sendPhoto(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self), let jpeg = Self.jpeg(from: data) else {
            model.error = "No se pudo leer la foto"
            return
        }
        model.sendFile(data: jpeg, filename: "foto-\(Int(Date().timeIntervalSince1970)).jpg", mime: "image/jpeg", caption: takeDraft())
    }

    private func sendFile(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            model.error = "No se pudo leer el archivo"
            return
        }
        let type = UTType(filenameExtension: url.pathExtension)
        if type?.conforms(to: .image) == true {
            guard let jpeg = Self.jpeg(from: data) else {
                model.error = "No se pudo leer la imagen"
                return
            }
            let name = url.deletingPathExtension().lastPathComponent + ".jpg"
            model.sendFile(data: jpeg, filename: name, mime: "image/jpeg", caption: takeDraft())
        } else {
            model.sendFile(data: data, filename: url.lastPathComponent, mime: type?.preferredMIMEType ?? "application/pdf", caption: takeDraft())
        }
    }

    /// HEIC/PNG → JPEG de 2048 px como máximo (lo que acepta y muestra bien la web).
    private static func jpeg(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let maxSide: CGFloat = 2048
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        if scale >= 1 { return image.jpegData(compressionQuality: 0.85) }
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let resized = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.85)
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
                    if model.messages.contains(where: { $0.id == m.id }) {
                        highlighted = m.id
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { highlighted = nil } }
                    } else {
                        router.chatPath.append(.conversation(channelId: model.channelId, focusMessageId: m.id))
                    }
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

// MARK: - Burbuja

struct MessageBubble: View {
    let message: ChatMessage
    let mine: Bool
    let showAuthor: Bool
    let showName: Bool
    let read: Bool
    let highlighted: Bool
    let showReplies: Bool
    let myId: String
    var onReact: (String) -> Void
    var onThread: () -> Void
    var onRetry: () -> Void
    var onDiscard: () -> Void
    var onImage: (URL) -> Void
    var onFile: (ChatAttachment) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if mine {
                Spacer(minLength: 48)
            } else if showName {
                if showAuthor { Avatar(name: message.author.fullName, size: 30) } else { Color.clear.frame(width: 30, height: 1) }
            }
            VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
                bubble
                if !message.allReactions.isEmpty { reactions }
                if showReplies && message.replies > 0 {
                    Button(action: onThread) {
                        Text(message.replies == 1 ? "1 respuesta ›" : "\(message.replies) respuestas ›")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ArtaColor.gold)
                    }
                }
                if message.failed {
                    HStack(spacing: 12) {
                        Text("No se envió").foregroundStyle(ArtaColor.danger)
                        Button("Reintentar", action: onRetry).foregroundStyle(ArtaColor.gold)
                        Button("Descartar", action: onDiscard).foregroundStyle(ArtaColor.muted)
                    }
                    .font(.caption)
                }
            }
            if !mine { Spacer(minLength: 48) }
        }
    }

    private var bubble: some View {
        BubbleStack(spacing: 4) {
            if showName && showAuthor && !mine {
                Text(message.author.fullName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ArtaColor.gold)
            }
            if message.pinnedAt != nil {
                Label("Fijado", systemImage: "pin.fill")
                    .font(.caption2)
                    .foregroundStyle(ArtaColor.muted)
            }
            if let attachment = message.attachment { attachmentView(attachment) }
            if !message.text.isEmpty {
                Text(mentionText(message.text))
                    .foregroundStyle(ArtaColor.text)
                    .textSelection(.enabled)
            }
            HStack(spacing: 4) {
                if message.editedAt != nil { Text("editado") }
                Text(messageTime(message.createdAt))
                if mine { tick }
            }
            .font(.caption2)
            .foregroundStyle(ArtaColor.muted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 16).fill(mine ? ArtaColor.mine : ArtaColor.bgElev))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(highlighted ? ArtaColor.gold : Color.clear, lineWidth: 1.5))
        .opacity(message.pending ? 0.75 : 1)
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

    @ViewBuilder
    private func attachmentView(_ a: ChatAttachment) -> some View {
        if a.isImage, let url = ApiConfig.resolve(a.url) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure:
                    Image(systemName: "photo").font(.largeTitle).foregroundStyle(ArtaColor.muted)
                default:
                    ProgressView().tint(ArtaColor.gold)
                }
            }
            .frame(width: 220, height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
            .onTapGesture { onImage(url) }
        } else {
            Button { onFile(a) } label: {
                HStack(spacing: 10) {
                    Image(systemName: a.mime == "application/pdf" ? "doc.richtext" : "doc")
                        .font(.title2)
                        .foregroundStyle(ArtaColor.gold)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.name ?? "Archivo").font(.subheadline).foregroundStyle(ArtaColor.text).lineLimit(2)
                        Text(fileSize(a.size)).font(.caption2).foregroundStyle(ArtaColor.muted)
                    }
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(ArtaColor.surface2))
            }
            .buttonStyle(.plain)
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
                .accessibilityLabel("\(r.emoji) \(r.count)")
            }
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

/// Foto a pantalla completa con zoom (pellizcar) y compartir.
struct ImageViewer: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var image: Image?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                AsyncImage(url: url) { phase in
                    if let img = phase.image {
                        img.resizable()
                            .scaledToFit()
                            .scaleEffect(scale)
                            .gesture(
                                MagnifyGesture()
                                    .onChanged { value in scale = max(1, min(5, lastScale * value.magnification)) }
                                    .onEnded { _ in lastScale = scale }
                            )
                            .onTapGesture(count: 2) {
                                withAnimation { scale = scale > 1 ? 1 : 2.5 }
                                lastScale = scale
                            }
                            .onAppear { image = img }
                    } else if phase.error != nil {
                        Image(systemName: "photo").font(.largeTitle).foregroundStyle(ArtaColor.muted)
                    } else {
                        ProgressView().tint(ArtaColor.gold)
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
                if let image {
                    ToolbarItem(placement: .primaryAction) {
                        ShareLink(item: image, preview: SharePreview("Foto", image: image))
                    }
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
    }
}
