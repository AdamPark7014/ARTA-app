package com.artaproducciones.ops.ui.modules

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import com.artaproducciones.ops.ui.theme.ArtaCard
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.outlined.BrokenImage
import androidx.compose.material.icons.outlined.ConfirmationNumber
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.RequestQuote
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.runtime.derivedStateOf
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import com.artaproducciones.ops.ui.theme.fadingEdges
import com.artaproducciones.ops.ui.theme.TABULAR
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.artaproducciones.ops.data.ActiveEntity
import com.artaproducciones.ops.data.EventModule
import com.artaproducciones.ops.data.Rbac
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.EventDetailDto
import com.artaproducciones.ops.data.api.EventPoRef
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.ModulesSession
import com.artaproducciones.ops.data.api.TaskEventRef
import com.artaproducciones.ops.data.api.WitnessDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.chat.RefBacklinksSection
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.ArtaType
import com.artaproducciones.ops.ui.theme.Button
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.OutlinedButton
import com.artaproducciones.ops.ui.theme.TextButton
import com.artaproducciones.ops.ui.theme.cardSurface
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.time.LocalDate

private enum class NativeTab { SUMMARY, TASKS, ADENDUM, TESTIGOS, TEAM }

/** Un módulo del evento: se pinta aquí mismo ([tab]) o vive en la web ([webKey] = `?tab=`). */
private data class EventModuleTab(val label: String, val tab: NativeTab? = null, val webKey: String? = null)

/**
 * Mismo orden y mismas condiciones que `modules` en la página del evento de la web (01-11-2026), más
 * «Equipo», que solo existe en la app.
 */
