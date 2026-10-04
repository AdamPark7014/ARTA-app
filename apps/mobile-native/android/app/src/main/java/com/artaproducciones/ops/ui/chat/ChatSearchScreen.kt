package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChatChannelRef
import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.plainText
import com.artaproducciones.ops.ui.common.relativeTime
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/** Coincidencias de [q] resaltadas en dorado (sin distinguir mayúsculas). */
fun highlight(text: String, q: String): AnnotatedString = buildAnnotatedString {
    if (q.isBlank()) {
        append(text)
        return@buildAnnotatedString
    }
    var i = 0
    while (true) {
        val j = text.indexOf(q, i, ignoreCase = true)
        if (j < 0) {
            append(text.substring(i))
            break
        }
        append(text.substring(i, j))
        withStyle(SpanStyle(color = ArtaColors.Gold, fontWeight = FontWeight.Bold, background = ArtaColors.GoldSoft)) {
            append(text.substring(j, j + q.length))
        }
        i = j + q.length
    }
}

/** Recorte alrededor de la primera coincidencia para que se vea en la fila. */
private fun snippet(text: String, q: String): String {
    val flat = text.replace('\n', ' ')
    val i = flat.indexOf(q, ignoreCase = true)
    return if (i > 60) "…" + flat.substring(i - 40) else flat
}

fun channelLabel(c: ChatChannelRef): String = when {
    c.isGroupDm -> c.name
    c.kind == "DIRECT" -> "Mensaje directo"
    else -> "#${c.name}"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatSearchScreen(onBack: () -> Unit, openMessage: (channelId: String, messageId: String) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var searched by remember { mutableStateOf("") }
    var retryTick by remember { mutableIntStateOf(0) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }

    LaunchedEffect(query, retryTick) {
        val q = query.trim()
        if (q.length < 2) {
            results = emptyList()
            error = null
            loading = false
            searched = ""
            return@LaunchedEffect
        }
        delay(300)
        loading = true
        try {
            results = ApiClient.api.search(q).messages
            error = null
            searched = q
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            loading = false
        }
    }

    Scaffold(
        containerColor = ArtaColors.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ArtaColors.BgElev),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Atrás") } },
                title = {
                    TextField(
                        value = query,
                        onValueChange = { query = it.take(100) },
                        placeholder = { Text("Buscar mensajes") },
                        singleLine = true,
                        trailingIcon = {
                            if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Outlined.Close, "Borrar") }
                        },
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                        ),
                        modifier = Modifier.fillMaxWidth().focusRequester(focus),
                    )
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            val q = query.trim()
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = ArtaColors.Gold, trackColor = ArtaColors.Line)
            when {
                q.length < 2 -> EmptyState(
                    Icons.Outlined.Search,
                    "Busca en tus conversaciones",
                    "Mensajes de canales, grupos y directos. Escribe al menos 2 letras.",
                    Modifier.padding(top = Space.XL),
                )
                results.isEmpty() && error != null -> ErrorState(error, onRetry = { retryTick++ }, modifier = Modifier.padding(top = Space.XL))
                results.isEmpty() && (loading || searched != q) -> ListSkeleton(6)
                results.isEmpty() -> EmptyState(Icons.Outlined.SearchOff, "Sin resultados", "Nada coincide con «$q».", Modifier.padding(top = Space.XL))
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Space.XL)) {
                    items(results, key = { it.id }) { m ->
                        SearchResultRow(m, searched) { openMessage(m.channelId, m.parentId ?: m.id) }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchResultRow(m: ChatMessage, q: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Space.L, vertical = Space.M),
        verticalAlignment = Alignment.Top,
    ) {
        Avatar(m.author.fullName, size = 40.dp)
        Spacer(Modifier.width(Space.M))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    m.author.fullName,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(relativeTime(m.createdAt), color = ArtaColors.Muted, style = MaterialTheme.typography.labelSmall)
            }
            m.channel?.let { c ->
                Text(
                    channelLabel(c) + if (m.parentId != null) " · en un hilo" else "",
                    color = ArtaColors.Gold,
                    style = MaterialTheme.typography.labelMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                highlight(snippet(plainText(m.body), q), q),
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
    HorizontalDivider(color = ArtaColors.Line, thickness = 0.5.dp, modifier = Modifier.padding(start = 68.dp))
}
