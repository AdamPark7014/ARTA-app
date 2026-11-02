package com.artaproducciones.ops.ui.modules

import android.content.Context
import android.os.Build
import android.view.HapticFeedbackConstants
import android.widget.Toast
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.Crossfade
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.ui.unit.Dp
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.graphics.vector.ImageVector
import com.artaproducciones.ops.ui.theme.skeleton
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artaproducciones.ops.data.AccessUser
import com.artaproducciones.ops.data.ActiveEntity
import com.artaproducciones.ops.data.EventModule
import com.artaproducciones.ops.data.NoticeFeed
import com.artaproducciones.ops.data.Rbac
import com.artaproducciones.ops.data.api.ChannelSummary
import com.artaproducciones.ops.data.api.ChatAttachment
import com.artaproducciones.ops.data.api.EventDetailDto
import com.artaproducciones.ops.data.api.ModulesMe
import com.artaproducciones.ops.data.api.PersonRef
import com.artaproducciones.ops.data.api.SentNoticeDto
import com.artaproducciones.ops.data.api.TaskDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.chat.openAttachment
import com.artaproducciones.ops.ui.theme.ArtaCard
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.ArtaType
import com.artaproducciones.ops.ui.theme.Button
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.OutlinedButton
import com.artaproducciones.ops.ui.theme.QuietCount
import com.artaproducciones.ops.ui.theme.StatusPill
import com.artaproducciones.ops.ui.theme.TABULAR
import com.artaproducciones.ops.ui.theme.TextButton
import com.artaproducciones.ops.ui.theme.Tone
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

// ─── Permisos: la tabla y las reglas viven en data/Rbac.kt (espejo de @arta/rbac) ─

/** Quienes ven «Todas las tareas» (`GET /tasks/workload`). */
private val TEAM_ROLES = setOf("super_admin", "dir_general", "dir_adjunta", "gerente_arta", "dir_auditorio", "convenios")

class ModulesPerms(val me: ModulesMe) {
    val role: String = me.roleKey.orEmpty()

    /** Lo que piden las reglas de [Rbac]. */
    val access = AccessUser(role, me.entities, me.permissions)

    fun has(permission: String): Boolean = Rbac.hasPermission(role, me.permissions, permission)

    fun hasAny(vararg permissions: String) = permissions.any { has(it) }

    val isDirection: Boolean get() = Rbac.isDirectionRole(role)
    val canSeeTeamTasks: Boolean get() = role in TEAM_ROLES
    val canCreateTasks: Boolean get() = Rbac.canCreateTasks(role)

    fun canAccessEventOps(entity: String?): Boolean = entity != null && Rbac.canAccessEventOps(me.entities, role, entity)

    /** `canSeeModule`: ¿ve este módulo en este negocio? */
    fun canSeeModule(entity: String?, module: EventModule): Boolean = entity != null && Rbac.canSeeModule(access, entity, module)

    /**
     * La entidad activa, si el rol opera eventos en ella (eventos, OC, calendario). Null = en esta
     * entidad no hay operación de eventos para la persona: no se piden esos listados.
     */
    val opsEntity: String? get() = ActiveEntity.param?.takeIf { canAccessEventOps(it) }

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

    /** Órdenes de compra en el negocio activo: mismo candado que la pestaña del evento. */
    val canPo: Boolean get() = canSeeModule(opsEntity, EventModule.PO)

