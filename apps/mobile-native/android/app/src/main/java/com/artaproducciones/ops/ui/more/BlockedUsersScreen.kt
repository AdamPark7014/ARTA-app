package com.artaproducciones.ops.ui.more

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.BlockedUser
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.data.realtime.ChatBlocks
import com.artaproducciones.ops.ui.chat.EmptyState
import com.artaproducciones.ops.ui.chat.ErrorState
import com.artaproducciones.ops.ui.chat.ListSkeleton
import com.artaproducciones.ops.ui.chat.ModerationText
import com.artaproducciones.ops.ui.chat.Space
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.parseInstant
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val BLOCKED_DATE = DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", Locale.forLanguageTag("es-MX"))

/** «Más › Usuarios bloqueados»: `GET /chat/blocks` con «Desbloquear» por persona. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BlockedUsersScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val users by ChatBlocks.users.collectAsState()
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val busy = remember { mutableStateListOf<String>() }

    suspend fun load() {
        ChatBlocks.refresh()
            .onSuccess { error = null }
            .onFailure { e ->
                // Con la lista ya cargada antes, se queda a la vista y solo se avisa.
                if (ChatBlocks.users.value.isEmpty()) error = e.userMessage() else snackbar.showSnackbar(e.userMessage())
            }
        loading = false
    }

    LaunchedEffect(Unit) { load() }

    fun unblock(u: BlockedUser) {
        if (u.id in busy) return
        busy.add(u.id)
        scope.launch {
            runCatching { ChatBlocks.unblock(u.id) }
                .onSuccess { snackbar.showSnackbar(ModerationText.unblocked(displayName(u))) }
                .onFailure { snackbar.showSnackbar(it.userMessage()) }
            busy.remove(u.id)
        }
    }

    Scaffold(
        containerColor = ArtaColors.Bg,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ArtaColors.BgElev),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Atrás") } },
                title = { Text(ModerationText.BLOCKED_USERS, fontWeight = FontWeight.SemiBold) },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = loading && users.isNotEmpty(),
            onRefresh = {
                loading = true
                scope.launch { load() }
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            when {
                loading && users.isEmpty() -> ListSkeleton(4)
                error != null && users.isEmpty() -> ErrorState(error, onRetry = {
                    loading = true
                    error = null
                    scope.launch { load() }
                })
                users.isEmpty() -> EmptyState(
                    Icons.Outlined.Block,
                    "No has bloqueado a nadie",
                    "Para bloquear a alguien, mantén presionado uno de sus mensajes en el chat.",
                    Modifier.padding(top = Space.XL),
                )
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Space.XL)) {
                    item(key = "hint") {
                        Text(
                            "No ves sus mensajes y no pueden escribirte por mensaje directo.",
                            color = ArtaColors.Muted,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(horizontal = Space.L, vertical = Space.M),
                        )
                    }
                    items(users, key = { it.id }) { u ->
                        BlockedRow(u, busy = u.id in busy, onUnblock = { unblock(u) })
                    }
                }
            }
        }
    }
}

private fun displayName(u: BlockedUser): String = u.name.ifBlank { "Usuario" }

@Composable
private fun BlockedRow(u: BlockedUser, busy: Boolean, onUnblock: () -> Unit) {
    val since = remember(u.blockedAt) {
        parseInstant(u.blockedAt)?.let { "Bloqueado el " + BLOCKED_DATE.format(it.atZone(ZoneId.systemDefault())) }
    }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Space.L, vertical = Space.M),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(displayName(u), size = 44.dp)
        Spacer(Modifier.width(Space.M))
        Column(Modifier.weight(1f)) {
            Text(displayName(u), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            since?.let { Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1) }
        }
        Spacer(Modifier.width(Space.S))
        OutlinedButton(
            onClick = onUnblock,
            enabled = !busy,
            border = BorderStroke(1.dp, if (busy) ArtaColors.Line else ArtaColors.Gold),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = ArtaColors.Gold),
        ) {
            if (busy) {
                CircularProgressIndicator(Modifier.size(16.dp), color = ArtaColors.Gold, strokeWidth = 2.dp)
            } else {
                Text(ModerationText.UNBLOCK)
            }
        }
    }
    HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp, modifier = Modifier.padding(start = 72.dp))
}
