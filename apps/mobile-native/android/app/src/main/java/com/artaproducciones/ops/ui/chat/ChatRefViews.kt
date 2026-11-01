package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.ChatRefs
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChannelMember
import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.data.api.ChatRefDto
import com.artaproducciones.ops.data.api.RefBacklink
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.plainText
import com.artaproducciones.ops.ui.modules.BusyLabel
import com.artaproducciones.ops.ui.modules.Pill
import com.artaproducciones.ops.ui.modules.ProgressLine
import com.artaproducciones.ops.ui.modules.SectionTitle
import com.artaproducciones.ops.ui.modules.dueLabel
import com.artaproducciones.ops.ui.modules.firstName
import com.artaproducciones.ops.ui.modules.rememberHaptics
import com.artaproducciones.ops.ui.modules.stampLabel
import com.artaproducciones.ops.ui.theme.ArtaCard
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.ArtaType
import com.artaproducciones.ops.ui.theme.Button
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.OutlinedButton
import com.artaproducciones.ops.ui.theme.StatusPill
import com.artaproducciones.ops.ui.theme.TABULAR
import com.artaproducciones.ops.ui.theme.TextButton
import com.artaproducciones.ops.ui.theme.Tone
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private const val SEARCH_MEMBERS_FROM = 8
private const val TITLE_MAX_FROM_MESSAGE = 160
private const val FACES_SHOWN = 3

/** El mismo ícono en el chip, la tarjeta y el selector. */
fun refIcon(kind: String): ImageVector = when (kind) {
    "task" -> Icons.Outlined.TaskAlt
    "event" -> Icons.Outlined.Event
    "po" -> Icons.AutoMirrored.Outlined.ReceiptLong
    "format" -> Icons.AutoMirrored.Outlined.Assignment
    "doc" -> Icons.Outlined.Description
    "advance" -> Icons.Outlined.Payments
    else -> Icons.Outlined.Link
}

private fun actionLabel(action: String): String? = when (action) {
    ChatRefs.ACTION_DELIVER -> "Entregar"
    ChatRefs.ACTION_COMPLETE -> "Marcar hecha"
    ChatRefs.ACTION_APPROVE -> "Aprobar"
    else -> null
}

/** Relleno = te toca actuar; contorno = solo informa. El rojo, solo si de verdad venció. */
private fun pillTone(tone: String?): Tone = when (tone) {
    ChatRefs.TONE_ACTION -> Tone.Action
    ChatRefs.TONE_LATE -> Tone.Danger
    ChatRefs.TONE_DONE -> Tone.Ok
    else -> Tone.Info
}

/** Debajo del mensaje: hasta tres tarjetas y lo demás con «Ver N más». Sin acceso no hay tarjeta, solo el chip. */
@Composable
fun RefCards(
    refs: List<ChatRefDto>,
    busyKey: String?,
    onOpen: (ChatRefDto) -> Unit,
    onAction: (ChatRefDto, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cards = remember(refs) { ChatRefs.cards(refs) }
    if (cards.isEmpty()) return
    var all by remember { mutableStateOf(false) }
    val shown = if (all) cards else cards.take(ChatRefs.CARDS_SHOWN)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        shown.forEach { r ->
            key(r.key) { RefCard(r, busy = busyKey == r.key, enabled = busyKey == null, onOpen = { onOpen(r) }, onAction = { onAction(r, it) }) }
        }
        if (cards.size > shown.size) {
            TextButton(onClick = { all = true }) { Text("Ver ${cards.size - shown.size} más") }
        }
    }
}