private fun eventModules(p: ModulesPerms, entity: String): List<EventModuleTab> = buildList {
    add(EventModuleTab("Resumen", tab = NativeTab.SUMMARY))
    if (p.canSeeModule(entity, EventModule.CORRIDA)) add(EventModuleTab("Corrida", webKey = "finance"))
    if (p.canSeeModule(entity, EventModule.CAMPAIGN)) add(EventModuleTab("Campaña", webKey = "campaign"))
    if (p.canSeeModule(entity, EventModule.FORMATS)) add(EventModuleTab("Formatos", webKey = "checklists"))
    if (p.canSeeModule(entity, EventModule.PO)) add(EventModuleTab("Órdenes de compra", webKey = "ocs"))
    if (p.canSeeModule(entity, EventModule.CONVENIOS)) add(EventModuleTab("Convenios", webKey = "sponsors"))
    if (p.canSeeModule(entity, EventModule.TICKETING)) add(EventModuleTab("Boletera", webKey = "ticketing"))
    if (p.canSeeModule(entity, EventModule.TASKS)) add(EventModuleTab("Tareas", tab = NativeTab.TASKS))
    if (p.canSeeModule(entity, EventModule.DOCUMENTS)) add(EventModuleTab("Documentos", webKey = "files"))
    if (p.canSeeModule(entity, EventModule.ADENDUM)) add(EventModuleTab("Adendum", tab = NativeTab.ADENDUM))
    if (p.canSeeModule(entity, EventModule.TESTIGOS)) add(EventModuleTab("Testigos de publicidad", tab = NativeTab.TESTIGOS))
    add(EventModuleTab("Equipo", tab = NativeTab.TEAM))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventDetailScreen(eventId: String, nav: ModuleNav) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    var event by remember(eventId) { mutableStateOf(ModulesStore.eventDetails[eventId]) }
    var perms by remember { mutableStateOf(ModulesStore.perms) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var tab by rememberSaveable { mutableStateOf(NativeTab.SUMMARY) }
    var creatingTask by remember { mutableStateOf(false) }
    var openingChat by remember { mutableStateOf(false) }
    // `GET /testigos/event/:id`; null hasta que se abre la pestaña por primera vez.
    var witnesses by remember(eventId) { mutableStateOf<List<WitnessDto>?>(null) }
    var witnessError by remember(eventId) { mutableStateOf<String?>(null) }

    LaunchedEffect(eventId, tick) {
        try {
            perms = ModulesPerms(ModulesSession.me()).also { ModulesStore.perms = it }
            event = ModulesClient.api.event(eventId).also { ModulesStore.eventDetails[eventId] = it }
            error = null
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            refreshing = false
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
    // `Event.entity`; si una respuesta no lo trae, la entidad activa (de ahí se abrió el evento).
    val entity = ev?.entity ?: ActiveEntity.current.key
    val modules = if (p != null) eventModules(p, entity) else emptyList()
    // Una pestaña que ya no le toca (cambió el rol al recargar) cae en Resumen.
    val current = if (modules.any { it.tab == tab }) tab else NativeTab.SUMMARY

    // Aparte del evento: si falla, lo demás sigue. Un API aún sin la ruta (404) se lee como «sin testigos».
    LaunchedEffect(eventId, tick, current) {
        if (current != NativeTab.TESTIGOS) return@LaunchedEffect
        try {
            witnesses = ModulesClient.api.eventWitnesses(eventId)
            witnessError = null
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            if (e is HttpException && e.code() == 404) {
                witnesses = emptyList()
                witnessError = null
            } else {
                witnessError = e.userMessage()
            }
        }
    }

    val listState = rememberLazyListState()
    // El nombre sube a la barra solo cuando el encabezado (que ya lo dice en grande) se fue de vista.
    val headerGone by remember { derivedStateOf { listState.firstVisibleItemIndex >= 2 } }

    Column(Modifier.fillMaxSize()) {
        DetailTopBar(if (headerGone && ev != null) ev.name else "Evento", onBack = { nav.back() }) {
            IconButton(onClick = { nav.openWeb("/events/$eventId", ev?.name) }) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Abrir en la web")
            }
        }
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                refreshing = true
                tick++
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            PhaseSwap(listPhase(ev != null && p != null, error)) { phase ->
                when (phase) {
                    ListPhase.Error -> ErrorState(error.orEmpty(), onRetry = { tick++ })
                    ListPhase.Loading -> SkeletonList(4)
                    ListPhase.Ready -> if (ev != null && p != null) LazyColumn(Modifier.fillMaxSize().fadingEdges(listState, start = 16.dp), state = listState, contentPadding = PaddingValues(top = 8.dp, bottom = bottomInset())) {
                        // Siempre el mismo número de renglones antes del encabezado (el título de la barra los cuenta).
                        item { error?.let { msg -> InlineError(msg) { tick++ } } }
                        item { EventHeader(ev) }
                        item {
                            QuickFacts(
                                ev,
                                p,
                                entity,
                                onTasks = { tab = NativeTab.TASKS },
                                onWeb = { key, label -> nav.openWeb("/events/$eventId?tab=$key", label) },
                            )
                        }
                        // Los módulos van en chips que pasan de renglón, en el orden del cliente: nada se va por
                        // el borde de la pantalla. Lo nativo se pinta aquí; lo de la web lleva ↗.
                        item {
                            ModuleChips(
                                modules,
                                selected = current,
                                onSelect = { tab = it },
                                onOpenWeb = { key, label -> nav.openWeb("/events/$eventId?tab=$key", label) },
                            )
                        }
                        when (current) {
                            NativeTab.SUMMARY -> {
                                // La venta en línea se abre en el navegador: algunas boleteras no se dejan embeber.
                                ev.boleteraUrl?.takeIf { it.isNotBlank() }?.let { url ->
                                    item(key = "boletera") {
                                        OutlinedButton(
                                            onClick = { openInBrowser(context, url) },
                                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                                        ) {
                                            Icon(Icons.Outlined.ConfirmationNumber, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(Modifier.width(8.dp))
                                            Text("Abrir boletera en línea")
                                        }
                                    }
                                }
                                summaryItems(ev, onOpenChecklist = { id ->
                                    nav.openWeb("/events/$eventId?tab=checklists&checklist=$id", "Formatos")
                                })
                                item(key = "mencionado") { RefBacklinksSection("event", eventId, onOpen = { nav.openWeb(it) }) }
                            }
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
                                    item { EmptyState("Sin tareas en este evento", if (closed) null else "Crea una y asígnala a una o varias personas.", icon = Icons.Outlined.TaskAlt) }
                                } else if (open.isEmpty()) {
                                    item { Text("Todo al día.", color = ArtaColors.Muted, modifier = Modifier.padding(horizontal = 20.dp)) }
                                }
                                items(open, key = { "o-${it.id}" }) { t ->
                                    TaskRow(task = t.copy(event = t.event ?: ref), showAssignees = true, showEvent = false, today = today, onClick = { nav.openTask(t.id) }, modifier = Modifier.animateItem())
                                }
                                if (done.isNotEmpty()) {
                                    item { SectionTitle("Hechas", count = done.size) }
                                    items(done, key = { "d-${it.id}" }) { t ->
                                        TaskRow(task = t.copy(event = t.event ?: ref), showAssignees = true, showEvent = false, today = today, onClick = { nav.openTask(t.id) }, modifier = Modifier.animateItem())
                                    }
                                }
                            }
                            NativeTab.ADENDUM -> {
                                // Solo lectura: un adendum se crea y se autoriza como cualquier OC, en la web.
                                val rows = ev.purchaseOrders.filter { it.paymentMethod == "ADENDUM" }.sortedByDescending { it.createdAt.orEmpty() }
                                item {
                                    SectionTitle("Adendum", count = rows.size.takeIf { it > 0 }) {
                                        if (rows.isNotEmpty()) {
                                            Text(money(rows.sumOf { it.amount?.toDoubleOrNull() ?: 0.0 }), style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
                                        }
                                    }
                                }
                                if (rows.isEmpty()) {
                                    item { EmptyState("Sin adendums", "Cuando se haga uno, aparecerá aquí.", icon = Icons.Outlined.RequestQuote) }
                                }
                                items(rows, key = { "a-${it.id}" }) { po -> AdendumRow(po, Modifier.animateItem()) }
                            }
                            NativeTab.TESTIGOS -> {
                                // Solo lectura: subirlos sigue siendo del panel web.
                                val list = witnesses
                                witnessError?.let { msg -> item { InlineError(msg) { tick++ } } }
                                item { SectionTitle("Testigos de publicidad", count = list?.size?.takeIf { it > 0 }) }
                                when {
                                    list == null && witnessError == null -> item { SkeletonList(3) }
                                    list != null && list.isEmpty() -> item {
                                        EmptyState("Sin testigos todavía", "Cuando se suban, aparecerán aquí.", icon = Icons.Outlined.PhotoLibrary)
                                    }
                                    list != null -> items(list, key = { "w-${it.id}" }) { w -> WitnessCard(w, Modifier.animateItem()) }
                                    else -> Unit
                                }
                            }
                            NativeTab.TEAM -> {
                                // Contabilidad y practicantes no entran solos al canal: el API responde 403.
                                if (Rbac.canJoinEventChannels(p.role)) {
                                    item {
                                        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Text(
                                                "La conversación de producción del evento: avisos, fotos, documentos y llamadas al equipo.",
                                                color = ArtaColors.Muted,
                                            )
                                            Button(onClick = { openChat() }, enabled = !openingChat, modifier = Modifier.fillMaxWidth()) {
                                                if (openingChat) {
                                                    BusyLabel(true, "Abrir chat del evento")
                                                } else {
                                                    Icon(Icons.Default.Forum, contentDescription = null, modifier = Modifier.size(18.dp))
                                                    Spacer(Modifier.width(8.dp))
                                                    Text("Abrir chat del evento")
                                                }
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
                                    item { Text("Nadie tiene tareas en este evento todavía.", color = ArtaColors.Muted, modifier = Modifier.padding(horizontal = 20.dp)) }
                                }
                                items(people, key = { "p-${it.id}" }) { person ->
                                    val count = ev.tasks.count { it.status != "DONE" && it.isAssignee(person.id) }
                                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
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
    Column(Modifier.padding(horizontal = 20.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(ev.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            val label = eventStatusLabel(ev.status) ?: "Activo"
            // «Activo» es informativo (contorno neutro); solo «Cancelado» lleva el rojo.
            Pill(label, if (ev.status == "CANCELLED") ArtaColors.Danger else ArtaColors.Muted)
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
    Row(verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, tint = ArtaColors.Gold, modifier = Modifier.padding(top = 1.dp).size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = TABULAR))
    }
}

/** Una tarjeta de cifra del resumen del evento. */
private data class FactItem(
    val label: String,
    val value: String,
    val sub: String?,
    val alert: Boolean = false,
    /** Sin dato: la palabra va en secundario, no con el peso de una cifra. */
    val quiet: Boolean = false,
    val progress: Float? = null,
    val onClick: () -> Unit,
)

/**
 * Cifras del evento en renglones de dos tarjetas del mismo alto, como en iOS: etiqueta en
 * MAYÚSCULAS, cifra ligera y detalle. Sin formatos va la palabra, nunca una raya suelta.
 */
@Composable
private fun QuickFacts(ev: EventDetailDto, p: ModulesPerms, entity: String, onTasks: () -> Unit, onWeb: (String, String) -> Unit) {
    val openTasks = ev.tasks.count { it.status != "DONE" }
    val overdue = ev.tasks.count { it.isOverdue() }
    val progress = ev.checklists.mapNotNull { it.progressPct }.takeIf { it.isNotEmpty() }?.average()?.toInt()
    val pendingPo = ev.purchaseOrders.filter { it.status == "PENDING_AUTH" || it.status == "DRAFT" }
    val items = buildList {
        if (p.canSeeModule(entity, EventModule.TASKS)) {
            add(
                FactItem(
                    "Tareas", "$openTasks",
                    if (overdue > 0) (if (overdue == 1) "1 vencida" else "$overdue vencidas") else if (openTasks == 1) "abierta" else "abiertas",
                    alert = overdue > 0,
                    onClick = onTasks,
                ),
            )
        }
        if (ev.checklists.isEmpty()) {
            val hint = if (Rbac.canCreateFormats(p.access, entity)) "Se crean en la web" else "Todavía no hay"
            add(FactItem("Formatos", "Sin formatos", hint, quiet = true, onClick = { onWeb("checklists", "Formatos") }))
        } else {
            val pct = progress ?: 0
            add(
                FactItem(
                    "Formatos", "$pct %",
                    if (ev.checklists.size == 1) "1 formato" else "${ev.checklists.size} formatos",
                    progress = pct / 100f,
                    onClick = { onWeb("checklists", "Formatos") },
                ),
            )
        }
        if (p.canSeeModule(entity, EventModule.PO)) {
            add(
                FactItem(
                    "Por autorizar", "${pendingPo.size}",
                    money(pendingPo.sumOf { it.amount?.toDoubleOrNull() ?: 0.0 }),
                    onClick = { onWeb("ocs", "Órdenes de compra") },
                ),
            )
        }
        if (p.canSeeModule(entity, EventModule.DOCUMENTS)) {
            add(FactItem("Documentos", "${ev.files.size}", if (ev.files.size == 1) "archivo" else "archivos", onClick = { onWeb("files", "Documentos") }))
        }
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { Fact(it, Modifier.weight(1f).fillMaxHeight()) }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun Fact(item: FactItem, modifier: Modifier = Modifier) {
    ArtaCard(
        modifier = modifier,
        onClick = item.onClick,
        onClickLabel = "Abrir ${item.label.lowercase()}",
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(item.label.uppercase(ES_MX), style = ArtaType.Cap, color = ArtaColors.Tertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            item.value,
            style = ArtaType.Kpi.copy(fontSize = if (item.quiet) 22.sp else 26.sp, lineHeight = 30.sp),
            color = when {
                item.alert -> ArtaColors.Danger
                item.quiet -> ArtaColors.Muted
                else -> ArtaColors.Text
            },
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        item.progress?.let { ProgressLine(it) }
        Spacer(Modifier.weight(1f))
        item.sub?.let {
            Text(it, style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR), color = if (item.alert) ArtaColors.Danger else ArtaColors.Tertiary, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Barra de avance de 3 dp del sistema: acento sobre la línea (sin verde al llegar al 100 %). */
@Composable
internal fun ProgressLine(value: Float, modifier: Modifier = Modifier) {
    val t = LocalArtaTokens.current
    Box(modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(50)).background(t.line)) {
        Box(Modifier.fillMaxWidth(value.coerceIn(0f, 1f)).fillMaxHeight().clip(RoundedCornerShape(50)).background(t.accentBrush))
    }
}

/** Módulos del evento: chips que pasan de renglón si no caben. Lo que vive en la web lleva ↗. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ModuleChips(
    modules: List<EventModuleTab>,
    selected: NativeTab,
    onSelect: (NativeTab) -> Unit,
    onOpenWeb: (key: String, label: String) -> Unit,
) {
    val t = LocalArtaTokens.current
    // Cada chip reserva 48 dp de toque; ese margen ya es la separación entre renglones.
    FlowRow(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        modules.forEach { m ->
            val active = m.tab == selected
            val paint = if (active) Modifier.background(t.accentBrush) else Modifier.border(1.dp, t.lineStrong, t.controlShape)
            Row(
                Modifier
                    .minimumInteractiveComponentSize()
                    .clip(t.controlShape)
                    .then(paint)
                    .clickable(role = Role.Button, onClickLabel = if (m.webKey != null) "Abrir ${m.label} en la web" else "Ver ${m.label}") {
                        m.tab?.let(onSelect)
                        m.webKey?.let { onOpenWeb(it, m.label) }
                    }
                    .heightIn(min = 36.dp)
                    .padding(start = 12.dp, end = if (m.webKey != null) 10.dp else 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(m.label, style = MaterialTheme.typography.labelLarge, color = if (active) t.onAccent else t.text, maxLines = 1)
                if (m.webKey != null) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, tint = t.tertiary, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}

/** Liga externa (boletera, publicación de un testigo), en el navegador del teléfono. */
private fun openInBrowser(context: Context, url: String) {
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url.trim())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.onFailure { toast(context, "No se pudo abrir la liga.") }
}

/** Archivo o liga de una tarjeta: una fila de texto con el área de toque completa. */
@Composable
private fun AttachmentLine(label: String, icon: ImageVector, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).heightIn(min = 48.dp).padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = ArtaColors.Gold, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
    }
}

/** Un adendum: a quién, a qué cuenta, cuánto, en qué estado y su archivo. */
@Composable
private fun AdendumRow(po: EventPoRef, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    ModuleCard(modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    po.adendumPerson?.takeIf { it.isNotBlank() } ?: po.vendorName?.takeIf { it.isNotBlank() } ?: "Sin persona",
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                po.adendumAccount?.takeIf { it.isNotBlank() }?.let {
                    Text("Cuenta $it", style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = TABULAR), color = ArtaColors.Muted)
                }
                localDateOf(po.createdAt)?.let {
                    Text(shortDate(it), style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR), color = ArtaColors.Tertiary)
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(money(po.amount?.toDoubleOrNull()), style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = TABULAR), fontWeight = FontWeight.SemiBold)
                Pill(poStatusLabel(po.status), poStatusColor(po.status))
            }
        }
        po.adendumFileUrl?.takeIf { it.isNotBlank() }?.let { file ->
            AttachmentLine(po.adendumFileName?.takeIf { it.isNotBlank() } ?: "Ver archivo", Icons.Default.AttachFile) {
                openRemoteFile(context, scope, file, po.adendumFileName)
            }
        }
    }
}

/** Un testigo de publicidad: la foto si es imagen, el medio, de qué trata y quién lo subió. */
@Composable
private fun WitnessCard(w: WitnessDto, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val file = w.fileUrl?.takeIf { it.isNotBlank() }
    val isImage = file != null && w.mimeType?.startsWith("image/") == true
    ModuleCard(modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
        if (file != null && isImage) {
            SubcomposeAsyncImage(
                model = ApiClient.resolveUrl(file),
                contentDescription = w.title,
                // Fit respeta la proporción de la foto: sin recortes en verticales ni panorámicas.
                contentScale = ContentScale.Fit,
                loading = { Box(Modifier.fillMaxWidth().height(160.dp).background(ArtaColors.Surface2)) },
                error = {
                    Box(Modifier.fillMaxWidth().height(160.dp).background(ArtaColors.Surface2), contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.BrokenImage, "No se pudo mostrar", tint = ArtaColors.Muted)
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 280.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(role = Role.Button, onClickLabel = "Abrir la foto") { openRemoteFile(context, scope, file, w.fileName ?: w.title) },
            )
            Spacer(Modifier.height(10.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Pill(witnessMediumLabel(w.medium), ArtaColors.Muted)
            if (w.isPublic) Pill("En el sitio", ArtaColors.Ok)
        }
        if (w.title.isNotBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(w.title, fontWeight = FontWeight.SemiBold)
        }
        w.note?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(2.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
        }
        val meta = listOfNotNull(dueDate(w.publishedAt)?.let { shortDate(it) }, w.createdBy?.fullName?.takeIf { it.isNotBlank() }).joinToString(" · ")
        if (meta.isNotBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(meta, style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR), color = ArtaColors.Tertiary)
        }
        if (file != null && !isImage) {
            AttachmentLine(w.fileName?.takeIf { it.isNotBlank() } ?: "Abrir archivo", Icons.Default.AttachFile) {
                openRemoteFile(context, scope, file, w.fileName ?: w.title)
            }
        }
        w.link?.takeIf { it.isNotBlank() }?.let { link ->
            AttachmentLine("Abrir liga", Icons.AutoMirrored.Filled.OpenInNew) { openInBrowser(context, link) }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.summaryItems(ev: EventDetailDto, onOpenChecklist: (String) -> Unit) {
    val description = ev.description?.takeIf { it.isNotBlank() }
    val notes = ev.notes?.takeIf { it.isNotBlank() }
    if (description != null) {
        item { SectionTitle("Descripción") }
        item { Text(description, modifier = Modifier.padding(horizontal = 20.dp)) }
    }
    if (notes != null) {
        item { SectionTitle("Notas") }
        item { Text(notes, modifier = Modifier.padding(horizontal = 20.dp)) }
    }
    ev.createdBy?.takeIf { it.fullName.isNotBlank() }?.let { who ->
        item {
            Text(
                "Creó el evento: ${who.fullName}",
                style = MaterialTheme.typography.bodySmall,
                color = ArtaColors.Muted,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
        }
    }
    item { SectionTitle("Formatos", count = ev.checklists.size.takeIf { it > 0 }) }
    if (ev.checklists.isEmpty()) {
        item { Text("Sin formatos.", color = ArtaColors.Muted, modifier = Modifier.padding(horizontal = 20.dp)) }
    }
    items(ev.checklists, key = { "c-${it.id}" }) { c ->
        val pct = (c.progressPct ?: 0.0).coerceIn(0.0, 100.0)
        ModuleCard(Modifier.animateItem().padding(horizontal = 16.dp, vertical = 4.dp), onClick = { onOpenChecklist(c.id) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.title ?: c.template?.name ?: "Formato", modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${pct.toInt()} %", style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = TABULAR), color = ArtaColors.Muted)
            }
            Spacer(Modifier.height(8.dp))
            ProgressLine((pct / 100.0).toFloat())
        }
    }
}
