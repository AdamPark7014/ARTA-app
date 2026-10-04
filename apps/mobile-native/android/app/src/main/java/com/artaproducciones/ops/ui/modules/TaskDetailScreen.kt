package com.artaproducciones.ops.ui.modules

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.ModulesSession
import com.artaproducciones.ops.data.api.TaskDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.chat.ChatMedia
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.launch
import okhttp3.MultipartBody

private val OPEN_STATUSES = setOf("OPEN", "IN_PROGRESS", "BLOCKED")

/** Qué puede hacer la persona con esta tarea: mismas reglas que la web y el API. */
private class TaskAbilities(t: TaskDto, perms: ModulesPerms) {
    private val me = perms.me.id
    val closed = t.eventClosed
    private val isAssignee = t.isAssignee(me)
    private val isRequester = t.createdById == me
    private val open = t.status in OPEN_STATUSES

    val review = t.status == "PENDING_APPROVAL" && perms.canReviewTask(t)
    val deliver = !closed && open && t.needsApproval() && isAssignee
    val markDone = !closed && open && !(t.needsApproval() && isAssignee)
    val reopen = !closed && (t.status == "DONE" || t.status == "PENDING_APPROVAL")
    val start = !closed && (t.status == "OPEN" || t.status == "BLOCKED")
    val block = !closed && open
    val edit = !closed
    val addFiles = !closed && (isAssignee || isRequester || perms.isDirection)
    val delete = !closed && (isRequester || perms.isDirection)
}

private fun displayName(context: Context, uri: Uri): String =
    runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment ?: "archivo"

