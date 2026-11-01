package com.artaproducciones.ops.ui.notifications

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListLayoutInfo
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import com.artaproducciones.ops.data.ActiveEntity
import com.artaproducciones.ops.data.NoticeChannel
import com.artaproducciones.ops.data.NoticeFeed
import com.artaproducciones.ops.data.NoticeFilter
import com.artaproducciones.ops.data.NoticeKinds
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.NotificationDto
import com.artaproducciones.ops.data.api.NotificationsSeenBody
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.ui.DeepLink
import com.artaproducciones.ops.ui.chat.ListSkeleton
import com.artaproducciones.ops.ui.modules.EmptyState
import com.artaproducciones.ops.ui.modules.ErrorState
import com.artaproducciones.ops.ui.modules.InlineError
import com.artaproducciones.ops.ui.modules.ListPhase
import com.artaproducciones.ops.ui.modules.ModulesStore
import com.artaproducciones.ops.ui.modules.PhaseSwap
import com.artaproducciones.ops.ui.modules.SectionTitle
import com.artaproducciones.ops.ui.modules.listPhase
import com.artaproducciones.ops.ui.modules.rememberHaptics
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.ArtaType
import com.artaproducciones.ops.ui.theme.LocalActiveEntity
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.QuietCount
import com.artaproducciones.ops.ui.theme.SegmentedControl
import com.artaproducciones.ops.ui.theme.TextButton
import com.artaproducciones.ops.ui.theme.fadingEdges
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Escrituras que no se cortan al salir de la pantalla: tocar un aviso marca leído y navega, y el
 * alcance de la pantalla se cancela con la navegación (la petición podía no llegar a salir).
 */
internal val noticeScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

private const val MINUTE_MS = 60_000L
internal const val REALTIME_DEBOUNCE_MS = 250L

/** Filas antes del final en las que se pide la página siguiente. */
private const val LOAD_MORE_MARGIN = 4

/** Lo que pasa de largo al deslizar no se vio: la lista tiene que quedarse quieta este rato. */
private const val SEEN_SETTLE_MS = 500L

