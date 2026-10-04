import Combine
import SwiftUI
import UIKit

/// Reacciones rápidas: mismas 8 y en el mismo orden en web, Android e iOS (contrato §8).
let chatQuickReactions = ["👍", "❤️", "😂", "🎉", "👀", "🔥", "✅", "🙏"]

/// Límite del cuerpo de un mensaje en los tres clientes y en el API.
let chatMessageLimit = 8000

extension ArtaColor {
    static let online = Color(hex: 0x22C55E)
}

private let isoOut: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

func isoString(_ date: Date) -> String { isoOut.string(from: date) }

/// «Ana, Luis, Pedro» (nombre de un directo de grupo) → nombres para los avatares apilados.
func groupMemberNames(_ name: String) -> [String] {
    name.split(separator: ",")
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
}

// MARK: - Hápticos

@MainActor
enum Haptics {
    static func send() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func react() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func longPress() { UIImpactFeedbackGenerator(style: .rigid).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}

// MARK: - Borradores por conversación

enum ChatDrafts {
    private static func key(_ channelId: String, _ parentId: String?) -> String {
        "chat.draft.\(channelId)" + (parentId.map { ".\($0)" } ?? "")
    }

    /// Texto con los tokens de mención (`[@Nombre](user:id)`), tal como se mandaría.
    static func load(channelId: String, parentId: String?) -> String {
        UserDefaults.standard.string(forKey: key(channelId, parentId)) ?? ""
    }

    static func save(_ text: String, channelId: String, parentId: String?) {
        let k = key(channelId, parentId)
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            UserDefaults.standard.removeObject(forKey: k)
        } else {
            UserDefaults.standard.set(String(text.prefix(chatMessageLimit)), forKey: k)
        }
    }
}

// MARK: - Presencia

/// Quién de la organización está conectado: `GET chat/presence` al conectar y
/// `chat:presence` en vivo. Con el API viejo (sin la ruta) simplemente no hay puntos verdes.
@MainActor
final class PresenceStore: ObservableObject {
    static let shared = PresenceStore()

    @Published private(set) var online: Set<String> = []
    private var bag = Set<AnyCancellable>()
    private var lastRefresh = Date.distantPast

    private init() {
        let rt = RealtimeClient.shared
        rt.presence
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if event.online { self.online.insert(event.userId) } else { self.online.remove(event.userId) }
            }
            .store(in: &bag)
        rt.connected
            .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refresh(force: true) }
            .store(in: &bag)
    }

    func isOnline(_ userId: String?) -> Bool {
        guard let userId else { return false }
        return online.contains(userId)
    }

    func refresh(force: Bool = false) {
        guard force || Date().timeIntervalSince(lastRefresh) > 30 else { return }
        lastRefresh = Date()
        Task {
            if let ids = try? await ApiClient.shared.presence() { online = Set(ids) }
        }
    }
}

// MARK: - Vista previa de enlaces

/// Caché en memoria por URL (contrato §5). Lo que no tiene vista previa también se recuerda.
@MainActor
enum LinkPreviews {
    private static var cache: [String: LinkPreview] = [:]
    private static var misses: Set<String> = []
    private static var inFlight: [String: Task<LinkPreview?, Never>] = [:]

    static func cached(_ url: String) -> LinkPreview? { cache[url] }

    static func load(_ url: String) async -> LinkPreview? {
        if let hit = cache[url] { return hit }
        if misses.contains(url) { return nil }
        if let running = inFlight[url] { return await running.value }
        let task = Task { () -> LinkPreview? in
            do {
                return try await ApiClient.shared.linkPreview(url)
            } catch {
                return nil
            }
        }
        inFlight[url] = task
        let result = await task.value
        inFlight[url] = nil
        if cache.count > 300 { cache.removeAll() }
        if let result, !result.isEmpty {
            cache[url] = result
            return result
        }
        misses.insert(url)
        return nil
    }
}

// MARK: - Piezas visuales

/// Punto de presencia: verde en línea, aro gris si no.
struct PresenceDot: View {
    var online: Bool
    var size: CGFloat = 12

    var body: some View {
        Circle()
            .fill(online ? ArtaColor.online : ArtaColor.bg)
            .overlay(Circle().stroke(online ? Color.clear : ArtaColor.muted, lineWidth: 1.5).padding(2))
            .overlay(Circle().stroke(ArtaColor.bg, lineWidth: 2))
            .frame(width: size, height: size)
            .accessibilityLabel(online ? "En línea" : "Desconectado")
    }
}

/// Dos avatares encimados para un directo de grupo.
struct StackedAvatars: View {
    let names: [String]
    var size: CGFloat = 44

    var body: some View {
        let small = size * 0.7
        ZStack(alignment: .topLeading) {
            Avatar(name: names.first ?? "?", size: small)
            if names.count > 1 {
                Avatar(name: names[1], size: small)
                    .overlay(Circle().stroke(ArtaColor.bg, lineWidth: 2))
                    .offset(x: size - small, y: size - small)
            }
        }
        .frame(width: size, height: size, alignment: .topLeading)
        .accessibilityHidden(true)
    }
}

/// Esqueleto mientras carga la conversación.
struct ChatSkeleton: View {
    @State private var pulse = false
    private let widths: [CGFloat] = [210, 150, 240, 120, 180, 220, 140]