/** Tarjeta en vivo: qué es, cómo va y lo que te toca hacer ahí mismo. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RefCard(r: ChatRefDto, busy: Boolean, enabled: Boolean, onOpen: () -> Unit, onAction: (String) -> Unit) {
    val hasLink = !r.href.isNullOrBlank()
    ArtaCard(
        onClick = if (hasLink) onOpen else null,
        onClickLabel = "Abrir",
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(refIcon(r.kind), contentDescription = null, tint = ArtaColors.Muted, modifier = Modifier.padding(top = 1.dp).size(18.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    r.title?.takeIf { it.isNotBlank() } ?: r.label,
                    style = ArtaType.PanelTitle,
                    color = ArtaColors.Text,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val status = r.statusLabel?.takeIf { it.isNotBlank() }
                val amount = r.amount?.takeIf { it.isNotBlank() }
                if (status != null || amount != null) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        status?.let { StatusPill(it, pillTone(r.tone), Modifier.align(Alignment.CenterVertically)) }
                        amount?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = TABULAR),
                                color = ArtaColors.Text,
                                modifier = Modifier.align(Alignment.CenterVertically),
                            )
                        }
                    }
                }
                r.subtitle?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            r.people?.takeIf { it.isNotEmpty() }?.let { people ->
                Spacer(Modifier.width(8.dp))
                RefFaces(people.map { it.fullName })
            }
        }
        r.progress?.let { ProgressLine((it / 100.0).toFloat()) }
        val actions = r.actions.orEmpty().filter { actionLabel(it) != null }
        if (actions.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                actions.forEachIndexed { i, action ->
                    val label = actionLabel(action).orEmpty()
                    // Un relleno por fila, y solo si te toca actuar.
                    if (i == 0 && r.tone == ChatRefs.TONE_ACTION) {
                        Button(onClick = { onAction(action) }, enabled = enabled) { BusyLabel(busy, label) }
                    } else {
                        OutlinedButton(onClick = { onAction(action) }, enabled = enabled) { BusyLabel(busy, label) }
                    }
                }
            }
        }
    }
}

/** Hasta tres caras encimadas y, si hay más, cuántas faltan. */
@Composable
private fun RefFaces(names: List<String>) {
    val t = LocalArtaTokens.current
    Row(horizontalArrangement = Arrangement.spacedBy((-6).dp), verticalAlignment = Alignment.CenterVertically) {
        names.take(FACES_SHOWN).forEach { name ->
            Avatar(name, size = 24.dp, modifier = Modifier.border(1.5.dp, t.surface, CircleShape))
        }
        if (names.size > FACES_SHOWN) {
            Box(Modifier.padding(start = 10.dp)) {
                Text("+${names.size - FACES_SHOWN}", style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR), color = ArtaColors.Muted)
            }
        }
    }
}

