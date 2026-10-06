import Foundation

// Mismos contratos que `android/.../data/api/ArtaApi.kt`. Todo lo que el API
// puede omitir es opcional; los valores por defecto viven en propiedades calculadas.

// MARK: - Auth

struct UserDto: Codable, Equatable {
    let id: String
    var email: String?
    var fullName: String?
    var title: String?
    var roleKey: String?
    var organizationId: String?

    var name: String { (fullName?.isEmpty == false ? fullName : email) ?? "" }
}

struct LoginBody: Encodable {
    let email: String
    let password: String
}

struct VerifyLoginBody: Encodable {
    let challengeId: String
    let code: String
}

struct LoginResponse: Decodable {
    var requires2fa: Bool?
    var challengeId: String?
    var requiresTotpEnrollment: Bool?
    var user: UserDto?
}

struct MeResponse: Decodable {
    let user: UserDto
}

// MARK: - Chat

struct ChatPeer: Codable, Equatable {
    let id: String
    let fullName: String
    var title: String?
}

struct ChannelSummary: Decodable, Identifiable, Equatable {
    let id: String
    let kind: String
    var slug: String?
    let name: String
    var topic: String?
    var eventId: String?
    var peer: ChatPeer?
    var isMember: Bool?
    var memberCount: Int?
    var postingRestricted: Bool?
    var canPost: Bool?
    var lastMessageAt: String?
    var lastMessagePreview: String?
    var unreadCount: Int?
    var muted: Bool?
    var mutedUntil: String?
    /// Chat v2: directo de grupo (`kind = PRIVATE`). Falta en el API viejo.
    var isGroupDm: Bool?

    var isDirect: Bool { kind.uppercased() == "DM" || kind.uppercased() == "DIRECT" || peer != nil }
    var isGroup: Bool { isGroupDm == true }
    var isPrivate: Bool { kind.uppercased() == "PRIVATE" }
    var isAnnouncement: Bool { postingRestricted == true }
    var isEvent: Bool { eventId?.isEmpty == false }
    var displayName: String { peer?.fullName ?? name }
    var unread: Int { unreadCount ?? 0 }
    var isMuted: Bool { muted == true }
    var joined: Bool { isMember ?? true }
}

struct ChannelMember: Codable, Identifiable, Equatable {
    let id: String
    let fullName: String
    var title: String?
    var role: String?
    var lastReadAt: String?
}

struct ChannelDetail: Decodable, Equatable {
    let id: String
    let kind: String
    var slug: String?
    let name: String
    var topic: String?
    var description: String?
    var eventId: String?
    var peer: ChatPeer?
    var postingRestricted: Bool?
    var canPost: Bool?
    var canManage: Bool?
    var muted: Bool?
    var mutedUntil: String?
    var lastReadAt: String?
    var memberCount: Int?
    var members: [ChannelMember]?
    var isGroupDm: Bool?

    var isDirect: Bool { kind.uppercased() == "DM" || kind.uppercased() == "DIRECT" || peer != nil }
    var isGroup: Bool { isGroupDm == true }
    var isPrivate: Bool { kind.uppercased() == "PRIVATE" }
    var isEvent: Bool { eventId?.isEmpty == false }
    /// #general y #anuncios incluyen a toda la organización: no se sale ni se archiva.
    var isOrgDefault: Bool { slug == "general" || slug == "anuncios" }
    var displayName: String { peer?.fullName ?? name }
    var allMembers: [ChannelMember] { members ?? [] }
    var mayPost: Bool { canPost ?? true }
    var mayManage: Bool { canManage ?? false }
    var isMuted: Bool { muted == true }
}

struct ChatAttachment: Codable, Equatable {
    let url: String
    var name: String?
    var mime: String?
    var size: Int64?

    private var ext: String { ((name ?? url) as NSString).pathExtension.lowercased() }
    var isImage: Bool { mime.map { $0.hasPrefix("image/") } ?? ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].contains(ext) }
    var isVideo: Bool { mime.map { $0.hasPrefix("video/") } ?? ["mp4", "m4v", "mov", "3gp", "webm"].contains(ext) }
    var isAudio: Bool { mime.map { $0.hasPrefix("audio/") } ?? ["m4a", "aac", "mp3", "ogg", "opus", "wav"].contains(ext) }
    /// Grabada en la app (Android, iPhone o web): burbuja de voz, no archivo.
    var isVoiceNote: Bool {
        isAudio && (name ?? "").range(of: #"^nota[-_ ]de[-_ ]voz"#, options: [.regularExpression, .caseInsensitive]) != nil
    }
}

struct ReactionUser: Codable, Equatable {
    let id: String
    let fullName: String
}

struct ChatReaction: Codable, Equatable {
    let emoji: String
    let count: Int
    var userIds: [String]?
    var users: [ReactionUser]?
}

struct ChatAuthor: Codable, Equatable {
    let id: String
    let fullName: String
    var title: String?
}

/// Mensaje citado (chat v2): `excerpt` ya viene en texto plano, ≤140 caracteres.
struct ChatReplyRef: Codable, Equatable {
    let id: String
    var authorId: String?
    var authorName: String?
    var excerpt: String?
    var kind: String?
    var attachmentName: String?
    var deleted: Bool?
}

/// Canal de un resultado de búsqueda o de un guardado.
struct ChatChannelRef: Codable, Equatable {
    let id: String
    var name: String?
    var kind: String?
    var isGroupDm: Bool?

    var isDirect: Bool { (kind ?? "").uppercased() == "DIRECT" || (kind ?? "").uppercased() == "DM" }
    var label: String {
        let n = name ?? ""
        return isDirect || isGroupDm == true ? n : "#" + n
    }
}

