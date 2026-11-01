package com.artaproducciones.ops.ui.modules

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.automirrored.outlined.FormatListBulleted
import com.artaproducciones.ops.ui.theme.CountBadge
import com.artaproducciones.ops.ui.theme.cardSurface
import com.artaproducciones.ops.ui.theme.fadingEdges
import com.artaproducciones.ops.ui.theme.pressScale
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artaproducciones.ops.data.ActiveEntity
import com.artaproducciones.ops.data.BizEntity
import com.artaproducciones.ops.data.api.AdvanceDto
import com.artaproducciones.ops.data.api.EventSummaryDto
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.ModulesSession
import com.artaproducciones.ops.data.api.TaskDto
import com.artaproducciones.ops.data.api.UserDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.EntityChip
import com.artaproducciones.ops.ui.theme.ArtaCard
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.ArtaType
import com.artaproducciones.ops.ui.theme.BrandMark
import com.artaproducciones.ops.ui.theme.LocalActiveEntity
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.StatusPill
import com.artaproducciones.ops.ui.theme.TABULAR
import com.artaproducciones.ops.ui.theme.TextButton
import com.artaproducciones.ops.ui.theme.Tone
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

private val TODAY_LONG = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", ES_MX)
private val HM = DateTimeFormatter.ofPattern("HH:mm", ES_MX)

internal class InicioData(
    val myTasks: List<TaskDto>?,
    val approvals: ApprovalsData?,
    val events: List<EventSummaryDto>?,
    val firstError: String?,
)

