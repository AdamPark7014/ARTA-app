package com.artaproducciones.ops.data.api

import com.squareup.moshi.Json
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MultipartBody
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

// ─── Sesión con permisos (UserDto del chat no los trae) ─────────────────────

data class ModulesMe(
    val id: String,
    val fullName: String = "",
    val title: String? = null,
    val roleKey: String? = null,
    val entities: List<String> = emptyList(),
    val permissions: List<String> = emptyList(),
    val organizationId: String? = null,
)

data class ModulesMeResponse(val user: ModulesMe)

data class PersonRef(val id: String = "", val fullName: String = "", val email: String? = null)

data class DirUserDto(
    val id: String,
    val fullName: String = "",
    val email: String? = null,
    val title: String? = null,
    val roleKey: String? = null,
)

// ─── Tareas ─────────────────────────────────────────────────────────────────

data class TaskEventRef(val id: String, val name: String = "", val status: String? = null, val entity: String? = null)

data class TaskEvidenceDto(
    val id: String,
    val fileUrl: String,
    val label: String? = null,
    val note: String? = null,
    val createdAt: String? = null,
    val uploadedBy: PersonRef? = null,
)

data class TaskActivityDto(
    val id: String,
    val action: String,
    val detail: String? = null,
    val createdAt: String,
    val actor: PersonRef? = null,
)

data class TaskDto(
    val id: String,
    val title: String = "",
    val module: String? = null,
    val detail: String? = null,
    val status: String = "OPEN",
    val dueAt: String? = null,
    val seenAt: String? = null,
    val submittedAt: String? = null,
    val completionNote: String? = null,
    val rejectionNote: String? = null,
    val approvedAt: String? = null,
    val rejectedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val eventId: String? = null,
    val assigneeId: String? = null,
    val assignee: PersonRef? = null,
    val assigneeIds: List<String> = emptyList(),
    val assignees: List<PersonRef> = emptyList(),
    val createdById: String? = null,
    val createdBy: PersonRef? = null,
    val approvedBy: PersonRef? = null,
    val rejectedBy: PersonRef? = null,
    val event: TaskEventRef? = null,
    val evidences: List<TaskEvidenceDto> = emptyList(),
    val activities: List<TaskActivityDto> = emptyList(),
)

// ─── Eventos y calendario ───────────────────────────────────────────────────

data class EventCounts(val checklists: Int = 0, val purchaseOrders: Int = 0, val tasks: Int = 0)

data class EventSummaryDto(
    val id: String,
    val name: String = "",
    val artist: String? = null,
    val venue: String? = null,
    val city: String? = null,
    val status: String = "DRAFT",
    val entity: String? = null,
    val startsAt: String? = null,
    val endsAt: String? = null,
    val schedule: String? = null,
    val functions: Int? = null,
    val updatedAt: String? = null,
    @Json(name = "_count") val counts: EventCounts? = null,
)

data class EventChecklistRef(
    val id: String,
    val title: String? = null,
    val progressPct: Double? = null,
    val status: String? = null,
    val template: EventTemplateRef? = null,
)

data class EventTemplateRef(val key: String? = null, val name: String? = null)

data class EventPoRef(val id: String, val status: String = "", val amount: String? = null)

data class IdRef(val id: String)

data class EventDetailDto(
    val id: String,
    val name: String = "",
    val artist: String? = null,
    val promoter: String? = null,
    val venue: String? = null,
    val city: String? = null,
    val status: String = "DRAFT",
    val entity: String? = null,
    val startsAt: String? = null,
    val endsAt: String? = null,
    val notes: String? = null,
    val description: String? = null,
    val schedule: String? = null,
    val functions: Int? = null,
    val createdBy: PersonRef? = null,
    val tasks: List<TaskDto> = emptyList(),
    val checklists: List<EventChecklistRef> = emptyList(),
    val purchaseOrders: List<EventPoRef> = emptyList(),
    val files: List<IdRef> = emptyList(),
    val sponsors: List<IdRef> = emptyList(),
    val ticketingSetups: List<IdRef> = emptyList(),
)

