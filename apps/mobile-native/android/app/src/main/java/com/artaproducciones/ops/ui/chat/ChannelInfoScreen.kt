package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.PersonRemove
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChannelDetail
import com.artaproducciones.ops.data.api.ChannelMember
import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.data.api.Colleague
import com.artaproducciones.ops.data.api.DirectBody
import com.artaproducciones.ops.data.api.MembersBody
import com.artaproducciones.ops.data.api.MuteBody
import com.artaproducciones.ops.data.api.UpdateChannelBody
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.parseInstant
import com.artaproducciones.ops.ui.common.plainText
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Canales de toda la organización: no se salen, no se archivan, no se renombran. */
fun isDefaultChannel(slug: String?) = slug == "general" || slug == "anuncios"

private val UNTIL = DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.forLanguageTag("es-MX"))

fun muteStatus(muted: Boolean, mutedUntil: String?): String {
    if (!muted) return "Notificaciones activas"
    val until = parseInstant(mutedUntil) ?: return "Silenciado"
    return if (Duration.between(Instant.now(), until).toDays() > 365) "Silenciado siempre"
    else "Silenciado hasta " + UNTIL.format(until.atZone(ZoneId.systemDefault()))
}

private enum class EditField(val label: String, val max: Int) { NAME("Nombre", 80), TOPIC("Tema", 250), DESCRIPTION("Descripción", 1000) }

