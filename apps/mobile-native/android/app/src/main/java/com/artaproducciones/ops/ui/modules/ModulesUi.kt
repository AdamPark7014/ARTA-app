package com.artaproducciones.ops.ui.modules

import android.content.Context
import android.os.Build
import android.view.HapticFeedbackConstants
import android.widget.Toast
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.ChatAttachment
import com.artaproducciones.ops.data.api.ModulesMe
import com.artaproducciones.ops.data.api.PersonRef
import com.artaproducciones.ops.data.api.TaskDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.chat.openAttachment
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

internal val ES_MX: Locale = Locale("es", "MX")

// ─── Permisos: espejo de apps/api/src/common/rbac/roles.ts ──────────────────

private val ROLE_PERMISSIONS: Map<String, Set<String>> = mapOf(
    "gerente_arta" to setOf(
        "finance.edit", "finance.view", "campaign.edit", "campaign.view", "po.authorize", "po.mark_paid",
        "event.create", "event.close", "checklist.edit", "studio.edit", "ticketing.edit", "folders.edit", "vendor.pin",
    ),
    "dir_auditorio" to setOf(
        "finance.view", "campaign.view", "po.authorize", "po.mark_paid", "event.create", "event.close",
        "checklist.edit", "studio.edit", "ticketing.edit", "folders.edit", "vendor.pin",
    ),
    "logistica" to setOf(
        "campaign.edit", "campaign.view", "checklist.edit", "event.create", "ticketing.edit", "finance.view", "folders.edit",
    ),
    "convenios" to setOf("checklist.edit", "finance.view", "campaign.view", "folders.edit"),
    "enlace_gobierno" to setOf("checklist.edit", "finance.view", "po.mark_paid", "event.create", "folders.edit"),
    "solo_carpetas" to emptySet(),
)

/** Quienes ven «Todas las tareas» (`GET /tasks/workload`). */
private val TEAM_ROLES = setOf("super_admin", "dir_general", "dir_adjunta", "gerente_arta", "dir_auditorio", "convenios")
private val DIRECTION_ROLES = setOf("super_admin", "dir_general", "dir_adjunta")

class ModulesPerms(val me: ModulesMe) {
    val role: String = me.roleKey.orEmpty()

    fun has(permission: String): Boolean {
        if (role == "super_admin" || role == "dir_general") return true
        if (role == "dir_adjunta" && permission != "users.manage") return true
        if ("everything" in me.permissions) return true
        return permission in ROLE_PERMISSIONS[role].orEmpty() || permission in me.permissions
    }

    fun hasAny(vararg permissions: String) = permissions.any { has(it) }

    val isDirection: Boolean get() = role in DIRECTION_ROLES
    val canSeeTeamTasks: Boolean get() = role in TEAM_ROLES
    val canCreateTasks: Boolean get() = role != "solo_carpetas"

    fun canAccessEventOps(entity: String?): Boolean {
        if (entity == null) return false
        val entityOk = role == "super_admin" || role == "dir_general" || entity in me.entities
        if (!entityOk || role == "solo_carpetas") return false
        return !(role == "dir_auditorio" && entity == "ARTA")
    }

    val eventOpsEntities: List<String> get() = me.entities.filter { canAccessEventOps(it) }

    val canAuthorizePo: Boolean get() = has("po.authorize")
    val canMarkPaid: Boolean get() = has("po.mark_paid")

    /** La gerencia de Arta solo autoriza OC de Arta y Rodrigo solo las del Auditorio. */
    fun canAuthorizePoFor(entity: String?): Boolean {
        if (!canAuthorizePo) return false
        if (role == "gerente_arta" && entity != "ARTA") return false
        if (role == "dir_auditorio" && entity != "EXPLANADA") return false
        return true
    }

    /** Aprobar o rechazar una entrega: quien la pidió o dirección (`canApproveTask` del API). */
    fun canReviewTask(t: TaskDto): Boolean = t.createdById == me.id || isDirection

