package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.VolumeOff
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChannelSummary
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.data.realtime.ChatBlocks
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.ui.common.messageTime
import com.artaproducciones.ops.ui.common.parseInstant
import com.artaproducciones.ops.ui.common.plainText
import com.artaproducciones.ops.ui.common.relativeTime
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

private enum class Section(val key: String, val title: String) {
    Channels("canales", "Canales"),
    Events("eventos", "Eventos"),
    Direct("directos", "Mensajes directos"),
    Browse("explorar", "Explorar canales"),
}

private fun sectionOf(c: ChannelSummary): Section = when {
    c.kind == "DIRECT" || c.isGroupDm -> Section.Direct
    !c.isMember -> Section.Browse
    c.eventId != null -> Section.Events
    else -> Section.Channels
}

fun dndLabel(untilIso: String?): String? {
    val until = parseInstant(untilIso)?.takeIf { it.isAfter(Instant.now()) } ?: return null
    val zone = ZoneId.systemDefault()
    val day = until.atZone(zone).toLocalDate()
    val prefix = if (day == LocalDate.now(zone)) "hoy" else if (day == LocalDate.now(zone).plusDays(1)) "mañana" else day.toString()
    return "No molestar hasta $prefix a las ${messageTime(untilIso)}"
}

private fun dndOptions(): List<Pair<String, Instant?>> {
    val now = Instant.now()
    val tomorrow = LocalDate.now().plusDays(1).atTime(LocalTime.of(8, 0)).atZone(ZoneId.systemDefault()).toInstant()
    return listOf(
        "Por 1 hora" to now.plus(1, ChronoUnit.HOURS),
        "Por 8 horas" to now.plus(8, ChronoUnit.HOURS),
        "Hasta mañana (8:00)" to tomorrow,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatListScreen(openChat: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var channels by remember { mutableStateOf<List<ChannelSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var unreadOnly by rememberSaveable { mutableStateOf(false) }
    var collapsed by rememberSaveable { mutableStateOf(setOf(Section.Browse.key)) }
    var reloadTick by remember { mutableIntStateOf(0) }
    var menu by remember { mutableStateOf(false) }
    var dndUntil by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { ChatPresence.ensureStarted() }
    // Al entrar al chat: quién está bloqueado (pudo cambiar desde la web), para ignorar lo suyo en tiempo real.
    LaunchedEffect(Unit) { ChatBlocks.ensureLoaded(refresh = true) }
    val online by ChatPresence.online.collectAsState()

    suspend fun load() {
        try {
            channels = ApiClient.api.channels()
            error = null
            loaded = true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    LaunchedEffect(reloadTick) { load() }
    LaunchedEffect(Unit) { dndUntil = runCatching { ApiClient.api.chatPrefs().dndUntil }.getOrNull() }
    // Ráfagas de actividad (varios mensajes seguidos) se juntan en una sola recarga.
    LaunchedEffect(Unit) {
        var pending = false
        merge(RealtimeClient.activity, RealtimeClient.channelsChanged, RealtimeClient.chatUnread).collect {
            if (pending) return@collect
            pending = true
            scope.launch {
                delay(400)
                pending = false
                load()
            }
        }
    }
    // Al volver a conectar el socket se recupera lo que llegó sin conexión.
    LaunchedEffect(Unit) { RealtimeClient.connected.collect { if (it) load() } }

    fun setDnd(until: Instant?) {
        menu = false
        scope.launch {
            val json = JSONObject().put("dndUntil", until?.toString() ?: JSONObject.NULL).toString()
            runCatching { ApiClient.api.setChatPrefs(json.toRequestBody("application/json".toMediaType())) }
                .onSuccess { dndUntil = it.dndUntil }
                .onFailure { error = it.userMessage() }
        }
    }

    val visible = channels.filter { c ->
        val matchesQuery = query.isBlank() || c.name.contains(query, ignoreCase = true) ||
            (c.peer?.fullName?.contains(query, ignoreCase = true) == true)
        matchesQuery && (!unreadOnly || c.unreadCount > 0)
    }
    val grouped = visible.groupBy(::sectionOf)
    val filtering = query.isNotBlank() || unreadOnly

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().padding(start = Space.L + Space.XS, end = Space.XS, top = Space.L, bottom = Space.XS),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Chats", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                IconButton(onClick = { openChat(ChatRoutes.SEARCH) }) { Icon(Icons.Outlined.Search, "Buscar mensajes") }
                IconButton(onClick = { openChat(ChatRoutes.SAVED) }) { Icon(Icons.Outlined.BookmarkBorder, "Guardados") }
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "Más opciones") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = ArtaColors.Surface2) {
                        Text(
                            "No molestar",
                            color = ArtaColors.Muted,
                            style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.padding(horizontal = Space.L, vertical = Space.S),
                        )
                        dndOptions().forEach { (label, until) ->
                            DropdownMenuItem(
                                text = { Text(label) },
                                leadingIcon = { Icon(Icons.Outlined.Bedtime, null) },
                                onClick = { setDnd(until) },
                            )
                        }
                        if (dndLabel(dndUntil) != null) {
                            DropdownMenuItem(
                                text = { Text("Desactivar No molestar", color = ArtaColors.Gold) },
                                leadingIcon = { Icon(Icons.Outlined.Close, null, tint = ArtaColors.Gold) },
                                onClick = { setDnd(null) },
                            )
                        }
                    }
                }
            }
            dndLabel(dndUntil)?.let { label ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Space.L, vertical = Space.XS)
                        .background(ArtaColors.GoldSoft, CircleShape)
                        .padding(start = Space.M),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.Bedtime, null, tint = ArtaColors.Gold, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(Space.S))
                    Text(label, color = ArtaColors.Gold, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    TextButton(onClick = { setDnd(null) }) { Text("Desactivar", color = ArtaColors.Gold) }
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = Space.L, vertical = Space.XS),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.S),
            ) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Ir a una conversación") },
                    leadingIcon = { Icon(Icons.Outlined.FilterList, null) },
                    trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Outlined.Close, "Borrar") } },
                    singleLine = true,
                    shape = CircleShape,
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = ArtaColors.Gold, cursorColor = ArtaColors.Gold),
                    modifier = Modifier.weight(1f),
                )
                FilterChip(
                    selected = unreadOnly,
                    onClick = { unreadOnly = !unreadOnly },
                    label = { Text("No leídos") },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = ArtaColors.GoldSoft, selectedLabelColor = ArtaColors.Gold),
                )
            }
            PullToRefreshBox(
                isRefreshing = loading && loaded,
                onRefresh = {
                    loading = true
                    reloadTick++
                },
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    !loaded && error == null -> ListSkeleton(9)
                    !loaded -> ErrorState(error, onRetry = {
                        error = null
                        loading = true
                        reloadTick++
                    })
                    visible.isEmpty() -> EmptyState(
                        Icons.Outlined.Forum,
                        if (filtering) "Nada por aquí" else "Aún no hay conversaciones",
                        when {
                            query.isNotBlank() -> "Nada coincide con «$query»."
                            unreadOnly -> "Estás al día."
                            else -> "Toca el lápiz para escribirle a alguien o crear un canal."
                        },
                        Modifier.padding(top = Space.XL),
                    )
                    else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
                        error?.let { msg ->
                            item {
                                Row(Modifier.fillMaxWidth().padding(start = Space.L), verticalAlignment = Alignment.CenterVertically) {
                                    Text(msg, color = ArtaColors.Danger, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                                    TextButton(onClick = { reloadTick++ }) { Text("Reintentar", color = ArtaColors.Gold) }
                                }
                            }
                        }
                        Section.entries.forEach { section ->
                            val rows = grouped[section].orEmpty()
                            if (rows.isEmpty()) return@forEach
                            val open = filtering || section.key !in collapsed
                            item(key = "h-" + section.key) {
                                SectionHeader(
                                    title = section.title,
                                    unread = rows.sumOf { if (it.muted) 0 else it.unreadCount },
                                    open = open,
                                ) { collapsed = if (section.key in collapsed) collapsed - section.key else collapsed + section.key }
                            }
                            if (open) {
                                items(rows, key = { it.id }) { c ->
                                    ChannelRow(c, online = c.peer?.id in online) { openChat(c.id) }
                                }
                            }
                        }
                    }
                }
            }
        }
        FloatingActionButton(
            onClick = { openChat(ChatRoutes.NEW) },
            containerColor = ArtaColors.Gold,
            contentColor = ArtaColors.Bg,
            modifier = Modifier.align(Alignment.BottomEnd).padding(Space.L + Space.XS),
        ) { Icon(Icons.Outlined.Edit, "Nueva conversación") }
    }
}

