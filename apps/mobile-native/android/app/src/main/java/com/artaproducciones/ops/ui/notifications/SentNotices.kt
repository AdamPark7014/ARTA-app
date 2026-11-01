package com.artaproducciones.ops.ui.notifications

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import com.artaproducciones.ops.data.ActiveEntity
import com.artaproducciones.ops.data.NoticeKinds
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.SentNoticeDto
import com.artaproducciones.ops.data.api.SentRecipientDto
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.ui.DeepLink
import com.artaproducciones.ops.ui.chat.ListSkeleton
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.modules.EmptyState
import com.artaproducciones.ops.ui.modules.ListPhase
import com.artaproducciones.ops.ui.modules.ModulesStore
import com.artaproducciones.ops.ui.modules.PhaseSwap
import com.artaproducciones.ops.ui.modules.listPhase
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.ArtaType
import com.artaproducciones.ops.ui.theme.LocalActiveEntity
import com.artaproducciones.ops.ui.theme.StatusPill
import com.artaproducciones.ops.ui.theme.Tone
import com.artaproducciones.ops.ui.theme.fadingEdges
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import java.time.Instant

/**
 * Avisos › Enviados: lo que mandé y quién ya lo vio (docs/AVISOS.md › Acuse de visto). Abrirla no marca
 * nada como visto. Si el API todavía no tiene esta ruta se queda en el vacío, nunca en un error rojo.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SentNotices(now: Instant, openLink: (DeepLink) -> Unit) {
    val entity = LocalActiveEntity.current
    var rows by remember(entity) { mutableStateOf(ModulesStore.sentNotices) }
    var refreshing by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val inFront = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    val listState = rememberLazyListState()

    suspend fun fetch() {
        val next = try {
            ApiClient.api.notificationsSent(ActiveEntity.param)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Lo que ya se veía se queda; sin nada, el vacío.
            rows ?: emptyList()
        }
        ModulesStore.sentNotices = next
        rows = next
    }

    // Al abrirla, al tirar hacia abajo y al volver a la app: el socket no repite lo que se perdió.
    LaunchedEffect(tick, entity, inFront) {
        if (!inFront) return@LaunchedEffect
        try {
            fetch()
        } finally {
            refreshing = false
        }
    }

    // Alguien acaba de ver algo mío: la fila cambia sola.
    LaunchedEffect(entity) {
        RealtimeClient.notificationSeen.collectLatest {
            delay(REALTIME_DEBOUNCE_MS)
            fetch()
        }
    }

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = {
            refreshing = true
            tick++
        },
        modifier = Modifier.fillMaxSize(),
    ) {
        PhaseSwap(listPhase(rows != null, null)) { phase ->
            when (phase) {
                ListPhase.Error, ListPhase.Loading -> ListSkeleton(8)
                ListPhase.Ready -> rows?.let { sent ->
                    LazyColumn(
                        Modifier.fillMaxSize().fadingEdges(listState, start = 16.dp, end = 28.dp),
                        state = listState,
                        contentPadding = PaddingValues(top = 2.dp, bottom = 32.dp),
                    ) {
                        if (sent.isEmpty()) {
                            item(key = "empty") {
                                EmptyState(
                                    "Todavía no mandas nada",
                                    "Cuando asignes una tarea, arrobes a alguien o pidas una autorización, aquí verás si ya lo vio.",
                                    icon = Icons.Outlined.Visibility,
                                )
                            }
                        } else {
                            item(key = "help") {
                                Text(
                                    "Visto: abrió sus avisos con ese aviso a la vista. No quiere decir que ya lo resolvió.",
                                    color = ArtaColors.Tertiary,
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 2.dp),
                                )
                            }
                            itemsIndexed(sent, contentType = { _, _ -> "sent" }) { index, row ->
                                SentRow(row, now, divider = index < sent.lastIndex, openLink = openLink)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Título (abre lo mismo que el aviso), estado en contorno porque solo informa, y cada persona debajo. */
@Composable
private fun SentRow(row: SentNoticeDto, now: Instant, divider: Boolean, openLink: (DeepLink) -> Unit) {
    val link = remember(row.linkUrl, row.type) { DeepLink.from(null, null, row.linkUrl, type = row.type) }
    val waiting = row.recipients.any { !NoticeKinds.wasSeen(it) }
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(enabled = link != null, onClickLabel = "Abrir aviso") { link?.let(openLink) }
                .padding(start = 20.dp, end = 16.dp, top = 14.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                row.title,
                style = ArtaType.PanelTitle,
                color = ArtaColors.Text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            StatusPill(NoticeKinds.sentSummary(row.recipients), tone = if (waiting) Tone.Strong else Tone.Info)
        }
        Column(Modifier.padding(start = 20.dp, end = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            row.recipients.forEach { RecipientRow(it, now) }
        }
        Text(
            NoticeKinds.sentAge(row.createdAt, now),
            color = ArtaColors.Tertiary,
            style = ArtaType.Time,
            modifier = Modifier.padding(start = 20.dp, end = 16.dp, top = 8.dp, bottom = 14.dp),
        )
        if (divider) HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp, modifier = Modifier.padding(start = 20.dp))
    }
}

/** Quien falta por ver es lo que importa: «Sin ver» va en el color del texto. */
@Composable
private fun RecipientRow(recipient: SentRecipientDto, now: Instant) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Avatar(recipient.fullName, size = 24.dp)
        Spacer(Modifier.width(10.dp))
        Text(
            recipient.fullName,
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            NoticeKinds.recipientStatus(recipient, now),
            color = if (NoticeKinds.wasSeen(recipient)) ArtaColors.Tertiary else ArtaColors.Text,
            style = ArtaType.Time,
            maxLines = 1,
        )
    }
}
