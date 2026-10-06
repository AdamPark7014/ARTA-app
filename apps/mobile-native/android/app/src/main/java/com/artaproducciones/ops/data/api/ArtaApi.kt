package com.artaproducciones.ops.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

// ─── Auth ────────────────────────────────────────────────────────────────────

data class UserDto(
    val id: String,
    val email: String? = null,
    val fullName: String = "",
    val title: String? = null,
    val roleKey: String? = null,
    val organizationId: String? = null,
    /** `ARTA` / `EXPLANADA`: decide qué módulos web ve (igual que el menú lateral). */
    val entities: List<String> = emptyList(),
    /** Permisos extra sobre los del rol. */
    val permissions: List<String> = emptyList(),
)

data class LoginBody(val email: String, val password: String)
data class VerifyLoginBody(val challengeId: String, val code: String)

data class LoginResponse(
    val requires2fa: Boolean? = null,
    val challengeId: String? = null,
    val requiresTotpEnrollment: Boolean? = null,
    val user: UserDto? = null,
)

data class MeResponse(val user: UserDto)
data class OkResponse(val ok: Boolean = true)

// ─── Chat ────────────────────────────────────────────────────────────────────

data class ChatPeer(val id: String, val fullName: String, val title: String? = null)

data class ChannelSummary(
    val id: String,
    val kind: String,
    val slug: String? = null,
    val name: String,
    val topic: String? = null,
    val eventId: String? = null,
    val peer: ChatPeer? = null,
    val isMember: Boolean = true,
    val memberCount: Int = 0,
    val postingRestricted: Boolean = false,
    val canPost: Boolean = true,
    val lastMessageAt: String? = null,
    val lastMessagePreview: String? = null,
    val unreadCount: Int = 0,
    val muted: Boolean = false,
    val mutedUntil: String? = null,
    val isGroupDm: Boolean = false,
)

data class ChannelMember(
    val id: String,
    val fullName: String,
    val title: String? = null,
    val role: String = "member",
    val lastReadAt: String? = null,
)

data class ChannelDetail(
    val id: String,
    val kind: String,
    val slug: String? = null,
    val name: String,
    val topic: String? = null,
    val description: String? = null,
    val eventId: String? = null,
    val peer: ChatPeer? = null,
    val postingRestricted: Boolean = false,
    val canPost: Boolean = true,
    val canManage: Boolean = false,
    val muted: Boolean = false,
    val mutedUntil: String? = null,
    val lastReadAt: String? = null,
    val memberCount: Int = 0,
    val members: List<ChannelMember> = emptyList(),
    val isGroupDm: Boolean = false,
)

data class ChatAttachment(val url: String, val name: String? = null, val mime: String? = null, val size: Long? = null) {
    private val ext: String get() = (name ?: url).substringAfterLast('.', "").lowercase()
    val isImage: Boolean get() = mime?.startsWith("image/") ?: (ext in IMAGE_EXT)
    val isVideo: Boolean get() = mime?.startsWith("video/") ?: (ext in VIDEO_EXT)
    val isAudio: Boolean get() = mime?.startsWith("audio/") ?: (ext in AUDIO_EXT)
    /** Grabada en la app (Android, iPhone o web): se pinta como burbuja de voz, no como archivo. */
    val isVoiceNote: Boolean get() = isAudio && VOICE_NAME.containsMatchIn(name.orEmpty())

    private companion object {
        val IMAGE_EXT = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "heif")
        val VIDEO_EXT = setOf("mp4", "m4v", "mov", "3gp", "webm")
        val AUDIO_EXT = setOf("m4a", "aac", "mp3", "ogg", "opus", "wav")
        val VOICE_NAME = Regex("^nota[-_ ]de[-_ ]voz", RegexOption.IGNORE_CASE)
    }
}

data class ReactionUser(val id: String, val fullName: String)
data class ChatReaction(val emoji: String, val count: Int, val userIds: List<String> = emptyList(), val users: List<ReactionUser> = emptyList())
data class ChatAuthor(val id: String, val fullName: String, val title: String? = null)

/** Mensaje citado (chat v2). `excerpt` ya viene en texto plano. */
data class ChatReplyRef(
    val id: String,
    val authorId: String? = null,
    val authorName: String? = null,
    val excerpt: String? = null,
    val kind: String? = null,
    val attachmentName: String? = null,
    val deleted: Boolean = false,
)

/** Canal de un resultado de búsqueda o de un guardado. */
data class ChatChannelRef(val id: String, val name: String = "", val kind: String = "PUBLIC", val isGroupDm: Boolean = false)