/**
 * Inicio (docs/diseno/SISTEMA-VISUAL.md › Apps): saludo, dos tarjetas de cifra, «Hoy» como línea
 * de tiempo y lo que espera mi visto bueno. Todo sale de lo que ya se carga aquí; nada nuevo del API.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InicioScreen(user: UserDto, nav: ModuleNav) {
    // Lo último cargado se ve de inmediato al volver y se actualiza por detrás, sin esqueleto.
    var perms by remember { mutableStateOf(ModulesStore.perms) }
    var data by remember { mutableStateOf(ModulesStore.inicio) }
    var refreshing by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }
    var creating by remember { mutableStateOf(false) }
    val today = LocalDate.now()
    val entity = LocalActiveEntity.current
    var dataEntity by remember { mutableStateOf(entity) }

    LaunchedEffect(user.id, tick, entity) {
        // Lo cargado era de la otra entidad: esqueleto en vez de mezclarlo con lo nuevo.
        if (dataEntity != entity) {
            data = null
            dataEntity = entity
        }
        try {
            val p = ModulesPerms(ModulesSession.me(expectedId = user.id))
            perms = p
            ModulesStore.perms = p
            val active = ActiveEntity.param
            val ops = p.opsEntity
            data = coroutineScope {
                val tasks = async { runCatching { ModulesClient.api.myTasks(active) } }
                val approvals = async { runCatching { loadApprovals(p) } }
                val events = async {
                    runCatching {
                        if (ops == null) emptyList() else ModulesClient.api.events(entity = ops, scope = "active")
                    }
                }
                val t = tasks.await()
                val a = approvals.await()
                val e = events.await()
                t.getOrNull()?.let { ModulesStore.taskLists["mine"] = it }
                InicioData(
                    myTasks = t.getOrNull() ?: data?.myTasks,
                    approvals = a.getOrNull() ?: data?.approvals,
                    events = e.getOrNull() ?: data?.events,
                    firstError = listOf(t, a, e).firstNotNullOfOrNull { it.exceptionOrNull() }?.userMessage(),
                )
            }
            ModulesStore.inicio = data
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            data = InicioData(data?.myTasks, data?.approvals, data?.events, e.userMessage())
        } finally {
            refreshing = false
        }
    }

    val p = perms
    val d = data
    val hasContent = d != null && (d.myTasks != null || d.events != null || d.approvals != null)

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = {
            refreshing = true
            tick++
        },
        modifier = Modifier.fillMaxSize(),
    ) {
        val listState = rememberLazyListState()
        LazyColumn(
            Modifier.fillMaxSize().fadingEdges(listState, start = 20.dp, end = 28.dp),
            state = listState,
            contentPadding = PaddingValues(bottom = 32.dp),
        ) {
            item(key = "header") { Header(user, today, entity) }
            when {
                !hasContent && d?.firstError != null -> item(key = "error") { ErrorState(d.firstError, onRetry = { tick++ }, modifier = Modifier.animateItem()) }
                !hasContent || p == null || d == null -> item(key = "skeleton") { Box(Modifier.animateItem()) { InicioSkeleton() } }
                else -> {
                    d.firstError?.let { msg -> item(key = "inline-error") { InlineError(msg) { tick++ } } }
                    item(key = "kpi") { Box(Modifier.animateItem()) { KpiRow(p, d, today, entity, nav) } }
                    item(key = "quick") { Box(Modifier.animateItem()) { QuickActions(p, d.approvals, onNewTask = { creating = true }, nav = nav) } }
                    val ops = p.opsEntity != null
                    val todayEvents = if (ops) eventsOn(d.events, today) else emptyList()
                    if (todayEvents.isNotEmpty()) {
                        item(key = "today") { Box(Modifier.animateItem()) { TodayPanel(todayEvents, today, onOpen = { nav.openEvent(it) }) } }
                    }
                    val approvals = d.approvals
                    if (approvals != null && (p.approvesMoney || approvals.tasksToReview.isNotEmpty() || approvals.actionableAdvances.isNotEmpty())) {
                        item(key = "approvals") { Box(Modifier.animateItem()) { ApprovalsPanel(approvals, p, nav) } }
                    }
                    todayTasks(d.myTasks, today, nav)
                    if (ops) upcomingEvents(d.events, today, nav)
                }
            }
        }
    }

    if (creating) {
        TaskFormSheet(
            onDismiss = { creating = false },
            onSaved = {
                creating = false
                ModulesStore.taskLists.clear()
                tick++
            },
        )
    }
}

// ─── Encabezado ─────────────────────────────────────────────────────────────

@Composable
private fun Header(user: UserDto, today: LocalDate, entity: BizEntity) {
    Column(Modifier.padding(start = 20.dp, end = 16.dp, top = 18.dp, bottom = 14.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            BrandMark(entity)
            Spacer(Modifier.weight(1f))
            EntityChip()
        }
        // El chip de un híbrido ya trae su margen de toque.
        Spacer(Modifier.height(if (ActiveEntity.isHybrid) 12.dp else 22.dp))
        Text(TODAY_LONG.format(today).uppercase(ES_MX), style = ArtaType.Cap, color = ArtaColors.Tertiary)
        Spacer(Modifier.height(4.dp))
        Text(
            buildAnnotatedString {
                append("Hola, ")
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(firstName(user.fullName)) }
            },
            style = ArtaType.Greeting,
            color = ArtaColors.Text,
            modifier = Modifier.semantics { heading() },
        )
    }
}

@Composable
private fun InicioSkeleton() {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            repeat(2) {
                ArtaCard(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SkeletonBlock(height = 10, widthFraction = 0.6f)
                    SkeletonBlock(height = 26, widthFraction = 0.3f)
                    SkeletonBlock(height = 10, widthFraction = 0.8f)
                }
            }
        }
        SkeletonList(3)
    }
}

// ─── Cifras ─────────────────────────────────────────────────────────────────

private class Kpi(
    val label: String,
    val value: String,
    val detail: String?,
    val silver: Boolean = false,
    /** El detalle es una alerta real (tareas vencidas): va en el color de peligro. */
    val alert: Boolean = false,
    val onClick: (() -> Unit)? = null,
    val clickLabel: String? = null,
)

private val ACTIONABLE = setOf("OPEN", "IN_PROGRESS", "BLOCKED")