    val canSeeFinance: Boolean get() = hasAny("finance.view", "finance.edit")
    val canSeeCampaign: Boolean get() = hasAny("campaign.view", "campaign.edit")
    val canChecklistEdit: Boolean get() = has("checklist.edit")
    val canTicketing: Boolean get() = has("ticketing.edit")
    val canPo: Boolean get() = hasAny("checklist.edit", "po.authorize", "po.mark_paid")

    /** El rol aprueba algo además de sus propias tareas pedidas. */
    val approvesMoney: Boolean get() = canAuthorizePo || canMarkPaid
}

// ─── Tareas ─────────────────────────────────────────────────────────────────

internal val CLOSED_EVENT = setOf("CLOSED", "CANCELLED")

fun TaskDto.assigneeIdList(): List<String> = assigneeIds.ifEmpty { listOfNotNull(assigneeId) }
fun TaskDto.assigneePeople(): List<PersonRef> = assignees.ifEmpty { listOfNotNull(assignee) }
fun TaskDto.isAssignee(userId: String?): Boolean = userId != null && userId in assigneeIdList()

/** Hay quien pidió y no está entre los responsables → hace falta visto bueno. */
fun TaskDto.needsApproval(): Boolean = createdById != null && createdById !in assigneeIdList()
val TaskDto.eventClosed: Boolean get() = event?.status in CLOSED_EVENT

fun taskStatusLabel(t: TaskDto): String = when (t.status) {
    "OPEN" -> "Abierta"
    "IN_PROGRESS" -> "En curso"
    "PENDING_APPROVAL" -> "Por aprobar"
    "DONE" -> if (t.approvedBy != null && t.needsApproval()) "Aprobada" else "Hecha"
    "BLOCKED" -> "Bloqueada"
    else -> t.status
}

fun taskStatusColor(status: String): Color = when (status) {
    "PENDING_APPROVAL" -> ArtaColors.Gold
    "DONE" -> OkGreen
    "BLOCKED" -> ArtaColors.Danger
    "IN_PROGRESS" -> ArtaColors.Read
    else -> ArtaColors.Muted
}

internal val OkGreen = Color(0xFF22C55E)

val TASK_ACTION_LABEL = mapOf(
    "created" to "Tarea creada",
    "assigned" to "Asignada",
    "reassigned" to "Reasignada",
    "status_changed" to "Estado cambiado",
    "submitted" to "Entregada para revisión",
    "completed" to "Completada",
    "approved" to "Aprobada",
    "rejected" to "Rechazada — corrección pedida",
    "evidence_added" to "Evidencia agregada",
    "deleted" to "Eliminada",
)

enum class DueBucket(val label: String) {
    OVERDUE("Vencidas"),
    TODAY("Hoy"),
    TOMORROW("Mañana"),
    WEEK("Esta semana"),
    LATER("Después"),
    NONE("Sin fecha"),
    DONE("Completadas"),
}

/**
 * El vencimiento se guarda como medianoche UTC (la web manda `AAAA-MM-DD`): se usa la parte
 * de fecha de la cadena; convertir a hora local lo correría un día en México.
 */
fun dueDate(iso: String?): LocalDate? =
    iso?.takeIf { it.length >= 10 }?.let { runCatching { LocalDate.parse(it.substring(0, 10)) }.getOrNull() }

fun TaskDto.bucket(today: LocalDate = LocalDate.now()): DueBucket {
    if (status == "DONE") return DueBucket.DONE
    val d = dueDate(dueAt) ?: return DueBucket.NONE
    val diff = ChronoUnit.DAYS.between(today, d)
    return when {
        diff < 0 -> DueBucket.OVERDUE
        diff == 0L -> DueBucket.TODAY
        diff == 1L -> DueBucket.TOMORROW
        diff <= 7 -> DueBucket.WEEK
        else -> DueBucket.LATER
    }
}

fun TaskDto.isOverdue(today: LocalDate = LocalDate.now()): Boolean = bucket(today) == DueBucket.OVERDUE

