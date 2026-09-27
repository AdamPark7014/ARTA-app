package com.artaproducciones.ops.ui.chat

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Done
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil.compose.AsyncImage
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChannelMember
import com.artaproducciones.ops.data.api.ChatAttachment
import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.dayKey
import com.artaproducciones.ops.ui.common.dayLabel
import com.artaproducciones.ops.ui.common.fileSize
import com.artaproducciones.ops.ui.common.mentionText
import com.artaproducciones.ops.ui.common.mentionToken
import com.artaproducciones.ops.ui.common.messageTime
import com.artaproducciones.ops.ui.common.parseInstant
import com.artaproducciones.ops.ui.common.plainText
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.io.File
import java.time.Instant

private val QUICK_REACTIONS = listOf("👍", "❤️", "😂", "😮", "🙏", "✅")
private const val GROUP_WINDOW_MS = 5 * 60 * 1000L

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationScreen(
    channelId: String,
    parentId: String?,
    focusMessageId: String?,
    onBack: () -> Unit,
    openThread: (String) -> Unit,
    openChat: (String) -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as Application
    val vm: ConversationViewModel = viewModel(
        key = "conv:$channelId:${parentId.orEmpty()}",
        factory = viewModelFactory { initializer { ConversationViewModel(app, channelId, parentId, focusMessageId) } },
    )
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    var draft by remember { mutableStateOf(TextFieldValue("")) }
    val mentions = remember { mutableStateMapOf<String, String>() }
    var editing by remember { mutableStateOf<ChatMessage?>(null) }
    var actionsFor by remember { mutableStateOf<ChatMessage?>(null) }
    var viewer by remember { mutableStateOf<ChatAttachment?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var pinsOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf<ChatMessage?>(null) }

    // Visible = pantalla al frente: marca leído y calla los pushes de esta conversación.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_RESUME -> vm.onVisible(true)
                Lifecycle.Event.ON_PAUSE -> vm.onVisible(false)
                else -> Unit
            }
        }
        lifecycle.addObserver(obs)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) vm.onVisible(true)
        onDispose {
            lifecycle.removeObserver(obs)
            vm.onVisible(false)
        }
    }

    LaunchedEffect(state.error) {
        state.error?.let {
            snackbar.showSnackbar(it)
            vm.clearError()
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            vm.sendFile(uri, resolveMentions(draft.text, mentions))
            draft = TextFieldValue("")
            mentions.clear()
        }
    }

    // Lista invertida: índice 0 = mensaje más nuevo, así el teclado y lo nuevo quedan abajo.
    val rows = remember(state.messages) { buildRows(state.messages, parentId) }
    val newestId = state.messages.lastOrNull()?.id
    LaunchedEffect(newestId) {
        if (listState.firstVisibleItemIndex <= 2) listState.animateScrollToItem(0)
    }
    LaunchedEffect(state.focusMessageId, rows.size) {
        val focus = state.focusMessageId ?: return@LaunchedEffect
        val idx = rows.indexOfFirst { it is Row.Message && it.message.id == focus }
        if (idx >= 0) {
            listState.scrollToItem(idx)
            vm.clearFocus()
        }
    }
    val nearTop = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= rows.size - 5 } == true
    LaunchedEffect(nearTop, rows.size) { if (nearTop && rows.isNotEmpty()) vm.loadOlder() }

    val channel = state.channel
    val isDirect = channel?.kind == "DIRECT"
    val title = when {
        parentId != null -> "Hilo"
        channel == null -> ""
        isDirect -> channel.name
        else -> "#${channel.name}"
    }
    val subtitle = when {
        state.typing.isNotEmpty() -> typingText(state.typing)
        parentId != null && channel != null -> if (isDirect) channel.name else "#${channel.name}"
        channel?.muted == true -> "Silenciado"
        isDirect -> channel?.peer?.title.orEmpty()
        channel != null -> channel.topic?.takeIf { it.isNotBlank() } ?: "${channel.memberCount} miembros"
        else -> ""
    }

    Scaffold(
        containerColor = ArtaColors.Bg,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ArtaColors.BgElev),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Atrás") } },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (channel != null && parentId == null) {
                            Avatar(channel.name, size = 36.dp, channel = !isDirect)
                            Spacer(Modifier.width(10.dp))
                        }
                        Column {
                            Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
                            if (subtitle.isNotBlank()) {
                                Text(
                                    subtitle,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (state.typing.isNotEmpty()) ArtaColors.Gold else ArtaColors.Muted,
                                )
                            }
                        }
                    }
                },
                actions = {
                    if (parentId == null && channel != null) {
                        IconButton(onClick = { menuOpen = true }) { Icon(Icons.Outlined.MoreVert, "Opciones") }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(text = { Text("Mensajes fijados") }, onClick = { menuOpen = false; pinsOpen = true })
                            if (channel.muted) {
                                DropdownMenuItem(text = { Text("Quitar silencio") }, onClick = { menuOpen = false; vm.mute(false, null) })
                            } else {
                                DropdownMenuItem(text = { Text("Silenciar 8 horas") }, onClick = { menuOpen = false; vm.mute(true, 8) })
                                DropdownMenuItem(text = { Text("Silenciar 1 semana") }, onClick = { menuOpen = false; vm.mute(true, 24 * 7) })
                                DropdownMenuItem(text = { Text("Silenciar siempre") }, onClick = { menuOpen = false; vm.mute(true, null) })
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            Box(Modifier.weight(1f)) {
                if (state.loading) {
                    CircularProgressIndicator(Modifier.align(Alignment.Center), color = ArtaColors.Gold)
                }
                LazyColumn(
                    state = listState,
                    reverseLayout = true,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
                ) {
                    items(rows, key = { it.key }) { row ->
                        when (row) {
                            is Row.Day -> DaySeparator(row.label)
                            is Row.ThreadHeader -> ThreadHeader(row.count)
                            is Row.Message -> MessageBubble(
                                m = row.message,
                                mine = row.message.author.id == vm.myId,
                                showAuthor = row.showAuthor && !isDirect,
                                readByAll = row.message.author.id == vm.myId && vm.readByAll(row.message),
                                myId = vm.myId,
                                inThread = parentId != null,
                                onLongPress = { actionsFor = row.message },
                                onReact = { emoji -> vm.react(row.message, emoji) },
                                onOpenThread = { openThread(row.message.id) },
                                onOpenAttachment = { a ->
                                    if (a.isImage) viewer = a else scope.launch { openFile(context, a) }
                                },
                                onRetry = { vm.retry(row.message) },
                                onDiscard = { vm.discard(row.message) },
                            )
                        }
                    }
                    if (state.loadingOlder) {
                        item(key = "older") {
                            Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(Modifier.size(22.dp), color = ArtaColors.Gold, strokeWidth = 2.dp)
                            }
                        }
                    }
                }
            }

            if (channel != null && !channel.canPost && parentId == null) {
                Text(
                    "Solo dirección publica en este canal.",
                    color = ArtaColors.Muted,
                    modifier = Modifier.fillMaxWidth().background(ArtaColors.BgElev).padding(16.dp).navigationBarsPadding(),
                )
            } else {
                MentionSuggestions(
                    draft = draft,
                    members = channel?.members.orEmpty().filter { it.id != vm.myId },
                    onPick = { member ->
                        val (value, name) = insertMention(draft, member)
                        mentions[name] = member.id
                        draft = value
                    },
                )
                editing?.let { e ->
                    Row(
                        Modifier.fillMaxWidth().background(ArtaColors.Surface2).padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Editando mensaje", color = ArtaColors.Gold, style = MaterialTheme.typography.labelMedium)
                            Text(plainText(e.body), maxLines = 1, overflow = TextOverflow.Ellipsis, color = ArtaColors.Muted)
                        }
                        IconButton(onClick = { editing = null; draft = TextFieldValue("") }) { Icon(Icons.Outlined.Close, "Cancelar") }
                    }
                }
                Composer(
                    value = draft,
                    uploading = state.uploading,
                    placeholder = if (parentId != null) "Responder en el hilo" else "Mensaje",
                    onChange = {
                        draft = it
                        if (it.text.isNotBlank()) vm.onTyping()
                    },
                    onAttach = { picker.launch(arrayOf("image/*", "application/pdf")) },
                    onSend = {
                        val body = resolveMentions(draft.text, mentions)
                        val e = editing
                        if (e != null) vm.edit(e, body) else vm.send(body)
                        editing = null
                        draft = TextFieldValue("")
                        mentions.clear()
                    },
                    canAttach = editing == null,
                )
            }
        }
    }

    actionsFor?.let { m ->
        MessageActions(
            m = m,
            mine = m.author.id == vm.myId,
            canManage = channel?.canManage == true,
            inThread = parentId != null,
            onDismiss = { actionsFor = null },
            onReact = { vm.react(m, it) },
            onThread = { openThread(m.id) },
            onCopy = {
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("mensaje", plainText(m.body)))
                Toast.makeText(context, "Copiado", Toast.LENGTH_SHORT).show()
            },
            onPin = { vm.togglePin(m) },
            onEdit = {
                editing = m
                mentions.clear()
                draft = TextFieldValue(plainTextKeepingMentions(m.body, mentions))
            },
            onDelete = { confirmDelete = m },
        )
    }

    confirmDelete?.let { m ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("¿Eliminar mensaje?") },
            text = { Text("Se quitará para todos en la conversación.") },
            confirmButton = { TextButton(onClick = { vm.delete(m); confirmDelete = null }) { Text("Eliminar", color = ArtaColors.Danger) } },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancelar") } },
        )
    }

    if (pinsOpen) PinsSheet(vm = vm, onDismiss = { pinsOpen = false })

    viewer?.let { a ->
        Dialog(onDismissRequest = { viewer = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Box(Modifier.fillMaxSize().background(Color.Black).clickable { viewer = null }) {
                AsyncImage(
                    model = ApiClient.resolveUrl(a.url),
                    contentDescription = a.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
                IconButton(onClick = { viewer = null }, modifier = Modifier.align(Alignment.TopEnd).padding(16.dp)) {
                    Icon(Icons.Outlined.Close, "Cerrar", tint = Color.White)
                }
            }
        }
    }
}

// ─── Filas de la lista ───────────────────────────────────────────────────────

private sealed interface Row {
    val key: String

    data class Message(val message: ChatMessage, val showAuthor: Boolean) : Row {
        override val key get() = "m:" + (message.clientId ?: message.id)
    }

    data class Day(val label: String, override val key: String) : Row
    data class ThreadHeader(val count: Int) : Row {
        override val key get() = "thread-header"
    }
}

/** Filas en orden inverso (lo más nuevo primero) con separadores de día y agrupación por autor. */
private fun buildRows(messages: List<ChatMessage>, parentId: String?): List<Row> {
    val out = ArrayList<Row>(messages.size + 8)
    var prev: ChatMessage? = null
    var prevDay: java.time.LocalDate? = null
    messages.forEachIndexed { i, m ->
        val day = dayKey(m.createdAt)
        if (day != null && day != prevDay) {
            out.add(Row.Day(dayLabel(day), "d:$day"))
            prevDay = day
            prev = null
        }
        val p = prev
        val grouped = p != null && p.author.id == m.author.id && p.kind != "SYSTEM" &&
            (parseInstant(m.createdAt)?.toEpochMilli() ?: 0L) - (parseInstant(p.createdAt)?.toEpochMilli() ?: 0L) < GROUP_WINDOW_MS
        out.add(Row.Message(m, showAuthor = !grouped))
        if (parentId != null && i == 0) out.add(Row.ThreadHeader(messages.size - 1))
        prev = m
    }
    return out.asReversed()
}

@Composable
private fun DaySeparator(label: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
        Surface(color = ArtaColors.Surface2, shape = RoundedCornerShape(10.dp)) {
            Text(label, color = ArtaColors.Muted, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
        }
    }
}

@Composable
private fun ThreadHeader(count: Int) {
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(
            if (count == 1) "1 respuesta" else "$count respuestas",
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
        HorizontalDivider(color = ArtaColors.Line)
    }
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
private fun MessageBubble(
    m: ChatMessage,
    mine: Boolean,
    showAuthor: Boolean,
    readByAll: Boolean,
    myId: String,
    inThread: Boolean,
    onLongPress: () -> Unit,
    onReact: (String) -> Unit,
    onOpenThread: () -> Unit,
    onOpenAttachment: (ChatAttachment) -> Unit,
    onRetry: () -> Unit,
    onDiscard: () -> Unit,
) {
    if (m.kind == "SYSTEM") {
        Text(
            plainText(m.body),
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        return
    }
    Column(
        Modifier.fillMaxWidth().padding(top = if (showAuthor) 8.dp else 2.dp),
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
    ) {
        Row(verticalAlignment = Alignment.Top) {
            if (!mine) {
                if (showAuthor) Avatar(m.author.fullName, size = 32.dp) else Spacer(Modifier.width(32.dp))
                Spacer(Modifier.width(6.dp))
            }
            Surface(
                color = if (mine) ArtaColors.Mine else ArtaColors.BgElev,
                shape = RoundedCornerShape(
                    topStart = if (!mine && showAuthor) 4.dp else 16.dp,
                    topEnd = if (mine && showAuthor) 4.dp else 16.dp,
                    bottomStart = 16.dp,
                    bottomEnd = 16.dp,
                ),
                modifier = Modifier
                    .widthIn(max = 300.dp)
                    .combinedClickable(onClick = {}, onLongClick = { if (!m.pending && !m.failed) onLongPress() }),
            ) {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    if (showAuthor && !mine) {
                        Text(m.author.fullName, color = ArtaColors.Gold, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
                    }
                    if (m.pinnedAt != null) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.PushPin, null, tint = ArtaColors.Gold, modifier = Modifier.size(12.dp))
                            Text(" Fijado", color = ArtaColors.Gold, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    m.attachment?.let { a -> AttachmentView(a) { onOpenAttachment(a) } }
                    if (m.body.isNotBlank()) Text(mentionText(m.body), style = MaterialTheme.typography.bodyLarge)
                    Row(
                        Modifier.align(Alignment.End),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        if (m.editedAt != null) Text("editado", color = ArtaColors.Muted, style = MaterialTheme.typography.labelSmall)
                        Text(messageTime(m.createdAt), color = ArtaColors.Muted, style = MaterialTheme.typography.labelSmall)
                        if (mine) {
                            when {
                                m.failed -> Icon(Icons.Outlined.ErrorOutline, "No enviado", tint = ArtaColors.Danger, modifier = Modifier.size(14.dp))
                                m.pending -> Icon(Icons.Outlined.Schedule, "Enviando", tint = ArtaColors.Muted, modifier = Modifier.size(14.dp))
                                readByAll -> Icon(Icons.Outlined.DoneAll, "Leído", tint = ArtaColors.Read, modifier = Modifier.size(16.dp))
                                else -> Icon(Icons.Outlined.Done, "Enviado", tint = ArtaColors.Muted, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
        if (m.failed) {
            Row(Modifier.padding(top = 2.dp)) {
                TextButton(onClick = onRetry) { Text("Reintentar") }
                TextButton(onClick = onDiscard) { Text("Descartar", color = ArtaColors.Muted) }
            }
        }
        if (m.reactions.isNotEmpty()) {
            FlowRow(
                Modifier.padding(start = if (mine) 0.dp else 38.dp, top = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                m.reactions.forEach { r ->
                    val reacted = myId in r.userIds
                    Surface(
                        color = if (reacted) ArtaColors.GoldSoft else ArtaColors.Surface2,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.clickable { onReact(r.emoji) },
                    ) {
                        Text("${r.emoji} ${r.count}", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                    }
                }
            }
        }
        if (!inThread && m.replyCount > 0) {
            Text(
                if (m.replyCount == 1) "1 respuesta ›" else "${m.replyCount} respuestas ›",
                color = ArtaColors.Gold,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier
                    .padding(start = if (mine) 0.dp else 38.dp, top = 2.dp)
                    .clickable(onClick = onOpenThread)
                    .padding(4.dp),
            )
        }
    }
}

@Composable
private fun AttachmentView(a: ChatAttachment, onClick: () -> Unit) {
    if (a.isImage) {
        AsyncImage(
            model = ApiClient.resolveUrl(a.url),
            contentDescription = a.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .padding(vertical = 4.dp)
                .widthIn(max = 260.dp)
                .heightIn(min = 120.dp, max = 260.dp)
                .background(ArtaColors.Surface2, RoundedCornerShape(10.dp))
                .clickable(onClick = onClick),
        )
    } else {
        Row(
            Modifier
                .padding(vertical = 4.dp)
                .background(ArtaColors.Surface2, RoundedCornerShape(10.dp))
                .clickable(onClick = onClick)
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Description, null, tint = ArtaColors.Gold)
            Spacer(Modifier.width(8.dp))
            Column {
                Text(a.name ?: "Archivo", maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium)
                Text(fileSize(a.size), color = ArtaColors.Muted, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun Composer(
    value: TextFieldValue,
    uploading: Boolean,
    placeholder: String,
    canAttach: Boolean,
    onChange: (TextFieldValue) -> Unit,
    onAttach: () -> Unit,
    onSend: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().background(ArtaColors.BgElev).padding(horizontal = 6.dp, vertical = 6.dp).navigationBarsPadding(),
        verticalAlignment = Alignment.Bottom,
    ) {
        if (canAttach) {
            IconButton(onClick = onAttach, enabled = !uploading) {
                if (uploading) CircularProgressIndicator(Modifier.size(20.dp), color = ArtaColors.Gold, strokeWidth = 2.dp)
                else Icon(Icons.Outlined.AttachFile, "Adjuntar foto o PDF", tint = ArtaColors.Muted)
            }
        }
        TextField(
            value = value,
            onValueChange = onChange,
            placeholder = { Text(placeholder) },
            maxLines = 6,
            shape = RoundedCornerShape(22.dp),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = ArtaColors.Surface2,
                unfocusedContainerColor = ArtaColors.Surface2,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(6.dp))
        IconButton(
            onClick = onSend,
            enabled = value.text.isNotBlank(),
            modifier = Modifier.background(if (value.text.isNotBlank()) ArtaColors.Gold else ArtaColors.Surface2, CircleShape),
        ) { Icon(Icons.AutoMirrored.Filled.Send, "Enviar", tint = if (value.text.isNotBlank()) ArtaColors.Bg else ArtaColors.Muted) }
    }
}

// ─── Menciones ───────────────────────────────────────────────────────────────

/** Palabra que empieza con @ justo antes del cursor, o null. */
private fun mentionQuery(v: TextFieldValue): String? {
    val upto = v.text.substring(0, v.selection.start.coerceIn(0, v.text.length))
    val at = upto.lastIndexOf('@')
    if (at < 0) return null
    if (at > 0 && !upto[at - 1].isWhitespace()) return null
    val q = upto.substring(at + 1)
    return if (q.length <= 30 && q.none { it == '\n' } && q.count { it == ' ' } <= 1) q else null
}

@Composable
private fun MentionSuggestions(draft: TextFieldValue, members: List<ChannelMember>, onPick: (ChannelMember) -> Unit) {
    val q = mentionQuery(draft) ?: return
    val matches = members.filter { it.fullName.contains(q, ignoreCase = true) }.take(5)
    if (matches.isEmpty()) return
    Column(Modifier.fillMaxWidth().background(ArtaColors.Surface2)) {
        matches.forEach { m ->
            Row(
                Modifier.fillMaxWidth().clickable { onPick(m) }.padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(m.fullName, size = 28.dp)
                Spacer(Modifier.width(10.dp))
                Text(m.fullName)
            }
        }
    }
}

private fun insertMention(v: TextFieldValue, member: ChannelMember): Pair<TextFieldValue, String> {
    val cursor = v.selection.start.coerceIn(0, v.text.length)
    val at = v.text.substring(0, cursor).lastIndexOf('@')
    val name = member.fullName
    val text = v.text.substring(0, at) + "@$name " + v.text.substring(cursor)
    val pos = at + name.length + 2
    return TextFieldValue(text, androidx.compose.ui.text.TextRange(pos)) to name
}

/** «@Ana Ruiz» elegidos de la lista → tokens `[@Ana Ruiz](user:id)` que el API entiende. */
private fun resolveMentions(text: String, mentions: Map<String, String>): String {
    var out = text
    mentions.entries.sortedByDescending { it.key.length }.forEach { (name, id) ->
        out = out.replace("@$name", mentionToken(name, id))
    }
    return out
}

/** Al editar: tokens → «@Nombre» visibles, recordando a quién apuntan para volver a armarlos. */
private fun plainTextKeepingMentions(body: String, mentions: MutableMap<String, String>): String =
    Regex("""\[@([^\]]{1,80})]\(user:([\w-]{1,64})\)""").replace(body) {
        mentions[it.groupValues[1]] = it.groupValues[2]
        "@" + it.groupValues[1]
    }

private fun typingText(names: List<String>): String = when (names.size) {
    1 -> "${names[0].substringBefore(' ')} está escribiendo…"
    2 -> "${names[0].substringBefore(' ')} y ${names[1].substringBefore(' ')} están escribiendo…"
    else -> "Varias personas están escribiendo…"
}

// ─── Hojas y acciones ────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessageActions(
    m: ChatMessage,
    mine: Boolean,
    canManage: Boolean,
    inThread: Boolean,
    onDismiss: () -> Unit,
    onReact: (String) -> Unit,
    onThread: () -> Unit,
    onCopy: () -> Unit,
    onPin: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val editable = mine && m.attachment == null &&
        (parseInstant(m.createdAt)?.let { Instant.now().toEpochMilli() - it.toEpochMilli() < ConversationViewModel.EDIT_WINDOW_MS } == true)
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = ArtaColors.BgElev) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            QUICK_REACTIONS.forEach { e ->
                Text(
                    e,
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.clip(CircleShape).clickable { onReact(e); onDismiss() }.padding(8.dp),
                )
            }
        }
        HorizontalDivider(color = ArtaColors.Line)
        if (!inThread) SheetItem("Responder en hilo") { onThread(); onDismiss() }
        if (m.body.isNotBlank()) SheetItem("Copiar texto") { onCopy(); onDismiss() }
        SheetItem(if (m.pinnedAt != null) "Desfijar" else "Fijar en la conversación") { onPin(); onDismiss() }
        if (editable) SheetItem("Editar") { onEdit(); onDismiss() }
        if (mine || canManage) SheetItem("Eliminar", danger = true) { onDelete(); onDismiss() }
        Spacer(Modifier.navigationBarsPadding().padding(bottom = 12.dp))
    }
}

@Composable
private fun SheetItem(label: String, danger: Boolean = false, onClick: () -> Unit) {
    Text(
        label,
        color = if (danger) ArtaColors.Danger else ArtaColors.Text,
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 24.dp, vertical = 14.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PinsSheet(vm: ConversationViewModel, onDismiss: () -> Unit) {
    var pins by remember { mutableStateOf<List<ChatMessage>?>(null) }
    LaunchedEffect(Unit) { pins = vm.pins() }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = ArtaColors.BgElev) {
        Text("Mensajes fijados", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        when {
            pins == null -> CircularProgressIndicator(Modifier.padding(24.dp), color = ArtaColors.Gold)
            pins!!.isEmpty() -> Text("No hay mensajes fijados.", color = ArtaColors.Muted, modifier = Modifier.padding(20.dp))
            else -> LazyColumn(Modifier.heightIn(max = 480.dp)) {
                items(pins!!, key = { it.id }) { p ->
                    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)) {
                        Text("${p.author.fullName} · ${messageTime(p.createdAt)}", color = ArtaColors.Gold, style = MaterialTheme.typography.labelMedium)
                        Text(mentionText(p.body.ifBlank { p.attachment?.name ?: "" }))
                    }
                    HorizontalDivider(color = ArtaColors.Line)
                }
            }
        }
        Spacer(Modifier.navigationBarsPadding().padding(bottom = 12.dp))
    }
}

/** PDF: se baja con la cookie de sesión y se abre con el visor del teléfono. */
private suspend fun openFile(context: Context, a: ChatAttachment) {
    try {
        val file = withContext(Dispatchers.IO) {
            val dir = File(context.cacheDir, "chat-files").apply { mkdirs() }
            val safeName = (a.name ?: a.url.substringAfterLast('/')).replace(Regex("[^\\w.\\- ]"), "_")
            val target = File(dir, safeName)
            ApiClient.http.newCall(Request.Builder().url(ApiClient.resolveUrl(a.url)).build()).execute().use { res ->
                if (!res.isSuccessful) error("No se pudo descargar (${res.code})")
                target.outputStream().use { out -> res.body?.byteStream()?.copyTo(out) }
            }
            target
        }
        val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, a.mime ?: "application/pdf")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(Intent.createChooser(intent, a.name ?: "Abrir").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
        Toast.makeText(context, e.userMessage(), Toast.LENGTH_LONG).show()
    }
}
