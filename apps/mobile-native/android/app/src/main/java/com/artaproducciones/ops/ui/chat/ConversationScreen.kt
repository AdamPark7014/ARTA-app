package com.artaproducciones.ops.ui.chat

import android.Manifest
import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material.icons.automirrored.outlined.Reply
import androidx.compose.material.icons.automirrored.outlined.VolumeOff
import androidx.compose.material.icons.outlined.AddReaction
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.BookmarkRemove
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Done
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EmojiEmotions
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Share
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
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil.compose.AsyncImage
import com.artaproducciones.ops.data.api.ChannelMember
import com.artaproducciones.ops.data.api.ChatAttachment
import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.data.api.ChatReaction
import com.artaproducciones.ops.data.api.ChatReplyRef
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.dayKey
import com.artaproducciones.ops.ui.common.dayLabel
import com.artaproducciones.ops.ui.common.mentionToken
import com.artaproducciones.ops.ui.common.messageTime
import com.artaproducciones.ops.ui.common.parseInstant
import com.artaproducciones.ops.ui.common.plainText
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import kotlin.math.roundToInt

private const val GROUP_WINDOW_MS = 5 * 60 * 1000L

/**
 * Subrutas del chat. La pestaña de chats y la conversación solo reciben `openChat`,
 * que navega a `chat/<arg>`; estas rutas literales ganan a `chat/{channelId}`.
 */
object ChatRoutes {
    const val SEARCH = "buscar"
    const val SAVED = "guardados"
    const val NEW = "nueva"
    fun info(channelId: String) = "$channelId/info"
    fun message(channelId: String, messageId: String) = "$channelId?msg=$messageId"
}