data class ChatMessage(
    val id: String,
    val channelId: String,
    val parentId: String? = null,
    val kind: String = "TEXT",
    val body: String = "",
    val attachment: ChatAttachment? = null,
    val pinnedAt: String? = null,
    val editedAt: String? = null,
    val createdAt: String,
    val author: ChatAuthor,
    val replyCount: Int = 0,
    val reactions: List<ChatReaction> = emptyList(),
    val replyTo: ChatReplyRef? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
    val channel: ChatChannelRef? = null,
    /** Solo en mensajes optimistas locales mientras el API responde. */
    val clientId: String? = null,
    val pending: Boolean = false,
    val failed: Boolean = false,
)

data class MessagePage(val messages: List<ChatMessage>, val hasMore: Boolean = false, val hasNewer: Boolean = false)
data class MessageList(val messages: List<ChatMessage>)
data class ThreadDto(val root: ChatMessage, val replies: List<ChatMessage>)

data class PostMessageBody(
    val body: String? = null,
    val parentId: String? = null,
    val attachmentUrl: String? = null,
    val attachmentName: String? = null,
    val attachmentMime: String? = null,
    val attachmentSize: Long? = null,
    val clientId: String? = null,
    val replyToId: String? = null,
)

data class EditBody(val body: String)
data class ReactionBody(val emoji: String)
data class MuteBody(val muted: Boolean, val hours: Int? = null)
data class DirectBody(val userId: String)
data class Colleague(val id: String, val fullName: String, val title: String? = null, val email: String? = null)
data class UploadResult(val url: String, val name: String? = null, val mime: String? = null, val size: Long? = null, val kind: String? = null)
data class UnreadTotal(val total: Int = 0)

data class CreateChannelBody(
    val name: String,
    val kind: String = "PUBLIC",
    val topic: String? = null,
    val description: String? = null,
    val memberIds: List<String> = emptyList(),
)
data class UpdateChannelBody(val name: String? = null, val topic: String? = null, val description: String? = null)
data class MembersBody(val userIds: List<String>)
data class GroupDmBody(val userIds: List<String>)
data class SaveResult(val saved: Boolean = false)
data class SavedItem(val savedAt: String? = null, val message: ChatMessage, val channel: ChatChannelRef? = null)
data class SavedPage(val items: List<SavedItem> = emptyList())
data class LinkPreview(val url: String, val title: String? = null, val description: String? = null, val image: String? = null, val siteName: String? = null)
data class PresenceList(val online: List<String> = emptyList())
data class ChatPrefs(val dndUntil: String? = null)

/** `reason`: `SPAM` | `ACOSO` | `OFENSIVO` | `OTRO` (docs/chat-reportar-bloquear.md). `details` hasta 1000. */
data class ReportBody(val reason: String, val details: String? = null)
data class ReportResult(val ok: Boolean = true, val reportId: String? = null)

/** Persona que YO bloqueé (`GET /chat/blocks`). */
data class BlockedUser(val id: String, val name: String = "", val avatarUrl: String? = null, val blockedAt: String? = null)

// ─── Avisos y dispositivos ──────────────────────────────────────────────────

data class NotificationActor(val id: String, val fullName: String)

data class NotificationDto(
    val id: String,
    val type: String,
    val title: String,
    val body: String? = null,
    val linkUrl: String? = null,
    val readAt: String? = null,
    val createdAt: String,
    val actor: NotificationActor? = null,
)

data class UnreadCount(val count: Int = 0)

data class RegisterPushBody(
    val token: String,
    val platform: String = "android",
    val deviceName: String? = null,
    val appVersion: String? = null,
)

data class RemovePushBody(val token: String?)

