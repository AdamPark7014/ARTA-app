package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.PersonSearch
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.InputChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
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
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.Colleague
import com.artaproducciones.ops.data.api.CreateChannelBody
import com.artaproducciones.ops.data.api.DirectBody
import com.artaproducciones.ops.data.api.GroupDmBody
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Límite de personas en un DM grupal sin contarte a ti (contrato: 2–8). */
const val GROUP_DM_MAX = 8

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewConversationScreen(onBack: () -> Unit, openChat: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val selected = remember { mutableStateMapOf<String, Colleague>() }
    var name by rememberSaveable { mutableStateOf("") }
    var topic by rememberSaveable { mutableStateOf("") }
    var private by rememberSaveable { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    val canSubmit = !busy && when (tab) {
        0 -> selected.size in 1..GROUP_DM_MAX
        else -> name.trim().length >= 2
    }

    fun submit() {
        busy = true
        scope.launch {
            try {
                val ids = selected.keys.toList()
                val channel = when {
                    tab == 1 -> ApiClient.api.createChannel(
                        CreateChannelBody(
                            name = name.trim(),
                            kind = if (private) "PRIVATE" else "PUBLIC",
                            topic = topic.trim().ifBlank { null },
                            memberIds = ids,
                        ),
                    )
                    ids.size == 1 -> ApiClient.api.openDirect(DirectBody(ids.first()))
                    else -> ApiClient.api.groupDm(GroupDmBody(ids))
                }
                openChat(channel.id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                snackbar.showSnackbar(e.userMessage())
            } finally {
                busy = false
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
                title = { Text("Nueva conversación", fontWeight = FontWeight.SemiBold) },
                actions = {
                    if (busy) {
                        CircularProgressIndicator(Modifier.padding(end = Space.L).size(20.dp), strokeWidth = 2.dp, color = ArtaColors.Gold)
                    } else {
                        TextButton(onClick = ::submit, enabled = canSubmit) {
                            Text(
                                when {
                                    tab == 1 -> "Crear"
                                    selected.size > 1 -> "Crear grupo"
                                    else -> "Abrir"
                                },
                                color = if (canSubmit) ArtaColors.Gold else ArtaColors.Muted,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            SecondaryTabRow(
                selectedTabIndex = tab,
                containerColor = ArtaColors.BgElev,
                contentColor = ArtaColors.Text,
                indicator = {
                    TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(tab), color = ArtaColors.Gold)
                },
            ) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Mensaje directo") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Canal") })
            }
            if (tab == 1) {
                Column(Modifier.padding(horizontal = Space.L, vertical = Space.M), verticalArrangement = Arrangement.spacedBy(Space.S)) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it.take(80) },
                        label = { Text("Nombre del canal") },
                        placeholder = { Text("p. ej. montaje-auditorio") },
                        prefix = { Text("#", color = ArtaColors.Muted) },
                        singleLine = true,
                        colors = fieldColors(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = topic,
                        onValueChange = { topic = it.take(250) },
                        label = { Text("Tema (opcional)") },
                        singleLine = true,
                        colors = fieldColors(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Canal privado", fontWeight = FontWeight.Medium)
                            Text(
                                if (private) "Solo las personas invitadas lo ven." else "Cualquiera del equipo puede encontrarlo y unirse.",
                                color = ArtaColors.Muted,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Switch(
                            checked = private,
                            onCheckedChange = { private = it },
                            colors = SwitchDefaults.colors(checkedTrackColor = ArtaColors.Gold, checkedThumbColor = ArtaColors.Bg),
                        )
                    }
                    Text("Miembros (opcional)", color = ArtaColors.Muted, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = Space.S))
                }
            } else {
                Text(
                    "Elige 1 persona para un directo o hasta $GROUP_DM_MAX para un grupo.",
                    color = ArtaColors.Muted,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = Space.L, vertical = Space.S),
                )
            }
            PeoplePicker(
                selected = selected,
                max = if (tab == 0) GROUP_DM_MAX else null,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = ArtaColors.Gold,
    focusedLabelColor = ArtaColors.Gold,
    cursorColor = ArtaColors.Gold,
)

/**
 * Buscador de compañeros con selección múltiple. [selected] lo controla quien llama;
 * [exclude] oculta ids (p. ej. miembros actuales de un canal).
 */
@Composable
fun PeoplePicker(
    selected: MutableMap<String, Colleague>,
    modifier: Modifier = Modifier,
    max: Int? = null,
    exclude: Set<String> = emptySet(),
) {
    val me = Session.currentUser?.id
    LaunchedEffect(Unit) { ChatPresence.ensureStarted() }
    val online by ChatPresence.online.collectAsState()
    var q by rememberSaveable { mutableStateOf("") }
    var people by remember { mutableStateOf<List<Colleague>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }

    LaunchedEffect(q, retry) {
        if (q.isNotEmpty()) delay(250)
        loading = true
        try {
            people = ApiClient.api.colleagues(q.trim().ifBlank { null })
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    Column(modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = q,
            onValueChange = { q = it.take(60) },
            placeholder = { Text("Buscar personas") },
            leadingIcon = { Icon(Icons.Outlined.Search, null, tint = ArtaColors.Muted) },
            trailingIcon = { if (q.isNotEmpty()) IconButton(onClick = { q = "" }) { Icon(Icons.Outlined.Close, "Borrar") } },
            singleLine = true,
            colors = fieldColors(),
            modifier = Modifier.fillMaxWidth().padding(horizontal = Space.L, vertical = Space.XS),
        )
        if (selected.isNotEmpty()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = Space.L),
                horizontalArrangement = Arrangement.spacedBy(Space.S),
                modifier = Modifier.padding(vertical = Space.XS),
            ) {
                items(selected.values.toList(), key = { it.id }) { c ->
                    InputChip(
                        selected = true,
                        onClick = { selected.remove(c.id) },
                        label = { Text(c.fullName.substringBefore(' '), maxLines = 1) },
                        avatar = { Avatar(c.fullName, size = 24.dp) },
                        trailingIcon = { Icon(Icons.Outlined.Close, "Quitar", Modifier.size(16.dp)) },
                        colors = InputChipDefaults.inputChipColors(selectedContainerColor = ArtaColors.GoldSoft),
                    )
                }
            }
        }
        val visible = people.filter { it.id != me && it.id !in exclude }
        when {
            loading && visible.isEmpty() -> ListSkeleton(6)
            error != null && visible.isEmpty() -> ErrorState(error, onRetry = { retry++ })
            visible.isEmpty() -> EmptyState(Icons.Outlined.PersonSearch, "Nadie coincide", if (q.isBlank()) null else "Prueba con otro nombre.")
            else -> LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(bottom = Space.XL)) {
                items(visible, key = { it.id }) { c ->
                    val checked = c.id in selected
                    val full = max != null && selected.size >= max && !checked
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !full) { if (checked) selected.remove(c.id) else selected[c.id] = c }
                            .padding(horizontal = Space.L, vertical = Space.S),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        PresenceAvatar(c.fullName, size = 40.dp, online = c.id in online)
                        Spacer(Modifier.width(Space.M))
                        Column(Modifier.weight(1f)) {
                            Text(c.fullName, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (full) ArtaColors.Muted else ArtaColors.Text)
                            c.title?.takeIf { it.isNotBlank() }?.let {
                                Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                        Checkbox(
                            checked = checked,
                            onCheckedChange = null,
                            enabled = !full,
                            colors = CheckboxDefaults.colors(checkedColor = ArtaColors.Gold, checkmarkColor = ArtaColors.Bg),
                        )
                    }
                }
            }
        }
    }
}