private enum class Ticks { None, Pending, Failed, Sent, ReadSome, ReadAll }

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
    val online by ChatPresence.online.collectAsState()
    LaunchedEffect(Unit) { ChatPresence.ensureStarted() }
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val maxBubble = (LocalConfiguration.current.screenWidthDp * 0.78f).dp

    val draftKey = remember { ChatDrafts.key(channelId, parentId) }
    val mentions = remember { mutableStateMapOf<String, String>() }
    var draft by remember {
        val text = plainTextKeepingMentions(ChatDrafts.get(context, draftKey), mentions)
        mutableStateOf(TextFieldValue(text, TextRange(text.length)))
    }
    var editing by remember { mutableStateOf<ChatMessage?>(null) }
    var replyTo by remember { mutableStateOf<ChatMessage?>(null) }
    var actionsFor by remember { mutableStateOf<ChatMessage?>(null) }
    var tappedId by remember { mutableStateOf<String?>(null) }
    var reactPickerFor by remember { mutableStateOf<ChatMessage?>(null) }
    var composerEmoji by remember { mutableStateOf(false) }
    var whoReacted by remember { mutableStateOf<ChatMessage?>(null) }
    var gallery by remember { mutableStateOf<Pair<List<ChatAttachment>, Int>?>(null) }
    var videoViewer by remember { mutableStateOf<ChatAttachment?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var pinsOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf<ChatMessage?>(null) }
    val focusRequester = remember { FocusRequester() }

    // Borrador por conversación: se guarda al escribir (con pausa) y al salir.
    LaunchedEffect(draft.text, editing) {
        if (editing != null) return@LaunchedEffect
        delay(400)
        ChatDrafts.put(context, draftKey, resolveMentions(draft.text, mentions))
    }
    val latestDraft by rememberUpdatedState(draft.text)
    val latestEditing by rememberUpdatedState(editing)
    DisposableEffect(Unit) {
        onDispose { if (latestEditing == null) ChatDrafts.put(context, draftKey, resolveMentions(latestDraft, mentions)) }
    }

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

    var attachOpen by remember { mutableStateOf(false) }
    val recorder = remember { VoiceRecorder(context) }
    var recording by remember { mutableStateOf(false) }
    // Sobrevive a que Android mate la app mientras la cámara está abierta.
    var captureUri by rememberSaveable { mutableStateOf<String?>(null) }
    DisposableEffect(Unit) {
        onDispose {
            recorder.cancel()
            ChatAudio.stop()
        }
    }

    fun clearComposer() {
        draft = TextFieldValue("")
        mentions.clear()
        replyTo = null
    }

    fun sendUris(uris: List<Uri>) {
        if (uris.isEmpty()) return
        vm.sendFiles(uris, resolveMentions(draft.text, mentions), replyTo)
        clearComposer()
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        captureUri?.let { if (ok) sendUris(listOf(Uri.parse(it))) }
        captureUri = null
    }
    val videoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CaptureVideo()) { ok ->
        captureUri?.let { if (ok) sendUris(listOf(Uri.parse(it))) }
        captureUri = null
    }
    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { sendUris(it) }
    val documentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { sendUris(it) }

    fun startRecording() {
        try {
            ChatAudio.stop()
            recorder.start()
            recording = true
        } catch (e: Exception) {
            Toast.makeText(context, "No se pudo usar el micrófono", Toast.LENGTH_LONG).show()
        }
    }
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startRecording()
        else Toast.makeText(context, "Activa el micrófono en Ajustes para mandar notas de voz", Toast.LENGTH_LONG).show()
    }

    fun onAttachSource(source: AttachSource) {
        attachOpen = false
        try {
            when (source) {
                AttachSource.Camera -> ChatMedia.captureUri(context, "jpg").also { captureUri = it.toString(); cameraLauncher.launch(it) }
                AttachSource.Video -> ChatMedia.captureUri(context, "mp4").also { captureUri = it.toString(); videoLauncher.launch(it) }
                AttachSource.Gallery -> galleryLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                AttachSource.Document -> documentLauncher.launch(arrayOf("*/*"))
            }
        } catch (_: android.content.ActivityNotFoundException) {
            captureUri = null
            Toast.makeText(context, "No hay una app para esto en el teléfono", Toast.LENGTH_LONG).show()
        }
    }

    fun onMic() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startRecording()
        else micPermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    fun startReply(m: ChatMessage) {
        editing = null
        replyTo = m
        tappedId = null
        focusRequester.runCatching { requestFocus() }
    }

    fun react(m: ChatMessage, emoji: String) {
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        vm.react(m, emoji)
    }

    fun openAttachment(a: ChatAttachment) {
        when {
            a.isImage -> {
                val images = state.messages.mapNotNull { it.attachment?.takeIf { att -> att.isImage && !it.deleted } }
                gallery = images to images.indexOfFirst { it.url == a.url }.coerceAtLeast(0)
            }
            a.isVideo -> videoViewer = a
            else -> scope.launch {
                runCatching { openAttachment(context, a) }
                    .onFailure { Toast.makeText(context, it.userMessage(), Toast.LENGTH_LONG).show() }
            }
        }
    }

    // Lista invertida: índice 0 = mensaje más nuevo, así el teclado y lo nuevo quedan abajo.
    val rows = remember(state.messages, state.firstUnreadId) { buildRows(state.messages, parentId, state.firstUnreadId) }
    val newest = state.messages.lastOrNull()
    var unseen by remember { mutableIntStateOf(0) }
    var positioned by rememberSaveable { mutableStateOf(false) }
    val atBottom by remember { derivedStateOf { listState.firstVisibleItemIndex <= 1 } }

    LaunchedEffect(newest?.id) {
        val n = newest ?: return@LaunchedEffect
        if (state.focusMessageId != null) return@LaunchedEffect
        if (listState.firstVisibleItemIndex <= 2 || n.author.id == vm.myId) {
            listState.animateScrollToItem(0)
            unseen = 0
        } else if (positioned) {
            unseen++
        }
    }
    LaunchedEffect(atBottom) {
        if (atBottom) {
            unseen = 0
            vm.loadNewer()
        }
    }
    // Al abrir con muchos no leídos, el separador «Mensajes nuevos» queda arriba, como en Slack.
    LaunchedEffect(state.loading, rows.size) {
        if (positioned || state.loading || rows.isEmpty()) return@LaunchedEffect
        positioned = true
        if (state.focusMessageId != null) return@LaunchedEffect
        val idx = rows.indexOfFirst { it is ListRow.Unread }
        if (idx > 6) {
            listState.scrollToItem(idx)
            listState.scrollBy(-listState.layoutInfo.viewportSize.height * 0.7f)
        }
    }
    LaunchedEffect(state.focusMessageId, rows.size) {
        val focus = state.focusMessageId ?: return@LaunchedEffect
        val idx = rows.indexOfFirst { it is ListRow.Message && it.message.id == focus }
        if (idx >= 0) {
            listState.scrollToItem(idx)
            listState.scrollBy(-listState.layoutInfo.viewportSize.height * 0.35f)
            vm.clearFocus()
        }
    }
    val nearTop = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= rows.size - 5 } == true
    LaunchedEffect(nearTop, rows.size) { if (nearTop && rows.isNotEmpty()) vm.loadOlder() }

    val channel = state.channel
    val isDirect = channel?.kind == "DIRECT"
    val isGroupDm = channel?.isGroupDm == true
    val peerOnline = channel?.peer?.id?.let { it in online } == true
    val title = when {
        parentId != null -> "Hilo"
        channel == null -> ""
        isDirect || isGroupDm -> channel.name
        else -> "#${channel.name}"
    }
    val subtitle = when {
        state.typing.isNotEmpty() -> typingText(state.typing)
        parentId != null && channel != null -> if (isDirect || isGroupDm) channel.name else "#${channel.name}"
        isDirect -> if (peerOnline) "en línea" else channel?.peer?.title.orEmpty()
        isGroupDm -> "${channel?.memberCount ?: 0} personas"
        channel != null -> channel.topic?.takeIf { it.isNotBlank() } ?: "${channel.memberCount} miembros"
        else -> ""
    }
    val lastMineId = state.messages.lastOrNull { it.author.id == vm.myId && !it.pending && !it.failed && !it.deleted }?.id
    fun openInfo() {
        if (parentId == null && channel != null) openChat(ChatRoutes.info(channelId))
    }

    Scaffold(
        containerColor = ArtaColors.Bg,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ArtaColors.BgElev),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Atrás") } },
                title = {
                    Row(
                        Modifier.clip(RoundedCornerShape(Space.S)).clickable(enabled = parentId == null && channel != null) { openInfo() },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (channel != null && parentId == null) {
                            ConversationAvatar(channel.name, channel.kind, isGroupDm, peerOnline, size = 36.dp)
                            Spacer(Modifier.width(Space.M))
                        }
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    title,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.weight(1f, fill = false),
                                )
                                if (channel?.muted == true) {
                                    Icon(
                                        Icons.AutoMirrored.Outlined.VolumeOff,
                                        "Silenciado",
                                        tint = ArtaColors.Muted,
                                        modifier = Modifier.padding(start = Space.XS).size(16.dp),
                                    )
                                }
                            }
                            if (subtitle.isNotBlank()) {
                                Text(
                                    subtitle,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = when {
                                        state.typing.isNotEmpty() -> ArtaColors.Gold
                                        isDirect && peerOnline -> OnlineGreen
                                        else -> ArtaColors.Muted
                                    },
                                )
                            }
                        }
                    }
                },
                actions = {
                    if (parentId == null && channel != null) {
                        IconButton(onClick = { menuOpen = true }) { Icon(Icons.Outlined.MoreVert, "Opciones") }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text("Información") },
                                leadingIcon = { Icon(Icons.Outlined.Info, null) },
                                onClick = { menuOpen = false; openInfo() },
                            )
                            DropdownMenuItem(
                                text = { Text("Mensajes fijados") },
                                leadingIcon = { Icon(Icons.Outlined.PushPin, null) },
                                onClick = { menuOpen = false; pinsOpen = true },
                            )
                            HorizontalDivider(color = ArtaColors.Line)
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
                when {
                    state.loading && state.messages.isEmpty() -> ConversationSkeleton()
                    state.loadError != null && state.messages.isEmpty() ->
                        ErrorState(state.loadError, onRetry = vm::retry, modifier = Modifier.align(Alignment.Center))
                    state.messages.isEmpty() -> EmptyState(
                        Icons.Outlined.ChatBubbleOutline,
                        title = if (parentId != null) "Sin respuestas todavía" else "Aún no hay mensajes",
                        subtitle = when {
                            parentId != null -> "Responde para empezar el hilo."
                            isDirect -> "Escríbele a ${channel?.name.orEmpty()} para empezar la conversación."
                            else -> "Sé la primera persona en escribir aquí."
                        },
                        modifier = Modifier.align(Alignment.Center),
                    )
                    else -> LazyColumn(
                        state = listState,
                        reverseLayout = true,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = Space.S, vertical = Space.S),
                    ) {
                        if (state.loadingNewer) {
                            item(key = "newer") { LoadingRow() }
                        }
                        items(rows, key = { it.key }) { row ->
                            when (row) {
                                is ListRow.Day -> DaySeparator(row.label)
                                is ListRow.Unread -> UnreadDivider()
                                is ListRow.ThreadHeader -> ThreadHeader(row.count)
                                is ListRow.Message -> {
                                    val m = row.message
                                    val mine = m.author.id == vm.myId
                                    val receipt = if (mine && parentId == null && !m.pending && !m.failed) vm.readReceipt(m) else null
                                    val ticks = when {
                                        !mine -> Ticks.None
                                        m.failed -> Ticks.Failed
                                        m.pending -> Ticks.Pending
                                        receipt == null || receipt.others == 0 || receipt.readers == 0 -> Ticks.Sent
                                        receipt.readers >= receipt.others -> Ticks.ReadAll
                                        else -> Ticks.ReadSome
                                    }
                                    val receiptLabel = if (m.id == lastMineId && receipt != null && receipt.readers > 0) {
                                        when {
                                            isDirect -> "Visto"
                                            receipt.readers >= receipt.others && receipt.others > 1 -> "Visto por todos"
                                            else -> "Visto por ${receipt.readers}"
                                        }
                                    } else null
                                    MessageBubble(
                                        m = m,
                                        mine = mine,
                                        showAuthor = row.showAuthor && !isDirect,
                                        ticks = ticks,
                                        receiptLabel = receiptLabel,
                                        myId = vm.myId,
                                        inThread = parentId != null,
                                        highlighted = state.highlightId == m.id,
                                        showActions = tappedId == m.id,
                                        maxWidth = maxBubble,
                                        onTap = { tappedId = if (tappedId == m.id) null else m.id },
                                        onLongPress = {
                                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                            tappedId = null
                                            actionsFor = m
                                        },
                                        onReply = { startReply(m) },
                                        onReact = { emoji -> react(m, emoji) },
                                        onMoreReactions = { tappedId = null; reactPickerFor = m },
                                        onMoreActions = { tappedId = null; actionsFor = m },
                                        onWhoReacted = {
                                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                            whoReacted = m
                                        },
                                        onOpenThread = { openThread(m.id) },
                                        onOpenAttachment = ::openAttachment,
                                        onJumpTo = vm::jumpTo,
                                        onRetry = { vm.retry(m) },
                                        onDiscard = { vm.discard(m) },
                                    )
                                }
                            }
                        }
                        if (state.loadingOlder) {
                            item(key = "older") { LoadingRow() }
                        }
                    }
                }
                val showJump = state.messages.isNotEmpty() && (listState.firstVisibleItemIndex > 3 || state.hasNewer)
                if (showJump) {
                    Surface(
                        color = ArtaColors.Surface2,
                        contentColor = if (unseen > 0) ArtaColors.Gold else ArtaColors.Text,
                        shape = RoundedCornerShape(20.dp),
                        shadowElevation = 6.dp,
                        border = BorderStroke(1.dp, ArtaColors.Line),
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(Space.L)
                            .clip(RoundedCornerShape(20.dp))
                            .clickable {
                                unseen = 0
                                vm.jumpToLatest()
                                scope.launch { listState.animateScrollToItem(0) }
                            },
                    ) {
                        Row(Modifier.padding(horizontal = Space.M, vertical = Space.S), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.KeyboardArrowDown, "Ir a lo más reciente", modifier = Modifier.size(20.dp))
                            if (unseen > 0) {
                                Text(
                                    if (unseen == 1) "1 nuevo" else "$unseen nuevos",
                                    style = MaterialTheme.typography.labelLarge,
                                    modifier = Modifier.padding(start = Space.XS),
                                )
                            }
                        }
                    }
                }
            }

            if (channel != null && !channel.canPost && parentId == null) {
                Text(
                    "Solo dirección publica en este canal.",
                    color = ArtaColors.Muted,
                    modifier = Modifier.fillMaxWidth().background(ArtaColors.BgElev).padding(Space.L).navigationBarsPadding(),
                )
            } else {
                MentionSuggestions(
                    draft = draft,
                    members = channel?.members.orEmpty().filter { it.id != vm.myId },
                    online = online,
                    allowChannel = channel != null && !isDirect,
                    onPick = { member ->
                        val (value, name) = insertMention(draft, member.fullName)
                        mentions[name] = member.id
                        draft = value
                    },
                    onPickChannel = { draft = insertMention(draft, "canal").first },
                )
                editing?.let { e ->
                    ComposerContextBar(
                        label = "Editando mensaje",
                        text = plainText(e.body),
                        onClose = { editing = null; draft = TextFieldValue("") },
                    )
                }
                replyTo?.let { r ->
                    ComposerContextBar(
                        label = "Respondiendo a ${if (r.author.id == vm.myId) "ti" else r.author.fullName}",
                        text = plainText(r.body).ifBlank { r.attachment?.name ?: "Adjunto" },
                        onClose = { replyTo = null },
                    )
                }
                state.upload?.let { UploadBar(it) }
                if (draft.text.length > ChatDrafts.MAX_CHARS - 500) {
                    Text(
                        "${draft.text.length} / ${ChatDrafts.MAX_CHARS}",
                        color = if (draft.text.length >= ChatDrafts.MAX_CHARS) ArtaColors.Danger else ArtaColors.Muted,
                        style = MaterialTheme.typography.labelSmall,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth().background(ArtaColors.BgElev).padding(horizontal = Space.L, vertical = 2.dp),
                    )
                }
                if (recording) {
                    RecordingBar(
                        recorder = recorder,
                        onCancel = {
                            recorder.cancel()
                            recording = false
                        },
                        onSend = {
                            val file = recorder.stop()
                            recording = false
                            if (file != null) {
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                vm.sendVoice(file, replyTo)
                                replyTo = null
                            } else {
                                Toast.makeText(context, "Mantén la grabación al menos un segundo", Toast.LENGTH_SHORT).show()
                            }
                        },
                    )
                } else {
                    Composer(
                        value = draft,
                        uploading = state.uploading,
                        placeholder = when {
                            parentId != null -> "Responder en el hilo"
                            channel == null -> "Mensaje"
                            isDirect || isGroupDm -> "Mensaje para ${channel.name}"
                            else -> "Mensaje en #${channel.name}"
                        },
                        focusRequester = focusRequester,
                        onChange = {
                            draft = if (it.text.length > ChatDrafts.MAX_CHARS) it.copy(text = it.text.take(ChatDrafts.MAX_CHARS)) else it
                            if (it.text.isNotBlank()) vm.onTyping()
                        },
                        onAttach = { attachOpen = true },
                        onEmoji = { composerEmoji = true },
                        onMic = { onMic() },
                        onSend = {
                            val body = resolveMentions(draft.text, mentions)
                            val e = editing
                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            if (e != null) vm.edit(e, body) else vm.send(body, replyTo = replyTo)
                            editing = null
                            clearComposer()
                            scope.launch { listState.animateScrollToItem(0) }
                        },
                        canAttach = editing == null,
                    )
                }
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
            onReact = { react(m, it) },
            onMoreReactions = { reactPickerFor = m },
            onReply = { startReply(m) },
            onThread = { openThread(m.id) },
            onCopy = {
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("mensaje", plainText(m.body)))
                Toast.makeText(context, "Copiado", Toast.LENGTH_SHORT).show()
            },
            onSave = {
                vm.toggleSave(m)
                Toast.makeText(context, if (m.saved) "Quitado de guardados" else "Guardado", Toast.LENGTH_SHORT).show()
            },
            onPin = { vm.togglePin(m) },
            onEdit = {
                replyTo = null
                editing = m
                mentions.clear()
                val text = plainTextKeepingMentions(m.body, mentions)
                draft = TextFieldValue(text, TextRange(text.length))
                focusRequester.runCatching { requestFocus() }
            },
            onDelete = { confirmDelete = m },
            onShare = {
                val a = m.attachment ?: return@MessageActions
                scope.launch {
                    runCatching { shareAttachment(context, a) }
                        .onFailure { Toast.makeText(context, it.userMessage(), Toast.LENGTH_LONG).show() }
                }
            },
        )
    }

    reactPickerFor?.let { m ->
        EmojiPickerSheet(
            onPick = { e ->
                react(m, e)
                reactPickerFor = null
            },
            onDismiss = { reactPickerFor = null },
        )
    }

    if (composerEmoji) {
        EmojiPickerSheet(
            onPick = { e ->
                draft = insertText(draft, e)
                composerEmoji = false
            },
            onDismiss = { composerEmoji = false },
        )
    }

    whoReacted?.let { m -> WhoReactedSheet(m, vm.myId, onDismiss = { whoReacted = null }) }

    if (attachOpen) AttachSheet(onPick = ::onAttachSource, onDismiss = { attachOpen = false })

    confirmDelete?.let { m ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("¿Eliminar mensaje?") },
            text = { Text("Se quitará para todos en la conversación.") },
            confirmButton = { TextButton(onClick = { vm.delete(m); confirmDelete = null }) { Text("Eliminar", color = ArtaColors.Danger) } },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancelar") } },
        )
    }

    if (pinsOpen) PinsSheet(vm = vm, onJump = { vm.jumpTo(it) }, onDismiss = { pinsOpen = false })

    gallery?.let { (images, start) -> ImageGallery(images, start, onDismiss = { gallery = null }) }
    videoViewer?.let { a -> MediaViewer(a, onDismiss = { videoViewer = null }) }
}

