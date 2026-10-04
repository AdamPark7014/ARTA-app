package com.artaproducciones.ops.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.NotificationDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.ui.DeepLink
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.relativeTime
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.launch

/** Bandeja de avisos de todos los procesos (la campana del panel web). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(openLink: (DeepLink) -> Unit, onUnreadChange: (Int) -> Unit) {
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<NotificationDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }

    suspend fun load() {
        try {
            items = ApiClient.api.notifications(take = 60)
            error = null
            onUnreadChange(items.count { it.readAt == null })
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    LaunchedEffect(tick) { load() }
    LaunchedEffect(Unit) { RealtimeClient.notificationsUnread.collect { load() } }

    fun open(n: NotificationDto) {
        if (n.readAt == null) {
            items = items.map { if (it.id == n.id) it.copy(readAt = "now") else it }
            onUnreadChange(items.count { it.readAt == null })
            scope.launch { runCatching { ApiClient.api.notificationRead(n.id) } }
        }
        // Lo que no tiene pantalla nativa se abre en la vista web, dentro de la app.
        DeepLink.from(null, null, n.linkUrl, type = n.type)?.let(openLink)
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 20.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Avisos", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (items.any { it.readAt == null }) {
                TextButton(onClick = {
                    scope.launch {
                        runCatching { ApiClient.api.notificationsReadAll() }
                            .onSuccess {
                                items = items.map { it.copy(readAt = it.readAt ?: "now") }
                                onUnreadChange(0)
                            }
                            .onFailure { error = it.userMessage() }
                    }
                }) { Text("Marcar todo leído") }
            }
        }
        PullToRefreshBox(
            isRefreshing = loading,
            onRefresh = {
                loading = true
                tick++
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                error?.let { item { Text(it, color = ArtaColors.Danger, modifier = Modifier.padding(20.dp)) } }
                if (!loading && items.isEmpty() && error == null) {
                    item { Text("No tienes avisos.", color = ArtaColors.Muted, modifier = Modifier.padding(20.dp)) }
                }
                items(items, key = { it.id }) { n -> NotificationRow(n) { open(n) } }
            }
        }
    }
}

@Composable
private fun NotificationRow(n: NotificationDto, onClick: () -> Unit) {
    val unread = n.readAt == null
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (unread) ArtaColors.GoldSoft.copy(alpha = 0.08f) else ArtaColors.Bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Avatar(n.actor?.fullName ?: "ARTA", size = 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(n.title, fontWeight = if (unread) FontWeight.Bold else FontWeight.Normal)
            n.body?.takeIf { it.isNotBlank() }?.let { Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium) }
            Text(relativeTime(n.createdAt), color = ArtaColors.Muted, style = MaterialTheme.typography.labelSmall)
        }
        if (unread) Box(Modifier.padding(top = 6.dp).size(10.dp).background(ArtaColors.Gold, CircleShape))
    }
    HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp)
}
