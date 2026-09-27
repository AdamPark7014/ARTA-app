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

    var isDirect: Bool { kind.uppercased() == "DM" || kind.uppercased() == "DIRECT" || peer != nil }
    var isPrivate: Bool { kind.uppercased() == "PRIVATE" }
    var isAnnouncement: Bool { postingRestricted == true }
    var displayName: String { peer?.fullName ?? name }
    var unread: Int { unreadCount ?? 0 }
    var isMuted: Bool { muted == true }
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

    var isDirect: Bool { kind.uppercased() == "DM" || kind.uppercased() == "DIRECT" || peer != nil }
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

    var isImage: Bool { mime?.hasPrefix("image/") == true }
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
    /// Solo en mensajes optimistas locales mientras el API responde.
    var pending = false
    var failed = false

    enum CodingKeys: String, CodingKey {
        case id, channelId, parentId, kind, body, attachment, pinnedAt, editedAt, createdAt, author, replyCount, reactions, clientId
    }

    var text: String { body ?? "" }
    var replies: Int { replyCount ?? 0 }
    var allReactions: [ChatReaction] { reactions ?? [] }
    var isSystem: Bool { (kind ?? "TEXT").uppercased() == "SYSTEM" }
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
}

struct UnreadTotal: Decodable { var total: Int? }

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