// ─── Filas de la lista ───────────────────────────────────────────────────────

private sealed interface ListRow {
    val key: String

    data class Message(val message: ChatMessage, val showAuthor: Boolean) : ListRow {
        override val key get() = "m:" + (message.clientId ?: message.id)
    }

    data class Day(val label: String, override val key: String) : ListRow
    data object Unread : ListRow {
        override val key get() = "unread"
    }
    data class ThreadHeader(val count: Int) : ListRow {
        override val key get() = "thread-header"
    }
}

/** Filas en orden inverso (lo más nuevo primero) con separadores de día, «Mensajes nuevos» y agrupación por autor. */
private fun buildRows(messages: List<ChatMessage>, parentId: String?, firstUnreadId: String?): List<ListRow> {
    val out = ArrayList<ListRow>(messages.size + 8)
    var prev: ChatMessage? = null
    var prevDay: java.time.LocalDate? = null
    messages.forEachIndexed { i, m ->
        val day = dayKey(m.createdAt)
        if (day != null && day != prevDay) {
            out.add(ListRow.Day(dayLabel(day), "d:$day"))
            prevDay = day
            prev = null
        }
        if (m.id == firstUnreadId && parentId == null) {
            out.add(ListRow.Unread)
            prev = null
        }
        val p = prev
        val grouped = p != null && p.author.id == m.author.id && p.kind != "SYSTEM" && m.replyTo == null &&
            (parseInstant(m.createdAt)?.toEpochMilli() ?: 0L) - (parseInstant(p.createdAt)?.toEpochMilli() ?: 0L) < GROUP_WINDOW_MS
        out.add(ListRow.Message(m, showAuthor = !grouped))
        if (parentId != null && i == 0) out.add(ListRow.ThreadHeader(messages.size - 1))
        prev = m
    }
    return out.asReversed()
}