    var body: some View {
        VStack(spacing: 14) {
            ForEach(0..<widths.count, id: \.self) { i in
                let mine = i % 3 == 2
                HStack(alignment: .top, spacing: 8) {
                    if mine {
                        Spacer(minLength: 60)
                    } else {
                        Circle().fill(ArtaColor.surface2).frame(width: 30, height: 30)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        if !mine {
                            RoundedRectangle(cornerRadius: 4).fill(ArtaColor.surface2).frame(width: 90, height: 10)
                        }
                        RoundedRectangle(cornerRadius: 14)
                            .fill(mine ? ArtaColor.mine : ArtaColor.surface2)
                            .frame(width: widths[i], height: i % 2 == 0 ? 44 : 32)
                    }
                    if !mine { Spacer(minLength: 60) }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.top, 16)
        .opacity(pulse ? 0.45 : 1)
        .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
        .onAppear { pulse = true }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando mensajes")
    }
}

/// Error de carga con «Reintentar» (no se confunde con «Aún no hay mensajes»).
struct ChatErrorState: View {
    let message: String
    var onRetry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark").font(.system(size: 40)).foregroundStyle(ArtaColor.muted)
            Text("No se pudo cargar").font(.headline).foregroundStyle(ArtaColor.text)
            Text(message).font(.subheadline).foregroundStyle(ArtaColor.muted).multilineTextAlignment(.center)
            Button(action: onRetry) {
                Text("Reintentar")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.bg)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(ArtaColor.gold))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Emojis (lista local, sin CDN)

struct EmojiCategory: Identifiable {
    let id: String
    let icon: String
    let emojis: [String]
}

enum ChatEmoji {
    private static func list(_ s: String) -> [String] { s.split(separator: " ").map(String.init) }

    static let categories: [EmojiCategory] = [
        EmojiCategory(id: "Caras", icon: "face.smiling", emojis: list(
            "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🤧 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖"
        )),
        EmojiCategory(id: "Gestos", icon: "hand.wave", emojis: list(
            "👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 👀 👁️ 🧠 🫶 💅 🤳"
        )),
        EmojiCategory(id: "Corazones", icon: "heart", emojis: list(
            "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡ 💤"
        )),
        EmojiCategory(id: "Celebración", icon: "party.popper", emojis: list(
            "🎉 🎊 🎈 🎁 🎂 🍾 🥂 🍻 🏆 🥇 🥈 🥉 🎖️ 🎗️ 🎟️ 🎫 🎤 🎧 🎬 🎭 🎨 🎪 🎸 🎹 🥁 🎺 🎷 📸 🎥 💃 🕺"
        )),
        EmojiCategory(id: "Trabajo", icon: "briefcase", emojis: list(
            "✅ ☑️ ✔️ ❌ ❗ ❓ ⚠️ 🚫 ⛔ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 📌 📍 📎 🔗 📝 📋 📁 📂 📅 📆 🗓️ ⏰ ⏳ ⌛ 📞 📱 💻 🖥️ 🖨️ 📧 📨 📦 🚚 🚀 🛠️ 🔧 🔨 💡 🔒 🔓 🔑 💰 💵 💳 🧾 📈 📉 📊"
        )),
        EmojiCategory(id: "Comida", icon: "fork.knife", emojis: list(
            "☕ 🍵 🧃 🥤 🍺 🍷 🍸 🍹 🍕 🍔 🌮 🌯 🥗 🍣 🍜 🍝 🥪 🍟 🌭 🍿 🥐 🍩 🍪 🍰 🧁 🍫 🍦 🍎 🍌 🍉 🍓 🥑 🌶️"
        )),
        EmojiCategory(id: "Lugares", icon: "airplane", emojis: list(
            "🚗 🚕 🚌 🚐 🚓 🚑 🏍️ 🚲 ✈️ 🚁 🚢 🏠 🏢 🏟️ 🏛️ 🏨 🏪 🌎 🗺️ 🏖️ 🏔️ 🌅 🌃 🌧️ ⛈️ ☀️ 🌤️ 🌈 ❄️ 🌊"
        )),
    ]

    private static let recentKey = "chat.emoji.recent"

    static func recent() -> [String] { UserDefaults.standard.stringArray(forKey: recentKey) ?? [] }

    static func remember(_ emoji: String) {
        var list = recent().filter { $0 != emoji }
        list.insert(emoji, at: 0)
        UserDefaults.standard.set(Array(list.prefix(16)), forKey: recentKey)
    }
}

/// Selector completo de emojis por categoría, con «Recientes».
struct EmojiPickerSheet: View {
    var title = "Reaccionar"
    var onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var recent: [String] = ChatEmoji.recent()
    private let columns = [GridItem(.adaptive(minimum: 44), spacing: 4)]

    private var sections: [EmojiCategory] {
        let head = recent.isEmpty ? [] : [EmojiCategory(id: "Recientes", icon: "clock", emojis: recent)]
        return head + ChatEmoji.categories
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        ForEach(sections) { section in
                            Button {
                                withAnimation { proxy.scrollTo(section.id, anchor: .top) }
                            } label: {
                                Image(systemName: section.icon)
                                    .font(.system(size: 17))
                                    .foregroundStyle(ArtaColor.muted)
                                    .frame(maxWidth: .infinity, minHeight: 36)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(section.id)
                        }
                    }
                    .padding(.horizontal, 8)
                    Divider().overlay(ArtaColor.line)
                    ScrollView {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(sections) { section in
                                Text(section.id)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(ArtaColor.muted)
                                    .padding(.top, 10)
                                    .id(section.id)
                                LazyVGrid(columns: columns, spacing: 4) {
                                    ForEach(section.emojis, id: \.self) { emoji in
                                        Button { pick(emoji) } label: {
                                            Text(emoji)
                                                .font(.system(size: 30))
                                                .frame(width: 44, height: 44)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.bottom, 16)
                    }
                }
            }
            .background(ArtaColor.bgElev)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func pick(_ emoji: String) {
        ChatEmoji.remember(emoji)
        onPick(emoji)
        dismiss()
    }
}
