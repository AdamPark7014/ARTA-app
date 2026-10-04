package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.BookmarkRemove
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.SavedItem
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.relativeTime
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.launch

private const val PAGE = 50

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavedMessagesScreen(onBack: () -> Unit, openMessage: (channelId: String, messageId: String) -> Unit) {
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    var items by remember { mutableStateOf<List<SavedItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var hasMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load(reset: Boolean) {
        val before = if (reset) null else items.lastOrNull()?.savedAt
        try {
            val page = ApiClient.api.saved(limit = PAGE, before = before).items
            items = if (reset) page else items + page.filterNot { p -> items.any { it.message.id == p.message.id } }
            hasMore = page.size >= PAGE
            error = null
        } catch (e: Exception) {
            if (reset || items.isEmpty()) error = e.userMessage() else snackbar.showSnackbar(e.userMessage())
        } finally {
            loading = false
            loadingMore = false
        }
    }

    LaunchedEffect(Unit) { load(reset = true) }
    val nearEnd by remember { derivedStateOf { (listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= items.size - 5 } }
    LaunchedEffect(nearEnd, items.size) {
        if (nearEnd && hasMore && !loadingMore && items.isNotEmpty()) {
            loadingMore = true
            load(reset = false)
        }
    }

    fun unsave(item: SavedItem) {
        val index = items.indexOf(item)
        items = items - item
        scope.launch {
            runCatching { ApiClient.api.toggleSave(item.message.id) }
                .onFailure {
                    items = items.toMutableList().apply { add(index.coerceIn(0, size), item) }
                    snackbar.showSnackbar(it.userMessage())
                    return@launch
                }
            val res = snackbar.showSnackbar("Quitado de guardados", actionLabel = "Deshacer", withDismissAction = true)
            if (res == SnackbarResult.ActionPerformed) {
                runCatching { ApiClient.api.toggleSave(item.message.id) }
                    .onSuccess { items = items.toMutableList().apply { add(index.coerceIn(0, size), item) } }
            }
        }
    }

    Scaffold(
        containerColor = ArtaColors.Bg,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ArtaColors.BgElev),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Atrás") } },
                title = { Text("Guardados", fontWeight = FontWeight.SemiBold) },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = loading && items.isNotEmpty(),
            onRefresh = {
                loading = true
                scope.launch { load(reset = true) }
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            when {
                loading && items.isEmpty() -> ListSkeleton(6)
                error != null && items.isEmpty() -> ErrorState(error, onRetry = {
                    loading = true
                    error = null
                    scope.launch { load(reset = true) }
                })
                items.isEmpty() -> EmptyState(
                    Icons.Outlined.BookmarkBorder,
                    "Sin mensajes guardados",
                    "Mantén presionado un mensaje y elige «Guardar mensaje» para tenerlo a la mano aquí.",
                    Modifier.padding(top = Space.XL),
                )
                else -> LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(bottom = Space.XL)) {
                    items(items, key = { it.message.id }) { item ->
                        SavedRow(item, onOpen = { openMessage(item.message.channelId, item.message.parentId ?: item.message.id) }, onUnsave = { unsave(item) })
                    }
                }
            }
        }
    }
}

@Composable
private fun SavedRow(item: SavedItem, onOpen: () -> Unit, onUnsave: () -> Unit) {
    val m = item.message
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(start = Space.L, top = Space.M, bottom = Space.M),
        verticalAlignment = Alignment.Top,
    ) {
        Avatar(m.author.fullName, size = 40.dp)
        Spacer(Modifier.width(Space.M))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(m.author.fullName, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                Text(
                    " · " + relativeTime(m.createdAt),
                    color = ArtaColors.Muted,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            (item.channel ?: m.channel)?.let { c ->
                Text(channelLabel(c), color = ArtaColors.Gold, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            val body = when {
                m.deleted -> "Mensaje eliminado"
                m.body.isNotBlank() -> m.body
                else -> "📎 " + (m.attachment?.name ?: "Adjunto")
            }
            Text(
                remember(body) { inlineMarkdown(body) },
                style = MaterialTheme.typography.bodyMedium,
                color = if (m.deleted) ArtaColors.Muted else ArtaColors.Text,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        IconButton(onClick = onUnsave) { Icon(Icons.Outlined.BookmarkRemove, "Quitar de guardados", tint = ArtaColors.Muted) }
    }
    HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp, modifier = Modifier.padding(start = 68.dp))
}