/**
 * Avisos de todos los procesos (la campana del panel web): por día, con filtro arriba, deslizar para
 * marcar leído y más al llegar abajo. La caché de [ModulesStore] evita el esqueleto al volver.
 * [showSent]: una liga pidió la pestaña Enviados.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    openLink: (DeepLink) -> Unit,
    onUnreadChange: (Int) -> Unit,
    openPrefs: () -> Unit,
    showSent: Boolean = false,
    onSentShown: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    val entity = LocalActiveEntity.current
    val snackbar = remember { SnackbarHostState() }
    var filter by rememberSaveable { mutableStateOf(if (showSent) NoticeFilter.SENT else NoticeFilter.ALL) }
    var feeds by remember(entity) { mutableStateOf(ModulesStore.noticeFeeds.toMap()) }
    var unreadTotal by remember(entity) { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }
    var loadingMore by remember { mutableStateOf(false) }
    var moreFailed by remember { mutableStateOf(false) }
    // «hace 5 min» sigue siendo cierto aunque la pantalla se quede abierta.
    val now by produceState(Instant.now()) {
        while (true) {
            delay(MINUTE_MS)
            value = Instant.now()
        }
    }

    LaunchedEffect(showSent) {
        if (showSent) {
            filter = NoticeFilter.SENT
            onSentShown()
        }
    }

    val unreadOnly = filter.unreadOnly
    val feed = feeds[unreadOnly]

    fun setFeed(query: Boolean, value: NoticeFeed) {
        ModulesStore.noticeFeeds[query] = value
        feeds = ModulesStore.noticeFeeds.toMap()
    }

    fun setUnreadTotal(value: Int) {
        unreadTotal = value.coerceAtLeast(0)
        onUnreadChange(unreadTotal)
    }

    suspend fun fetchFirst(query: Boolean) {
        val page = ApiClient.api.notifications(
            take = NoticeKinds.PAGE_SIZE,
            entity = ActiveEntity.param,
            unread = if (query) "1" else null,
        )
        setFeed(query, (feeds[query] ?: NoticeFeed()).withFirstPage(page, NoticeKinds.PAGE_SIZE))
    }

    suspend fun refreshUnreadTotal() {
        runCatching { ApiClient.api.notificationsUnread(ActiveEntity.param).count }.onSuccess { setUnreadTotal(it) }
    }

    LaunchedEffect(tick, unreadOnly, entity) {
        try {
            fetchFirst(unreadOnly)
            error = null
            moreFailed = false
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            refreshing = false
        }
        refreshUnreadTotal()
    }

    // Llegó un aviso o se actualizó una tarjeta: arriba de cada lista ya cargada.
    LaunchedEffect(entity) {
        RealtimeClient.notificationsUnread.collectLatest {
            delay(REALTIME_DEBOUNCE_MS)
            ModulesStore.noticeFeeds.keys.toList().forEach { query -> runCatching { fetchFirst(query) } }
            refreshUnreadTotal()
        }
    }

    // Leído en otro dispositivo (o con «Marcar como leído» del push).
    LaunchedEffect(entity) {
        RealtimeClient.notificationRead.collect { id ->
            if (id == null) {
                tick++
            } else {
                val at = Instant.now().toString()
                ModulesStore.noticeFeeds.keys.toList().forEach { query -> feeds[query]?.let { setFeed(query, it.read(id, at)) } }
                refreshUnreadTotal()
            }
        }
    }

    fun markRead(n: NotificationDto, undoOnFailure: Boolean) {
        if (n.readAt != null) return
        val at = Instant.now().toString()
        ModulesStore.noticeFeeds.keys.toList().forEach { query -> feeds[query]?.let { setFeed(query, it.read(n.id, at)) } }
        setUnreadTotal(unreadTotal - 1)
        noticeScope.launch {
            try {
                ApiClient.api.notificationRead(n.id)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (undoOnFailure) {
                    ModulesStore.noticeFeeds.keys.toList().forEach { query -> feeds[query]?.let { setFeed(query, it.unread(n.id)) } }
                    setUnreadTotal(unreadTotal + 1)
                    haptics.reject()
                    scope.launch { snackbar.showSnackbar(e.userMessage()) }
                }
            }
        }
    }

    fun open(n: NotificationDto) {
        markRead(n, undoOnFailure = false)
        // Lo que no tiene pantalla nativa se abre en la vista web, dentro de la app.
        DeepLink.from(null, null, n.linkUrl, type = n.type)?.let(openLink)
    }

    fun markAll() {
        val before = feeds
        val previousTotal = unreadTotal
        val at = Instant.now().toString()
        before.forEach { (query, value) -> setFeed(query, value.read(null, at)) }
        setUnreadTotal(0)
        haptics.confirm()
        noticeScope.launch {
            try {
                // Solo la entidad activa: lo de la otra sigue sin leer hasta que se vea allá.
                ApiClient.api.notificationsReadAll(ActiveEntity.param)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                before.forEach { (query, value) -> setFeed(query, value) }
                setUnreadTotal(previousTotal)
                haptics.reject()
                scope.launch { snackbar.showSnackbar(e.userMessage()) }
            }
        }
    }

    fun loadMore() {
        val current = feeds[unreadOnly] ?: return
        val cursor = current.items.lastOrNull()?.createdAt ?: return
        // En Enviados esta lista no está en pantalla: parecería que ya se llegó abajo.
        if (filter == NoticeFilter.SENT || loadingMore || moreFailed || !current.hasMore) return
        val query = unreadOnly
        val forEntity = entity
        loadingMore = true
        scope.launch {
            try {
                val page = ApiClient.api.notifications(
                    take = NoticeKinds.PAGE_SIZE,
                    entity = ActiveEntity.param,
                    before = cursor,
                    unread = if (query) "1" else null,
                )
                // Cambió de entidad mientras llegaba: esta página ya no es de la lista que se ve.
                if (ActiveEntity.current == forEntity) setFeed(query, (feeds[query] ?: current).withNextPage(page, NoticeKinds.PAGE_SIZE))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                moreFailed = true
            } finally {
                loadingMore = false
            }
        }
    }

    val shown = remember(feed, filter) { feed?.items.orEmpty().filter(filter::matches) }
    val groups = remember(shown, now) { NoticeKinds.group(shown, { it.createdAt }, now) }
    val listState = rememberLazyListState()

    // Otro filtro es otra lista: empieza arriba. Al volver a la pestaña, en cambio, sigue donde iba.
    var listedFilter by rememberSaveable { mutableStateOf(filter) }
    LaunchedEffect(filter) {
        // Enviados tiene su propia lista; esta sigue donde iba y no se mueve fuera de pantalla.
        if (filter != NoticeFilter.SENT && listedFilter != filter) {
            listedFilter = filter
            listState.scrollToItem(0)
        }
    }

    // Lo que está a la vista ya se vio (docs/AVISOS.md › Acuse de visto). Con la app en segundo plano
    // o con otra pantalla encima baja de RESUMED; el push, el globo y traer la lista no pasan por aquí.
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val inFront = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    val shownById = remember(shown) { shown.associateBy { it.id } }
    LaunchedEffect(listState, shownById, filter, inFront, tick) {
        if (!inFront || filter == NoticeFilter.SENT) return@LaunchedEffect
        snapshotFlow { noticesOnScreen(listState.layoutInfo, shownById) }
            .distinctUntilChanged()
            .collectLatest { onScreen ->
                delay(SEEN_SETTLE_MS)
                reportSeen(onScreen)
            }
    }

    // Al llegar abajo, la página siguiente. También sirve con listas cortas: «Por atender» filtra lo
    // que llega, así que se sigue pidiendo hasta llenar la pantalla o acabarse los avisos.
    LaunchedEffect(listState, feed?.items?.size, feed?.hasMore, filter, moreFailed, loadingMore) {
        snapshotFlow {
            val info = listState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) >= info.totalItemsCount - LOAD_MORE_MARGIN
        }.filter { it }.collect { loadMore() }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(
                // El título a la misma altura que en Tareas y Chats, aunque aquí lleve botones al lado.
                Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 16.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Avisos", style = ArtaType.ScreenTitle, color = ArtaColors.Text, modifier = Modifier.weight(1f).semantics { heading() })
                if (unreadTotal > 0 && filter != NoticeFilter.SENT) {
                    IconButton(onClick = ::markAll) { Icon(Icons.Outlined.DoneAll, contentDescription = "Marcar todo leído") }
                }
                IconButton(onClick = openPrefs) { Icon(Icons.Outlined.Tune, contentDescription = "Preferencias de avisos") }
            }
            // Con la letra del sistema agrandada el contador ya no cabe sin cortar «Sin leer».
            val roomForCount = LocalDensity.current.fontScale <= 1.05f
            val filterLabels = NoticeFilter.entries.map {
                if (it == NoticeFilter.UNREAD && roomForCount && unreadTotal in 1..99) "${it.label} · $unreadTotal" else it.label
            }
            SegmentedControl(
                options = filterLabels,
                selected = filter.ordinal,
                onSelect = { filter = NoticeFilter.entries[it] },
                // «Por atender» no cabe en una cuarta parte de un teléfono de 360 dp.
                weights = filterLabels.map { it.length + 4f },
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 8.dp),
            )
            if (filter == NoticeFilter.SENT) {
                SentNotices(now = now, openLink = openLink)
            } else {
                PullToRefreshBox(
                    isRefreshing = refreshing,
                    onRefresh = {
                        refreshing = true
                        tick++
                    },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    PhaseSwap(listPhase(feed != null, error)) { phase ->
                        when (phase) {
                            ListPhase.Error -> ErrorState(error.orEmpty(), onRetry = { tick++ })
                            ListPhase.Loading -> ListSkeleton(8)
                            ListPhase.Ready -> LazyColumn(
                                Modifier.fillMaxSize().fadingEdges(listState, start = 16.dp, end = 28.dp),
                                state = listState,
                                contentPadding = PaddingValues(top = 2.dp, bottom = 32.dp),
                            ) {
                                error?.let { msg -> item(key = "error") { InlineError(msg) { tick++ } } }
                                if (shown.isEmpty() && feed?.hasMore != true) {
                                    item(key = "empty") { NoticesEmpty(filter, Modifier.animateItem()) }
                                }
                                groups.forEach { group ->
                                    item(key = "h-${group.day.name}", contentType = "header") {
                                        SectionTitle(group.day.label, Modifier.animateItem())
                                    }
                                    items(group.items, key = { it.id }, contentType = { "notice" }) { n ->
                                        NoticeRow(
                                            n = n,
                                            now = now,
                                            divider = n !== group.items.last(),
                                            modifier = Modifier.animateItem(),
                                            onOpen = { open(n) },
                                            onMarkRead = { markRead(n, undoOnFailure = true) },
                                        )
                                    }
                                }
                                if (feed?.hasMore == true) {
                                    item(key = "more", contentType = "more") {
                                        LoadMoreFooter(failed = moreFailed, onRetry = { moreFailed = false })
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
    }
}

/** Las filas de avisos que se alcanzan a ver; los títulos de día y el pie no cuentan. */
private fun noticesOnScreen(info: LazyListLayoutInfo, shown: Map<String, NotificationDto>): List<NotificationDto> =
    info.visibleItemsInfo
        .filter { NoticeKinds.isOnScreen(it.offset, it.size, info.viewportStartOffset, info.viewportEndOffset) }
        .mapNotNull { item -> (item.key as? String)?.let { shown[it] } }