@Composable
private fun LoadingRow() {
    Box(Modifier.fillMaxWidth().padding(Space.M), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(Modifier.size(22.dp), color = ArtaColors.Gold, strokeWidth = 2.dp)
    }
}

@Composable
private fun DaySeparator(label: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = Space.M), contentAlignment = Alignment.Center) {
        Surface(color = ArtaColors.Surface2, shape = RoundedCornerShape(10.dp)) {
            Text(label, color = ArtaColors.Muted, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = Space.M, vertical = Space.XS))
        }
    }
}

@Composable
private fun UnreadDivider() {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.S), verticalAlignment = Alignment.CenterVertically) {
        HorizontalDivider(Modifier.weight(1f), color = ArtaColors.Gold.copy(alpha = 0.6f))
        Text(
            "Mensajes nuevos",
            color = ArtaColors.Gold,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = Space.S),
        )
        HorizontalDivider(Modifier.weight(1f), color = ArtaColors.Gold.copy(alpha = 0.6f))
    }
}

@Composable
private fun ThreadHeader(count: Int) {
    Column(Modifier.fillMaxWidth().padding(vertical = Space.S)) {
        Text(
            if (count == 1) "1 respuesta" else "$count respuestas",
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = Space.S, vertical = Space.XS),
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
    ticks: Ticks,
    receiptLabel: String?,
    myId: String,
    inThread: Boolean,
    highlighted: Boolean,
    showActions: Boolean,
    maxWidth: Dp,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    onReply: () -> Unit,
    onReact: (String) -> Unit,
    onMoreReactions: () -> Unit,
    onMoreActions: () -> Unit,
    onWhoReacted: () -> Unit,
    onOpenThread: () -> Unit,
    onOpenAttachment: (ChatAttachment) -> Unit,
    onJumpTo: (String) -> Unit,
    onRetry: () -> Unit,
    onDiscard: () -> Unit,
) {
    if (m.kind == "SYSTEM") {
        Text(
            plainText(m.body),
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.fillMaxWidth().padding(vertical = Space.S, horizontal = Space.L),
            textAlign = TextAlign.Center,
        )
        return
    }
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val offsetX = remember { Animatable(0f) }
    val threshold = with(LocalDensity.current) { 64.dp.toPx() }
    var armed by remember { mutableStateOf(false) }
    val canInteract = !m.pending && !m.failed && !m.deleted
    val replyAction by rememberUpdatedState(onReply)
    val avatarGap = if (mine) 0.dp else 38.dp

    Column(
        Modifier
            .fillMaxWidth()
            .background(if (highlighted) ArtaColors.GoldSoft else Color.Transparent, RoundedCornerShape(Space.S))
            .padding(top = if (showAuthor) Space.S else 2.dp),
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .pointerInput(canInteract) {
                    if (!canInteract) return@pointerInput
                    // Deslizar a la derecha para responder citando (como WhatsApp).
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            if (offsetX.value >= threshold) replyAction()
                            armed = false
                            scope.launch { offsetX.animateTo(0f) }
                        },
                        onDragCancel = {
                            armed = false
                            scope.launch { offsetX.animateTo(0f) }
                        },
                    ) { change, drag ->
                        val next = (offsetX.value + drag).coerceIn(0f, threshold * 1.4f)
                        if (next != offsetX.value) change.consume()
                        scope.launch { offsetX.snapTo(next) }
                        if (!armed && next >= threshold) {
                            armed = true
                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        } else if (armed && next < threshold) {
                            armed = false
                        }
                    }
                },
        ) {
            if (offsetX.value > 4f) {
                Icon(
                    Icons.AutoMirrored.Outlined.Reply,
                    null,
                    tint = if (armed) ArtaColors.Gold else ArtaColors.Muted,
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .padding(start = Space.S)
                        .alpha((offsetX.value / threshold).coerceIn(0f, 1f)),
                )
            }
            Row(
                Modifier
                    .align(if (mine) Alignment.CenterEnd else Alignment.CenterStart)
                    .offset { IntOffset(offsetX.value.roundToInt(), 0) },
                verticalAlignment = Alignment.Top,
            ) {
                if (!mine) {
                    if (showAuthor) Avatar(m.author.fullName, size = 32.dp) else Spacer(Modifier.width(32.dp))
                    Spacer(Modifier.width(6.dp))
                }
                Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
                    Surface(
                        color = if (mine) ArtaColors.Mine else ArtaColors.BgElev,
                        shape = RoundedCornerShape(
                            topStart = if (!mine && showAuthor) 4.dp else 16.dp,
                            topEnd = if (mine && showAuthor) 4.dp else 16.dp,
                            bottomStart = 16.dp,
                            bottomEnd = 16.dp,
                        ),
                        modifier = Modifier
                            .widthIn(max = maxWidth)
                            .combinedClickable(
                                onClick = { if (canInteract) onTap() },
                                onLongClick = { if (canInteract) onLongPress() },
                            ),
                    ) {
                        BubbleContent(m, mine, showAuthor, ticks, onOpenAttachment, onJumpTo)
                    }
                    if (m.reactions.isNotEmpty() && !m.deleted) {
                        FlowRow(
                            Modifier.widthIn(max = maxWidth).offset(y = (-4).dp).padding(horizontal = Space.S),
                            horizontalArrangement = Arrangement.spacedBy(Space.XS),
                            verticalArrangement = Arrangement.spacedBy(Space.XS),
                        ) {
                            m.reactions.forEach { r ->
                                ReactionChip(r, reacted = myId in r.userIds, onClick = { onReact(r.emoji) }, onLongClick = onWhoReacted)
                            }
                            Surface(
                                color = ArtaColors.Surface2,
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, ArtaColors.Line),
                                modifier = Modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = onMoreReactions),
                            ) {
                                Icon(
                                    Icons.Outlined.AddReaction,
                                    "Agregar reacción",
                                    tint = ArtaColors.Muted,
                                    modifier = Modifier.padding(horizontal = Space.S, vertical = 3.dp).size(16.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
        if (showActions) {
            Row(Modifier.padding(start = avatarGap, top = 2.dp), horizontalArrangement = Arrangement.spacedBy(Space.XS)) {
                InlineAction(Icons.AutoMirrored.Outlined.Reply, "Responder", onReply)
                InlineAction(Icons.Outlined.AddReaction, "Reaccionar", onMoreReactions)
                InlineAction(Icons.Outlined.MoreHoriz, "Más acciones", onMoreActions)
            }
        }
        if (m.failed) {
            Row(Modifier.padding(top = 2.dp)) {
                TextButton(onClick = onRetry) { Text("Reintentar") }
                TextButton(onClick = onDiscard) { Text("Descartar", color = ArtaColors.Muted) }
            }
        }
        if (receiptLabel != null) {
            Text(
                receiptLabel,
                color = ArtaColors.Muted,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(end = Space.XS, top = 2.dp),
            )
        }
        if (!inThread && m.replyCount > 0) {
            Text(
                if (m.replyCount == 1) "1 respuesta ›" else "${m.replyCount} respuestas ›",
                color = ArtaColors.Gold,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier
                    .padding(start = avatarGap, top = 2.dp)
                    .clip(RoundedCornerShape(Space.S))
                    .clickable(onClick = onOpenThread)
                    .padding(Space.XS),
            )
        }
    }
}

@Composable
private fun BubbleContent(
    m: ChatMessage,
    mine: Boolean,
    showAuthor: Boolean,
    ticks: Ticks,
    onOpenAttachment: (ChatAttachment) -> Unit,
    onJumpTo: (String) -> Unit,
) {
    Column(Modifier.padding(horizontal = Space.M, vertical = Space.S)) {
        if (showAuthor && !mine) {
            Text(m.author.fullName, color = ArtaColors.Gold, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
        }
        if (m.pinnedAt != null || m.saved) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.XS)) {
                if (m.pinnedAt != null) {
                    Icon(Icons.Outlined.PushPin, null, tint = ArtaColors.Gold, modifier = Modifier.size(12.dp))
                    Text("Fijado", color = ArtaColors.Gold, style = MaterialTheme.typography.labelSmall)
                }
                if (m.saved) {
                    Icon(Icons.Outlined.Bookmark, null, tint = ArtaColors.Gold, modifier = Modifier.size(12.dp))
                    Text("Guardado", color = ArtaColors.Gold, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        if (m.deleted) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    "Mensaje eliminado",
                    color = ArtaColors.Muted,
                    fontStyle = FontStyle.Italic,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.width(Space.S))
                MetaRow(m, Ticks.None)
            }
            return@Column
        }
        m.replyTo?.let { r -> QuotedBlock(r) { onJumpTo(r.id) } }
        m.attachment?.let { a -> AttachmentView(a, mine) { onOpenAttachment(a) } }
        if (m.attachment == null) firstUrl(m.body)?.let { LinkPreviewCard(it) }
        if (m.body.isNotBlank()) {
            MarkdownText(m.body, meta = { MetaRow(m, ticks) })
        } else {
            Box(Modifier.align(Alignment.End)) { MetaRow(m, ticks) }
        }
    }
}

@Composable
private fun MetaRow(m: ChatMessage, ticks: Ticks) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        if (m.editedAt != null && !m.deleted) Text("editado", color = ArtaColors.Muted, style = MaterialTheme.typography.labelSmall)
        Text(messageTime(m.createdAt), color = ArtaColors.Muted, style = MaterialTheme.typography.labelSmall)
        when (ticks) {
            Ticks.None -> Unit
            Ticks.Failed -> Icon(Icons.Outlined.ErrorOutline, "No enviado", tint = ArtaColors.Danger, modifier = Modifier.size(14.dp))
            Ticks.Pending -> Icon(Icons.Outlined.Schedule, "Enviando", tint = ArtaColors.Muted, modifier = Modifier.size(14.dp))
            Ticks.Sent -> Icon(Icons.Outlined.Done, "Enviado", tint = ArtaColors.Muted, modifier = Modifier.size(15.dp))
            Ticks.ReadSome -> Icon(Icons.Outlined.DoneAll, "Visto por algunos", tint = ArtaColors.Muted, modifier = Modifier.size(15.dp))
            Ticks.ReadAll -> Icon(Icons.Outlined.DoneAll, "Visto", tint = ArtaColors.Read, modifier = Modifier.size(15.dp))
        }
    }
}