data class CalendarNoteDto(
    val id: String,
    val entity: String? = null,
    /** `AAAA-MM-DD`, sin hora. */
    val date: String,
    val text: String = "",
    val createdBy: PersonRef? = null,
    val updatedBy: PersonRef? = null,
)

// ─── Órdenes de compra ──────────────────────────────────────────────────────

/** Fila de `GET /analytics/purchase-orders` → `orders[]` (monto ya numérico). */
data class PoRowDto(
    val id: String,
    val eventId: String,
    val eventName: String = "",
    val eventStatus: String? = null,
    val rubro: String? = null,
    val vendorName: String? = null,
    val paymentMethod: String? = null,
    val payeeType: String? = null,
    val withIva: Boolean? = null,
    val proofCount: Int = 0,
    val status: String = "",
    val amount: Double = 0.0,
    val ageDays: Int = 0,
    val createdBy: String? = null,
    val authorizedBy: String? = null,
    val createdAt: String? = null,
    val authorizedAt: String? = null,
    val paidAt: String? = null,
)

data class PoAnalyticsDto(val orders: List<PoRowDto> = emptyList())

data class NameRef(val fullName: String = "")

/** Los Decimal de Prisma llegan como texto; Moshi también acepta números en un String. */
data class PoLineDto(val id: String, val concept: String = "", val qty: String? = null, val unitPrice: String? = null, val total: String? = null)

data class PoProofDto(
    val id: String,
    val label: String? = null,
    val fileUrl: String,
    val amount: String? = null,
    val createdAt: String? = null,
)

data class PoDetailDto(
    val id: String,
    val eventId: String = "",
    val rubro: String? = null,
    val vendorName: String? = null,
    val description: String? = null,
    val amount: String? = null,
    val currency: String? = null,
    val status: String = "",
    val paymentMethod: String? = null,
    val payeeType: String? = null,
    val withIva: Boolean? = null,
    val createdAt: String? = null,
    val authorizedAt: String? = null,
    val paidAt: String? = null,
    val event: TaskEventRef? = null,
    val createdBy: NameRef? = null,
    val authorizedBy: NameRef? = null,
    val lines: List<PoLineDto> = emptyList(),
    val proofs: List<PoProofDto> = emptyList(),
)

data class PoWindowDto(
    val open: Boolean = false,
    val canPayNow: Boolean = false,
    val bypass: Boolean = false,
)

// ─── Anticipos (docs/ANTICIPOS-CONTRATO.md) ────────────────────────────────

data class AdvanceEventRef(val id: String = "", val name: String = "", val entity: String? = null)

/** `PaymentProof` sin OC. `amount` es un Decimal de Prisma (texto); `advanceStatus` null en los viejos. */
data class AdvanceDto(
    val id: String,
    val eventId: String? = null,
    val label: String? = null,
    val amount: String? = null,
    val fileUrl: String? = null,
    val note: String? = null,
    val advanceStatus: String? = null,
    val createdAt: String? = null,
    val decidedAt: String? = null,
    val rejectReason: String? = null,
    val paidAt: String? = null,
    val paidProofUrl: String? = null,
    val uploadedBy: PersonRef? = null,
    val decidedBy: PersonRef? = null,
    val paidBy: PersonRef? = null,
    val event: AdvanceEventRef? = null,
)

/** Cuerpo libre: solo viajan las llaves presentes (y `null` explícito para borrar, p. ej. `dueAt`). */
typealias JsonBody = Map<String, @JvmSuppressWildcards Any?>

interface ArtaModulesApi {
    @GET("auth/me")
    suspend fun me(): ModulesMeResponse

    @GET("users/directory")
    suspend fun directory(): List<DirUserDto>

    // Tareas
    @GET("tasks/mine")
    suspend fun myTasks(): List<TaskDto>

    @GET("tasks/requested")
    suspend fun requestedTasks(): List<TaskDto>

    /** Solo dirección y convenios (403 para el resto). */
    @GET("tasks/workload")
    suspend fun workload(@Query("status") status: String? = null): List<TaskDto>

    @GET("tasks/event/{eventId}")
    suspend fun eventTasks(@Path("eventId") eventId: String): List<TaskDto>