/**
 * Manda lo que falta de [onScreen]. Un error aquí nunca se enseña (el API viejo no tiene esta ruta):
 * se olvidan esos ids para reintentar la próxima vez que estén a la vista.
 */
private fun reportSeen(onScreen: List<NotificationDto>) {
    val reported = ModulesStore.noticesReportedSeen
    NoticeKinds.seenBatches(onScreen, reported).forEach { ids ->
        reported += ids
        noticeScope.launch {
            try {
                ApiClient.api.notificationsSeen(NotificationsSeenBody(ids))
            } catch (e: Exception) {
                reported -= ids.toSet()
                if (e is CancellationException) throw e
            }
        }
    }
}

@Composable
private fun NoticesEmpty(filter: NoticeFilter, modifier: Modifier = Modifier) {
    when (filter) {
        // En Enviados esta lista no se pinta: tiene su propio vacío (SentNotices).
        NoticeFilter.SENT -> Unit
        NoticeFilter.ALL -> EmptyState(
            "No tienes avisos",
            "Aquí llegan las entregas, aprobaciones y menciones de tu equipo.",
            icon = Icons.Outlined.NotificationsNone,
            modifier = modifier,
        )
        NoticeFilter.UNREAD -> EmptyState("Todo leído", "No tienes avisos pendientes de leer.", icon = Icons.Outlined.DoneAll, modifier = modifier)
        NoticeFilter.ACTION -> EmptyState(
            "Nada por atender",
            "Cuando algo espere tu visto bueno o tu respuesta aparecerá aquí.",
            icon = Icons.Outlined.TaskAlt,
            modifier = modifier,
        )
    }
}