@Composable
private fun QuotedBlock(r: ChatReplyRef, onClick: () -> Unit) {
    Row(
        Modifier
            .padding(bottom = Space.XS)
            .widthIn(min = 140.dp)
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(Space.S))
            .background(Color.Black.copy(alpha = 0.22f))
            .clickable(onClick = onClick),
    ) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(ArtaColors.Gold))
        Column(Modifier.padding(horizontal = Space.S, vertical = 6.dp)) {
            Text(
                r.authorName ?: "Mensaje",
                color = ArtaColors.Gold,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                when {
                    r.deleted -> "Mensaje eliminado"
                    !r.excerpt.isNullOrBlank() -> r.excerpt
                    r.attachmentName != null -> "📎 ${r.attachmentName}"
                    else -> "Adjunto"
                },
                color = ArtaColors.Muted,
                style = MaterialTheme.typography.bodySmall,
                fontStyle = if (r.deleted) FontStyle.Italic else FontStyle.Normal,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun LinkPreviewCard(url: String) {
    val uriHandler = LocalUriHandler.current
    val preview by produceState(LinkPreviews.cached(url), url) {
        if (value == null && !LinkPreviews.known(url)) value = LinkPreviews.load(url)
    }
    val p = preview ?: return
    Column(
        Modifier
            .padding(bottom = Space.XS)
            .widthIn(max = 280.dp)
            .clip(RoundedCornerShape(Space.S))
            .background(Color.Black.copy(alpha = 0.22f))
            .clickable { runCatching { uriHandler.openUri(p.url.ifBlank { url }) } },
    ) {
        if (!p.image.isNullOrBlank()) {
            AsyncImage(
                model = p.image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(1.91f),
            )
        }
        Column(Modifier.padding(Space.S)) {
            p.siteName?.takeIf { it.isNotBlank() }?.let { Text(it, color = ArtaColors.Gold, style = MaterialTheme.typography.labelSmall, maxLines = 1) }
            p.title?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            p.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ReactionChip(r: ChatReaction, reacted: Boolean, onClick: () -> Unit, onLongClick: () -> Unit) {
    Surface(
        color = if (reacted) ArtaColors.GoldSoft else ArtaColors.Surface2,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, if (reacted) ArtaColors.Gold else ArtaColors.Line),
        modifier = Modifier.clip(RoundedCornerShape(12.dp)).combinedClickable(onClick = onClick, onLongClick = onLongClick),
    ) {
        Text(
            "${r.emoji} ${r.count}",
            style = MaterialTheme.typography.labelMedium,
            color = if (reacted) ArtaColors.Gold else ArtaColors.Text,
            modifier = Modifier.padding(horizontal = Space.S, vertical = 3.dp),
        )
    }
}

@Composable
private fun InlineAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    Surface(
        color = ArtaColors.Surface2,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(horizontal = Space.S, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = ArtaColors.Muted, modifier = Modifier.size(16.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted, modifier = Modifier.padding(start = Space.XS))
        }
    }
}

@Composable
private fun ComposerContextBar(label: String, text: String, onClose: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(ArtaColors.Surface2).padding(start = Space.L, end = Space.XS, top = Space.S, bottom = Space.S),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(3.dp).height(36.dp).background(ArtaColors.Gold, RoundedCornerShape(2.dp)))
        Spacer(Modifier.width(Space.S))
        Column(Modifier.weight(1f)) {
            Text(label, color = ArtaColors.Gold, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            Text(text, maxLines = 1, overflow = TextOverflow.Ellipsis, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall)
        }
        IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, "Cancelar") }
    }
}

