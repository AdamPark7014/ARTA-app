package com.artaproducciones.ops.ui.modules

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.ModulesSession
import com.artaproducciones.ops.data.api.TaskDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.theme.ArtaColors
import java.time.LocalDate

private enum class TaskView(val label: String, val key: String) {
    MINE("Mis tareas", "mine"),
    REQUESTED("Pedidas por mí", "requested"),
    TEAM("Todas", "team"),
}

private enum class StatusFilter(val label: String) {
    OPEN("Pendientes"),
    OVERDUE("Vencidas"),
    REVIEW("Por aprobar"),
    BLOCKED("Bloqueadas"),
    DONE("Hechas"),
    ALL("Todas"),
}

private fun StatusFilter.matches(t: TaskDto, today: LocalDate): Boolean = when (this) {
    StatusFilter.OPEN -> t.status != "DONE"
    StatusFilter.OVERDUE -> t.isOverdue(today)
    StatusFilter.REVIEW -> t.status == "PENDING_APPROVAL"
    StatusFilter.BLOCKED -> t.status == "BLOCKED"
    StatusFilter.DONE -> t.status == "DONE"
    StatusFilter.ALL -> true
}

/** Busca en lo mismo que la web: título, área, detalle, responsables y evento. */
internal fun TaskDto.matchesQuery(q: String): Boolean {
    val n = q.trim().lowercase()
    if (n.isEmpty()) return true
    return title.lowercase().contains(n) ||
        module.orEmpty().lowercase().contains(n) ||
        detail.orEmpty().lowercase().contains(n) ||
        event?.name.orEmpty().lowercase().contains(n) ||
        assigneePeople().any { it.fullName.lowercase().contains(n) }
}