    @GET("tasks/{id}")
    suspend fun task(@Path("id") id: String): TaskDto

    @POST("tasks")
    suspend fun createTask(@Body body: JsonBody): TaskDto

    @PATCH("tasks/{id}")
    suspend fun updateTask(@Path("id") id: String, @Body body: JsonBody): TaskDto

    @HTTP(method = "DELETE", path = "tasks/{id}")
    suspend fun deleteTask(@Path("id") id: String)

    @Multipart
    @POST("tasks/{id}/evidence")
    suspend fun addEvidence(@Path("id") id: String, @Part file: MultipartBody.Part): TaskEvidenceDto

    @POST("tasks/{id}/submit")
    suspend fun submitTask(@Path("id") id: String, @Body body: JsonBody): TaskDto

    @POST("tasks/{id}/approve")
    suspend fun approveTask(@Path("id") id: String, @Body body: JsonBody = emptyMap()): TaskDto

    @POST("tasks/{id}/reject")
    suspend fun rejectTask(@Path("id") id: String, @Body body: JsonBody): TaskDto

    // Eventos
    @GET("events")
    suspend fun events(@Query("entity") entity: String? = null, @Query("scope") scope: String? = null): List<EventSummaryDto>

    @GET("events/{id}")
    suspend fun event(@Path("id") id: String): EventDetailDto

    @GET("calendar/notes")
    suspend fun calendarNotes(
        @Query("entity") entity: String,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): List<CalendarNoteDto>

    // Órdenes de compra
    @GET("analytics/purchase-orders")
    suspend fun poAnalytics(@Query("entity") entity: String? = null): PoAnalyticsDto

    @GET("purchase-orders/window")
    suspend fun poWindow(): PoWindowDto

    @GET("purchase-orders/{id}")
    suspend fun purchaseOrder(@Path("id") id: String): PoDetailDto

    @PATCH("purchase-orders/{id}/status")
    suspend fun setPoStatus(@Path("id") id: String, @Body body: JsonBody)

    // Anticipos: lo que yo puedo resolver (PENDING si apruebo, APPROVED si pago)
    @GET("finance/advances/pending")
    suspend fun pendingAdvances(): List<AdvanceDto>

    @PATCH("finance/advances/{id}/approve")
    suspend fun approveAdvance(@Path("id") id: String)

    /** `{ reason }` obligatorio, ≥3 caracteres. */
    @PATCH("finance/advances/{id}/reject")
    suspend fun rejectAdvance(@Path("id") id: String, @Body body: JsonBody)

    @PATCH("finance/advances/{id}/paid")
    suspend fun markAdvancePaid(@Path("id") id: String, @Body body: JsonBody = emptyMap())

    // Chat del evento (crea el canal la primera vez)
    @POST("chat/event/{eventId}")
    suspend fun openEventChannel(@Path("eventId") eventId: String): ChannelDetail
}

/** Retrofit de los módulos con el mismo OkHttp (cookies, CSRF, 401) que `ApiClient`. */
object ModulesClient {
    val api: ArtaModulesApi by lazy {
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        Retrofit.Builder()
            .baseUrl(ApiClient.baseUrl)
            .client(ApiClient.http)
            .addConverterFactory(MoshiConverterFactory.create(moshi).withNullSerialization())
            .build()
            .create(ArtaModulesApi::class.java)
    }
}

/** Usuario con rol, entidades y permisos; se pide una vez por sesión. */
object ModulesSession {
    private val lock = Mutex()
    @Volatile private var cached: ModulesMe? = null
    @Volatile private var people: List<DirUserDto>? = null

    suspend fun me(expectedId: String? = null, force: Boolean = false): ModulesMe = lock.withLock {
        val current = cached
        if (!force && current != null && (expectedId == null || current.id == expectedId)) return current
        ModulesClient.api.me().user.also {
            if (current?.id != it.id) people = null
            cached = it
        }
    }

    suspend fun directory(force: Boolean = false): List<DirUserDto> {
        people?.takeIf { !force }?.let { return it }
        return ModulesClient.api.directory().also { people = it }
    }

    fun clear() {
        cached = null
        people = null
    }
}