struct ChatMessage: Decodable, Identifiable, Equatable {
    var id: String
    var channelId: String
    var parentId: String?
    var kind: String?
    var body: String?
    var attachment: ChatAttachment?
    var pinnedAt: String?
    var editedAt: String?
    var createdAt: String
    var author: ChatAuthor
    var replyCount: Int?
    var reactions: [ChatReaction]?
    var clientId: String?
    var replyTo: ChatReplyRef?
    var saved: Bool?
    var deleted: Bool?
    /// Solo en resultados de `GET chat/search`.
    var channel: ChatChannelRef?
    /// Solo en mensajes optimistas locales mientras el API responde.
    var pending = false
    var failed = false

    enum CodingKeys: String, CodingKey {
        case id, channelId, parentId, kind, body, attachment, pinnedAt, editedAt, createdAt, author, replyCount, reactions, clientId
        case replyTo, saved, deleted, channel
    }

    var text: String { body ?? "" }
    var replies: Int { replyCount ?? 0 }
    var allReactions: [ChatReaction] { reactions ?? [] }
    var isSystem: Bool { (kind ?? "TEXT").uppercased() == "SYSTEM" }
    var isDeleted: Bool { deleted == true }
    var isSaved: Bool { saved == true }
}

struct MessagePage: Decodable {
    let messages: [ChatMessage]
    var hasMore: Bool?
    var hasNewer: Bool?
}

struct MessageList: Decodable {
    let messages: [ChatMessage]
}

struct ThreadDto: Decodable {
    let root: ChatMessage
    let replies: [ChatMessage]
}

struct PostMessageBody: Encodable {
    var body: String?
    var parentId: String?
    var attachmentUrl: String?
    var attachmentName: String?
    var attachmentMime: String?
    var attachmentSize: Int64?
    var clientId: String?
    var replyToId: String?
}

struct EditBody: Encodable { let body: String }
struct ReactionBody: Encodable { let emoji: String }
struct MuteBody: Encodable {
    let muted: Bool
    let hours: Int?
}
struct DirectBody: Encodable { let userId: String }

struct Colleague: Decodable, Identifiable, Equatable {
    let id: String
    let fullName: String
    var title: String?
    var email: String?
}

struct UploadResult: Decodable, Equatable {
    let url: String
    var name: String?
    var mime: String?
    var size: Int64?
    /// image | video | audio | file, decidido por el API.
    var kind: String?
}

struct UnreadTotal: Decodable { var total: Int? }

// MARK: - Chat v2 (docs/CHAT-V2-CONTRATO.md)

struct SaveToggle: Decodable { var saved: Bool? }

struct SavedItem: Decodable, Identifiable, Equatable {
    let savedAt: String
    let message: ChatMessage
    var channel: ChatChannelRef?

    var id: String { message.id }
}

struct SavedPage: Decodable { var items: [SavedItem]? }

struct GroupDmBody: Encodable { let userIds: [String] }

struct CreateChannelBody: Encodable {
    let name: String
    /// PUBLIC | PRIVATE
    var kind: String?
    var topic: String?
    var description: String?
    var memberIds: [String]?
}

struct UpdateChannelBody: Encodable {
    var name: String?
    var topic: String?
    var description: String?
}

struct MembersBody: Encodable { let userIds: [String] }

struct PresenceDto: Decodable { var online: [String]? }

struct LinkPreview: Decodable, Equatable {
    var url: String?
    var title: String?
    var description: String?
    var image: String?
    var siteName: String?

    var isEmpty: Bool { (title ?? "").isEmpty && (description ?? "").isEmpty && (image ?? "").isEmpty }
}

struct ChatPrefs: Decodable { var dndUntil: String? }

/// `dndUntil: null` apaga «No molestar»: hay que mandar el `null`, no omitir la clave.
struct ChatPrefsBody: Encodable {
    let dndUntil: String?

    enum CodingKeys: String, CodingKey { case dndUntil }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let dndUntil {
            try c.encode(dndUntil, forKey: .dndUntil)
        } else {
            try c.encodeNil(forKey: .dndUntil)
        }
    }
}

// MARK: - Reportar y bloquear (docs/chat-reportar-bloquear.md)

/// Motivos de `POST chat/messages/:id/report`, en el orden en que se muestran (iOS, Android y web).
enum ChatReportReason: String, CaseIterable, Identifiable {
    case spam = "SPAM"
    case acoso = "ACOSO"
    case ofensivo = "OFENSIVO"
    case otro = "OTRO"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .spam: return "Spam"
        case .acoso: return "Acoso o intimidación"
        case .ofensivo: return "Contenido ofensivo o inapropiado"
        case .otro: return "Otro"
        }
    }
}

/// `details` se omite si va vacío (máx. 1000 caracteres en el API).
struct ChatReportBody: Encodable {
    let reason: String
    var details: String?
}

/// Persona que yo bloqueé (`GET chat/blocks`): `id` es el de la persona.
struct BlockedUser: Decodable, Identifiable, Equatable {
    let id: String
    var name: String?
    var avatarUrl: String?
    var blockedAt: String?

    var displayName: String {
        let n = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return n.isEmpty ? "Usuario" : n
    }
}

// MARK: - Avisos y dispositivos

struct NotificationActor: Decodable, Equatable {
    let id: String
    let fullName: String
}

struct NotificationDto: Decodable, Identifiable, Equatable {
    let id: String
    let type: String
    let title: String
    var body: String?
    var linkUrl: String?
    var readAt: String?
    let createdAt: String
    var actor: NotificationActor?

    var isRead: Bool { readAt != nil }
}

struct UnreadCount: Decodable { var count: Int? }

struct RegisterPushBody: Encodable {
    let token: String
    var platform: String = "ios"
    var deviceName: String?
    var appVersion: String?
}

struct RemovePushBody: Encodable { let token: String? }