private suspend fun uploadEvidence(context: Context, taskId: String, uris: List<Uri>) {
    for (uri in uris) {
        val prepared = ChatMedia.prepare(context, uri)
        try {
            ModulesClient.api.addEvidence(
                taskId,
                MultipartBody.Part.createFormData("file", prepared.name, prepared.body { _, _ -> }),
            )
        } finally {
            prepared.dispose()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailScreen(taskId: String, nav: ModuleNav) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    var task by remember { mutableStateOf<TaskDto?>(null) }
    var perms by remember { mutableStateOf<ModulesPerms?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var delivering by remember { mutableStateOf(false) }
    var rejecting by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(taskId, tick) {
        loading = true
        try {
            perms = ModulesPerms(ModulesSession.me())
            task = ModulesClient.api.task(taskId)
            error = null
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    fun act(key: String, success: String?, block: suspend () -> TaskDto?) {
        if (busy != null) return
        busy = key
        scope.launch {
            try {
                block()?.let { task = it }
                ModulesStore.taskLists.clear()
                haptics.confirm()
                success?.let { toast(context, it) }
            } catch (e: Exception) {
                haptics.reject()
                toast(context, e.userMessage())
            } finally {
                busy = null
            }
        }
    }

    fun setStatus(status: String, success: String) =
        act(status, success) { ModulesClient.api.updateTask(taskId, mapOf("status" to status)) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isNotEmpty()) {
            act("files", if (uris.size == 1) "Archivo agregado" else "${uris.size} archivos agregados") {
                uploadEvidence(context, taskId, uris)
                ModulesClient.api.task(taskId)
            }
        }
    }

    val t = task
    val p = perms
    val can = if (t != null && p != null) TaskAbilities(t, p) else null

    Column(Modifier.fillMaxSize()) {
        DetailTopBar("Tarea", onBack = { nav.back() }) {
            if (can != null && (can.edit || can.delete)) {
                Column {
                    IconButton(onClick = { menuOpen = true }) { Icon(Icons.Default.MoreVert, contentDescription = "Más") }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        if (can.edit) DropdownMenuItem(text = { Text("Editar") }, onClick = { menuOpen = false; editing = true })
                        if (can.delete) {
                            DropdownMenuItem(
                                text = { Text("Eliminar", color = ArtaColors.Danger) },
                                onClick = { menuOpen = false; confirmDelete = true },
                            )
                        }
                    }
                }
            }
        }
        PullToRefreshBox(
            isRefreshing = loading && t != null,
            onRefresh = { tick++ },
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            when {
                t == null && error != null -> ErrorState(error!!, onRetry = { tick++ })
                t == null || can == null -> DetailSkeleton()
                else -> TaskBody(
                    task = t,
                    can = can,
                    busy = busy,
                    onOpenEvent = { id -> nav.openEvent(id) },
                    onOpenFile = { url, name -> openRemoteFile(context, scope, url, name) },
                    onAddFiles = { picker.launch("*/*") },
                    onStart = { setStatus("IN_PROGRESS", "Tarea en curso") },
                    onToggleBlock = {
                        if (t.status == "BLOCKED") setStatus("OPEN", "Tarea desbloqueada") else setStatus("BLOCKED", "Tarea bloqueada")
                    },
                )
            }
        }
        if (t != null && can != null) {
            TaskActionBar(
                can = can,
                busy = busy,
                onApprove = { act("approve", "Entrega aprobada") { ModulesClient.api.approveTask(taskId) } },
                onReject = { rejecting = true },
                onDeliver = { delivering = true },
                onMarkDone = { setStatus("DONE", "Tarea completada") },
                onReopen = { setStatus("OPEN", "Tarea reabierta") },
            )
        }
    }

    if (editing && t != null) {
        TaskFormSheet(
            initial = t,
            onDismiss = { editing = false },
            onSaved = { saved ->
                editing = false
                task = saved
                ModulesStore.taskLists.clear()
            },
        )
    }

    if (delivering && t != null) {
        DeliverSheet(
            task = t,
            onDismiss = { delivering = false },
            onDelivered = { updated ->
                delivering = false
                task = updated
                ModulesStore.taskLists.clear()
            },
        )
    }

    if (rejecting) {
        ReasonDialog(
            title = "Pedir corrección",
            placeholder = "Qué falta o qué corregir…",
            confirmLabel = "Rechazar entrega",
            onConfirm = { note -> act("reject", "Corrección pedida") { ModulesClient.api.rejectTask(taskId, mapOf("note" to note)) } },
            onDismiss = { rejecting = false },
        )
    }

    if (confirmDelete && t != null) {
        ConfirmDialog(
            title = "¿Eliminar la tarea?",
            text = "«${t.title}» se borra para todos. No se puede deshacer.",
            confirmLabel = "Eliminar",
            danger = true,
            onConfirm = {
                act("delete", "Tarea eliminada") {
                    ModulesClient.api.deleteTask(taskId)
                    nav.back()
                    null
                }
            },
            onDismiss = { confirmDelete = false },
        )
    }
}

@Composable
private fun DetailSkeleton() {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SkeletonBlock(height = 24, widthFraction = 0.8f)
        SkeletonBlock(height = 14, widthFraction = 0.4f)
        Spacer(Modifier.height(8.dp))
        repeat(4) { SkeletonBlock(height = 56) }
    }
}

@Composable
private fun TaskBody(
    task: TaskDto,
    can: TaskAbilities,
    busy: String?,
    onOpenEvent: (String) -> Unit,
    onOpenFile: (String, String?) -> Unit,
    onAddFiles: () -> Unit,
    onStart: () -> Unit,
    onToggleBlock: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(task.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Pill(taskStatusLabel(task), taskStatusColor(task.status))
                if (task.status != "DONE") {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        dueLabel(task.dueAt),
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (task.isOverdue()) ArtaColors.Danger else ArtaColors.Muted,
                    )
                }
            }
        }

        if (can.closed) {
            Banner("Evento cerrado o cancelado: la tarea queda solo de lectura.", ArtaColors.Muted)
        }

        if (can.start || can.block) {
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (can.start) OutlinedButton(onClick = onStart, enabled = busy == null) { Text("En curso") }
                if (can.block) {
                    OutlinedButton(
                        onClick = onToggleBlock,
                        enabled = busy == null,
                        colors = if (task.status == "BLOCKED") ButtonDefaults.outlinedButtonColors()
                        else ButtonDefaults.outlinedButtonColors(contentColor = ArtaColors.Danger),
                    ) { Text(if (task.status == "BLOCKED") "Desbloquear" else "Bloquear") }
                }
            }
        }

        task.rejectionNote?.takeIf { it.isNotBlank() && task.status != "DONE" }?.let {
            Banner(
                "Corrección pedida${task.rejectedBy?.let { r -> " por ${r.fullName}" } ?: ""}: $it",
                ArtaColors.Danger,
            )
        }

        task.event?.let { ev ->
            ModuleCard(Modifier.padding(horizontal = 16.dp), onClick = { onOpenEvent(ev.id) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Event, contentDescription = null, tint = ArtaColors.Gold)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Evento", style = MaterialTheme.typography.labelSmall, color = ArtaColors.Muted)
                        Text(ev.name, fontWeight = FontWeight.SemiBold)
                    }
                    eventStatusLabel(ev.status.orEmpty())?.let { Pill(it, ArtaColors.Muted) }
                }
            }
        }

        if (!task.detail.isNullOrBlank() || !task.module.isNullOrBlank()) {
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                task.module?.takeIf { it.isNotBlank() }?.let { Text("Área: $it", color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall) }
                task.detail?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
            }
        }

        SectionTitle("Personas")
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            task.createdBy?.takeIf { it.fullName.isNotBlank() }?.let {
                PersonLine(it.fullName, "Pidió" + (task.createdAt?.let { c -> " · ${stampLabel(c)}" } ?: ""))
            }
            val people = task.assigneePeople()
            if (people.isEmpty()) Text("Sin responsables asignados", color = ArtaColors.Muted)
            people.forEachIndexed { i, person ->
                PersonLine(person.fullName, if (i == 0 && people.size > 1) "Responsable principal" else "Responsable")
            }
        }

        if (!task.completionNote.isNullOrBlank() || task.submittedAt != null || task.approvedBy != null) {
            SectionTitle("Entrega")
            ModuleCard(Modifier.padding(horizontal = 16.dp)) {
                task.completionNote?.takeIf { it.isNotBlank() }?.let { Text(it) }
                task.submittedAt?.let {
                    Text("Entregada ${stampLabel(it)}", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
                }
                task.approvedBy?.takeIf { task.status == "DONE" }?.let {
                    Text(
                        "Aprobada por ${it.fullName}${task.approvedAt?.let { a -> " · ${stampLabel(a)}" } ?: ""}",
                        style = MaterialTheme.typography.bodySmall,
                        color = OkGreen,
                    )
                }
            }
        }

        SectionTitle("Archivos y entregables", count = task.evidences.size.takeIf { it > 0 }) {
            if (can.addFiles) {
                TextButton(onClick = onAddFiles, enabled = busy == null) {
                    if (busy == "files") CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    else Text("Agregar")
                }
            }
        }
        if (task.evidences.isEmpty()) {
            Text("Sin archivos todavía.", color = ArtaColors.Muted, modifier = Modifier.padding(horizontal = 16.dp))
        }
        task.evidences.forEach { ev ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onOpenFile(ev.fileUrl, ev.label) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.AttachFile, contentDescription = null, tint = ArtaColors.Gold)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(ev.label ?: ev.fileUrl.substringAfterLast('/'), maxLines = 1)
                    Text(
                        listOfNotNull(ev.uploadedBy?.fullName?.takeIf { it.isNotBlank() }, stampLabel(ev.createdAt).takeIf { it.isNotBlank() })
                            .joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = ArtaColors.Muted,
                    )
                    ev.note?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }

        if (task.activities.isNotEmpty()) {
            SectionTitle("Historial", count = task.activities.size)
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                task.activities.asReversed().forEach { a ->
                    Row {
                        Dot(ArtaColors.Gold, 8)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(TASK_ACTION_LABEL[a.action] ?: a.action, fontWeight = FontWeight.Medium)
                            a.detail?.takeIf { it.isNotBlank() && a.action != "status_changed" }?.let {
                                Text(it, style = MaterialTheme.typography.bodySmall)
                            }
                            if (a.action == "status_changed") {
                                Text(statusName(a.detail), style = MaterialTheme.typography.bodySmall)
                            }
                            Text(
                                listOfNotNull(a.actor?.fullName, stampLabel(a.createdAt)).joinToString(" · "),
                                style = MaterialTheme.typography.labelSmall,
                                color = ArtaColors.Muted,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun statusName(status: String?): String = when (status) {
    "OPEN" -> "Abierta"
    "IN_PROGRESS" -> "En curso"
    "PENDING_APPROVAL" -> "Por aprobar"
    "DONE" -> "Hecha"
    "BLOCKED" -> "Bloqueada"
    else -> status.orEmpty()
}

@Composable
private fun PersonLine(name: String, role: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Avatar(name, size = 32.dp)
        Spacer(Modifier.width(12.dp))
        Column {
            Text(name)
            Text(role, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
        }
    }
}

@Composable
private fun Banner(text: String, color: androidx.compose.ui.graphics.Color) {
    Text(
        text,
        color = color,
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
            .padding(12.dp),
    )
}

@Composable
private fun TaskActionBar(
    can: TaskAbilities,
    busy: String?,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onDeliver: () -> Unit,
    onMarkDone: () -> Unit,
    onReopen: () -> Unit,
) {
    if (!can.review && !can.deliver && !can.markDone && !can.reopen) return
    Surface(color = ArtaColors.BgElev) {
        Column {
            HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp)
            Row(
                Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                val enabled = busy == null
                when {
                    can.review -> {
                        OutlinedButton(
                            onClick = onReject,
                            enabled = enabled,
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = ArtaColors.Danger),
                            modifier = Modifier.weight(1f),
                        ) { Text("Rechazar") }
                        Button(onClick = onApprove, enabled = enabled, modifier = Modifier.weight(1f)) {
                            if (busy == "approve") CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArtaColors.Bg)
                            else Text("Dar visto bueno")
                        }
                    }
                    can.deliver -> Button(onClick = onDeliver, enabled = enabled, modifier = Modifier.weight(1f)) { Text("Entregar") }
                    can.markDone -> Button(onClick = onMarkDone, enabled = enabled, modifier = Modifier.weight(1f)) {
                        if (busy == "DONE") CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArtaColors.Bg)
                        else Text("Marcar hecha")
                    }
                }
                if (can.reopen && !can.review) {
                    OutlinedButton(onClick = onReopen, enabled = enabled, modifier = Modifier.weight(1f)) { Text("Reabrir") }
                }
            }
        }
    }
}

