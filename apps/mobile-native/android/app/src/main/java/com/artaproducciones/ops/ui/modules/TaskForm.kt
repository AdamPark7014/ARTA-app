package com.artaproducciones.ops.ui.modules

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import com.artaproducciones.ops.data.api.DirUserDto
import com.artaproducciones.ops.data.api.EventSummaryDto
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.ModulesSession
import com.artaproducciones.ops.data.api.TaskDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Crear (initial = null) o editar una tarea. Igual que la web: título, detalle, área,
 * evento (solo al crear: el API no cambia el evento), 1 o más responsables (el primero
 * es el principal) y vencimiento por día (`AAAA-MM-DD`).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TaskFormSheet(
    onDismiss: () -> Unit,
    onSaved: (TaskDto) -> Unit,
    initial: TaskDto? = null,
    presetEventId: String? = null,
    presetEventName: String? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val editing = initial != null

    var title by remember { mutableStateOf(initial?.title.orEmpty()) }
    var detail by remember { mutableStateOf(initial?.detail.orEmpty()) }
    var module by remember { mutableStateOf(initial?.module.orEmpty()) }
    var eventId by remember { mutableStateOf(initial?.eventId ?: presetEventId) }
    var eventName by remember { mutableStateOf(initial?.event?.name ?: presetEventName) }
    val assigneeIds = remember { mutableStateListOf<String>().apply { initial?.let { addAll(it.assigneeIdList()) } } }
    var due by remember { mutableStateOf(dueDate(initial?.dueAt)) }
    var people by remember { mutableStateOf<List<DirUserDto>>(emptyList()) }
    var events by remember { mutableStateOf<List<EventSummaryDto>>(emptyList()) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pickPeople by remember { mutableStateOf(false) }
    var pickEvent by remember { mutableStateOf(false) }
    var pickDate by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        runCatching { ModulesSession.directory() }.onSuccess { people = it }
        if (!editing && presetEventId == null) {
            runCatching { ModulesClient.api.events(scope = "active") }
                .onSuccess { list -> events = list.filter { it.status !in CLOSED_EVENT }.sortedBy { it.startsAt ?: "9999" } }
        }
    }

    fun nameOf(id: String) = people.firstOrNull { it.id == id }?.fullName
        ?: initial?.assigneePeople()?.firstOrNull { it.id == id }?.fullName
        ?: "…"

    fun save() {
        if (title.isBlank()) {
            error = "La tarea necesita un título"
            haptics.reject()
            return
        }
        saving = true
        error = null
        scope.launch {
            try {
                val dueText = due?.toString()
                val saved = if (initial == null) {
                    val body = buildMap<String, Any?> {
                        put("title", title.trim())
                        if (detail.isNotBlank()) put("detail", detail.trim())
                        if (module.isNotBlank()) put("module", module.trim())
                        put("assigneeIds", assigneeIds.toList())
                        eventId?.let { put("eventId", it) }
                        dueText?.let { put("dueAt", it) }
                    }
                    ModulesClient.api.createTask(body)
                } else {
                    val body = buildMap<String, Any?> {
                        if (title.trim() != initial.title) put("title", title.trim())
                        if (detail.trim() != initial.detail.orEmpty()) put("detail", detail.trim().ifBlank { null })
                        if (module.trim() != initial.module.orEmpty()) put("module", module.trim().ifBlank { null })
                        if (assigneeIds.toList() != initial.assigneeIdList()) put("assigneeIds", assigneeIds.toList())
                        if (due != dueDate(initial.dueAt)) put("dueAt", dueText)
                    }
                    if (body.isEmpty()) initial else ModulesClient.api.updateTask(initial.id, body)
                }
                haptics.confirm()
                val names = assigneeIds.map { nameOf(it) }
                toast(
                    context,
                    when {
                        editing -> "Tarea actualizada"
                        names.size > 1 -> "Tarea asignada a ${names.joinToString(", ")}"
                        names.size == 1 -> "Tarea asignada a ${names[0]}"
                        else -> "Tarea creada"
                    },
                )
                onSaved(saved)
            } catch (e: Exception) {
                haptics.reject()
                error = e.userMessage()
            } finally {
                saving = false
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
            Text(if (editing) "Editar tarea" else "Nueva tarea", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = title,
                onValueChange = { title = it; error = null },
                label = { Text("Título") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = detail,
                onValueChange = { detail = it },
                label = { Text("Detalle (opcional)") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = module,
                onValueChange = { module = it },
                label = { Text("Área o módulo (opcional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            FieldRow(
                label = "Evento",
                value = eventName ?: "Sin evento",
                enabled = !editing && presetEventId == null,
                onClick = { pickEvent = true },
            )

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Responsables", style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    assigneeIds.forEachIndexed { index, id ->
                        InputChip(
                            selected = index == 0,
                            onClick = { assigneeIds.remove(id) },
                            label = { Text(if (index == 0 && assigneeIds.size > 1) "${nameOf(id)} · principal" else nameOf(id)) },
                            trailingIcon = { Icon(Icons.Default.Close, contentDescription = "Quitar", modifier = Modifier.size(16.dp)) },
                        )
                    }
                    OutlinedButton(onClick = { pickPeople = true }) {
                        Icon(Icons.Default.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (assigneeIds.isEmpty()) "Asignar personas" else "Agregar")
                    }
                }
                if (assigneeIds.isEmpty()) {
                    Text("Sin asignar: queda en la lista de quien la pidió.", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Vence", style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
                    Text(due?.let { dueLabel(it.toString()) } ?: "Sin fecha")
                }
                if (due != null) TextButton(onClick = { due = null }) { Text("Quitar") }
                OutlinedButton(onClick = { pickDate = true }) {
                    Icon(Icons.Default.Event, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (due == null) "Elegir fecha" else "Cambiar")
                }
            }

            error?.let { Text(it, color = ArtaColors.Danger) }

            Button(onClick = { save() }, enabled = !saving, modifier = Modifier.fillMaxWidth()) {
                if (saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArtaColors.Bg)
                else Text(if (editing) "Guardar cambios" else "Crear tarea")
            }
            Spacer(Modifier.size(8.dp))
        }
    }

    if (pickPeople) {
        PeoplePickerDialog(
            people = people,
            selected = assigneeIds.toList(),
            onDismiss = { pickPeople = false },
            onDone = { ids ->
                assigneeIds.clear()
                assigneeIds.addAll(ids)
                pickPeople = false
            },
        )
    }

    if (pickEvent) {
        EventPickerDialog(
            events = events,
            onDismiss = { pickEvent = false },
            onPick = { ev ->
                eventId = ev?.id
                eventName = ev?.name
                pickEvent = false
            },
        )
    }

    if (pickDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = (due ?: LocalDate.now()).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { due = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    pickDate = false
                }) { Text("Listo") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Cancelar") } },
        ) {
            DatePicker(state = state)
        }
    }
}

@Composable
private fun FieldRow(label: String, value: String, enabled: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 4.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
        Text(value, color = if (enabled) ArtaColors.Gold else ArtaColors.Text)
    }
}

/** Selección múltiple conservando el orden en que se marcan (el primero es el principal). */
@Composable
private fun PeoplePickerDialog(
    people: List<DirUserDto>,
    selected: List<String>,
    onDismiss: () -> Unit,
    onDone: (List<String>) -> Unit,
) {
    val picked = remember { mutableStateListOf<String>().apply { addAll(selected) } }
    var q by remember { mutableStateOf("") }
    val visible = remember(q, people) {
        val n = q.trim().lowercase()
        if (n.isEmpty()) people else people.filter { it.fullName.lowercase().contains(n) || it.title.orEmpty().lowercase().contains(n) }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Responsables") },
        text = {
            Column {
                OutlinedTextField(
                    value = q,
                    onValueChange = { q = it },
                    placeholder = { Text("Buscar persona") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (people.isEmpty()) {
                    Text("Cargando equipo…", color = ArtaColors.Muted, modifier = Modifier.padding(top = 12.dp))
                }
                LazyColumn(Modifier.heightIn(max = 360.dp).padding(top = 8.dp)) {
                    items(visible, key = { it.id }) { p ->
                        val index = picked.indexOf(p.id)
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { if (index >= 0) picked.remove(p.id) else picked.add(p.id) }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(checked = index >= 0, onCheckedChange = { if (it) picked.add(p.id) else picked.remove(p.id) })
                            Column(Modifier.weight(1f)) {
                                Text(p.fullName)
                                p.title?.takeIf { it.isNotBlank() }?.let {
                                    Text(it, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
                                }
                            }
                            if (index == 0) Pill("Principal", ArtaColors.Gold)
                        }
                    }
                }
            }
        },
        confirmButton = { Button(onClick = { onDone(picked.toList()) }) { Text("Listo (${picked.size})") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        containerColor = ArtaColors.BgElev,
    )
}

@Composable
private fun EventPickerDialog(
    events: List<EventSummaryDto>,
    onDismiss: () -> Unit,
    onPick: (EventSummaryDto?) -> Unit,
) {
    var q by remember { mutableStateOf("") }
    val visible = remember(q, events) {
        val n = q.trim().lowercase()
        if (n.isEmpty()) events else events.filter { it.name.lowercase().contains(n) || it.artist.orEmpty().lowercase().contains(n) }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Evento") },
        text = {
            Column {
                OutlinedTextField(
                    value = q,
                    onValueChange = { q = it },
                    placeholder = { Text("Buscar evento") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                LazyColumn(Modifier.heightIn(max = 360.dp).padding(top = 8.dp)) {
                    item {
                        Text(
                            "Sin evento (apoyo entre personas)",
                            color = ArtaColors.Gold,
                            modifier = Modifier.fillMaxWidth().clickable { onPick(null) }.padding(vertical = 12.dp),
                        )
                        HorizontalDivider(color = ArtaColors.Line)
                    }
                    items(visible, key = { it.id }) { ev ->
                        Column(Modifier.fillMaxWidth().clickable { onPick(ev) }.padding(vertical = 10.dp)) {
                            Text(ev.name)
                            Text(eventWhenLabel(ev.startsAt, ev.endsAt), style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        containerColor = ArtaColors.BgElev,
    )
}