    /** Calendario de shows del negocio activo: quien opera eventos y, en solo lectura, el practicante. */
    val canSeeCalendar: Boolean get() = ActiveEntity.param?.let { Rbac.canSeeEventCalendar(me.entities, role, it) } == true

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

/** Relleno (acento) = espera una decisión; el resto, contorno. */
@Composable
@ReadOnlyComposable
fun taskStatusColor(status: String): Color = when (status) {
    "PENDING_APPROVAL" -> ArtaColors.Gold
    "DONE" -> ArtaColors.Ok
    "BLOCKED" -> ArtaColors.Danger
    "IN_PROGRESS" -> ArtaColors.Read
    else -> ArtaColors.Muted
}

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
    "comment" to "Comentario",
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
    "ADENDUM" -> "Adendum"
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

@Composable
@ReadOnlyComposable
fun poStatusColor(status: String): Color = when (status) {
    "PENDING_AUTH", "DRAFT" -> ArtaColors.Gold
    "AUTHORIZED" -> ArtaColors.Read
    "PAID" -> ArtaColors.Ok
    "REJECTED", "CANCELLED" -> ArtaColors.Danger
    else -> ArtaColors.Muted
}

// ─── Testigos de publicidad ─────────────────────────────────────────────────

/** Medios del API (`TESTIGO_MEDIA`). */
private val WITNESS_MEDIUM_LABELS = mapOf(
    "ESPECTACULAR" to "Espectaculares",
    "PENDON" to "Pendones",
    "PRENSA" to "Prensa",
    "RADIO" to "Radio",
    "TV" to "Televisión",
    "REDES" to "Redes sociales",
    "WEB" to "Web",
    "OTRO" to "Otros",
)

fun witnessMediumLabel(medium: String): String = WITNESS_MEDIUM_LABELS[medium] ?: medium

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

/**
 * Margen inferior de las listas de pantallas que no viven en el cascarón de pestañas (detalle de
 * evento, eventos, calendario): [extra] de aire más la barra de gestos, para que lo último no
 * quede debajo de ella.
 */
@Composable
fun bottomInset(extra: Dp = 32.dp): Dp = extra + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

/** Encabezado grande de las pestañas (como «Avisos»): ligero, como el saludo de Inicio. */
@Composable
fun ScreenTitle(title: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(
        modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 22.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            style = ArtaType.ScreenTitle,
            color = ArtaColors.Text,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing()
    }
}

/** Barra de las pantallas de detalle: atrás + título + acciones, con línea fina abajo. */
@Composable
fun DetailTopBar(title: String, onBack: () -> Unit, actions: @Composable RowScope.() -> Unit = {}) {
    val line = ArtaColors.Line
    Row(
        Modifier
            .fillMaxWidth()
            .drawBehind { drawLine(line, Offset(0f, size.height - 0.5f), Offset(size.width, size.height - 0.5f), 1f) }
            // Estas pantallas no viven en un Scaffold: la barra de estado la libra la barra misma.
            .statusBarsPadding()
            .padding(horizontal = 4.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Atrás") }
        // Si el título cambia (el nombre del evento aparece al pasar su encabezado), entra suave.
        Crossfade(title, Modifier.weight(1f), animationSpec = tween(200), label = "detailTitle") { text ->
            Text(
                text,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                fontSize = 17.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        actions()
    }
}

/**
 * Etiqueta de sección (la misma que iOS): MAYÚSCULAS espaciadas en terciario y el contador en
 * insignia discreta. [alert] solo para alertas reales (vencidas).
 */
@Composable
fun SectionTitle(
    text: String,
    modifier: Modifier = Modifier,
    count: Int? = null,
    alert: Boolean = false,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier.fillMaxWidth().heightIn(min = 40.dp).padding(start = 20.dp, end = 12.dp, top = 10.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // La etiqueta toma todo el espacio libre (no la mitad, que la partía en dos renglones sin
        // necesidad) y lo de la derecha queda siempre pegado al borde.
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text.uppercase(ES_MX),
                style = ArtaType.Cap,
                color = if (alert) ArtaColors.Danger else ArtaColors.Tertiary,
                modifier = Modifier.weight(1f, fill = false).semantics { heading() },
            )
            if (count != null) {
                Spacer(Modifier.width(8.dp))
                QuietCount(count)
            }
        }
        Spacer(Modifier.width(8.dp))
        trailing()
    }
}

/**
 * Estado en píldora (MAYÚSCULAS 10.5). El acento va relleno (requiere acción); los demás van en
 * contorno con su color: peligro y ok solo para errores y cierres reales.
 */
@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier) {
    val tone = when (color) {
        ArtaColors.Gold -> Tone.Action
        ArtaColors.Danger -> Tone.Danger
        ArtaColors.Ok -> Tone.Ok
        ArtaColors.Warn -> Tone.Warn
        ArtaColors.Text -> Tone.Strong
        else -> Tone.Info
    }
    StatusPill(text, tone, modifier)
}

@Composable
fun ModuleCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    ArtaCard(modifier = modifier, onClick = onClick, contentPadding = PaddingValues(14.dp), content = content)
}

@Composable
fun SkeletonBlock(modifier: Modifier = Modifier, height: Int = 14, widthFraction: Float = 1f) {
    val shape = if (LocalArtaTokens.current.isPill) RoundedCornerShape(50) else RoundedCornerShape(2.dp)
    Box(
        modifier
            .fillMaxWidth(widthFraction)
            .height(height.dp)
            .skeleton(shape),
    )
}

/** Esqueleto de lista mientras carga la primera vez: mismas tarjetas que el contenido. */
@Composable
fun SkeletonList(rows: Int = 6, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(rows) {
            ArtaCard(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SkeletonBlock(height = 14, widthFraction = 0.7f)
                SkeletonBlock(height = 10, widthFraction = 0.45f)
            }
        }
    }
}

/**
 * Vacío del sistema (el mismo que el del chat): ícono en círculo de acento tenue, título y una
 * línea de ayuda centrados.
 */
@Composable
fun EmptyState(
    title: String,
    text: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (icon != null) {
            // Igual que iOS: relleno neutro con línea fina; círculo en ARTA, recto en Auditorio.
            val shape = LocalArtaTokens.current.controlShape
            Box(
                Modifier.size(60.dp).background(ArtaColors.Surface2, shape).border(1.dp, ArtaColors.Line, shape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = ArtaColors.Muted, modifier = Modifier.size(26.dp))
            }
            Spacer(Modifier.height(6.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, color = ArtaColors.Text)
        if (text != null) Text(text, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onAction) { Text(actionLabel) }
        }
    }
}