@Composable
private fun Composer(
    value: TextFieldValue,
    uploading: Boolean,
    placeholder: String,
    canAttach: Boolean,
    focusRequester: FocusRequester,
    onChange: (TextFieldValue) -> Unit,
    onAttach: () -> Unit,
    onEmoji: () -> Unit,
    onMic: () -> Unit,
    onSend: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().background(ArtaColors.BgElev).padding(horizontal = 6.dp, vertical = 6.dp).navigationBarsPadding(),
        verticalAlignment = Alignment.Bottom,
    ) {
        if (canAttach) {
            // Se puede seguir adjuntando mientras sube lo anterior: entra a la cola.
            IconButton(onClick = onAttach) {
                Icon(Icons.Outlined.AttachFile, "Adjuntar foto, video o documento", tint = if (uploading) ArtaColors.Gold else ArtaColors.Muted)
            }
        }
        TextField(
            value = value,
            onValueChange = onChange,
            placeholder = { Text(placeholder, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            maxLines = 6,
            shape = RoundedCornerShape(22.dp),
            trailingIcon = {
                IconButton(onClick = onEmoji) { Icon(Icons.Outlined.EmojiEmotions, "Emojis", tint = ArtaColors.Muted) }
            },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = ArtaColors.Surface2,
                unfocusedContainerColor = ArtaColors.Surface2,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            modifier = Modifier.weight(1f).focusRequester(focusRequester),
        )
        Spacer(Modifier.width(6.dp))
        if (canAttach && value.text.isBlank()) {
            MicButton(onClick = onMic)
            return@Row
        }
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
private fun MentionSuggestions(
    draft: TextFieldValue,
    members: List<ChannelMember>,
    online: Set<String>,
    allowChannel: Boolean,
    onPick: (ChannelMember) -> Unit,
    onPickChannel: () -> Unit,
) {
    val q = mentionQuery(draft) ?: return
    val matches = remember(q, members) { members.filter { it.fullName.contains(q, ignoreCase = true) } }
    val channelMatch = allowChannel && "canal".startsWith(q.lowercase())
    if (matches.isEmpty() && !channelMatch) return
    Surface(
        color = ArtaColors.BgElev,
        shape = RoundedCornerShape(Space.M),
        shadowElevation = 8.dp,
        border = BorderStroke(1.dp, ArtaColors.Line),
        modifier = Modifier.fillMaxWidth().padding(horizontal = Space.S, vertical = Space.XS),
    ) {
        LazyColumn(Modifier.heightIn(max = 240.dp)) {
            if (channelMatch) {
                item(key = "@canal") {
                    Row(
                        Modifier.fillMaxWidth().clickable(onClick = onPickChannel).padding(horizontal = Space.L, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar("canal", size = 32.dp, channel = true)
                        Spacer(Modifier.width(Space.M))
                        Column {
                            Text("@canal", fontWeight = FontWeight.Medium)
                            Text("Avisar a todos en la conversación", color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            items(matches, key = { it.id }) { m ->
                Row(
                    Modifier.fillMaxWidth().clickable { onPick(m) }.padding(horizontal = Space.L, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PresenceAvatar(m.fullName, size = 32.dp, online = m.id in online)
                    Spacer(Modifier.width(Space.M))
                    Column {
                        Text(m.fullName, fontWeight = FontWeight.Medium)
                        m.title?.takeIf { it.isNotBlank() }?.let {
                            Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}

/** Sustituye la palabra «@…» bajo el cursor por «@[name] ». */
private fun insertMention(v: TextFieldValue, name: String): Pair<TextFieldValue, String> {
    val cursor = v.selection.start.coerceIn(0, v.text.length)
    val at = v.text.substring(0, cursor).lastIndexOf('@')
    val text = v.text.substring(0, at) + "@$name " + v.text.substring(cursor)
    val pos = at + name.length + 2
    return TextFieldValue(text, TextRange(pos)) to name
}

private fun insertText(v: TextFieldValue, insert: String): TextFieldValue {
    val start = v.selection.min.coerceIn(0, v.text.length)
    val end = v.selection.max.coerceIn(0, v.text.length)
    val text = (v.text.substring(0, start) + insert + v.text.substring(end)).take(ChatDrafts.MAX_CHARS)
    return TextFieldValue(text, TextRange((start + insert.length).coerceAtMost(text.length)))
}

/** «@Ana Ruiz» elegidos de la lista → tokens `[@Ana Ruiz](user:id)` que el API entiende. */
private fun resolveMentions(text: String, mentions: Map<String, String>): String {
    var out = text
    mentions.entries.sortedByDescending { it.key.length }.forEach { (name, id) ->
        out = out.replace("@$name", mentionToken(name, id))
    }
    return out
}

/** Al editar o restaurar un borrador: tokens → «@Nombre» visibles, recordando a quién apuntan. */
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
    onMoreReactions: () -> Unit,
    onReply: () -> Unit,
    onThread: () -> Unit,
    onCopy: () -> Unit,
    onSave: () -> Unit,
    onPin: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onShare: () -> Unit,
) {
    val editable = mine && m.attachment == null &&
        (parseInstant(m.createdAt)?.let { Instant.now().toEpochMilli() - it.toEpochMilli() < ConversationViewModel.EDIT_WINDOW_MS } == true)
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = ArtaColors.BgElev) {
        QuickReactionRow(onReact = { onReact(it); onDismiss() }, onMore = { onMoreReactions(); onDismiss() })
        HorizontalDivider(color = ArtaColors.Line, modifier = Modifier.padding(top = Space.XS))
        SheetItem(Icons.AutoMirrored.Outlined.Reply, "Responder") { onReply(); onDismiss() }
        if (!inThread) SheetItem(Icons.Outlined.Forum, "Responder en hilo") { onThread(); onDismiss() }
        if (m.body.isNotBlank()) SheetItem(Icons.Outlined.ContentCopy, "Copiar texto") { onCopy(); onDismiss() }
        SheetItem(
            if (m.saved) Icons.Outlined.BookmarkRemove else Icons.Outlined.BookmarkBorder,
            if (m.saved) "Quitar de guardados" else "Guardar mensaje",
        ) { onSave(); onDismiss() }
        if (m.attachment != null) SheetItem(Icons.Outlined.Share, "Compartir o guardar archivo") { onShare(); onDismiss() }
        SheetItem(Icons.Outlined.PushPin, if (m.pinnedAt != null) "Desfijar" else "Fijar en la conversación") { onPin(); onDismiss() }
        if (editable) SheetItem(Icons.Outlined.Edit, "Editar") { onEdit(); onDismiss() }
        if (mine || canManage) SheetItem(Icons.Outlined.DeleteOutline, "Eliminar", danger = true) { onDelete(); onDismiss() }
        Spacer(Modifier.navigationBarsPadding().padding(bottom = Space.M))
    }
}

@Composable
private fun SheetItem(icon: ImageVector, label: String, danger: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Space.XL, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = if (danger) ArtaColors.Danger else ArtaColors.Muted, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(Space.L))
        Text(label, color = if (danger) ArtaColors.Danger else ArtaColors.Text, style = MaterialTheme.typography.bodyLarge)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WhoReactedSheet(m: ChatMessage, myId: String, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = ArtaColors.BgElev) {
        Text("Reacciones", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = Space.XL, vertical = Space.S))
        LazyColumn(Modifier.heightIn(max = 460.dp)) {
            m.reactions.forEach { r ->
                item(key = "h:${r.emoji}") {
                    Row(Modifier.fillMaxWidth().padding(horizontal = Space.XL, vertical = Space.S), verticalAlignment = Alignment.CenterVertically) {
                        Text(r.emoji, fontSize = 22.sp)
                        Text(
                            if (r.count == 1) "1 persona" else "${r.count} personas",
                            color = ArtaColors.Muted,
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.padding(start = Space.M),
                        )
                    }
                }
                items(r.users, key = { u -> "${r.emoji}:${u.id}" }) { u ->
                    Row(Modifier.fillMaxWidth().padding(start = 56.dp, end = Space.XL, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(u.fullName, size = 28.dp)
                        Text(if (u.id == myId) "Tú" else u.fullName, modifier = Modifier.padding(start = Space.M))
                    }
                }
            }
        }
        Spacer(Modifier.navigationBarsPadding().padding(bottom = Space.M))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PinsSheet(vm: ConversationViewModel, onJump: (String) -> Unit, onDismiss: () -> Unit) {
    var pins by remember { mutableStateOf<List<ChatMessage>?>(null) }
    LaunchedEffect(Unit) { pins = vm.pins() }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = ArtaColors.BgElev) {
        Text("Mensajes fijados", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = Space.XL, vertical = Space.S))
        val list = pins
        when {
            list == null -> CircularProgressIndicator(Modifier.padding(Space.XL), color = ArtaColors.Gold)
            list.isEmpty() -> Text("No hay mensajes fijados.", color = ArtaColors.Muted, modifier = Modifier.padding(Space.XL))
            else -> LazyColumn(Modifier.heightIn(max = 480.dp)) {
                items(list, key = { it.id }) { p ->
                    Column(
                        Modifier.fillMaxWidth().clickable { onJump(p.id); onDismiss() }.padding(horizontal = Space.XL, vertical = Space.M),
                    ) {
                        Text("${p.author.fullName} · ${messageTime(p.createdAt)}", color = ArtaColors.Gold, style = MaterialTheme.typography.labelMedium)
                        Text(plainText(p.body.ifBlank { p.attachment?.name ?: "" }), maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                    HorizontalDivider(color = ArtaColors.Line)
                }
            }
        }
        Spacer(Modifier.navigationBarsPadding().padding(bottom = Space.M))
    }
}