@Composable
private fun LoadMoreFooter(failed: Boolean, onRetry: () -> Unit) {
    Box(Modifier.fillMaxWidth().heightIn(min = 56.dp), contentAlignment = Alignment.Center) {
        if (failed) {
            TextButton(onClick = onRetry) { Text("No se pudieron cargar más. Reintentar") }
        } else {
            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = ArtaColors.Muted)
        }
    }
}

/** Ícono de línea de cada categoría (los mismos que el menú de la web). */
internal fun NoticeChannel.icon(): ImageVector = when (this) {
    NoticeChannel.CHAT -> Icons.Outlined.ChatBubbleOutline
    NoticeChannel.APPROVALS -> Icons.Outlined.TaskAlt
    NoticeChannel.TASKS -> Icons.Outlined.Checklist
    NoticeChannel.FINANCE -> Icons.Outlined.Payments
    NoticeChannel.EVENTS -> Icons.Outlined.Event
    NoticeChannel.DOCUMENTS -> Icons.Outlined.Description
    NoticeChannel.GENERAL -> Icons.Outlined.NotificationsNone
}

/**
 * Relleno = espera algo de quien lo lee; contorno = para enterarse (SISTEMA-VISUAL.md › Principios).
 * Círculo en ARTA y cuadrado de 4 dp en Auditorio: es el radio de control de cada entidad.
 */
@Composable
internal fun NoticeIcon(channel: NoticeChannel, action: Boolean, modifier: Modifier = Modifier, icon: ImageVector = channel.icon()) {
    val t = LocalArtaTokens.current
    val shape = t.controlShape
    val paint = if (action) Modifier.background(t.accentBrush, shape) else Modifier.border(1.dp, t.lineStrong, shape)
    Box(modifier.size(40.dp).clip(shape).then(paint), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = if (action) t.onAccent else t.secondary, modifier = Modifier.size(19.dp))
    }
}