private val DAY_MONTH = DateTimeFormatter.ofPattern("d MMM", ES_MX)
private val DAY_MONTH_YEAR = DateTimeFormatter.ofPattern("d MMM yyyy", ES_MX)
private val WEEKDAY_DAY_MONTH = DateTimeFormatter.ofPattern("EEE d MMM", ES_MX)
private val HM = DateTimeFormatter.ofPattern("HH:mm", ES_MX)
private val MONTH_YEAR = DateTimeFormatter.ofPattern("LLLL yyyy", ES_MX)

private fun clean(s: String) = s.replace(".", "")

fun shortDate(d: LocalDate, today: LocalDate = LocalDate.now()): String =
    clean(if (d.year == today.year) DAY_MONTH.format(d) else DAY_MONTH_YEAR.format(d))

fun monthYearLabel(d: LocalDate): String = MONTH_YEAR.format(d).replaceFirstChar { it.titlecase(ES_MX) }

/** «Vence hoy», «Vence mañana», «Vence en 3 días», «Venció hace 2 días», «Vence el 12 oct». */
fun dueLabel(iso: String?, today: LocalDate = LocalDate.now()): String {
    val d = dueDate(iso) ?: return "Sin fecha"
    val diff = ChronoUnit.DAYS.between(today, d)
    return when {
        diff == 0L -> "Vence hoy"
        diff == 1L -> "Vence mañana"
        diff == -1L -> "Venció ayer"
        diff < -1 -> "Venció hace ${-diff} días"
        diff in 2..6 -> "Vence en $diff días"
        else -> "Vence el ${shortDate(d, today)}"
    }
}

