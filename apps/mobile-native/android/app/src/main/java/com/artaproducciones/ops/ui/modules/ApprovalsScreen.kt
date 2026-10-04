package com.artaproducciones.ops.ui.modules

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.AdvanceDto
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.ModulesSession
import com.artaproducciones.ops.data.api.PoDetailDto
import com.artaproducciones.ops.data.api.PoRowDto
import com.artaproducciones.ops.data.api.TaskDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import retrofit2.HttpException

/** Una OC con la entidad de la que se pidió (la autorización depende de ella). */
internal data class PoItem(val row: PoRowDto, val entity: String)

internal data class ApprovalsData(
    val tasksToReview: List<TaskDto>,
    val requested: List<TaskDto>,
    val orders: List<PoItem>,
    val canPayNow: Boolean,
    val advances: List<AdvanceDto> = emptyList(),
) {
    fun toAuthorize(p: ModulesPerms) = orders.filter {
        poIsPending(it.row.status) && it.row.eventStatus !in CLOSED_EVENT && p.canAuthorizePoFor(it.entity)
    }

    fun toPay(p: ModulesPerms) = orders.filter {
        p.canMarkPaid && it.row.status == "AUTHORIZED" && it.row.eventStatus !in CLOSED_EVENT
    }

    /** Por aprobar primero, luego por pagar; las más viejas arriba. */
    val actionableAdvances: List<AdvanceDto>
        get() = advances.filter { it.isActionable() }.sortedWith(compareBy({ it.advanceStatus != "PENDING" }, { it.createdAt ?: "" }))

    fun pendingCount(p: ModulesPerms) = tasksToReview.size + toAuthorize(p).size + toPay(p).size + actionableAdvances.size
}

/** El API filtra por permisos; si la ruta aún no existe (404) o falla, la sección no aparece. */
internal suspend fun loadPendingAdvances(p: ModulesPerms): List<AdvanceDto> =
    if (p.approvesMoney || p.has("finance.edit")) runCatching { ModulesClient.api.pendingAdvances() }.getOrDefault(emptyList()) else emptyList()

/**
 * Lo que espera mi decisión. Tareas: las que pedí (dirección ve todas las de su
 * operación, como en el API). OC: `GET /analytics/purchase-orders` por cada entidad.
 */
