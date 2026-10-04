package com.artaproducciones.ops.ui.modules

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.EventSummaryDto
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.ModulesSession
import com.artaproducciones.ops.data.api.TaskDto
import com.artaproducciones.ops.data.api.UserDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val TODAY_LONG = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", ES_MX)

private class InicioData(
    val myTasks: List<TaskDto>?,
    val approvals: ApprovalsData?,
    val events: List<EventSummaryDto>?,
    val firstError: String?,
)

/** Inicio: lo de hoy y lo que viene (misma idea que el dashboard web, sin las cifras técnicas). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InicioScreen(user: UserDto, nav: ModuleNav) {
    var perms by remember { mutableStateOf<ModulesPerms?>(null) }
    var data by remember { mutableStateOf<InicioData?>(null) }
    var loading by remember { mutableStateOf(true) }
    var tick by remember { mutableIntStateOf(0) }
    var creating by remember { mutableStateOf(false) }
    val today = LocalDate.now()

    LaunchedEffect(user.id, tick) {
        loading = true
        try {
            val p = ModulesPerms(ModulesSession.me(expectedId = user.id))
            perms = p
            data = coroutineScope {
                val tasks = async { runCatching { ModulesClient.api.myTasks() } }
                val approvals = async { runCatching { loadApprovals(p) } }
                val events = async {
                    runCatching {
                        if (p.eventOpsEntities.isEmpty()) emptyList() else ModulesClient.api.events(scope = "active")
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
        } catch (e: Exception) {
            data = InicioData(data?.myTasks, data?.approvals, data?.events, e.userMessage())
        } finally {
            loading = false
        }
    }

    val p = perms
    val d = data
    val hasContent = d != null && (d.myTasks != null || d.events != null || d.approvals != null)

    PullToRefreshBox(
        isRefreshing = loading && hasContent,
        onRefresh = { tick++ },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
            item {
                Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 8.dp)) {
                    Text(TODAY_LONG.format(today).replaceFirstChar { it.titlecase(ES_MX) }, color = ArtaColors.Muted)
                    Text(
                        "Hola, ${firstName(user.fullName)}",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            when {
                !hasContent && d?.firstError != null -> item { ErrorState(d.firstError, onRetry = { tick++ }) }
                !hasContent || p == null || d == null -> item { SkeletonList(4) }
                else -> {
                    d.firstError?.let { msg -> item { InlineError(msg) { tick++ } } }
                    item { QuickActions(p, d.approvals, onNewTask = { creating = true }, nav = nav) }
                    todayTasks(d.myTasks, today, nav)
                    val approvals = d.approvals
                    if (approvals != null && (p.approvesMoney || approvals.tasksToReview.isNotEmpty() || approvals.actionableAdvances.isNotEmpty())) {
                        item { ApprovalsSummary(approvals, p, onOpen = { nav.openApprovals() }) }
                    }
                    if (p.eventOpsEntities.isNotEmpty()) upcomingEvents(d.events, today, nav)
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

@Composable
private fun QuickActions(p: ModulesPerms, approvals: ApprovalsData?, onNewTask: () -> Unit, nav: ModuleNav) {
    val pending = approvals?.pendingCount(p) ?: 0
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (p.canCreateTasks) item { Action("Nueva tarea", Icons.Default.Add, onNewTask) }
        if (p.approvesMoney || pending > 0) {
            item { Action(if (pending > 0) "Aprobaciones · $pending" else "Aprobaciones", Icons.Default.FactCheck) { nav.openApprovals() } }
        }
        if (p.eventOpsEntities.isNotEmpty()) item { Action("Calendario", Icons.Default.CalendarMonth) { nav.openWeb("/calendar", "Calendario") } }
        if (p.canPo) item { Action("Órdenes de compra", Icons.Default.ReceiptLong) { nav.openWeb("/purchase-orders", "Órdenes de compra") } }
        if (p.canSeeFinance) item { Action("Anticipos", Icons.Default.Payments) { nav.openWeb("/advances", "Anticipos") } }
    }
}

@Composable
private fun Action(label: String, icon: ImageVector, onClick: () -> Unit) {
    AssistChip(
        onClick = onClick,
        label = { Text(label) },
        leadingIcon = { Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = ArtaColors.Gold) },
        colors = AssistChipDefaults.assistChipColors(containerColor = ArtaColors.BgElev),
    )
}

private val ACTIONABLE = setOf("OPEN", "IN_PROGRESS", "BLOCKED")

private fun androidx.compose.foundation.lazy.LazyListScope.todayTasks(tasks: List<TaskDto>?, today: LocalDate, nav: ModuleNav) {
    if (tasks == null) return
    val actionable = tasks.filter { it.status in ACTIONABLE }
    val urgent = actionable
        .filter { val b = it.bucket(today); b == DueBucket.OVERDUE || b == DueBucket.TODAY }
        .sortedBy { it.dueAt ?: "" }
    val overdue = urgent.count { it.isOverdue(today) }
    item {
        SectionTitle("Mis tareas de hoy", count = urgent.size.takeIf { it > 0 }) {
            if (overdue > 0) Text("$overdue vencidas", style = MaterialTheme.typography.labelMedium, color = ArtaColors.Danger)
        }
    }
    if (urgent.isEmpty()) {
        item {
            val rest = actionable.size
            Text(
                if (rest > 0) "Nada vence hoy. Tienes $rest pendiente${if (rest == 1) "" else "s"} en Tareas." else "Estás al día: no tienes tareas pendientes.",
                color = ArtaColors.Muted,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
    } else {
        items(urgent.take(8), key = { "t-${it.id}" }) { t -> TaskRow(task = t, showAssignees = false, today = today, onClick = { nav.openTask(t.id) }) }
        val more = actionable.size - urgent.take(8).size
        if (more > 0) {
            item {
                Text(
                    "$more pendiente${if (more == 1) "" else "s"} más en Tareas",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArtaColors.Muted,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun ApprovalsSummary(a: ApprovalsData, p: ModulesPerms, onOpen: () -> Unit) {
    val toAuthorize = a.toAuthorize(p)
    val toPay = a.toPay(p)
    val advancesToApprove = a.actionableAdvances.filter { it.advanceStatus == "PENDING" }
    val advancesToPay = a.actionableAdvances.filter { it.advanceStatus == "APPROVED" }
    val total = a.tasksToReview.size + toAuthorize.size + toPay.size + advancesToApprove.size + advancesToPay.size
    SectionTitle("Por aprobar", count = total.takeIf { it > 0 })
    ModuleCard(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), onClick = onOpen) {
        if (total == 0) {
            Text("Nada pendiente de tu visto bueno.", color = ArtaColors.Muted)
        } else {
            if (a.tasksToReview.isNotEmpty()) {
                SummaryLine("Entregas de tareas", "${a.tasksToReview.size}")
            }
            if (toAuthorize.isNotEmpty()) {
                SummaryLine("Órdenes por autorizar", "${toAuthorize.size} · ${money(toAuthorize.sumOf { it.row.amount })}")
            }
            if (toPay.isNotEmpty()) {
                SummaryLine("Órdenes por pagar", "${toPay.size} · ${money(toPay.sumOf { it.row.amount })}")
            }
            if (advancesToApprove.isNotEmpty()) {
                SummaryLine("Anticipos por aprobar", "${advancesToApprove.size} · ${money(advancesToApprove.sumOf { advanceAmount(it.amount) ?: 0.0 })}")
            }
            if (advancesToPay.isNotEmpty()) {
                SummaryLine("Anticipos por pagar", "${advancesToPay.size} · ${money(advancesToPay.sumOf { advanceAmount(it.amount) ?: 0.0 })}")
            }
        }
    }
}

@Composable
private fun SummaryLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Dot(ArtaColors.Gold, 8)
        Spacer(Modifier.width(10.dp))
        Text(label, modifier = Modifier.weight(1f))
        Text(value, fontWeight = FontWeight.SemiBold, color = ArtaColors.Gold)
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
    item {
        SectionTitle("Próximos 7 días", count = upcoming.size.takeIf { it > 0 }) {
            TextButton(onClick = { nav.openWeb("/events", "Eventos") }) { Text("Ver eventos") }
        }
    }
    if (upcoming.isEmpty()) {
        item { Text("Sin shows en los próximos 7 días.", color = ArtaColors.Muted, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) }
    }
    items(upcoming, key = { "e-${it.id}" }) { e -> EventRow(e, onClick = { nav.openEvent(e.id) }) }
}