/** Fila del selector del `@`: ícono, nombre de hoy y cómo va. */
@Composable
fun RefSuggestionRow(r: ChatRefDto, onClick: () -> Unit) {
    val t = LocalArtaTokens.current
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Space.L, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(32.dp).clip(t.itemShape).background(t.fill), contentAlignment = Alignment.Center) {
            Icon(refIcon(r.kind), contentDescription = null, tint = ArtaColors.Muted, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(Space.M))
        Column(Modifier.weight(1f)) {
            Text(r.title?.takeIf { it.isNotBlank() } ?: r.label, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val detail = listOfNotNull(r.statusLabel, r.amount, r.subtitle).filter { it.isNotBlank() }.joinToString(" · ")
            if (detail.isNotBlank()) {
                Text(detail, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** «Entregar» de la tarjeta: la nota basta; para adjuntar evidencia, se abre la tarea. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefDeliverSheet(
    ref: ChatRefDto,
    onDismiss: () -> Unit,
    onOpenTask: () -> Unit,
    onSend: suspend (String) -> Result<String>,
    onSent: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var note by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun send() {
        if (note.isBlank()) {
            error = "Escribe una nota de lo que hiciste"
            haptics.reject()
            return
        }
        sending = true
        error = null
        scope.launch {
            onSend(note.trim())
                .onSuccess {
                    haptics.confirm()
                    onSent(it)
                }
                .onFailure {
                    haptics.reject()
                    error = it.userMessage()
                }
            sending = false
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
            Text(ref.title?.takeIf { it.isNotBlank() } ?: ref.label, color = ArtaColors.Muted)
            OutlinedTextField(
                value = note,
                onValueChange = { note = it; error = null },
                label = { Text("¿Qué hiciste?") },
                placeholder = { Text("Lo realizado, referencias, números, contactos…") },
                minLines = 4,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let { Text(it, color = ArtaColors.Danger) }
            Button(onClick = { send() }, enabled = !sending, modifier = Modifier.fillMaxWidth()) { BusyLabel(sending, "Enviar entrega") }
            if (!ref.href.isNullOrBlank()) {
                TextButton(onClick = onOpenTask, enabled = !sending, modifier = Modifier.fillMaxWidth()) { Text("Abrir la tarea para adjuntar archivos") }
            }
            Spacer(Modifier.size(8.dp))
        }
    }
}

/**
 * «Crear tarea» desde un mensaje: el texto ya es el título; basta decir de quién y para cuándo.
 * Los responsables salen de la conversación, el primero que se marca es el principal.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatTaskSheet(
    message: ChatMessage,
    members: List<ChannelMember>,
    myId: String,
    onDismiss: () -> Unit,
    onCreate: suspend (title: String, assigneeIds: List<String>, due: LocalDate?) -> Result<Unit>,
    onCreated: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var title by remember { mutableStateOf(plainText(message.body).replace(Regex("\\s+"), " ").trim().take(TITLE_MAX_FROM_MESSAGE)) }
    val assignees = remember { mutableStateListOf<String>() }
    var due by remember { mutableStateOf<LocalDate?>(null) }
    var pickDate by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val visible = remember(query, members) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) members else members.filter { it.fullName.lowercase().contains(q) }
    }

    fun toggle(id: String) {
        if (id in assignees) assignees.remove(id) else assignees.add(id)
    }

    fun save() {
        if (title.isBlank()) {
            error = "La tarea necesita un título"
            haptics.reject()
            return
        }
        saving = true
        error = null
        scope.launch {
            onCreate(title.trim(), assignees.toList(), due)
                .onSuccess {
                    haptics.confirm()
                    onCreated()
                }
                .onFailure {
                    haptics.reject()
                    error = it.userMessage()
                }
            saving = false
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = ArtaColors.BgElev) {
        LazyColumn(
            Modifier.fillMaxWidth().imePadding().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item { Text("Crear tarea", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it; error = null },
                    label = { Text("Qué hay que hacer") },
                    minLines = 2,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("VENCE", style = ArtaType.Cap, color = ArtaColors.Tertiary)
                        Text(due?.let { dueLabel(it.toString()) } ?: "Sin fecha")
                    }
                    if (due != null) TextButton(onClick = { due = null }) { Text("Quitar") }
                    OutlinedButton(onClick = { pickDate = true }) { Text(if (due == null) "Elegir fecha" else "Cambiar") }
                }
            }
            item {
                Text("RESPONSABLES", style = ArtaType.Cap, color = ArtaColors.Tertiary, modifier = Modifier.padding(top = 4.dp))
                if (assignees.isEmpty()) {
                    Text("Sin asignar: queda en la lista de quien la pidió.", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted)
                }
            }
            if (members.size > SEARCH_MEMBERS_FROM) {
                item {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("Buscar persona") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            items(visible, key = { it.id }) { m ->
                val index = assignees.indexOf(m.id)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Checkbox) { toggle(m.id) }
                        .heightIn(min = 48.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = index >= 0, onCheckedChange = { toggle(m.id) })
                    Avatar(m.fullName, size = 28.dp)
                    Spacer(Modifier.width(10.dp))
                    Text(if (m.id == myId) "${m.fullName} (tú)" else m.fullName, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (index == 0 && assignees.size > 1) Pill("Principal", ArtaColors.Muted)
                }
            }
            error?.let { msg -> item { Text(msg, color = ArtaColors.Danger) } }
            item {
                // Apagado a propósito mientras falta el título, como en la tarea normal.
                Button(onClick = { save() }, enabled = !saving && title.isNotBlank(), modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                    BusyLabel(saving, "Crear tarea")
                }
                Spacer(Modifier.size(8.dp))
            }
        }
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

/** «Mencionado en el chat»: dónde se ha hablado de esto. No ocupa lugar si nadie lo ha mencionado. */
@Composable
fun RefBacklinksSection(kind: String, id: String, onOpen: (String) -> Unit) {
    val links by produceState(emptyList<RefBacklink>(), kind, id) {
        value = try {
            ApiClient.api.refBacklinks(kind, id).links.orEmpty()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // 404: sin permiso, o un API sin referencias. No es un error que enseñar.
            emptyList()
        }
    }
    if (links.isEmpty()) return
    Column(Modifier.fillMaxWidth()) {
        SectionTitle("Mencionado en el chat", count = links.size)
        links.forEach { l ->
            key(l.messageId) {
                val href = l.href?.takeIf { it.isNotBlank() }
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clickable(enabled = href != null, role = Role.Button) { href?.let(onOpen) }
                        .heightIn(min = 48.dp)
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        listOf(l.channelName, stampLabel(l.at)).filter { it.isNotBlank() }.joinToString(" · "),
                        style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR),
                        color = ArtaColors.Tertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val who = l.author?.fullName?.takeIf { it.isNotBlank() }?.let { firstName(it) + ": " }.orEmpty()
                    Text(who + plainText(l.excerpt.orEmpty()), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