private fun EventSummaryDto.startLocal(): ZonedDateTime? = parseIso(startsAt)?.atZone(ZoneId.systemDefault())
private fun EventSummaryDto.endLocal(): ZonedDateTime? = parseIso(endsAt)?.atZone(ZoneId.systemDefault())

/** Eventos vivos que tocan [day] (los de varios días cuentan todos sus días). */
private fun eventsOn(events: List<EventSummaryDto>?, day: LocalDate): List<EventSummaryDto> =
    events.orEmpty()
        .filter { it.status !in CLOSED_EVENT }
        .filter { e ->
            val start = e.startDay() ?: return@filter false
            val end = e.endDay() ?: start
            !day.isBefore(start) && !day.isAfter(end)
        }
        .sortedBy { it.startsAt ?: "" }

private fun nextEvent(events: List<EventSummaryDto>?, today: LocalDate): EventSummaryDto? =
    events.orEmpty()
        .filter { it.status !in CLOSED_EVENT }
        .filter { e -> !(e.endDay() ?: e.startDay() ?: return@filter false).isBefore(today) }
        .minByOrNull { it.startsAt ?: "9999" }

private fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"

@Composable
private fun KpiRow(p: ModulesPerms, d: InicioData, today: LocalDate, entity: BizEntity, nav: ModuleNav) {
    val auditorio = entity == BizEntity.EXPLANADA
    val approvals = d.approvals
    val approver = approvals != null && (p.approvesMoney || approvals.tasksToReview.isNotEmpty() || approvals.actionableAdvances.isNotEmpty())
    val next = if (p.opsEntity != null) nextEvent(d.events, today) else null
    val actionable = d.myTasks.orEmpty().filter { it.status in ACTIONABLE }

    val showKpi: Kpi? = next?.let { e ->
        val days = e.startDay()?.let { ChronoUnit.DAYS.between(today, it) }
        val value = when {
            days == null -> "Sin fecha"
            days < 0 -> "En curso"
            days == 0L -> "Hoy"
            days == 1L -> "Mañana"
            else -> "$days días"
        }
        Kpi(if (auditorio) "Próximo show" else "Próximo evento", value, e.name, silver = auditorio, onClick = { nav.openEvent(e.id) }, clickLabel = "Abrir ${e.name}")
    }
    val approvalsKpi: Kpi? = approvals?.takeIf { approver }?.let { a ->
        val orders = a.toAuthorize(p).size + a.toPay(p).size
        val advances = a.actionableAdvances.size
        val deliveries = a.tasksToReview.size
        val parts = listOfNotNull(
            orders.takeIf { it > 0 }?.let { "$it OC" },
            advances.takeIf { it > 0 }?.let { plural(it, "anticipo", "anticipos") },
            deliveries.takeIf { it > 0 }?.let { plural(it, "entrega", "entregas") },
        )
        Kpi("Por aprobar", "${a.pendingCount(p)}", parts.joinToString(" · ").ifEmpty { "Nada pendiente" }, onClick = { nav.openApprovals() }, clickLabel = "Abrir aprobaciones")
    }
    val openKpi = Kpi(
        "Abiertas",
        "${actionable.size}",
        if (actionable.isEmpty()) "Estás al día" else "tareas mías",
        onClick = { nav.openWeb("/tasks", "Tareas") },
        clickLabel = "Abrir tareas",
    )
    // Auditorio pone primero el próximo show (como la propuesta); ARTA, lo que espera su visto bueno.
    val first = (if (auditorio) showKpi ?: approvalsKpi else approvalsKpi ?: showKpi) ?: openKpi

    val dueToday = actionable.count { it.bucket(today) == DueBucket.TODAY }
    val overdue = actionable.count { it.isOverdue(today) }
    val second = Kpi(
        "Vencen hoy",
        "$dueToday",
        when {
            actionable.isEmpty() -> "Sin tareas abiertas"
            overdue > 0 -> "${plural(overdue, "vencida", "vencidas")} · de ${actionable.size} abiertas"
            else -> "de ${plural(actionable.size, "abierta", "abiertas")}"
        },
        alert = overdue > 0,
        onClick = { nav.openWeb("/tasks", "Tareas") },
        clickLabel = "Abrir tareas",
    )

    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        KpiCard(first, Modifier.weight(1f).fillMaxHeight())
        KpiCard(second, Modifier.weight(1f).fillMaxHeight())
    }
}