internal suspend fun loadApprovals(p: ModulesPerms): ApprovalsData = coroutineScope {
    val requested = async { ModulesClient.api.requestedTasks() }
    val review = async {
        if (p.isDirection) ModulesClient.api.workload("PENDING_APPROVAL") else null
    }
    val orders = if (p.approvesMoney) {
        p.eventOpsEntities.map { entity ->
            async { runCatching { ModulesClient.api.poAnalytics(entity).orders.map { PoItem(it, entity) } }.getOrDefault(emptyList()) }
        }
    } else {
        emptyList()
    }
    val window = async { if (p.canMarkPaid) runCatching { ModulesClient.api.poWindow().canPayNow }.getOrDefault(false) else false }
    val advances = async { loadPendingAdvances(p) }
    val mine = requested.await()
    ApprovalsData(
        tasksToReview = (review.await() ?: mine.filter { it.status == "PENDING_APPROVAL" })
            .filter { p.canReviewTask(it) }
            .sortedBy { it.submittedAt ?: it.updatedAt ?: "" },
        requested = mine,
        orders = orders.awaitAll().flatten(),
        canPayNow = window.await(),
        advances = advances.await(),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApprovalsScreen(nav: ModuleNav, focusAdvanceId: String? = null) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    var perms by remember { mutableStateOf<ModulesPerms?>(null) }
    var data by remember { mutableStateOf<ApprovalsData?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var openPo by remember { mutableStateOf<PoItem?>(null) }
    var rejectTask by remember { mutableStateOf<TaskDto?>(null) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var rejectAdvance by remember { mutableStateOf<AdvanceDto?>(null) }
    var confirmPaid by remember { mutableStateOf<AdvanceDto?>(null) }
    var highlightAdvance by remember { mutableStateOf<String?>(null) }
    var focusHandled by rememberSaveable { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()

    LaunchedEffect(tick) {
        loading = true
        try {
            val p = ModulesPerms(ModulesSession.me())
            perms = p
            data = loadApprovals(p)
            error = null
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    fun reviewTask(t: TaskDto, note: String?) {
        busyId = t.id
        scope.launch {
            try {
                if (note == null) ModulesClient.api.approveTask(t.id) else ModulesClient.api.rejectTask(t.id, mapOf("note" to note))
                data = data?.let { d -> d.copy(tasksToReview = d.tasksToReview.filter { it.id != t.id }) }
                ModulesStore.taskLists.clear()
                haptics.confirm()
                toast(context, if (note == null) "Entrega aprobada" else "Corrección pedida")
            } catch (e: Exception) {
                haptics.reject()
                toast(context, e.userMessage())
            } finally {
                busyId = null
            }
        }
    }

    fun notify(message: String) {
        scope.launch { snackbar.showSnackbar(message) }
    }

    /** Optimista: la tarjeta sale de la lista y vuelve a su lugar si el API falla; un 409 recarga lo del servidor. */
    fun resolveAdvance(a: AdvanceDto, action: String, reason: String? = null) {
        val before = data ?: return
        val index = before.advances.indexOfFirst { it.id == a.id }
        if (index < 0) return
        data = before.copy(advances = before.advances.filterNot { it.id == a.id })
        scope.launch {
            try {
                when (action) {
                    "approve" -> ModulesClient.api.approveAdvance(a.id)
                    "reject" -> ModulesClient.api.rejectAdvance(a.id, mapOf("reason" to reason))
                    else -> ModulesClient.api.markAdvancePaid(a.id)
                }
                haptics.confirm()
                notify(
                    when (action) {
                        "approve" -> "Anticipo aprobado"
                        "reject" -> "Anticipo rechazado"
                        else -> "Anticipo marcado como pagado"
                    },
                )
                // Quien aprueba también puede pagar: el mismo anticipo vuelve como «Por pagar».
                runCatching { ModulesClient.api.pendingAdvances() }.getOrNull()?.let { list -> data = data?.copy(advances = list) }
            } catch (e: Exception) {
                haptics.reject()
                notify(e.userMessage())
                val fresh = if (e is HttpException && e.code() == 409) {
                    runCatching { ModulesClient.api.pendingAdvances() }.getOrNull()
                } else {
                    null
                }
                data = data?.let { d ->
                    when {
                        fresh != null -> d.copy(advances = fresh)
                        d.advances.any { it.id == a.id } -> d
                        else -> d.copy(advances = d.advances.toMutableList().apply { add(index.coerceAtMost(size), a) })
                    }
                }
            }
        }
    }

    val p = perms
    val d = data

    LaunchedEffect(d != null, focusAdvanceId) {
        val id = focusAdvanceId ?: return@LaunchedEffect
        val loaded = data ?: return@LaunchedEffect
        val pp = perms ?: return@LaunchedEffect
        if (focusHandled) return@LaunchedEffect
        focusHandled = true
        tab = 0
        val index = loaded.advanceListIndex(pp, id, hasError = error != null)
        if (index == null) {
            notify("Ese anticipo ya no está pendiente de tu parte.")
            return@LaunchedEffect
        }
        highlightAdvance = id
        runCatching { listState.animateScrollToItem(index) }
        delay(4_000)
        highlightAdvance = null
    }

    Column(Modifier.fillMaxSize()) {
        DetailTopBar("Aprobaciones", onBack = { nav.back() })
        val pending = if (p != null && d != null) d.pendingCount(p) else 0
        TabRow(selectedTabIndex = tab, containerColor = ArtaColors.Bg, contentColor = ArtaColors.Gold) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text(if (pending > 0) "Pendientes · $pending" else "Pendientes") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Historial") })
        }
        PullToRefreshBox(
            isRefreshing = loading && d != null,
            onRefresh = { tick++ },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                d == null && error != null -> ErrorState(error!!, onRetry = { tick++ })
                d == null || p == null -> SkeletonList()
                tab == 0 -> PendingList(
                    data = d,
                    perms = p,
                    error = error,
                    busyId = busyId,
                    onRetry = { tick++ },
                    onOpenTask = { nav.openTask(it.id) },
                    onApprove = { reviewTask(it, null) },
                    onReject = { rejectTask = it },
                    onOpenPo = { openPo = it },
                    onOpenAdvances = { nav.openWeb("/advances", "Anticipos") },
                    listState = listState,
                    highlightAdvance = highlightAdvance,
                    onOpenFile = { a, url -> openRemoteFile(context, scope, url, a.label) },
                    onApproveAdvance = { resolveAdvance(it, "approve") },
                    onRejectAdvance = { rejectAdvance = it },
                    onPaidAdvance = { confirmPaid = it },
                )
                else -> HistoryList(
                    data = d,
                    perms = p,
                    onOpenTask = { nav.openTask(it.id) },
                    onOpenPo = { openPo = it },
                )
            }
            SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
        }
    }

    rejectAdvance?.let { a ->
        AdvanceRejectSheet(
            advance = a,
            onConfirm = { reason ->
                rejectAdvance = null
                resolveAdvance(a, "reject", reason)
            },
            onDismiss = { rejectAdvance = null },
        )
    }

    confirmPaid?.let { a ->
        ConfirmDialog(
            title = "¿Marcar pagado?",
            text = listOfNotNull(a.conceptLabel(), advanceAmountLabel(a.amount), a.event?.name?.takeIf { it.isNotBlank() }).joinToString(" · "),
            confirmLabel = "Marcar pagado",
            onConfirm = { resolveAdvance(a, "paid") },
            onDismiss = { confirmPaid = null },
        )
    }

    rejectTask?.let { t ->
        ReasonDialog(
            title = "Pedir corrección",
            placeholder = "Qué falta o qué corregir…",
            confirmLabel = "Rechazar entrega",
            onConfirm = { note -> reviewTask(t, note) },
            onDismiss = { rejectTask = null },
        )
    }

    val po = openPo
    if (po != null && p != null && d != null) {
        PoSheet(
            item = po,
            perms = p,
            canPayNow = d.canPayNow,
            onDismiss = { openPo = null },
            onChanged = {
                openPo = null
                tick++
            },
            onOpenEvent = { id ->
                openPo = null
                nav.openEvent(id)
            },
            onOpenWeb = { path, title ->
                openPo = null
                nav.openWeb(path, title)
            },
        )
    }
}

@Composable
private fun PendingList(
    data: ApprovalsData,
    perms: ModulesPerms,
    error: String?,
    busyId: String?,
    onRetry: () -> Unit,
    onOpenTask: (TaskDto) -> Unit,
    onApprove: (TaskDto) -> Unit,
    onReject: (TaskDto) -> Unit,
    onOpenPo: (PoItem) -> Unit,
    onOpenAdvances: () -> Unit,
    listState: LazyListState,
    highlightAdvance: String?,
    onOpenFile: (AdvanceDto, String) -> Unit,
    onApproveAdvance: (AdvanceDto) -> Unit,
    onRejectAdvance: (AdvanceDto) -> Unit,
    onPaidAdvance: (AdvanceDto) -> Unit,
) {
    val toAuthorize = data.toAuthorize(perms).sortedByDescending { it.row.ageDays }
    val toPay = data.toPay(perms).sortedByDescending { it.row.ageDays }
    val advances = data.actionableAdvances
    LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(bottom = 32.dp)) {
        error?.let { msg -> item { InlineError(msg, onRetry) } }
        if (data.tasksToReview.isEmpty() && toAuthorize.isEmpty() && toPay.isEmpty() && advances.isEmpty()) {
            item {
                EmptyState(
                    "Nada pendiente",
                    "Cuando alguien te entregue una tarea" +
                        (if (perms.approvesMoney) ", pidan una orden de compra o un anticipo" else "") + ", aparecerá aquí.",
                )
            }
        }
        if (data.tasksToReview.isNotEmpty()) {
            item { SectionTitle("Tareas por aprobar", count = data.tasksToReview.size) }
            items(data.tasksToReview, key = { "t-${it.id}" }) { t ->
                ReviewTaskCard(t, busy = busyId == t.id, onOpen = { onOpenTask(t) }, onApprove = { onApprove(t) }, onReject = { onReject(t) })
            }
        }
        if (toAuthorize.isNotEmpty()) {
            item {
                SectionTitle("Órdenes por autorizar", count = toAuthorize.size) {
                    Text(money(toAuthorize.sumOf { it.row.amount }), style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
                }
            }
            items(toAuthorize, key = { "a-${it.row.id}" }) { PoCard(it, onClick = { onOpenPo(it) }) }
        }
        if (toPay.isNotEmpty()) {
            item {
                SectionTitle("Órdenes por pagar", count = toPay.size) {
                    Text(money(toPay.sumOf { it.row.amount }), style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
                }
            }
            if (!data.canPayNow) {
                item {
                    Text(
                        "Hoy no es día de cobro: los pagos se registran solo en los días de cobro.",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArtaColors.Muted,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                }
            }
            items(toPay, key = { "p-${it.row.id}" }) { PoCard(it, onClick = { onOpenPo(it) }) }
        }
        if (advances.isNotEmpty()) {
            item {
                SectionTitle("Anticipos", count = advances.size) {
                    Text(money(advances.sumOf { advanceAmount(it.amount) ?: 0.0 }), style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
                }
            }
            items(advances, key = { "adv-${it.id}" }) { a ->
                AdvanceCard(
                    advance = a,
                    highlighted = a.id == highlightAdvance,
                    onOpenFile = { url -> onOpenFile(a, url) },
                    onApprove = { onApproveAdvance(a) },
                    onReject = { onRejectAdvance(a) },
                    onPaid = { onPaidAdvance(a) },
                )
            }
        }
        if (perms.canSeeFinance) {
            item {
                ModuleCard(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), onClick = onOpenAdvances) {
                    Text("Anticipos", fontWeight = FontWeight.SemiBold)
                    Text(
                        "Solicitudes, historial y anticipos de cada evento. Toca para verlos.",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArtaColors.Muted,
                    )
                }
            }
        }
    }
}

/** Posición de la tarjeta del anticipo en [PendingList]; tiene que contar los mismos `item` en el mismo orden. */
internal fun ApprovalsData.advanceListIndex(p: ModulesPerms, advanceId: String, hasError: Boolean): Int? {
    val advances = actionableAdvances
    val at = advances.indexOfFirst { it.id == advanceId }
    if (at < 0) return null
    val toAuthorize = toAuthorize(p)
    val toPay = toPay(p)
    var index = if (hasError) 1 else 0
    if (tasksToReview.isNotEmpty()) index += 1 + tasksToReview.size
    if (toAuthorize.isNotEmpty()) index += 1 + toAuthorize.size
    if (toPay.isNotEmpty()) index += 1 + toPay.size + (if (canPayNow) 0 else 1)
    return index + 1 + at
}

@Composable
private fun HistoryList(data: ApprovalsData, perms: ModulesPerms, onOpenTask: (TaskDto) -> Unit, onOpenPo: (PoItem) -> Unit) {
    val orders = data.orders
        .filter { it.row.status in setOf("AUTHORIZED", "PAID", "REJECTED", "CANCELLED") }
        .sortedByDescending { it.row.paidAt ?: it.row.authorizedAt ?: it.row.createdAt ?: "" }
        .take(60)
    val approved = data.requested.filter { it.status == "DONE" }.sortedByDescending { it.approvedAt ?: it.updatedAt ?: "" }.take(40)
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        if (orders.isEmpty() && approved.isEmpty()) {
            item { EmptyState("Sin historial todavía", "Aquí quedan las órdenes autorizadas o pagadas y las tareas que aprobaste.") }
        }
        if (perms.approvesMoney && orders.isNotEmpty()) {
            item { SectionTitle("Órdenes de compra", count = orders.size) }
            items(orders, key = { "h-${it.row.id}" }) { PoCard(it, onClick = { onOpenPo(it) }) }
        }
        if (approved.isNotEmpty()) {
            item { SectionTitle("Tareas que pediste, ya cerradas", count = approved.size) }
            items(approved, key = { "d-${it.id}" }) { t -> TaskRow(task = t, showAssignees = true, onClick = { onOpenTask(t) }) }
        }
    }
}

@Composable
private fun ReviewTaskCard(task: TaskDto, busy: Boolean, onOpen: () -> Unit, onApprove: () -> Unit, onReject: () -> Unit) {
    ModuleCard(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), onClick = onOpen) {
        Text(task.title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        val who = task.assigneePeople().joinToString(", ") { it.fullName }.ifBlank { "Sin responsable" }
        Text(
            "Entregó: $who" + (task.submittedAt?.let { " · ${stampLabel(it)}" } ?: ""),
            style = MaterialTheme.typography.bodySmall,
            color = ArtaColors.Muted,
        )
        task.event?.let { Text(it.name, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted, maxLines = 1) }
        task.completionNote?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(4.dp))
            Text(it, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        if (task.evidences.isNotEmpty()) {
            Text(
                if (task.evidences.size == 1) "1 archivo de evidencia" else "${task.evidences.size} archivos de evidencia",
                style = MaterialTheme.typography.bodySmall,
                color = ArtaColors.Gold,
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = onReject,
                enabled = !busy,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = ArtaColors.Danger),
                modifier = Modifier.weight(1f),
            ) { Text("Rechazar") }
            Button(onClick = onApprove, enabled = !busy, modifier = Modifier.weight(1f)) {
                if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArtaColors.Bg)
                else Text("Visto bueno")
            }
        }
    }
}

@Composable
private fun PoCard(item: PoItem, onClick: () -> Unit) {
    val r = item.row
    ModuleCard(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(r.vendorName ?: "Sin proveedor", fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            Text(money(r.amount), fontWeight = FontWeight.Bold, color = ArtaColors.Gold)
        }
        Text("${poRubroLabel(r.rubro)} · ${r.eventName}", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Pill(poStatusLabel(r.status), poStatusColor(r.status))
            val waiting = poIsPending(r.status) || r.status == "AUTHORIZED"
            if (waiting) {
                Spacer(Modifier.width(8.dp))
                Text(
                    if (r.ageDays == 1) "1 día esperando" else "${r.ageDays} días esperando",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (r.ageDays > 7) ArtaColors.Danger else ArtaColors.Muted,
                )
            }
            Spacer(Modifier.weight(1f))
            r.createdBy?.let { Text("Pidió ${firstName(it)}", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted) }
        }
    }
}

/** Detalle de la OC: montos, partidas, comprobantes y la acción que le toca (como la web). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PoSheet(
    item: PoItem,
    perms: ModulesPerms,
    canPayNow: Boolean,
    onDismiss: () -> Unit,
    onChanged: () -> Unit,
    onOpenEvent: (String) -> Unit,
    onOpenWeb: (String, String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var po by remember { mutableStateOf<PoDetailDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<String?>(null) }
    val row = item.row

    LaunchedEffect(row.id, tick) {
        try {
            po = ModulesClient.api.purchaseOrder(row.id)
            error = null
        } catch (e: Exception) {
            error = e.userMessage()
        }
    }

    fun setStatus(status: String) {
        busy = true
        scope.launch {
            try {
                ModulesClient.api.setPoStatus(row.id, mapOf("status" to status))
                haptics.confirm()
                toast(
                    context,
                    when (status) {
                        "AUTHORIZED" -> "Orden autorizada"
                        "PAID" -> "Orden pagada"
                        else -> "Orden rechazada"
                    },
                )
                onChanged()
            } catch (e: Exception) {
                haptics.reject()
                toast(context, e.userMessage())
            } finally {
                busy = false
            }
        }
    }

    val ocsPath = "/events/${row.eventId}?tab=ocs"

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = ArtaColors.BgElev) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            val d = po
            val status = d?.status ?: row.status
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    d?.vendorName ?: row.vendorName ?: "Sin proveedor",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Pill(poStatusLabel(status), poStatusColor(status))
            }
            Text(money(d?.amount?.toDoubleOrNull() ?: row.amount), style = MaterialTheme.typography.headlineMedium, color = ArtaColors.Gold, fontWeight = FontWeight.Bold)
            Text(
                row.eventName,
                color = ArtaColors.Gold,
                modifier = Modifier.clickable { onOpenEvent(row.eventId) },
            )

            when {
                d == null && error != null -> ErrorState(error!!, onRetry = { tick++ })
                d == null -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { repeat(4) { SkeletonBlock(height = 18) } }
                else -> {
                    InfoLine("Rubro", poRubroLabel(d.rubro))
                    InfoLine("Solicitó", d.createdBy?.fullName ?: row.createdBy ?: "—")
                    d.createdAt?.let { InfoLine("Pedida", stampLabel(it)) }
                    InfoLine("Forma de pago", poPaymentLabel(d.paymentMethod))
                    InfoLine("Beneficiario", if (d.payeeType == "OTRO") "Otro" else "Proveedor")
                    InfoLine("IVA", if (d.withIva == true) "Sí (16 %)" else "No")
                    d.authorizedBy?.let { InfoLine("Autorizó", it.fullName + (d.authorizedAt?.let { a -> " · ${stampLabel(a)}" } ?: "")) }
                    d.paidAt?.let { InfoLine("Pagada", stampLabel(it)) }
                    d.description?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }

                    if (d.lines.isNotEmpty()) {
                        HorizontalDivider(color = ArtaColors.Line)
                        Text("Partidas", style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
                        d.lines.forEach { l ->
                            Row {
                                Column(Modifier.weight(1f)) {
                                    Text(l.concept)
                                    Text(
                                        "${l.qty?.toDoubleOrNull()?.let { q -> if (q % 1.0 == 0.0) q.toLong().toString() else q.toString() } ?: "—"} × ${moneyOf(l.unitPrice)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = ArtaColors.Muted,
                                    )
                                }
                                Text(moneyOf(l.total))
                            }
                        }
                        val total = d.amount?.toDoubleOrNull() ?: row.amount
                        val subtotal = d.lines.sumOf { it.total?.toDoubleOrNull() ?: 0.0 }
                        if (d.withIva == true) {
                            InfoLine("Subtotal", money(subtotal))
                            InfoLine("IVA", money(total - subtotal))
                        }
                        InfoLine("Total", money(total))
                    }

                    HorizontalDivider(color = ArtaColors.Line)
                    Text("Comprobantes", style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
                    if (d.proofs.isEmpty()) Text("Sin comprobantes", color = ArtaColors.Muted)
                    d.proofs.forEach { proof ->
                        Row(
                            Modifier.fillMaxWidth().clickable { openRemoteFile(context, scope, proof.fileUrl, proof.label) }.padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.AttachFile, contentDescription = null, tint = ArtaColors.Gold)
                            Spacer(Modifier.width(8.dp))
                            Text(proof.label ?: proof.fileUrl.substringAfterLast('/'), modifier = Modifier.weight(1f), maxLines = 1)
                            proof.amount?.let { Text(moneyOf(it), color = ArtaColors.Muted) }
                        }
                    }

                    val eventOpen = (d.event?.status ?: row.eventStatus) !in CLOSED_EVENT
                    HorizontalDivider(color = ArtaColors.Line)
                    when {
                        !eventOpen -> Text("Evento cerrado: la orden queda solo de lectura.", color = ArtaColors.Muted)
                        poIsPending(d.status) && perms.canAuthorizePoFor(item.entity) -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            OutlinedButton(
                                onClick = { confirm = "REJECTED" },
                                enabled = !busy,
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = ArtaColors.Danger),
                                modifier = Modifier.weight(1f),
                            ) { Text("Rechazar") }
                            Button(onClick = { setStatus("AUTHORIZED") }, enabled = !busy, modifier = Modifier.weight(1f)) {
                                if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArtaColors.Bg) else Text("Autorizar")
                            }
                        }
                        d.status == "AUTHORIZED" && perms.canMarkPaid -> when {
                            poNeedsProof(d.paymentMethod) && d.proofs.isEmpty() -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    "Pago por ${poPaymentLabel(d.paymentMethod).lowercase(ES_MX)}: falta subir el comprobante para poder marcarla pagada.",
                                    color = ArtaColors.Muted,
                                )
                                OutlinedButton(onClick = { onOpenWeb(ocsPath, "Órdenes de compra") }) { Text("Subir comprobante") }
                            }
                            !canPayNow -> Text("Hoy no es día de cobro: el pago se registra en el siguiente día de cobro.", color = ArtaColors.Muted)
                            else -> Button(onClick = { confirm = "PAID" }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                                if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArtaColors.Bg) else Text("Marcar pagada")
                            }
                        }
                    }
                }
            }
            TextButton(onClick = { onOpenWeb(ocsPath, "Órdenes de compra") }) { Text("Abrir en la web") }
            Spacer(Modifier.height(8.dp))
        }
    }

    when (confirm) {
        "REJECTED" -> ConfirmDialog(
            title = "¿Rechazar la orden?",
            text = "La orden de ${row.vendorName ?: "este proveedor"} por ${money(row.amount)} queda rechazada y quien la pidió recibe el aviso. Si sigue haciendo falta, tendrá que crear otra.",
            confirmLabel = "Rechazar",
            danger = true,
            onConfirm = { setStatus("REJECTED") },
            onDismiss = { confirm = null },
        )
        "PAID" -> ConfirmDialog(
            title = "¿Marcar pagada?",
            text = "${row.vendorName ?: "Sin proveedor"} · ${money(row.amount)} · ${poPaymentLabel(po?.paymentMethod ?: row.paymentMethod)}",
            confirmLabel = "Marcar pagada",
            onConfirm = { setStatus("PAID") },
            onDismiss = { confirm = null },
        )
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row {
        Text(label, color = ArtaColors.Muted, modifier = Modifier.width(120.dp), style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
}
