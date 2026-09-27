package com.artaproducciones.ops.data.api

import okhttp3.MultipartBody
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
)

data class ChatAttachment(val url: String, val name: String? = null, val mime: String? = null, val size: Long? = null) {
    val isImage: Boolean get() = mime?.startsWith("image/") == true
}

data class ReactionUser(val id: String, val fullName: String)
data class ChatReaction(val emoji: String, val count: Int, val userIds: List<String> = emptyList(), val users: List<ReactionUser> = emptyList())
data class ChatAuthor(val id: String, val fullName: String, val title: String? = null)

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
)

data class EditBody(val body: String)
data class ReactionBody(val emoji: String)
data class MuteBody(val muted: Boolean, val hours: Int? = null)
data class DirectBody(val userId: String)
data class Colleague(val id: String, val fullName: String, val title: String? = null, val email: String? = null)
data class UploadResult(val url: String, val name: String? = null, val mime: String? = null, val size: Long? = null)
data class UnreadTotal(val total: Int = 0)

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