/** Entregar con evidencia: nota y/o archivos; el API exige al menos una de las dos. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DeliverSheet(task: TaskDto, onDismiss: () -> Unit, onDelivered: (TaskDto) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var note by remember { mutableStateOf(task.completionNote.orEmpty()) }
    val files = remember { mutableStateListOf<Uri>() }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        files.addAll(uris.filter { it !in files })
    }

    fun send() {
        if (note.isBlank() && files.isEmpty() && task.evidences.isEmpty()) {
            error = "Agrega una nota o al menos un archivo de evidencia"
            haptics.reject()
            return
        }
        sending = true
        error = null
        scope.launch {
            try {
                if (files.isNotEmpty()) uploadEvidence(context, task.id, files.toList())
                val updated = ModulesClient.api.submitTask(task.id, mapOf("completionNote" to note.trim()))
                haptics.confirm()
                toast(
                    context,
                    if (updated.status == "PENDING_APPROVAL") "Entrega enviada: espera el visto bueno de quien la pidió" else "Tarea completada",
                )
                onDelivered(updated)
            } catch (e: Exception) {
                haptics.reject()
                error = e.userMessage()
            } finally {
                sending = false
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = ArtaColors.BgElev) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Entregar tarea", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                task.title + (task.createdBy?.fullName?.takeIf { it.isNotBlank() }?.let { " · pidió $it" } ?: ""),
                color = ArtaColors.Muted,
            )
            task.rejectionNote?.takeIf { it.isNotBlank() }?.let {
                Text("Corrección pedida: $it", color = ArtaColors.Danger, style = MaterialTheme.typography.bodyMedium)
            }
            OutlinedTextField(
                value = note,
                onValueChange = { note = it; error = null },
                label = { Text("¿Qué hiciste?") },
                placeholder = { Text("Lo realizado, referencias, números, contactos…") },
                minLines = 4,
                modifier = Modifier.fillMaxWidth(),
            )
            files.forEach { uri ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.AttachFile, contentDescription = null, tint = ArtaColors.Gold, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(displayName(context, uri), modifier = Modifier.weight(1f), maxLines = 1)
                    TextButton(onClick = { files.remove(uri) }) { Text("Quitar") }
                }
            }
            OutlinedButton(onClick = { picker.launch("*/*") }, enabled = !sending) {
                Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Adjuntar foto, PDF o archivo")
            }
            if (task.evidences.isNotEmpty()) {
                Text("Ya hay ${task.evidences.size} archivo(s) en esta tarea.", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
            }
            error?.let { Text(it, color = ArtaColors.Danger) }
            Button(onClick = { send() }, enabled = !sending, modifier = Modifier.fillMaxWidth()) {
                if (sending) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArtaColors.Bg)
                else Text("Enviar entrega")
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