/** Error que tapa la pantalla (no hay nada cargado): el mismo que el del chat, con «Reintentar». */
@Composable
fun ErrorState(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Outlined.CloudOff, contentDescription = null, tint = ArtaColors.Muted, modifier = Modifier.size(36.dp))
        Text("No se pudo cargar", style = MaterialTheme.typography.titleMedium, color = ArtaColors.Text, textAlign = TextAlign.Center)
        Text(message, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(4.dp))
        Button(onClick = onRetry) { Text("Reintentar") }
    }
}

/**
 * Texto del botón o, mientras trabaja, un círculo del color del contenido. El texto se queda (sin
 * verse) para que el botón no cambie de ancho, y el círculo toma el color del botón apagado: con
 * `OnAccent` fijo salía blanco sobre gris claro y no se veía.
 */
@Composable
fun BusyLabel(busy: Boolean, text: String, maxLines: Int = 1) {
    Box(contentAlignment = Alignment.Center) {
        Text(
            text,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = if (busy) Modifier.alpha(0f) else Modifier,
        )
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = LocalContentColor.current)
    }
}

/** Qué se ve en una lista: error que la tapa, esqueleto o lo cargado. */
enum class ListPhase { Error, Loading, Ready }

fun listPhase(hasData: Boolean, error: String?): ListPhase = when {
    hasData -> ListPhase.Ready
    error != null -> ListPhase.Error
    else -> ListPhase.Loading
}

/**
 * Cambia de esqueleto a contenido (o de pestaña) fundiendo, sin salto. [state] es la fase, nunca
 * los datos: lo que sale se sigue pintando durante el fundido, así que el contenido debe aguantar
 * que los datos ya no estén (`val x = dato ?: return@PhaseSwap`).
 */
@Composable
fun <S> PhaseSwap(state: S, modifier: Modifier = Modifier.fillMaxSize(), content: @Composable (S) -> Unit) {
    AnimatedContent(
        targetState = state,
        modifier = modifier,
        transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(110)) },
        label = "phase",
    ) { content(it) }
}

/** Banda de error sobre contenido que ya estaba cargado (no lo tapa). */
@Composable
fun InlineError(message: String, onRetry: () -> Unit) {
    // Sin relleno teñido: contorno de línea fuerte; el rojo, solo en el texto del error.
    val shape = LocalArtaTokens.current.itemShape
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(shape)
            .border(1.dp, ArtaColors.LineStrong, shape)
            .padding(start = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(message, color = ArtaColors.Danger, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        TextButton(onClick = onRetry, colors = ButtonDefaults.textButtonColors(contentColor = ArtaColors.Text)) { Text("Reintentar") }
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
            if (danger) {
                // Lo destructivo es discreto: contorno con el texto en rojo, nunca un botón rojo lleno.
                OutlinedButton(
                    onClick = { onDismiss(); onConfirm() },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = ArtaColors.Danger),
                ) { Text(confirmLabel) }
            } else {
                Button(onClick = { onDismiss(); onConfirm() }) { Text(confirmLabel) }
            }
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
            OutlinedButton(
                onClick = {
                    if (reason.isBlank()) showError = true else { onDismiss(); onConfirm(reason.trim()) }
                },
                colors = ButtonDefaults.outlinedButtonColors(contentColor = ArtaColors.Danger),
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

/**
 * Caché en memoria para no mostrar esqueleto cada vez que se vuelve a una pantalla.
 * Es de la entidad activa: al cambiar de entidad se vacía (`switchEntity`).
 */
object ModulesStore {
    private const val MAX_DETAILS = 24

    val taskLists = mutableMapOf<String, List<TaskDto>>()
    var events: List<com.artaproducciones.ops.data.api.EventSummaryDto>? = null
    var perms: ModulesPerms? = null
    internal var inicio: InicioData? = null
    internal var approvals: ApprovalsData? = null
    var channels: List<ChannelSummary>? = null

    /** Avisos por consulta: `false` = todos, `true` = solo sin leer. */
    val noticeFeeds = mutableMapOf<Boolean, NoticeFeed>()

    /** Avisos › Enviados; null = todavía no se pide. */
    var sentNotices: List<SentNoticeDto>? = null

    /** Avisos ya reportados como vistos: no se repiten. Si la llamada falla salen de aquí para reintentar. */
    val noticesReportedSeen = mutableSetOf<String>()

    /** Lo último visto de cada detalle: al volver de una tarea el evento no parpadea. */
    val eventDetails = object : LinkedHashMap<String, EventDetailDto>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, EventDetailDto>?) = size > MAX_DETAILS
    }
    val taskDetails = object : LinkedHashMap<String, TaskDto>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, TaskDto>?) = size > MAX_DETAILS
    }

    fun clear() {
        taskLists.clear()
        events = null
        perms = null
        inicio = null
        approvals = null
        channels = null
        noticeFeeds.clear()
        sentNotices = null
        noticesReportedSeen.clear()
        eventDetails.clear()
        taskDetails.clear()
    }
}