fun parseIso(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

fun localDateOf(iso: String?): LocalDate? = parseIso(iso)?.atZone(ZoneId.systemDefault())?.toLocalDate()

/** «hoy 16:00», «ayer 09:12», «12 oct 18:30». */
fun stampLabel(iso: String?): String {
    val instant = parseIso(iso) ?: return ""
    val zdt = instant.atZone(ZoneId.systemDefault())
    val today = LocalDate.now()
    val day = when (zdt.toLocalDate()) {
        today -> "hoy"
        today.minusDays(1) -> "ayer"
        else -> shortDate(zdt.toLocalDate(), today)
    }
    return "$day ${HM.format(zdt)}"
}

/** «Hoy», «Mañana», «En 5 días», «Hace 3 días». */
fun daysUntilLabel(iso: String?): String {
    val d = localDateOf(iso) ?: return ""
    val diff = ChronoUnit.DAYS.between(LocalDate.now(), d)
    return when {
        diff == 0L -> "Hoy"
        diff == 1L -> "Mañana"
        diff == -1L -> "Ayer"
        diff > 1 -> "En $diff días"
        else -> "Hace ${-diff} días"
    }
}

/** Fecha de un show: «Hoy 20:00», «Mañana 21:00», «Sáb 12 oct · 20:00», «12 – 14 oct». */
fun eventWhenLabel(startIso: String?, endIso: String?): String {
    val start = parseIso(startIso)?.atZone(ZoneId.systemDefault()) ?: return "Sin fecha"
    val end = parseIso(endIso)?.atZone(ZoneId.systemDefault())
    val today = LocalDate.now()
    val sd = start.toLocalDate()
    if (end != null && end.toLocalDate() != sd) {
        val ed = end.toLocalDate()
        return if (sd.month == ed.month && sd.year == ed.year) "${sd.dayOfMonth} – ${shortDate(ed, today)}"
        else "${shortDate(sd, today)} – ${shortDate(ed, today)}"
    }
    val time = if (start.hour == 0 && start.minute == 0) "" else HM.format(start)
    val day = when (sd) {
        today -> "Hoy"
        today.plusDays(1) -> "Mañana"
        else -> clean(WEEKDAY_DAY_MONTH.format(sd)).replaceFirstChar { it.titlecase(ES_MX) } +
            if (sd.year != today.year) " ${sd.year}" else ""
    }
    return if (time.isEmpty()) day else if (sd == today || sd == today.plusDays(1)) "$day $time" else "$day · $time"
}

private val MONEY = NumberFormat.getCurrencyInstance(ES_MX)
fun money(amount: Double?): String = if (amount == null) "—" else synchronized(MONEY) { MONEY.format(amount) }
fun moneyOf(raw: String?): String = money(raw?.toDoubleOrNull())

fun eventStatusLabel(status: String): String? = when (status) {
    "DRAFT" -> "Borrador"
    "CLOSED" -> "Cerrado"
    "CANCELLED" -> "Cancelado"
    else -> null
}

fun firstName(full: String?): String = full?.trim()?.split(Regex("\\s+"))?.firstOrNull()?.takeIf { it.isNotBlank() } ?: "equipo"

// ─── Órdenes de compra ──────────────────────────────────────────────────────

private val PO_RUBRO_LABELS = mapOf(
    "audio" to "Audio",
    "luces" to "Luces",
    "planta_luz" to "Planta de luz",
    "hospedaje" to "Hospedaje",
    "transporte" to "Transporte",
    "catering" to "Catering",
    "artes" to "Artes",
    "publicidad" to "Publicidad / campaña",
    "otro" to "Otro",
)

fun poRubroLabel(rubro: String?): String = if (rubro.isNullOrBlank()) "Sin rubro" else PO_RUBRO_LABELS[rubro] ?: rubro

fun poPaymentLabel(method: String?): String = when (method) {
    "EFECTIVO" -> "Efectivo"
    "CHEQUE" -> "Cheque"
    "TARJETA" -> "Tarjeta"
    "OTRO" -> "Otro"
    else -> "Transferencia"
}

fun poIsPending(status: String) = status == "PENDING_AUTH" || status == "DRAFT"

/** Todo lo que no sea efectivo pide comprobante antes de marcar pagada. */
fun poNeedsProof(method: String?) = method != "EFECTIVO"

fun poStatusLabel(status: String): String = when (status) {
    "PENDING_AUTH", "DRAFT" -> "Por autorizar"
    "AUTHORIZED" -> "Por pagar"
    "PAID" -> "Pagada"
    "REJECTED" -> "Rechazada"
    "CANCELLED" -> "Cancelada"
    else -> status
}

fun poStatusColor(status: String): Color = when (status) {
    "PENDING_AUTH", "DRAFT" -> ArtaColors.Gold
    "AUTHORIZED" -> ArtaColors.Read
    "PAID" -> OkGreen
    "REJECTED", "CANCELLED" -> ArtaColors.Danger
    else -> ArtaColors.Muted
}

// ─── Utilidades de plataforma ───────────────────────────────────────────────

fun toast(context: Context, text: String) = Toast.makeText(context, text, Toast.LENGTH_SHORT).show()

/** Baja el archivo con la sesión y lo abre con el visor del sistema (PDF, foto, Excel…). */
fun openRemoteFile(context: Context, scope: CoroutineScope, url: String, name: String?) {
    scope.launch {
        runCatching { openAttachment(context, ChatAttachment(url = url, name = name ?: url.substringAfterLast('/'))) }
            .onFailure { toast(context, it.userMessage()) }
    }
}

class Haptics(private val view: android.view.View) {
    fun confirm() {
        view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
    }

    fun reject() {
        view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS)
    }

    fun tick() {
        view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    }
}

@Composable
fun rememberHaptics(): Haptics {
    val view = LocalView.current
    return remember(view) { Haptics(view) }
}

// ─── Piezas de UI compartidas ───────────────────────────────────────────────

/** Encabezado grande de las pestañas (como «Avisos»). */
@Composable
fun ScreenTitle(title: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(
        modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 20.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        trailing()
    }
}

/** Barra de las pantallas de detalle: atrás + título + acciones. */
@Composable
fun DetailTopBar(title: String, onBack: () -> Unit, actions: @Composable RowScope.() -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Atrás") }
        Text(
            title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        actions()
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, count: Int? = null, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text.uppercase(ES_MX), style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted, fontWeight = FontWeight.SemiBold)
        if (count != null) {
            Spacer(Modifier.width(8.dp))
            Text("$count", style = MaterialTheme.typography.labelMedium, color = ArtaColors.Gold, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.weight(1f))
        trailing()
    }
}

