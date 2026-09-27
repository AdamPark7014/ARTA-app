package com.artaproducciones.ops.ui.chat

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.VolumeOff
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChannelSummary
import com.artaproducciones.ops.data.api.Colleague
import com.artaproducciones.ops.data.api.DirectBody
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.plainText
import com.artaproducciones.ops.ui.common.relativeTime
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch

private enum class ChatFilter(val label: String) { Todos("Todos"), NoLeidos("No leídos"), Directos("Directos"), Canales("Canales") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatListScreen(openChat: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var channels by remember { mutableStateOf<List<ChannelSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(ChatFilter.Todos) }
    var picking by remember { mutableStateOf(false) }
    var reloadTick by remember { mutableStateOf(0) }

    suspend fun load() {
        try {
            channels = ApiClient.api.channels()
            error = null
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    LaunchedEffect(reloadTick) { load() }
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

    val visible = channels.filter { c ->
        val matchesQuery = query.isBlank() || c.name.contains(query, ignoreCase = true) ||
            (c.lastMessagePreview?.contains(query, ignoreCase = true) == true)
        val matchesFilter = when (filter) {
            ChatFilter.Todos -> true
            ChatFilter.NoLeidos -> c.unreadCount > 0
            ChatFilter.Directos -> c.kind == "DIRECT"
            ChatFilter.Canales -> c.kind != "DIRECT"
        }
        matchesQuery && matchesFilter
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Text(
                "Chats",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 8.dp),
            )
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Buscar") },
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                singleLine = true,
                shape = CircleShape,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            )
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(ChatFilter.entries) { f ->
                    FilterChip(
                        selected = filter == f,
                        onClick = { filter = f },
                        label = { Text(f.label) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = ArtaColors.GoldSoft,
                            selectedLabelColor = ArtaColors.Gold,
                        ),
                    )
                }
            }
            PullToRefreshBox(
                isRefreshing = loading,
                onRefresh = {
                    loading = true
                    reloadTick++
                },
                modifier = Modifier.fillMaxSize(),
            ) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
                    error?.let { msg ->
                        item { Text(msg, color = ArtaColors.Danger, modifier = Modifier.padding(20.dp)) }
                    }
                    if (!loading && visible.isEmpty() && error == null) {
                        item {
                            Text(
                                if (query.isBlank()) "Aún no hay conversaciones." else "Nada coincide con «$query».",
                                color = ArtaColors.Muted,
                                modifier = Modifier.padding(20.dp),
                            )
                        }
                    }
                    items(visible, key = { it.id }) { c -> ChannelRow(c) { openChat(c.id) } }
                }
            }
        }
        FloatingActionButton(
            onClick = { picking = true },
            containerColor = ArtaColors.Gold,
            contentColor = ArtaColors.Bg,
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp),
        ) { Icon(Icons.Outlined.Edit, "Nuevo mensaje") }
    }

    if (picking) {
        NewMessageSheet(
            onDismiss = { picking = false },
            onPick = { person ->
                scope.launch {
                    runCatching { ApiClient.api.openDirect(DirectBody(person.id)) }
                        .onSuccess {
                            picking = false
                            openChat(it.id)
                        }
                        .onFailure { error = it.userMessage() }
                }
            },
        )
    }
}

@Composable
private fun ChannelRow(c: ChannelSummary, onClick: () -> Unit) {
    val unread = c.unreadCount > 0
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(c.name, channel = c.kind != "DIRECT")
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (c.kind == "PRIVATE") Icon(Icons.Outlined.Lock, null, tint = ArtaColors.Muted, modifier = Modifier.size(14.dp).padding(end = 2.dp))
                if (c.postingRestricted) Icon(Icons.Outlined.Campaign, null, tint = ArtaColors.Muted, modifier = Modifier.size(16.dp).padding(end = 2.dp))
                Text(
                    if (c.kind == "DIRECT") c.name else "#${c.name}",
                    fontWeight = if (unread) FontWeight.Bold else FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    relativeTime(c.lastMessageAt),
                    color = if (unread) ArtaColors.Gold else ArtaColors.Muted,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    plainText(c.lastMessagePreview ?: c.topic ?: ""),
                    color = ArtaColors.Muted,
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewMessageSheet(onDismiss: () -> Unit, onPick: (Colleague) -> Unit) {
    var query by remember { mutableStateOf("") }
    var people by remember { mutableStateOf<List<Colleague>>(emptyList()) }
    LaunchedEffect(query) {
        delay(250)
        people = runCatching { ApiClient.api.colleagues(query.ifBlank { null }) }.getOrDefault(people)
    }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = ArtaColors.BgElev) {
        Column(Modifier.fillMaxWidth().height(520.dp)) {
            Text("Nuevo mensaje", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 20.dp))
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Buscar persona") },
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            )
            LazyColumn {
                items(people, key = { it.id }) { p ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onPick(p) }.padding(horizontal = 20.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar(p.fullName, size = 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(p.fullName, fontWeight = FontWeight.Medium)
                            (p.title ?: p.email)?.let { Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                }
            }
        }
    }
}
