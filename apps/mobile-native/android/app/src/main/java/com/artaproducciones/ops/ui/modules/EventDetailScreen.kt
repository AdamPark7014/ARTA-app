package com.artaproducciones.ops.ui.modules

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.EventDetailDto
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.ModulesSession
import com.artaproducciones.ops.data.api.TaskEventRef
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.launch
import java.time.LocalDate

private enum class NativeTab(val label: String) { SUMMARY("Resumen"), TASKS("Tareas"), TEAM("Equipo") }

/** Pestañas de la web que todavía no tienen versión nativa: se abren en la vista web. */
private data class WebTab(val key: String, val label: String)

private fun webTabs(p: ModulesPerms): List<WebTab> = buildList {
    add(WebTab("checklists", "Formatos"))
    if (p.canPo) add(WebTab("ocs", "Órdenes de compra"))
    if (p.canSeeFinance) add(WebTab("finance", "Corrida"))
    if (p.canSeeCampaign) add(WebTab("campaign", "Campaña"))
    if (p.canChecklistEdit || p.canSeeCampaign) add(WebTab("sponsors", "Convenios"))
    if (p.canTicketing) add(WebTab("ticketing", "Boletera"))
    add(WebTab("files", "Documentos"))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventDetailScreen(eventId: String, nav: ModuleNav) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    var event by remember { mutableStateOf<EventDetailDto?>(null) }
    var perms by remember { mutableStateOf<ModulesPerms?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var tab by rememberSaveable { mutableStateOf(NativeTab.SUMMARY) }
    var creatingTask by remember { mutableStateOf(false) }
    var openingChat by remember { mutableStateOf(false) }

    LaunchedEffect(eventId, tick) {
        loading = true
        try {
            perms = ModulesPerms(ModulesSession.me())
            event = ModulesClient.api.event(eventId)
            error = null
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    fun openChat() {
        if (openingChat) return
        openingChat = true
        scope.launch {
            try {
                val channel = ModulesClient.api.openEventChannel(eventId)
                haptics.confirm()
                nav.openChat(channel.id)
            } catch (e: Exception) {
                haptics.reject()
                toast(context, e.userMessage())
            } finally {
                openingChat = false
            }
        }
    }

    val ev = event
    val p = perms
    val closed = ev?.status in CLOSED_EVENT

    Column(Modifier.fillMaxSize()) {
        DetailTopBar(ev?.name ?: "Evento", onBack = { nav.back() }) {
            IconButton(onClick = { nav.openWeb("/events/$eventId", ev?.name) }) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Abrir en la web")
            }
        }
        PullToRefreshBox(
            isRefreshing = loading && ev != null,
            onRefresh = { tick++ },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                ev == null && error != null -> ErrorState(error!!, onRetry = { tick++ })
                ev == null || p == null -> SkeletonList(4)
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
                    error?.let { msg -> item { InlineError(msg) { tick++ } } }
                    item { EventHeader(ev) }
                    item { QuickFacts(ev, p) }
                    item {
                        val web = webTabs(p)
                        ScrollableTabRow(
                            selectedTabIndex = tab.ordinal,
                            edgePadding = 16.dp,
                            containerColor = ArtaColors.Bg,
                            contentColor = ArtaColors.Gold,
                        ) {
                            NativeTab.entries.forEach { t ->
                                Tab(selected = tab == t, onClick = { tab = t }, text = { Text(t.label) })
                            }
                            web.forEach { w ->
                                Tab(
                                    selected = false,
                                    onClick = { nav.openWeb("/events/$eventId?tab=${w.key}", w.label) },
                                    text = {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(w.label, color = ArtaColors.Muted)
                                            Spacer(Modifier.width(4.dp))
                                            Icon(
                                                Icons.AutoMirrored.Filled.OpenInNew,
                                                contentDescription = null,
                                                tint = ArtaColors.Muted,
                                                modifier = Modifier.size(14.dp),
                                            )
                                        }
                                    },
                                )
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    when (tab) {
                        NativeTab.SUMMARY -> summaryItems(ev, onOpenChecklist = { id ->
                            nav.openWeb("/events/$eventId?tab=checklists&checklist=$id", "Formatos")
                        })
                        NativeTab.TASKS -> {
                            val today = LocalDate.now()
                            val ref = TaskEventRef(ev.id, ev.name, ev.status, ev.entity)
                            val open = ev.tasks.filter { it.status != "DONE" }.sortedBy { it.dueAt ?: "9999" }
                            val done = ev.tasks.filter { it.status == "DONE" }
                            item {
                                SectionTitle("Pendientes", count = open.size) {
                                    if (!closed && p.canCreateTasks) {
                                        TextButton(onClick = { creatingTask = true }) {
                                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Nueva tarea")
                                        }
                                    }
                                }
                            }
                            if (ev.tasks.isEmpty()) {
                                item { EmptyState("Sin tareas en este evento", if (closed) null else "Crea una y asígnala a una o varias personas.") }
                            } else if (open.isEmpty()) {
                                item { Text("Todo al día.", color = ArtaColors.Muted, modifier = Modifier.padding(horizontal = 16.dp)) }
                            }
                            items(open, key = { "o-${it.id}" }) { t ->
                                TaskRow(task = t.copy(event = t.event ?: ref), showAssignees = true, showEvent = false, today = today, onClick = { nav.openTask(t.id) })
                            }
                            if (done.isNotEmpty()) {
                                item { SectionTitle("Hechas", count = done.size) }
                                items(done, key = { "d-${it.id}" }) { t ->
                                    TaskRow(task = t.copy(event = t.event ?: ref), showAssignees = true, showEvent = false, today = today, onClick = { nav.openTask(t.id) })
                                }
                            }
                        }
                        NativeTab.TEAM -> {
                            item {
                                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        "La conversación de producción del evento: avisos, fotos, documentos y llamadas al equipo.",
                                        color = ArtaColors.Muted,
                                    )
                                    Button(onClick = { openChat() }, enabled = !openingChat, modifier = Modifier.fillMaxWidth()) {
                                        if (openingChat) {
                                            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArtaColors.Bg)
                                        } else {
                                            Icon(Icons.Default.Forum, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(Modifier.width(8.dp))
                                            Text("Abrir chat del evento")
                                        }
                                    }
                                }
                            }
                            val people = ev.tasks.flatMap { it.assigneePeople() + listOfNotNull(it.createdBy) }
                                .filter { it.id.isNotEmpty() && it.fullName.isNotBlank() }
                                .distinctBy { it.id }
                                .sortedBy { it.fullName }
                            item { SectionTitle("Personas con tareas aquí", count = people.size.takeIf { it > 0 }) }
                            if (people.isEmpty()) {
                                item { Text("Nadie tiene tareas en este evento todavía.", color = ArtaColors.Muted, modifier = Modifier.padding(horizontal = 16.dp)) }
                            }
                            items(people, key = { "p-${it.id}" }) { person ->
                                val count = ev.tasks.count { it.status != "DONE" && it.isAssignee(person.id) }
                                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(person.fullName, size = 36.dp)
                                    Spacer(Modifier.width(12.dp))
                                    Text(person.fullName, modifier = Modifier.weight(1f))
                                    if (count > 0) Text(if (count == 1) "1 pendiente" else "$count pendientes", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (creatingTask && ev != null) {
        TaskFormSheet(
            presetEventId = ev.id,
            presetEventName = ev.name,
            onDismiss = { creatingTask = false },
            onSaved = {
                creatingTask = false
                ModulesStore.taskLists.clear()
                tick++
            },
        )
    }
}

@Composable
private fun EventHeader(ev: EventDetailDto) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(ev.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            val label = eventStatusLabel(ev.status) ?: "Activo"
            Pill(label, if (ev.status == "ACTIVE") OkGreen else if (ev.status == "CANCELLED") ArtaColors.Danger else ArtaColors.Muted)
        }
        ev.artist?.takeIf { it.isNotBlank() && it != ev.name }?.let { Text(it, color = ArtaColors.Muted) }
        val until = daysUntilLabel(ev.startsAt)
        FactLine(Icons.Default.Event, eventWhenLabel(ev.startsAt, ev.endsAt) + if (until.isNotBlank() && ev.status !in CLOSED_EVENT) " · $until" else "")
        val place = listOfNotNull(ev.venue?.takeIf { it.isNotBlank() }, ev.city?.takeIf { it.isNotBlank() }).joinToString(", ")
        if (place.isNotBlank()) FactLine(Icons.Default.Place, place)
        val schedule = listOfNotNull(
            ev.schedule?.takeIf { it.isNotBlank() },
            ev.functions?.takeIf { it > 0 }?.let { if (it == 1) "1 función" else "$it funciones" },
        ).joinToString(" · ")
        if (schedule.isNotBlank()) FactLine(Icons.Default.Schedule, schedule)
        ev.promoter?.takeIf { it.isNotBlank() }?.let { Text("Promotor: $it", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted) }
    }
}

@Composable
private fun FactLine(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = ArtaColors.Gold, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun QuickFacts(ev: EventDetailDto, p: ModulesPerms) {
    val openTasks = ev.tasks.count { it.status != "DONE" }
    val overdue = ev.tasks.count { it.isOverdue() }
    val progress = ev.checklists.mapNotNull { it.progressPct }.takeIf { it.isNotEmpty() }?.average()?.toInt()
    val pendingPo = ev.purchaseOrders.count { it.status == "PENDING_AUTH" || it.status == "AUTHORIZED" || it.status == "DRAFT" }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Fact("Tareas abiertas", "$openTasks", if (overdue > 0) "$overdue vencidas" else null, Modifier.weight(1f))
        Fact("Formatos", progress?.let { "$it %" } ?: "—", "${ev.checklists.size} en total", Modifier.weight(1f))
        if (p.canPo) Fact("OC pendientes", "$pendingPo", null, Modifier.weight(1f))
        else Fact("Documentos", "${ev.files.size}", null, Modifier.weight(1f))
    }
}

@Composable
private fun Fact(label: String, value: String, sub: String?, modifier: Modifier = Modifier) {
    Column(
        modifier.background(ArtaColors.BgElev, RoundedCornerShape(12.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = ArtaColors.Muted, maxLines = 1)
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        sub?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = if (it.contains("vencid")) ArtaColors.Danger else ArtaColors.Muted, maxLines = 1) }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.summaryItems(ev: EventDetailDto, onOpenChecklist: (String) -> Unit) {
    val description = ev.description?.takeIf { it.isNotBlank() }
    val notes = ev.notes?.takeIf { it.isNotBlank() }
    if (description != null) {
        item { SectionTitle("Descripción") }
        item { Text(description, modifier = Modifier.padding(horizontal = 16.dp)) }
    }
    if (notes != null) {
        item { SectionTitle("Notas") }
        item { Text(notes, modifier = Modifier.padding(horizontal = 16.dp)) }
    }
    ev.createdBy?.takeIf { it.fullName.isNotBlank() }?.let { who ->
        item {
            Text(
                "Creó el evento: ${who.fullName}",
                style = MaterialTheme.typography.bodySmall,
                color = ArtaColors.Muted,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
    }
    item { SectionTitle("Formatos", count = ev.checklists.size.takeIf { it > 0 }) }
    if (ev.checklists.isEmpty()) {
        item { Text("Sin formatos.", color = ArtaColors.Muted, modifier = Modifier.padding(horizontal = 16.dp)) }
    }
    items(ev.checklists, key = { "c-${it.id}" }) { c ->
        val pct = (c.progressPct ?: 0.0).coerceIn(0.0, 100.0)
        ModuleCard(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), onClick = { onOpenChecklist(c.id) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.title ?: c.template?.name ?: "Formato", modifier = Modifier.weight(1f), maxLines = 1)
                Text("${pct.toInt()} %", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
            }
            Spacer(Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { (pct / 100.0).toFloat() },
                modifier = Modifier.fillMaxWidth(),
                color = if (pct >= 100.0) OkGreen else ArtaColors.Gold,
                trackColor = ArtaColors.Surface2,
            )
        }
    }
}