@Composable
private fun KpiCard(k: Kpi, modifier: Modifier) {
    val t = LocalArtaTokens.current
    ArtaCard(
        modifier = modifier.semantics(mergeDescendants = true) {},
        onClick = k.onClick,
        onClickLabel = k.clickLabel,
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 13.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(k.label.uppercase(ES_MX), style = ArtaType.Cap.copy(fontSize = 10.sp, letterSpacing = 1.4.sp), color = ArtaColors.Tertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        val valueStyle = if (k.silver) ArtaType.Kpi.copy(brush = t.accentBrush) else ArtaType.Kpi.copy(color = ArtaColors.Text)
        Text(k.value, style = valueStyle, maxLines = 1, overflow = TextOverflow.Ellipsis)
        k.detail?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = if (k.alert) ArtaColors.Danger else ArtaColors.Tertiary, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ─── Accesos ────────────────────────────────────────────────────────────────

private class Shortcut(val label: String, val icon: ImageVector, val badge: Int = 0, val primary: Boolean = false, val onClick: () -> Unit)

/**
 * Accesos en mosaico de dos columnas con renglones del mismo alto, como iOS: nada se va por el
 * borde de la pantalla. Si sobra uno, ocupa el renglón completo (sin un mosaico huérfano).
 */
@Composable
private fun QuickActions(p: ModulesPerms, approvals: ApprovalsData?, onNewTask: () -> Unit, nav: ModuleNav) {
    val pending = approvals?.pendingCount(p) ?: 0
    val items = buildList {
        if (p.canCreateTasks) add(Shortcut("Nueva tarea", Icons.Default.Add, primary = true, onClick = onNewTask))
        add(Shortcut("Mis tareas", Icons.AutoMirrored.Outlined.FormatListBulleted) { nav.openWeb("/tasks", "Tareas") })
        if (p.approvesMoney || pending > 0) add(Shortcut("Aprobaciones", Icons.Outlined.FactCheck, badge = pending) { nav.openApprovals() })
        if (p.opsEntity != null) add(Shortcut("Calendario", Icons.Outlined.CalendarMonth) { nav.openWeb("/calendar", "Calendario") })
        if (p.canPo) add(Shortcut("Órdenes de compra", Icons.Outlined.ReceiptLong) { nav.openWeb("/purchase-orders", "Órdenes de compra") })
        if (p.canSeeFinance) add(Shortcut("Anticipos", Icons.Outlined.Payments) { nav.openWeb("/advances", "Anticipos") })
    }
    Column(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 6.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { ShortcutTile(it, Modifier.weight(1f).fillMaxHeight()) }
            }
        }
    }
}

/** Mosaico de acceso: el principal en acento; los demás, tarjeta. Etiqueta hasta en dos renglones. */
@Composable
private fun ShortcutTile(s: Shortcut, modifier: Modifier) {
    val t = LocalArtaTokens.current
    val shape = t.cardShape
    val fg = if (s.primary) t.onAccent else t.text
    val interaction = remember { MutableInteractionSource() }
    val paint = if (s.primary) Modifier.clip(shape).background(t.accentBrush) else Modifier.cardSurface(t)
    Row(
        modifier
            .heightIn(min = 52.dp)
            .pressScale(interaction, pressed = 0.97f)
            .then(paint)
            .clickable(interactionSource = interaction, indication = LocalIndication.current, role = Role.Button, onClick = s.onClick)
            .semantics(mergeDescendants = true) {}
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // El contador va en la esquina del ícono (como un globo): la etiqueta conserva todo el ancho
        // y «Aprobaciones» no se parte a media palabra con la letra del sistema agrandada.
        Box {
            Icon(s.icon, contentDescription = null, tint = if (s.primary) fg else t.secondary, modifier = Modifier.size(19.dp))
            if (s.badge > 0) {
                CountBadge(s.badge, inverted = s.primary, small = true, modifier = Modifier.align(Alignment.TopEnd).offset(x = 9.dp, y = (-8).dp))
            }
        }
        Spacer(Modifier.width(if (s.badge > 0) 14.dp else 10.dp))
        Text(
            s.label,
            color = fg,
            style = MaterialTheme.typography.labelLarge.copy(fontSize = 14.sp, lineHeight = 18.sp),
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}

// ─── Hoy (línea de tiempo) ──────────────────────────────────────────────────

private class Moment(val time: String, val done: Boolean, val title: String, val detail: String?, val eventId: String)

private fun momentsOf(events: List<EventSummaryDto>, today: LocalDate, now: ZonedDateTime): List<Moment> {
    val single = events.size == 1
    return events.flatMap { e ->
        val start = e.startLocal()
        val end = e.endLocal()
        val place = e.venue?.takeIf { it.isNotBlank() }
        val live = start != null && !now.isBefore(start) && (end == null || now.isBefore(end))
        val startsToday = start?.toLocalDate() == today
        buildList {
            add(
                Moment(
                    time = if (startsToday && start != null) HM.format(start) else "Hoy",
                    done = start != null && !now.isBefore(start),
                    // Con un solo evento su nombre ya va en el encabezado del panel.
                    title = if (single) (if (startsToday) "Inicio" else "Continúa") else e.name,
                    detail = listOfNotNull(place, "en curso".takeIf { live }).joinToString(" · ").ifBlank { null },
                    eventId = e.id,
                ),
            )
            if (end != null && end.toLocalDate() == today) {
                add(Moment(HM.format(end), !now.isBefore(end), "Cierre", if (single) null else e.name, e.id))
            }
        }
    }
}

@Composable
private fun TodayPanel(events: List<EventSummaryDto>, today: LocalDate, onOpen: (String) -> Unit) {
    val moments = remember(events, today) { momentsOf(events, today, ZonedDateTime.now()) }
    ArtaCard(
        Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 8.dp),
    ) {
        PanelHeader("Hoy", if (events.size == 1) events.first().name else plural(events.size, "evento", "eventos"))
        Spacer(Modifier.height(6.dp))
        moments.forEach { m -> TimelineRow(m) { onOpen(m.eventId) } }
    }
}

@Composable
private fun PanelHeader(title: String, trailing: String?, onTrailing: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            title,
            style = ArtaType.PanelTitle,
            color = ArtaColors.Text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        if (trailing != null) {
            Spacer(Modifier.width(12.dp))
            val click = if (onTrailing != null) {
                Modifier
                    .minimumInteractiveComponentSize()
                    .clip(LocalArtaTokens.current.controlShape)
                    .clickable(role = Role.Button, onClick = onTrailing)
                    .padding(horizontal = 6.dp, vertical = 4.dp)
            } else {
                Modifier
            }
            Text(
                trailing,
                style = MaterialTheme.typography.bodySmall,
                color = ArtaColors.Tertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 170.dp).then(click),
            )
        }
    }
}