private sealed interface Confirm {
    data object Leave : Confirm
    data object Archive : Confirm
    data class Remove(val member: ChannelMember) : Confirm
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChannelInfoScreen(
    channelId: String,
    onBack: () -> Unit,
    openChat: (String) -> Unit,
    openMessage: (channelId: String, messageId: String) -> Unit,
    onLeft: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val me = Session.currentUser?.id
    LaunchedEffect(Unit) { ChatPresence.ensureStarted() }
    val online by ChatPresence.online.collectAsState()

    var detail by remember { mutableStateOf<ChannelDetail?>(null) }
    var pins by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var saved by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<EditField?>(null) }
    var confirm by remember { mutableStateOf<Confirm?>(null) }
    var muteMenu by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }

    LaunchedEffect(reload) {
        try {
            detail = ApiClient.api.channel(channelId)
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage()
            return@LaunchedEffect
        }
        pins = runCatching { ApiClient.api.pins(channelId).messages }.getOrDefault(pins)
        saved = runCatching { ApiClient.api.saved(limit = 100).items.map { it.message }.filter { it.channelId == channelId } }.getOrDefault(saved)
    }

    fun run(success: String? = null, block: suspend () -> Unit) {
        busy = true
        scope.launch {
            try {
                block()
                success?.let { snackbar.showSnackbar(it) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                snackbar.showSnackbar(e.userMessage())
            } finally {
                busy = false
            }
        }
    }

    val d = detail
    Scaffold(
        containerColor = ArtaColors.Bg,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ArtaColors.BgElev),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Atrás") } },
                title = { Text("Información", fontWeight = FontWeight.SemiBold) },
                actions = {
                    if (busy) CircularProgressIndicator(Modifier.padding(end = Space.L).size(20.dp), strokeWidth = 2.dp, color = ArtaColors.Gold)
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                d == null && error != null -> ErrorState(error, onRetry = { reload++ })
                d == null -> ListSkeleton(8)
                else -> {
                    val direct = d.kind == "DIRECT"
                    val default = isDefaultChannel(d.slug)
                    val canEdit = d.canPost && !direct
                    val canInvite = canEdit && !default
                    val title = when {
                        direct -> d.peer?.fullName ?: d.name
                        d.isGroupDm -> d.name
                        else -> "#${d.name}"
                    }
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Space.XL)) {
                        item {
                            Column(
                                Modifier.fillMaxWidth().padding(vertical = Space.XL, horizontal = Space.L),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                ConversationAvatar(d.name, d.kind, d.isGroupDm, online = d.peer?.id in online, size = 72.dp)
                                Spacer(Modifier.height(Space.M))
                                Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                                Text(
                                    when {
                                        direct -> if (d.peer?.id in online) "En línea" else (d.peer?.title ?: "Mensaje directo")
                                        else -> kindLabel(d.kind, d.isGroupDm) + " · ${d.memberCount.coerceAtLeast(d.members.size)} miembros"
                                    },
                                    color = if (direct && d.peer?.id in online) OnlineGreen else ArtaColors.Muted,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                        if (!direct) {
                            item { SectionHeader("Acerca de") }
                            if (!d.isGroupDm && !default) {
                                item { InfoRow(Icons.Outlined.Edit, "Nombre", d.name, enabled = canEdit) { editing = EditField.NAME } }
                            }
                            item { InfoRow(null, "Tema", d.topic?.takeIf { it.isNotBlank() } ?: if (canEdit) "Agregar un tema" else "Sin tema", enabled = canEdit) { editing = EditField.TOPIC } }
                            item {
                                InfoRow(null, "Descripción", d.description?.takeIf { it.isNotBlank() } ?: if (canEdit) "Agregar una descripción" else "Sin descripción", enabled = canEdit) {
                                    editing = EditField.DESCRIPTION
                                }
                            }
                        }
                        item { SectionHeader("Notificaciones") }
                        item {
                            InfoRow(
                                if (d.muted) Icons.Outlined.NotificationsOff else Icons.Outlined.NotificationsNone,
                                if (d.muted) "Silenciado" else "Silenciar",
                                muteStatus(d.muted, d.mutedUntil),
                            ) { muteMenu = true }
                        }
                        item { SectionHeader("Fijados · ${pins.size}") }
                        if (pins.isEmpty()) item { HintRow("Nada fijado. Mantén presionado un mensaje y elige «Fijar».") }
                        items(pins, key = { "pin-" + it.id }) { m ->
                            MessageLinkRow(Icons.Outlined.PushPin, m) { openMessage(channelId, m.parentId ?: m.id) }
                        }
                        item { SectionHeader("Tus guardados aquí · ${saved.size}") }
                        if (saved.isEmpty()) item { HintRow("No has guardado mensajes de esta conversación.") }
                        items(saved, key = { "saved-" + it.id }) { m ->
                            MessageLinkRow(Icons.Outlined.Bookmark, m) { openMessage(channelId, m.parentId ?: m.id) }
                        }
                        item { SectionHeader("Miembros · ${d.members.size}") }
                        if (canInvite) {
                            item { InfoRow(Icons.Outlined.PersonAdd, "Agregar personas", null) { adding = true } }
                        }
                        items(d.members, key = { "member-" + it.id }) { member ->
                            val isMe = member.id == me
                            MemberRow(
                                member = member,
                                isMe = isMe,
                                online = member.id in online,
                                canRemove = d.canManage && !isMe && !direct && !default,
                                onOpen = {
                                    if (!isMe) run { openChat(ApiClient.api.openDirect(DirectBody(member.id)).id) }
                                },
                                onRemove = { confirm = Confirm.Remove(member) },
                            )
                        }
                        if (!direct && !default) {
                            item { Spacer(Modifier.height(Space.L)) }
                            item { DangerRow(Icons.AutoMirrored.Outlined.Logout, if (d.isGroupDm) "Salir del grupo" else "Salir del canal") { confirm = Confirm.Leave } }
                            if (d.canManage && !d.isGroupDm) {
                                item { DangerRow(Icons.Outlined.Archive, "Archivar canal") { confirm = Confirm.Archive } }
                            }
                        }
                    }
                }
            }
        }
    }

    if (d != null) {
        editing?.let { field ->
            EditDialog(
                field = field,
                initial = when (field) {
                    EditField.NAME -> d.name
                    EditField.TOPIC -> d.topic.orEmpty()
                    EditField.DESCRIPTION -> d.description.orEmpty()
                },
                onDismiss = { editing = null },
                onSave = { value ->
                    editing = null
                    run("Cambios guardados") {
                        detail = ApiClient.api.updateChannel(
                            channelId,
                            when (field) {
                                EditField.NAME -> UpdateChannelBody(name = value)
                                EditField.TOPIC -> UpdateChannelBody(topic = value)
                                EditField.DESCRIPTION -> UpdateChannelBody(description = value)
                            },
                        )
                    }
                },
            )
        }

        if (muteMenu) {
            val options = listOf<Pair<String, MuteBody>>(
                "Por 8 horas" to MuteBody(true, 8),
                "Por 1 semana" to MuteBody(true, 24 * 7),
                "Siempre" to MuteBody(true, null),
            ) + if (d.muted) listOf("Reactivar notificaciones" to MuteBody(false)) else emptyList()
            AlertDialog(
                onDismissRequest = { muteMenu = false },
                title = { Text("Silenciar conversación") },
                text = {
                    Column {
                        options.forEach { (label, body) ->
                            Text(
                                label,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        muteMenu = false
                                        run(if (body.muted) "Conversación silenciada" else "Notificaciones activas") {
                                            ApiClient.api.mute(channelId, body)
                                            detail = ApiClient.api.channel(channelId)
                                        }
                                    }
                                    .padding(vertical = Space.M),
                                color = if (body.muted) ArtaColors.Text else ArtaColors.Gold,
                            )
                        }
                    }
                },
                confirmButton = { TextButton(onClick = { muteMenu = false }) { Text("Cancelar") } },
            )
        }

        confirm?.let { c ->
            val (heading, body, action) = when (c) {
                Confirm.Leave -> Triple(
                    if (d.isGroupDm) "¿Salir del grupo?" else "¿Salir de #${d.name}?",
                    if (d.kind == "PRIVATE" || d.isGroupDm) "Para volver, alguien tendrá que agregarte de nuevo." else "Puedes volver a unirte cuando quieras.",
                    "Salir",
                )
                Confirm.Archive -> Triple("¿Archivar #${d.name}?", "Nadie podrá escribir en él y desaparecerá de la lista de chats.", "Archivar")
                is Confirm.Remove -> Triple("¿Quitar a ${c.member.fullName}?", "Dejará de ver esta conversación.", "Quitar")
            }
            AlertDialog(
                onDismissRequest = { confirm = null },
                title = { Text(heading) },
                text = { Text(body) },
                confirmButton = {
                    TextButton(onClick = {
                        confirm = null
                        when (c) {
                            Confirm.Leave -> run { ApiClient.api.leaveChannel(channelId); onLeft() }
                            Confirm.Archive -> run { ApiClient.api.archiveChannel(channelId); onLeft() }
                            is Confirm.Remove -> run("${c.member.fullName} ya no es miembro") {
                                ApiClient.api.removeMember(channelId, c.member.id)
                                detail = ApiClient.api.channel(channelId)
                            }
                        }
                    }) { Text(action, color = ArtaColors.Danger) }
                },
                dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancelar") } },
            )
        }

        if (adding) {
            AddMembersSheet(
                exclude = d.members.map { it.id }.toSet(),
                max = if (d.isGroupDm) (GROUP_DM_MAX + 1 - d.members.size).coerceAtLeast(0) else null,
                onDismiss = { adding = false },
                onAdd = { ids ->
                    adding = false
                    run(if (ids.size == 1) "Persona agregada" else "${ids.size} personas agregadas") {
                        detail = ApiClient.api.addMembers(channelId, MembersBody(ids))
                    }
                },
            )
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text.uppercase(),
        color = ArtaColors.Muted,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = Space.L, end = Space.L, top = Space.XL, bottom = Space.S),
    )
}

