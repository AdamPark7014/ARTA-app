package com.artaproducciones.ops.ui.modules

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.CalendarNoteDto
import com.artaproducciones.ops.data.api.EventSummaryDto
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.ModulesSession
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

private enum class EventSegment(val label: String) { UPCOMING("Próximos"), LIVE("En curso"), PAST("Pasados") }

internal fun EventSummaryDto.startDay(): LocalDate? = localDateOf(startsAt)
internal fun EventSummaryDto.endDay(): LocalDate? = localDateOf(endsAt) ?: startDay()

/** Misma regla que la web: pasado = cerrado/cancelado o con fecha (fin o inicio) anterior a hoy. */
private fun EventSummaryDto.segment(today: LocalDate): EventSegment {
    if (status in CLOSED_EVENT) return EventSegment.PAST
    val start = startDay() ?: return EventSegment.UPCOMING
    val end = endDay() ?: start
    return when {
        end.isBefore(today) -> EventSegment.PAST
        !start.isAfter(today) -> EventSegment.LIVE
        else -> EventSegment.UPCOMING
    }
}

internal fun EventSummaryDto.occursOn(day: LocalDate): Boolean {
    val start = startDay() ?: return false
    val end = endDay() ?: start
    return !day.isBefore(start) && !day.isAfter(end)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventsScreen(nav: ModuleNav, showBack: Boolean = true) {
    var perms by remember { mutableStateOf<ModulesPerms?>(null) }
    var events by remember { mutableStateOf(ModulesStore.events) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var monthMode by rememberSaveable { mutableStateOf(false) }
    var segment by rememberSaveable { mutableStateOf(EventSegment.UPCOMING) }
    var query by rememberSaveable { mutableStateOf("") }
    var month by remember { mutableStateOf(YearMonth.now()) }
    var selected by remember { mutableStateOf(LocalDate.now()) }
    var notes by remember { mutableStateOf<List<CalendarNoteDto>>(emptyList()) }
    val today = LocalDate.now()

    LaunchedEffect(tick) {
        loading = true
        try {
            perms = ModulesPerms(ModulesSession.me())
            val list = ModulesClient.api.events(scope = "all")
            ModulesStore.events = list
            events = list
            error = null
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    LaunchedEffect(month, perms, tick, monthMode) {
        val p = perms ?: return@LaunchedEffect
        if (!monthMode) return@LaunchedEffect
        val from = month.atDay(1).toString()
        val to = month.atEndOfMonth().toString()
        notes = coroutineScope {
            p.eventOpsEntities.map { entity ->
                async { runCatching { ModulesClient.api.calendarNotes(entity, from, to) }.getOrDefault(emptyList()) }
            }.awaitAll().flatten()
        }
    }

    val visible = remember(events, segment, query) {
        val n = query.trim().lowercase()
        events.orEmpty()
            .filter { it.segment(today) == segment }
            .filter {
                n.isEmpty() || it.name.lowercase().contains(n) || it.artist.orEmpty().lowercase().contains(n) ||
                    it.venue.orEmpty().lowercase().contains(n) || it.city.orEmpty().lowercase().contains(n)
            }
            .let { list ->
                if (segment == EventSegment.PAST) list.sortedByDescending { it.startsAt ?: "" }
                else list.sortedBy { it.startsAt ?: "9999" }
            }
    }

    Column(Modifier.fillMaxSize()) {
        val toggle: @Composable () -> Unit = {
            IconButton(onClick = { monthMode = !monthMode }) {
                if (monthMode) Icon(Icons.AutoMirrored.Filled.List, contentDescription = "Ver lista")
                else Icon(Icons.Default.CalendarMonth, contentDescription = "Ver calendario")
            }
        }
        if (showBack) DetailTopBar("Eventos", onBack = { nav.back() }) { toggle() }
        else ScreenTitle("Eventos") { toggle() }

        PullToRefreshBox(
            isRefreshing = loading && events != null,
            onRefresh = { tick++ },
            modifier = Modifier.fillMaxSize(),
        ) {
            val current = events
            when {
                current == null && error != null -> ErrorState(error!!, onRetry = { tick++ })
                current == null -> SkeletonList()
                monthMode -> MonthView(
                    events = current,
                    notes = notes,
                    month = month,
                    selected = selected,
                    error = error,
                    onRetry = { tick++ },
                    onMonth = { month = it },
                    onSelect = { selected = it },
                    onOpen = { nav.openEvent(it.id) },
                )
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
                    item {
                        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                            EventSegment.entries.forEachIndexed { i, s ->
                                SegmentedButton(
                                    selected = segment == s,
                                    onClick = { segment = s },
                                    shape = SegmentedButtonDefaults.itemShape(index = i, count = EventSegment.entries.size),
                                ) { Text(s.label, maxLines = 1) }
                            }
                        }
                    }
                    item {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            placeholder = { Text("Buscar show, artista o lugar") },
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                            trailingIcon = {
                                if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Default.Close, contentDescription = "Limpiar") }
                            },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                    error?.let { msg -> item { InlineError(msg) { tick++ } } }
                    if (visible.isEmpty()) {
                        item {
                            when {
                                query.isNotBlank() -> EmptyState("Nada coincide", "Prueba con otro nombre o lugar.")
                                segment == EventSegment.LIVE -> EmptyState("Ningún show en curso hoy")
                                segment == EventSegment.PAST -> EmptyState("Sin eventos pasados")
                                else -> EmptyState("Sin shows próximos", "Los eventos nuevos se crean desde la web.")
                            }
                        }
                    }
                    items(visible, key = { it.id }) { e -> EventRow(e, onClick = { nav.openEvent(e.id) }) }
                }
            }
        }
    }
}

private val MONTH_SHORT = DateTimeFormatter.ofPattern("MMM", ES_MX)

/** Tarjeta de evento con su fecha en «chip» (como la web). */
@Composable
internal fun EventRow(e: EventSummaryDto, onClick: () -> Unit) {
    ModuleCard(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val start = e.startDay()
            Column(
                Modifier
                    .width(48.dp)
                    .background(ArtaColors.Surface2, RoundedCornerShape(8.dp))
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(start?.dayOfMonth?.toString() ?: "—", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Text(
                    start?.let { MONTH_SHORT.format(it).replace(".", "") } ?: "",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArtaColors.Gold,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(e.name, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val place = listOfNotNull(e.venue?.takeIf { it.isNotBlank() }, e.city?.takeIf { it.isNotBlank() }).joinToString(", ")
                Text(
                    listOf(eventWhenLabel(e.startsAt, e.endsAt), place).filter { it.isNotBlank() }.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = ArtaColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                e.artist?.takeIf { it.isNotBlank() && it != e.name }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted, maxLines = 1)
                }
            }
            eventStatusLabel(e.status)?.let {
                Spacer(Modifier.width(8.dp))
                Pill(it, if (e.status == "CANCELLED") ArtaColors.Danger else ArtaColors.Muted)
            }
        }
    }
}

private val WEEKDAYS = listOf("L", "M", "M", "J", "V", "S", "D")

@Composable
private fun MonthView(
    events: List<EventSummaryDto>,
    notes: List<CalendarNoteDto>,
    month: YearMonth,
    selected: LocalDate,
    error: String?,
    onRetry: () -> Unit,
    onMonth: (YearMonth) -> Unit,
    onSelect: (LocalDate) -> Unit,
    onOpen: (EventSummaryDto) -> Unit,
) {
    val today = LocalDate.now()
    val notesByDay = remember(notes) { notes.groupBy { it.date } }
    val dayEvents = remember(events, selected) { events.filter { it.occursOn(selected) }.sortedBy { it.startsAt ?: "" } }
    val dayNotes = notesByDay[selected.toString()].orEmpty()

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        error?.let { msg -> item { InlineError(msg, onRetry) } }
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { onMonth(month.minusMonths(1)) }) { Icon(Icons.Default.ChevronLeft, contentDescription = "Mes anterior") }
                Text(
                    monthYearLabel(month.atDay(1)),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { onMonth(month.plusMonths(1)) }) { Icon(Icons.Default.ChevronRight, contentDescription = "Mes siguiente") }
            }
            if (month != YearMonth.now()) {
                TextButton(
                    onClick = { onMonth(YearMonth.now()); onSelect(today) },
                    modifier = Modifier.padding(horizontal = 8.dp),
                ) { Text("Hoy") }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 12.dp)) {
                Row(Modifier.fillMaxWidth()) {
                    WEEKDAYS.forEach {
                        Text(
                            it,
                            modifier = Modifier.weight(1f),
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.labelSmall,
                            color = ArtaColors.Muted,
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                val first = month.atDay(1)
                val offset = first.dayOfWeek.value - 1
                val cells = offset + month.lengthOfMonth()
                val rows = (cells + 6) / 7
                for (r in 0 until rows) {
                    Row(Modifier.fillMaxWidth()) {
                        for (c in 0 until 7) {
                            val index = r * 7 + c - offset
                            if (index < 0 || index >= month.lengthOfMonth()) {
                                Spacer(Modifier.weight(1f).aspectRatio(1f))
                            } else {
                                val day = month.atDay(index + 1)
                                DayCell(
                                    day = day,
                                    isToday = day == today,
                                    isSelected = day == selected,
                                    hasEvents = events.any { it.occursOn(day) },
                                    hasNotes = notesByDay.containsKey(day.toString()),
                                    onClick = { onSelect(day) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }
            }
        }
        item {
            val label = when (selected) {
                today -> "Hoy"
                today.plusDays(1) -> "Mañana"
                else -> shortDate(selected)
            }
            SectionTitle(label, count = (dayEvents.size + dayNotes.size).takeIf { it > 0 })
        }
        if (dayEvents.isEmpty() && dayNotes.isEmpty()) {
            item { Text("Nada en este día.", color = ArtaColors.Muted, modifier = Modifier.padding(horizontal = 16.dp)) }
        }
        items(dayEvents, key = { "e-${it.id}" }) { e -> EventRow(e, onClick = { onOpen(e) }) }
        items(dayNotes, key = { "n-${it.id}" }) { n ->
            ModuleCard(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                Text(n.text)
                Text(
                    listOfNotNull("Nota del equipo", n.updatedBy?.fullName ?: n.createdBy?.fullName).joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall,
                    color = ArtaColors.Muted,
                )
            }
        }
    }
}

@Composable
private fun DayCell(
    day: LocalDate,
    isToday: Boolean,
    isSelected: Boolean,
    hasEvents: Boolean,
    hasNotes: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier
            .aspectRatio(1f)
            .padding(2.dp)
            .background(if (isSelected) ArtaColors.GoldSoft else ArtaColors.Bg, shape)
            .then(if (isToday) Modifier.border(1.dp, ArtaColors.Gold, shape) else Modifier)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                day.dayOfMonth.toString(),
                fontWeight = if (isToday || isSelected) FontWeight.Bold else FontWeight.Normal,
                color = if (isSelected) ArtaColors.Gold else ArtaColors.Text,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.height(6.dp)) {
                if (hasEvents) Dot(ArtaColors.Gold)
                if (hasNotes) Dot(ArtaColors.Read)
            }
        }
    }
}