@Composable
private fun TimelineRow(m: Moment, onClick: () -> Unit) {
    val t = LocalArtaTokens.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(t.itemShape)
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(vertical = 7.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(m.time, style = ArtaType.Time, color = ArtaColors.Tertiary, modifier = Modifier.width(52.dp).padding(top = 1.dp))
        Box(Modifier.width(22.dp).padding(top = 4.dp), contentAlignment = Alignment.TopCenter) { TimelineDot(m.done) }
        Column(Modifier.weight(1f).padding(start = 6.dp)) {
            Text(m.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = ArtaColors.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            m.detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Tertiary, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/** Punto de la línea de tiempo: relleno = hecho o en curso; contorno = pendiente. En Auditorio, con brillo. */
@Composable
private fun TimelineDot(done: Boolean) {
    val t = LocalArtaTokens.current
    val accent = t.accent
    val glow = if (done && t.isDark) {
        Modifier.drawBehind {
            drawCircle(Brush.radialGradient(listOf(accent.copy(alpha = 0.45f), Color.Transparent)), radius = size.minDimension * 1.2f)
        }
    } else {
        Modifier
    }
    Box(
        glow
            .size(10.dp)
            .clip(CircleShape)
            .background(if (done) accent else t.bg)
            .border(2.dp, accent, CircleShape),
    )
}

// ─── Esperan tu visto bueno ─────────────────────────────────────────────────

private class Pending(val title: String, val detail: String?, val amount: String?, val status: String, val action: Boolean, val open: () -> Unit)

private fun AdvanceDto.who(): String? = uploadedBy?.fullName?.takeIf { it.isNotBlank() }?.let { firstName(it) }

private fun joinDetail(vararg parts: String?): String? = parts.filterNotNull().filter { it.isNotBlank() }.joinToString(" · ").ifBlank { null }

@Composable
private fun ApprovalsPanel(a: ApprovalsData, p: ModulesPerms, nav: ModuleNav) {
    val items = buildList {
        a.tasksToReview.forEach { t ->
            val who = t.assigneePeople().firstOrNull()?.fullName?.let(::firstName)
            add(Pending("Entrega · ${t.title}", joinDetail(who, t.event?.name), null, "Revisar", true) { nav.openTask(t.id) })
        }
        a.toAuthorize(p).forEach { o ->
            add(Pending("Orden de compra · ${poRubroLabel(o.row.rubro)}", joinDetail(o.row.vendorName, o.row.eventName), money(o.row.amount), "Autorizar", true) { nav.openApprovals() })
        }
        a.toPay(p).forEach { o ->
            // Fuera de la ventana de pagos no hay nada que hacer todavía: va como informativo.
            add(Pending("Orden de compra · ${poRubroLabel(o.row.rubro)}", joinDetail(o.row.vendorName, o.row.eventName), money(o.row.amount), if (a.canPayNow) "Pagar" else "Por pagar", a.canPayNow) { nav.openApprovals() })
        }
        a.actionableAdvances.forEach { ad ->
            val toApprove = ad.advanceStatus == "PENDING"
            add(Pending(advanceTitle(ad.conceptLabel()), joinDetail(ad.who(), ad.event?.name), advanceAmountOrNull(ad.amount), if (toApprove) "Aprobar" else "Pagar", true) { nav.openApprovals() })
        }
    }
    ArtaCard(
        Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
        contentPadding = PaddingValues(start = 16.dp, end = 12.dp, top = 8.dp, bottom = 4.dp),
    ) {
        PanelHeader("Esperan tu visto bueno", "Ver todo", onTrailing = { nav.openApprovals() })
        if (items.isEmpty()) {
            Text(
                "Nada pendiente de tu visto bueno.",
                style = MaterialTheme.typography.bodyMedium,
                color = ArtaColors.Muted,
                modifier = Modifier.padding(top = 2.dp, bottom = 10.dp),
            )
        }
        items.take(5).forEachIndexed { i, item ->
            if (i > 0) HorizontalDivider(thickness = 1.dp, color = ArtaColors.Line, modifier = Modifier.padding(end = 4.dp))
            PendingRow(item)
        }
        if (items.size > 5) {
            Text(
                "${items.size - 5} más en Aprobaciones",
                style = MaterialTheme.typography.bodySmall,
                color = ArtaColors.Tertiary,
                modifier = Modifier.padding(top = 2.dp, bottom = 8.dp),
            )
        }
    }
}

/**
 * «Anticipo de hospedaje» ya dice que es anticipo: sin el prefijo repetido («Anticipo · Anticipo
 * de hospedaje»). Los demás conceptos llevan «Anticipo · » delante.
 */
internal fun advanceTitle(concept: String): String =
    if (concept.trim().startsWith("anticipo", ignoreCase = true)) concept.trim() else "Anticipo · ${concept.trim()}"

/**
 * Fila de pendiente: título y detalle hasta en dos renglones; el monto y el estado van apilados
 * a la derecha para no robarle ancho al texto.
 */
@Composable
private fun PendingRow(item: Pending) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = item.open)
            .padding(top = 12.dp, bottom = 12.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(item.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = ArtaColors.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            item.detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Tertiary, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
        Spacer(Modifier.width(12.dp))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            item.amount?.let { amount ->
                Text(
                    amount,
                    style = MaterialTheme.typography.bodyMedium.merge(TextStyle(fontFeatureSettings = TABULAR)),
                    fontWeight = FontWeight.SemiBold,
                    color = ArtaColors.Text,
                    maxLines = 1,
                )
            }
            StatusPill(item.status, if (item.action) Tone.Action else Tone.Info)
        }
    }
}

// ─── Mis tareas de hoy y próximos días ──────────────────────────────────────

private fun androidx.compose.foundation.lazy.LazyListScope.todayTasks(tasks: List<TaskDto>?, today: LocalDate, nav: ModuleNav) {
    if (tasks == null) return
    val actionable = tasks.filter { it.status in ACTIONABLE }
    val urgent = actionable
        .filter { val b = it.bucket(today); b == DueBucket.OVERDUE || b == DueBucket.TODAY }
        .sortedBy { it.dueAt ?: "" }
    val overdue = urgent.count { it.isOverdue(today) }
    item(key = "h-tasks") {
        SectionTitle("Mis tareas de hoy", count = urgent.size.takeIf { it > 0 }, modifier = Modifier.padding(top = 8.dp)) {
            if (overdue > 0) Text(plural(overdue, "vencida", "vencidas"), style = MaterialTheme.typography.labelMedium, color = ArtaColors.Danger)
        }
    }
    if (urgent.isEmpty()) {
        item(key = "tasks-empty") {
            val rest = actionable.size
            Text(
                if (rest > 0) "Nada vence hoy. Tienes $rest pendiente${if (rest == 1) "" else "s"} en Tareas." else "Estás al día: no tienes tareas pendientes.",
                style = MaterialTheme.typography.bodyMedium,
                color = ArtaColors.Muted,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
        }
    } else {
        items(urgent.take(8), key = { "t-${it.id}" }) { t ->
            TaskRow(task = t, showAssignees = false, today = today, onClick = { nav.openTask(t.id) }, modifier = Modifier.animateItem())
        }
        val more = actionable.size - urgent.take(8).size
        if (more > 0) {
            item(key = "tasks-more") {
                Text(
                    "$more pendiente${if (more == 1) "" else "s"} más en Tareas",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArtaColors.Tertiary,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                )
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.upcomingEvents(events: List<EventSummaryDto>?, today: LocalDate, nav: ModuleNav) {
    if (events == null) return
    val limit = today.plusDays(7)
    val upcoming = events
        .filter { it.status !in CLOSED_EVENT }
        .filter { e ->
            val start = e.startDay() ?: return@filter false
            val end = e.endDay() ?: start
            !end.isBefore(today) && !start.isAfter(limit)
        }
        .sortedBy { it.startsAt ?: "" }
    item(key = "h-events") {
        SectionTitle("Próximos 7 días", count = upcoming.size.takeIf { it > 0 }, modifier = Modifier.padding(top = 8.dp)) {
            TextButton(onClick = { nav.openWeb("/events", "Eventos") }) { Text("Ver eventos") }
        }
    }
    if (upcoming.isEmpty()) {
        item(key = "events-empty") {
            Text(
                "Sin shows en los próximos 7 días.",
                style = MaterialTheme.typography.bodyMedium,
                color = ArtaColors.Muted,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
        }
    }
    items(upcoming, key = { "e-${it.id}" }) { e -> EventRow(e, onClick = { nav.openEvent(e.id) }, modifier = Modifier.animateItem()) }
}