@Composable
private fun SectionHeader(title: String, unread: Int, open: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(start = Space.L, end = Space.L, top = Space.L, bottom = Space.XS),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Outlined.ExpandMore,
            if (open) "Contraer" else "Expandir",
            tint = ArtaColors.Muted,
            modifier = Modifier.size(18.dp).rotate(if (open) 0f else -90f),
        )
        Spacer(Modifier.width(Space.XS))
        Text(
            title,
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
        )
        if (!open && unread > 0) {
            Badge(containerColor = ArtaColors.Gold, contentColor = ArtaColors.Bg) { Text(if (unread > 99) "99+" else "$unread") }
        }
    }
}

@Composable
private fun ChannelRow(c: ChannelSummary, online: Boolean, onClick: () -> Unit) {
    val unread = c.unreadCount > 0
    val direct = c.kind == "DIRECT" || c.isGroupDm
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = Space.L, vertical = Space.S + 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ConversationAvatar(c.name, c.kind, c.isGroupDm, online = online, size = 44.dp)
        Spacer(Modifier.width(Space.M))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (c.kind == "PRIVATE" && !c.isGroupDm) Icon(Icons.Outlined.Lock, null, tint = ArtaColors.Muted, modifier = Modifier.size(14.dp).padding(end = 2.dp))
                if (c.postingRestricted) Icon(Icons.Outlined.Campaign, null, tint = ArtaColors.Muted, modifier = Modifier.size(16.dp).padding(end = 2.dp))
                Text(
                    if (direct) c.name else "#${c.name}",
                    fontWeight = if (unread && !c.muted) FontWeight.Bold else FontWeight.Medium,
                    color = if (c.muted && !unread) ArtaColors.Muted else ArtaColors.Text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    relativeTime(c.lastMessageAt),
                    color = if (unread && !c.muted) ArtaColors.Gold else ArtaColors.Muted,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    plainText(c.lastMessagePreview ?: c.topic ?: if (!c.isMember) "Toca para ver el canal" else ""),
                    color = if (unread && !c.muted) ArtaColors.Text else ArtaColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                if (c.muted) Icon(Icons.AutoMirrored.Outlined.VolumeOff, "Silenciado", tint = ArtaColors.Muted, modifier = Modifier.size(16.dp))
                if (unread) {
                    Spacer(Modifier.width(6.dp))
                    Badge(containerColor = if (c.muted) ArtaColors.Muted else ArtaColors.Gold, contentColor = ArtaColors.Bg) {
                        Text(if (c.unreadCount > 99) "99+" else "${c.unreadCount}")
                    }
                }
            }
        }
    }
    HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp, modifier = Modifier.padding(start = 72.dp))
}