interface ArtaApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginBody): LoginResponse

    @POST("auth/2fa/verify-login")
    suspend fun verifyLogin(@Body body: VerifyLoginBody): LoginResponse

    @POST("auth/logout")
    suspend fun logout(): OkResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    @GET("chat/channels")
    suspend fun channels(): List<ChannelSummary>

    @GET("chat/channels/{id}")
    suspend fun channel(@Path("id") id: String): ChannelDetail

    @GET("chat/channels/{id}/messages")
    suspend fun messages(
        @Path("id") channelId: String,
        @Query("before") before: String? = null,
        @Query("after") after: String? = null,
        @Query("around") around: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("parentId") parentId: String? = null,
    ): MessagePage

    @POST("chat/channels/{id}/messages")
    suspend fun post(@Path("id") channelId: String, @Body body: PostMessageBody): ChatMessage

    @GET("chat/messages/{id}/thread")
    suspend fun thread(@Path("id") messageId: String): ThreadDto

    @PATCH("chat/messages/{id}")
    suspend fun edit(@Path("id") messageId: String, @Body body: EditBody): ChatMessage

    @HTTP(method = "DELETE", path = "chat/messages/{id}")
    suspend fun delete(@Path("id") messageId: String): OkResponse

    @POST("chat/messages/{id}/reactions")
    suspend fun react(@Path("id") messageId: String, @Body body: ReactionBody): ChatMessage

    @POST("chat/messages/{id}/pin")
    suspend fun pin(@Path("id") messageId: String): ChatMessage

    @GET("chat/channels/{id}/pins")
    suspend fun pins(@Path("id") channelId: String): MessageList

    @POST("chat/channels/{id}/read")
    suspend fun markRead(@Path("id") channelId: String): OkResponse

    @PATCH("chat/channels/{id}/mute")
    suspend fun mute(@Path("id") channelId: String, @Body body: MuteBody): OkResponse

    @POST("chat/dm")
    suspend fun openDirect(@Body body: DirectBody): ChannelDetail

    @GET("chat/search")
    suspend fun search(@Query("q") q: String, @Query("channelId") channelId: String? = null): MessageList

    @GET("chat/colleagues")
    suspend fun colleagues(@Query("q") q: String? = null): List<Colleague>

    @Multipart
    @POST("chat/upload")
    suspend fun upload(@Part file: MultipartBody.Part): UploadResult

    @GET("chat/unread")
    suspend fun chatUnread(): UnreadTotal

    @POST("chat/channels")
    suspend fun createChannel(@Body body: CreateChannelBody): ChannelDetail

    @PATCH("chat/channels/{id}")
    suspend fun updateChannel(@Path("id") channelId: String, @Body body: UpdateChannelBody): ChannelDetail

    @POST("chat/channels/{id}/archive")
    suspend fun archiveChannel(@Path("id") channelId: String): OkResponse

    @POST("chat/channels/{id}/members")
    suspend fun addMembers(@Path("id") channelId: String, @Body body: MembersBody): ChannelDetail

    @HTTP(method = "DELETE", path = "chat/channels/{id}/members/{userId}")
    suspend fun removeMember(@Path("id") channelId: String, @Path("userId") userId: String): OkResponse

    @POST("chat/channels/{id}/leave")
    suspend fun leaveChannel(@Path("id") channelId: String): OkResponse

    @POST("chat/group-dm")
    suspend fun groupDm(@Body body: GroupDmBody): ChannelDetail

    @POST("chat/messages/{id}/save")
    suspend fun toggleSave(@Path("id") messageId: String): SaveResult

    @GET("chat/saved")
    suspend fun saved(@Query("limit") limit: Int = 50, @Query("before") before: String? = null): SavedPage

    /** El API responde `null` (o vacío) si no hay vista previa: quien llama atrapa la excepción. */
    @GET("chat/link-preview")
    suspend fun linkPreview(@Query("url") url: String): LinkPreview

    @GET("chat/presence")
    suspend fun presence(): PresenceList

    @GET("chat/prefs")
    suspend fun chatPrefs(): ChatPrefs

    /** JSON crudo: Moshi omite los null y `dndUntil: null` tiene que viajar para apagar No molestar. */
    @PATCH("chat/prefs")
    suspend fun setChatPrefs(@Body body: RequestBody): ChatPrefs

    // Reportar y bloquear (guía 1.2 de Apple): contrato en docs/chat-reportar-bloquear.md.

    @POST("chat/messages/{id}/report")
    suspend fun reportMessage(@Path("id") messageId: String, @Body body: ReportBody): ReportResult

    @POST("chat/users/{userId}/block")
    suspend fun blockUser(@Path("userId") userId: String): OkResponse

    @HTTP(method = "DELETE", path = "chat/users/{userId}/block")
    suspend fun unblockUser(@Path("userId") userId: String): OkResponse

    @GET("chat/blocks")
    suspend fun blocks(): List<BlockedUser>

    @GET("notifications")
    suspend fun notifications(@Query("take") take: Int = 50): List<NotificationDto>

    @GET("notifications/unread-count")
    suspend fun notificationsUnread(): UnreadCount

    @PATCH("notifications/{id}/read")
    suspend fun notificationRead(@Path("id") id: String): NotificationDto

    @POST("notifications/read-all")
    suspend fun notificationsReadAll(): OkResponse

    @POST("devices/push")
    suspend fun registerPush(@Body body: RegisterPushBody): Any

    @HTTP(method = "DELETE", path = "devices/push", hasBody = true)
    suspend fun removePush(@Body body: RemovePushBody): Any
}