@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .background(color.copy(alpha = 0.16f), RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        Text(text, color = color, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
fun ModuleCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    val border = BorderStroke(0.5.dp, ArtaColors.Line)
    if (onClick != null) {
        Surface(onClick = onClick, modifier = modifier.fillMaxWidth(), shape = shape, color = ArtaColors.BgElev, border = border) {
            Column(Modifier.padding(12.dp), content = content)
        }
    } else {
        Surface(modifier = modifier.fillMaxWidth(), shape = shape, color = ArtaColors.BgElev, border = border) {
            Column(Modifier.padding(12.dp), content = content)
        }
    }
}

@Composable
fun SkeletonBlock(modifier: Modifier = Modifier, height: Int = 14, widthFraction: Float = 1f) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val alpha by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.8f,
        animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse),
        label = "skeletonAlpha",
    )
    Box(
        modifier
            .fillMaxWidth(widthFraction)
            .height(height.dp)
            .alpha(alpha)
            .background(ArtaColors.Surface2, RoundedCornerShape(6.dp)),
    )
}

/** Esqueleto de lista mientras carga la primera vez. */
@Composable
fun SkeletonList(rows: Int = 6, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        repeat(rows) {
            Column(
                Modifier.fillMaxWidth().background(ArtaColors.BgElev, RoundedCornerShape(12.dp)).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SkeletonBlock(height = 16, widthFraction = 0.7f)
                SkeletonBlock(height = 12, widthFraction = 0.45f)
            }
        }
    }
}

@Composable
fun EmptyState(title: String, text: String? = null, actionLabel: String? = null, onAction: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        if (text != null) Text(text, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(4.dp))
            OutlinedButton(onClick = onAction) { Text(actionLabel) }
        }
    }
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(message, color = ArtaColors.Danger, textAlign = TextAlign.Center)
        Button(onClick = onRetry) { Text("Reintentar") }
    }
}

/** Banda de error sobre contenido que ya estaba cargado (no lo tapa). */
@Composable
fun InlineError(message: String, onRetry: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
            .background(ArtaColors.Danger.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
            .padding(start = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(message, color = ArtaColors.Danger, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        TextButton(onClick = onRetry) { Text("Reintentar") }
    }
}

@Composable
fun ConfirmDialog(
    title: String,
    text: String?,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    danger: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = text?.let { { Text(it) } },
        confirmButton = {
            Button(
                onClick = { onDismiss(); onConfirm() },
                colors = if (danger) ButtonDefaults.buttonColors(containerColor = ArtaColors.Danger, contentColor = Color.White)
                else ButtonDefaults.buttonColors(),
            ) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        containerColor = ArtaColors.BgElev,
    )
}

/** Rechazar con motivo obligatorio. */
@Composable
fun ReasonDialog(
    title: String,
    placeholder: String,
    confirmLabel: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var reason by remember { mutableStateOf("") }
    var showError by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it; showError = false },
                    placeholder = { Text(placeholder) },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                    isError = showError,
                )
                if (showError) Text("Escribe el motivo", color = ArtaColors.Danger, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (reason.isBlank()) showError = true else { onDismiss(); onConfirm(reason.trim()) }
                },
                colors = ButtonDefaults.buttonColors(containerColor = ArtaColors.Danger, contentColor = Color.White),
            ) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        containerColor = ArtaColors.BgElev,
    )
}

@Composable
fun Dot(color: Color, size: Int = 6) {
    Box(Modifier.size(size.dp).background(color, RoundedCornerShape(50)))
}

/** Caché en memoria para no mostrar esqueleto cada vez que se vuelve a una pantalla. */
object ModulesStore {
    val taskLists = mutableMapOf<String, List<TaskDto>>()
    var events: List<com.artaproducciones.ops.data.api.EventSummaryDto>? = null

    fun clear() {
        taskLists.clear()
        events = null
    }
}