@Composable
private fun HintRow(text: String) {
    Text(text, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = Space.L, vertical = Space.XS))
}

@Composable
private fun InfoRow(icon: ImageVector?, label: String, value: String?, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).padding(horizontal = Space.L, vertical = Space.M),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = ArtaColors.Gold, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(Space.L))
        }
        Column(Modifier.weight(1f)) {
            Text(label, fontWeight = FontWeight.Medium)
            value?.let { Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium, maxLines = 4, overflow = TextOverflow.Ellipsis) }
        }
    }
}

@Composable
private fun MessageLinkRow(icon: ImageVector, m: ChatMessage, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Space.L, vertical = Space.S),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(icon, null, tint = ArtaColors.Muted, modifier = Modifier.padding(top = 2.dp).size(18.dp))
        Spacer(Modifier.width(Space.M))
        Column(Modifier.weight(1f)) {
            Text(m.author.fullName, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
            Text(
                if (m.body.isNotBlank()) plainText(m.body) else "📎 " + (m.attachment?.name ?: "Adjunto"),
                color = ArtaColors.Muted,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun MemberRow(member: ChannelMember, isMe: Boolean, online: Boolean, canRemove: Boolean, onOpen: () -> Unit, onRemove: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = !isMe, onClick = onOpen).padding(start = Space.L, end = Space.XS, top = Space.S, bottom = Space.S),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PresenceAvatar(member.fullName, size = 40.dp, online = online)
        Spacer(Modifier.width(Space.M))
        Column(Modifier.weight(1f)) {
            Text(member.fullName + if (isMe) " (tú)" else "", fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val sub = listOfNotNull(
                "Administra".takeIf { member.role == "owner" || member.role == "admin" },
                member.title?.takeIf { it.isNotBlank() },
            ).joinToString(" · ")
            if (sub.isNotEmpty()) Text(sub, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (canRemove) IconButton(onClick = onRemove) { Icon(Icons.Outlined.PersonRemove, "Quitar del canal", tint = ArtaColors.Muted) }
    }
}

@Composable
private fun DangerRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp)
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Space.L, vertical = Space.L),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = ArtaColors.Danger, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(Space.L))
        Text(label, color = ArtaColors.Danger, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun EditDialog(field: EditField, initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var value by remember { mutableStateOf(initial) }
    val valid = field != EditField.NAME || value.trim().removePrefix("#").length >= 2
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Editar " + field.label.lowercase()) },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = { value = it.take(field.max) },
                singleLine = field == EditField.NAME,
                minLines = if (field == EditField.DESCRIPTION) 3 else 1,
                supportingText = { Text("${value.length}/${field.max}") },
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = ArtaColors.Gold, cursorColor = ArtaColors.Gold),
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(value.trim()) }, enabled = valid && value.trim() != initial.trim()) { Text("Guardar", color = ArtaColors.Gold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddMembersSheet(exclude: Set<String>, max: Int?, onDismiss: () -> Unit, onAdd: (List<String>) -> Unit) {
    val selected = remember { mutableStateMapOf<String, Colleague>() }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = ArtaColors.BgElev,
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.9f)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = Space.L), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Agregar personas", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                TextButton(onClick = { onAdd(selected.keys.toList()) }, enabled = selected.isNotEmpty()) {
                    Text(if (selected.isEmpty()) "Agregar" else "Agregar (${selected.size})", color = if (selected.isEmpty()) Color.Unspecified else ArtaColors.Gold)
                }
            }
            if (max == 0) {
                HintRow("El grupo ya está completo. Crea un canal privado para sumar más personas.")
            } else {
                PeoplePicker(selected = selected, max = max, exclude = exclude, modifier = Modifier.weight(1f))
            }
        }
    }
}