internal fun groupByDue(tasks: List<TaskDto>, today: LocalDate): List<Pair<DueBucket, List<TaskDto>>> =
    tasks.groupBy { it.bucket(today) }
        .toSortedMap(compareBy { it.ordinal })
        .map { (bucket, list) -> bucket to list.sortedBy { it.dueAt ?: "9999" } }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen(nav: ModuleNav) {
    var perms by remember { mutableStateOf<ModulesPerms?>(null) }
    var view by rememberSaveable { mutableStateOf(TaskView.MINE) }
    var filter by rememberSaveable { mutableStateOf(StatusFilter.OPEN) }
    var query by rememberSaveable { mutableStateOf("") }
    var rows by remember { mutableStateOf(ModulesStore.taskLists[view.key]) }
    var shownView by remember { mutableStateOf(view) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var creating by remember { mutableStateOf(false) }
    val today = LocalDate.now()

    LaunchedEffect(Unit) {
        runCatching { ModulesSession.me() }.onSuccess { perms = ModulesPerms(it) }
    }

    LaunchedEffect(view, tick) {
        if (shownView != view) {
            rows = ModulesStore.taskLists[view.key]
            shownView = view
        }
        loading = true
        try {
            val list = when (view) {
                TaskView.MINE -> ModulesClient.api.myTasks()
                TaskView.REQUESTED -> ModulesClient.api.requestedTasks()
                TaskView.TEAM -> ModulesClient.api.workload()
            }
            ModulesStore.taskLists[view.key] = list
            rows = list
            error = null
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    val views = remember(perms) { TaskView.entries.filter { it != TaskView.TEAM || perms?.canSeeTeamTasks == true } }
    val groups = remember(rows, filter, query) {
        groupByDue(rows.orEmpty().filter { filter.matches(it, today) && it.matchesQuery(query) }, today)
    }
    val overdueCount = remember(rows) { rows.orEmpty().count { it.isOverdue(today) } }
    val reviewCount = remember(rows) { rows.orEmpty().count { it.status == "PENDING_APPROVAL" } }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            ScreenTitle("Tareas")
            if (views.size > 1) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    views.forEachIndexed { i, v ->
                        SegmentedButton(
                            selected = view == v,
                            onClick = { view = v },
                            shape = SegmentedButtonDefaults.itemShape(index = i, count = views.size),
                        ) { Text(v.label, maxLines = 1) }
                    }
                }
            }
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Buscar tarea, persona o evento") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Default.Close, contentDescription = "Limpiar") }
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            )
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(StatusFilter.entries) { f ->
                    val count = when (f) {
                        StatusFilter.OVERDUE -> overdueCount
                        StatusFilter.REVIEW -> reviewCount
                        else -> 0
                    }
                    FilterChip(
                        selected = filter == f,
                        onClick = { filter = f },
                        label = { Text(if (count > 0) "${f.label} · $count" else f.label) },
                    )
                }
            }
            PullToRefreshBox(
                isRefreshing = loading && rows != null,
                onRefresh = { tick++ },
                modifier = Modifier.fillMaxSize(),
            ) {
                val current = rows
                when {
                    current == null && error != null -> ErrorState(error!!, onRetry = { tick++ })
                    current == null -> SkeletonList()
                    else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
                        error?.let { msg -> item { InlineError(msg) { tick++ } } }
                        if (groups.isEmpty()) {
                            item {
                                val filtered = query.isNotBlank() || filter != StatusFilter.OPEN
                                when {
                                    filtered -> EmptyState("Nada coincide", "Prueba con otra búsqueda o filtro.")
                                    view == TaskView.MINE -> EmptyState("No tienes tareas pendientes", "Cuando alguien te asigne algo aparecerá aquí.")
                                    view == TaskView.REQUESTED -> EmptyState("No has pedido tareas", "Crea una con «Nueva tarea» y asígnala a una o varias personas.")
                                    else -> EmptyState("Sin tareas pendientes", "El equipo está al día.")
                                }
                            }
                        }
                        groups.forEach { (bucket, tasks) ->
                            item(key = "h-${bucket.name}") { SectionTitle(bucket.label, count = tasks.size) }
                            items(tasks, key = { "${bucket.name}-${it.id}" }) { t ->
                                TaskRow(
                                    task = t,
                                    showAssignees = view != TaskView.MINE,
                                    today = today,
                                    onClick = { nav.openTask(t.id) },
                                )
                            }
                        }
                    }
                }
            }
        }

        if (perms?.canCreateTasks != false) {
            ExtendedFloatingActionButton(
                onClick = { creating = true },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Nueva tarea") },
                containerColor = ArtaColors.Gold,
                contentColor = ArtaColors.Bg,
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            )
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

/** Fila de tarea compartida por Tareas, Inicio y el evento. */
@Composable
internal fun TaskRow(task: TaskDto, showAssignees: Boolean, onClick: () -> Unit, today: LocalDate = LocalDate.now(), showEvent: Boolean = true) {
    val overdue = task.isOverdue(today)
    ModuleCard(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), onClick = onClick) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                task.title,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Pill(taskStatusLabel(task), taskStatusColor(task.status))
        }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (task.status != "DONE" && task.dueAt != null) {
                Text(
                    dueLabel(task.dueAt, today),
                    style = MaterialTheme.typography.bodySmall,
                    color = when {
                        overdue -> ArtaColors.Danger
                        task.bucket(today) == DueBucket.TODAY -> ArtaColors.Gold
                        else -> ArtaColors.Muted
                    },
                    fontWeight = if (overdue) FontWeight.SemiBold else FontWeight.Normal,
                )
                if (showEvent && task.event != null) Text("  ·  ", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
            }
            if (showEvent && task.event != null) {
                Text(
                    task.event.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = ArtaColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        val people = task.assigneePeople()
        val who = if (showAssignees) {
            if (people.isEmpty()) "Sin asignar" else "Para: " + people.joinToString(", ") { firstName(it.fullName) }
        } else {
            task.createdBy?.takeIf { it.id.isNotEmpty() && task.needsApproval() }?.let { "Pidió: ${it.fullName}" }
        }
        who?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        task.rejectionNote?.takeIf { it.isNotBlank() && task.status != "DONE" }?.let {
            Text("Corrección: $it", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Danger, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}
