import SwiftUI

enum MessageAction {
    case react(String)
    case reply
    case thread
    case copy
    case save
    case pin
    case share
    case edit
    case delete
    /// Mensaje de otra persona (docs/chat-reportar-bloquear.md).
    case report
    case block
}

/// Hoja al mantener presionado un mensaje (como Slack): las 8 reacciones rápidas,
/// el selector completo, las acciones y quién reaccionó.
struct MessageActionsSheet: View {
    let message: ChatMessage
    let myId: String
    let canThread: Bool
    let canEdit: Bool
    let canDelete: Bool
    /// «Reportar» y «Bloquear a {nombre}»: solo en mensajes de otras personas.
    var canReport = false
    var canBlock = false
    var onAction: (MessageAction) -> Void

    @State private var showPicker = false

    private var usable: Bool { !message.pending && !message.failed && !message.isDeleted }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                preview
                if usable { reactionBar }
                VStack(spacing: 0) {
                    if usable {
                        row("Responder citando", icon: "arrowshape.turn.up.left", id: "msg-action-reply") { onAction(.reply) }
                        if canThread {
                            row("Responder en hilo", icon: "bubble.left.and.bubble.right", id: "msg-action-thread") { onAction(.thread) }
                        }
                    }
                    if !message.text.isEmpty && !message.isDeleted {
                        row("Copiar texto", icon: "doc.on.doc", id: "msg-action-copy") { onAction(.copy) }
                    }
                    if usable {
                        row(message.isSaved ? "Quitar de guardados" : "Guardar", icon: message.isSaved ? "bookmark.slash" : "bookmark", id: "msg-action-save") { onAction(.save) }
                        row(message.pinnedAt != nil ? "Desfijar" : "Fijar en la conversación", icon: message.pinnedAt != nil ? "pin.slash" : "pin", id: "msg-action-pin") { onAction(.pin) }
                    }
                    if message.attachment != nil && usable {
                        row("Compartir o guardar archivo", icon: "square.and.arrow.up", id: "msg-action-share") { onAction(.share) }
                    }
                    if canEdit {
                        row("Editar", icon: "pencil", id: "msg-action-edit") { onAction(.edit) }
                    }
                    if canDelete {
                        row("Eliminar", icon: "trash", destructive: true, id: "msg-action-delete") { onAction(.delete) }
                    }
                    if canReport {
                        row("Reportar", icon: "exclamationmark.bubble", id: "msg-action-report") { onAction(.report) }
                    }
                    if canBlock {
                        row(blockTitle, icon: "hand.raised", destructive: true, id: "msg-action-block") { onAction(.block) }
                    }
                }
                .background(RoundedRectangle(cornerRadius: 14).fill(ArtaColor.surface2))
                .padding(.horizontal, 16)
                .padding(.top, 12)
                if !message.allReactions.isEmpty { whoReacted }
            }
            .padding(.bottom, 20)
        }
        .background(ArtaColor.bgElev)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sheet(isPresented: $showPicker) {
            EmojiPickerSheet { emoji in onAction(.react(emoji)) }
        }
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(message.author.fullName)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ArtaColor.gold)
            Text(previewText)
                .font(.subheadline)
                .foregroundStyle(ArtaColor.muted)
                .lineLimit(2)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
    }

    private var previewText: String {
        if message.isDeleted { return "Mensaje eliminado" }
        if !message.text.isEmpty { return plainText(message.text) }
        return message.attachment?.name ?? "Adjunto"
    }

    private func reacted(_ emoji: String) -> Bool {
        message.allReactions.first(where: { $0.emoji == emoji })?.userIds?.contains(myId) ?? false
    }

    private var reactionBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chatQuickReactions, id: \.self) { emoji in
                    Button { onAction(.react(emoji)) } label: {
                        Text(emoji)
                            .font(.system(size: 24))
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(reacted(emoji) ? ArtaColor.goldSoft : ArtaColor.surface2))
                            .overlay(Circle().stroke(reacted(emoji) ? ArtaColor.gold : Color.clear, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Reaccionar con \(emoji)")
                }
                Button { showPicker = true } label: {
                    Image(systemName: "face.smiling")
                        .font(.system(size: 20))
                        .foregroundStyle(ArtaColor.text)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(ArtaColor.surface2))
                        .overlay(alignment: .bottomTrailing) {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 13))
                                .foregroundStyle(ArtaColor.gold)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Más reacciones")
            }
            .padding(.horizontal, 16)
        }
    }

    private var blockTitle: String {
        let name = message.author.fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? "Bloquear a esta persona" : "Bloquear a \(name)"
    }

    private func row(_ title: String, icon: String, destructive: Bool = false, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 17))
                    .frame(width: 24)
                Text(title).font(.body)
                Spacer()
            }
            .foregroundStyle(destructive ? ArtaColor.danger : ArtaColor.text)
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    private var whoReacted: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Reacciones")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ArtaColor.muted)
            ForEach(message.allReactions, id: \.emoji) { r in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(r.emoji).font(.title3)
                    Text(names(r))
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.text)
                    Spacer()
                    Text("\(r.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ArtaColor.muted)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
    }

    private func names(_ r: ChatReaction) -> String {
        let list = (r.users ?? []).map { $0.id == myId ? "Tú" : $0.fullName }
        return list.isEmpty ? (r.count == 1 ? "1 persona" : "\(r.count) personas") : list.joined(separator: ", ")
    }
}
