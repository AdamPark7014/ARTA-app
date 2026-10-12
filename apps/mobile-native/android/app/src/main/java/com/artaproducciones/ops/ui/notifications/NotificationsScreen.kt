package com.artaproducciones.ops.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsNone
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.fadingEdges
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.ActiveEntity
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.NotificationDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.ui.DeepLink
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.relativeTime
import com.artaproducciones.ops.ui.modules.EmptyState
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.ArtaType
import com.artaproducciones.ops.ui.theme.LocalActiveEntity
import com.artaproducciones.ops.ui.theme.TextButton
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
    val entity = LocalActiveEntity.current

    suspend fun load() {
        try {
            items = ApiClient.api.notifications(take = 60, entity = ActiveEntity.param)
            error = null
            onUnreadChange(items.count { it.readAt == null })
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    LaunchedEffect(tick, entity) { load() }
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
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 22.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Avisos", style = ArtaType.ScreenTitle, color = ArtaColors.Text, modifier = Modifier.weight(1f).semantics { heading() })
            if (items.any { it.readAt == null }) {
                TextButton(onClick = {
                    scope.launch {
                        // Solo la entidad activa: lo de la otra sigue sin leer hasta que se vea allá.
                        runCatching { ApiClient.api.notificationsReadAll(ActiveEntity.param) }
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
            val listState = rememberLazyListState()
            LazyColumn(
                Modifier.fillMaxSize().fadingEdges(listState, start = 16.dp, end = 28.dp),
                state = listState,
                contentPadding = PaddingValues(top = 4.dp, bottom = 32.dp),
            ) {
                error?.let { item { Text(it, color = ArtaColors.Danger, modifier = Modifier.padding(20.dp)) } }
                if (!loading && items.isEmpty() && error == null) {
                    item { EmptyState("No tienes avisos", "Aquí llegan las entregas, aprobaciones y menciones de tu equipo.", icon = Icons.Outlined.NotificationsNone) }
                }
                itemsIndexed(items, key = { _, n -> n.id }) { i, n -> NotificationRow(n, divider = i < items.lastIndex) { open(n) } }
            }
        }
    }
}

/**
 * Aviso: sin leer = título en SemiBold, punto de acento y un velo muy tenue; leído = plano.
 * La línea fina entre avisos empieza donde empieza el texto (no corta de orilla a orilla).
 */
@Composable
private fun NotificationRow(n: NotificationDto, divider: Boolean, onClick: () -> Unit) {
    val unread = n.readAt == null
    val t = LocalArtaTokens.current
    val veil = if (t.isDark) Color(0x0DC7CCD4) else Color(0x080C0C0D)
    Column(Modifier.fillMaxWidth().background(if (unread) veil else Color.Transparent)) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(start = 20.dp, end = 16.dp, top = 14.dp, bottom = 14.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Avatar(n.actor?.fullName ?: "ARTA", size = 40.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(n.title, color = ArtaColors.Text, fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal)
                n.body?.takeIf { it.isNotBlank() }?.let { Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium) }
                Text(relativeTime(n.createdAt), color = ArtaColors.Tertiary, style = ArtaType.Time)
            }
            Spacer(Modifier.width(8.dp))
            // Mismo ancho leído o no: el texto no brinca al marcarlo.
            Box(Modifier.padding(top = 7.dp).size(8.dp).background(if (unread) ArtaColors.Gold else Color.Transparent, CircleShape))
        }
        if (divider) HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp, modifier = Modifier.padding(start = 72.dp))
    }
}