/**
 * Sin leer: título en SemiBold, velo muy tenue y punto de acento. Se desliza a cualquier lado para
 * marcarlo leído: la fila vuelve a su lugar (en «Sin leer» y «Por atender» se va de la lista).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NoticeRow(
    n: NotificationDto,
    now: Instant,
    divider: Boolean,
    onOpen: () -> Unit,
    onMarkRead: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalArtaTokens.current
    val haptics = rememberHaptics()
    val unread = n.readAt == null
    val channel = remember(n.type) { NoticeKinds.channelOf(n.type) }
    // El estado del deslizamiento vive más que esta composición: siempre lo último.
    val latestUnread by rememberUpdatedState(unread)
    val latestMark by rememberUpdatedState(onMarkRead)
    val swipe = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value != SwipeToDismissBoxValue.Settled && latestUnread) {
                haptics.confirm()
                latestMark()
            }
            false
        },
        positionalThreshold = { distance -> distance * 0.32f },
    )
    val swiping = swipe.dismissDirection != SwipeToDismissBoxValue.Settled
    val veil = if (t.isDark) Color(0x0DC7CCD4) else Color(0x080C0C0D)
    val tint by animateColorAsState(if (unread) veil else Color.Transparent, tween(240), label = "noticeVeil")
    val dotAlpha by animateFloatAsState(if (unread) 1f else 0f, tween(200), label = "noticeDot")

    SwipeToDismissBox(
        state = swipe,
        modifier = modifier,
        enableDismissFromStartToEnd = unread,
        enableDismissFromEndToStart = unread,
        backgroundContent = {
            if (swiping) {
                val armed = swipe.targetValue != SwipeToDismissBoxValue.Settled
                val grow by animateFloatAsState(if (armed) 1.15f else 1f, tween(140), label = "noticeSwipe")
                val toStart = swipe.dismissDirection == SwipeToDismissBoxValue.EndToStart
                Row(
                    Modifier.fillMaxSize().background(t.fill).padding(horizontal = 24.dp),
                    horizontalArrangement = if (toStart) Arrangement.End else Arrangement.Start,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.DoneAll, contentDescription = null, tint = t.text, modifier = Modifier.size(20.dp).scale(grow))
                    Spacer(Modifier.width(8.dp))
                    Text("Leído", style = MaterialTheme.typography.labelLarge, color = t.text)
                }
            }
        },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                // Encima del fondo de la acción solo mientras se desliza: quieta deja ver el reflector.
                .background(if (swiping) t.bg else Color.Transparent)
                .background(tint)
                .semantics {
                    if (unread) customActions = listOf(CustomAccessibilityAction("Marcar como leído") { onMarkRead(); true })
                },
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(onClickLabel = "Abrir aviso", onClick = onOpen)
                    .padding(start = 20.dp, end = 16.dp, top = 14.dp, bottom = 14.dp),
                verticalAlignment = Alignment.Top,
            ) {
                NoticeIcon(
                    channel,
                    action = NoticeKinds.needsAction(n.type),
                    icon = if (NoticeKinds.isSeenReceipt(n.type)) Icons.Outlined.Visibility else channel.icon(),
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        n.title,
                        style = ArtaType.PanelTitle.copy(fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Medium),
                        color = ArtaColors.Text,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    n.body?.takeIf { it.isNotBlank() }?.let {
                        Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                    Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${channel.label} · ${NoticeKinds.age(n.createdAt, now)}",
                            color = ArtaColors.Tertiary,
                            style = ArtaType.Time,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (n.bundleCount > 1) {
                            Spacer(Modifier.width(8.dp))
                            QuietCount(n.bundleCount)
                        }
                    }
                }
                Spacer(Modifier.width(8.dp))
                // Mismo ancho leído o no: el texto no brinca al marcarlo.
                Box(Modifier.padding(top = 7.dp).size(8.dp).alpha(dotAlpha).background(t.accent, CircleShape))
            }
            if (divider) HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp, modifier = Modifier.padding(start = 72.dp))
        }
    }
}
