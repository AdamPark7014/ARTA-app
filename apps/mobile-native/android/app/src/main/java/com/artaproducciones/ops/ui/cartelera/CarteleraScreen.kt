package com.artaproducciones.ops.ui.cartelera

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.CalendarContract
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.artaproducciones.ops.R
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ModulesClient
import com.artaproducciones.ops.data.api.PublicShowDto
import com.artaproducciones.ops.data.api.PublicShowsDto
import com.artaproducciones.ops.ui.common.LegalLinks
import com.artaproducciones.ops.ui.modules.ErrorState
import com.artaproducciones.ops.ui.theme.ArtaCard
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.Button
import com.artaproducciones.ops.ui.theme.InterTight
import com.artaproducciones.ops.ui.theme.OutlinedButton

private val PAPER = Color(0xFFF7F6F3)
private val INK = Color(0xFF0C0C0D)

/** `/uploads/x.jpg` → dirección completa del mismo host. */
private fun posterUrl(path: String?): String? = path?.let { ApiClient.resolveUrl(it) }

/** Póster de un show. Sin póster, la marca sobre tinta: nunca un hueco. */
@Composable
private fun ShowPoster(show: PublicShowDto, modifier: Modifier = Modifier) {
    val url = posterUrl(show.coverUrl)
    if (url != null) {
        AsyncImage(model = url, contentDescription = "Póster de ${show.title}", modifier = modifier, contentScale = ContentScale.FillWidth)
    } else {
        Box(
            modifier
                .aspectRatio(0.72f)
                .background(Brush.linearGradient(listOf(Color(0xFF2B2623), INK))),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painterResource(R.drawable.arta_wordmark),
                contentDescription = null,
                colorFilter = ColorFilter.tint(Color.White.copy(alpha = 0.22f)),
                modifier = Modifier.fillMaxWidth(0.6f),
            )
        }
    }
}

private fun openUrl(context: Context, url: String) = LegalLinks.open(context, url)

private fun addToCalendar(context: Context, show: PublicShowDto) {
    val span = CarteleraRules.calendarSpan(show) ?: return
    val intent = Intent(Intent.ACTION_INSERT)
        .setData(CalendarContract.Events.CONTENT_URI)
        .putExtra(CalendarContract.Events.TITLE, show.title)
        .putExtra(CalendarContract.Events.EVENT_LOCATION, CarteleraRules.place(show).orEmpty())
        .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, span.startMillis)
        .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, span.endMillis)
        .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, span.allDay)
    // Un teléfono sin app de calendario no debe tronar: el botón simplemente no hace nada.
    runCatching { context.startActivity(intent) }.onFailure { if (it !is ActivityNotFoundException) throw it }
}

private fun share(context: Context, show: PublicShowDto) {
    val send = Intent(Intent.ACTION_SEND)
        .setType("text/plain")
        .putExtra(Intent.EXTRA_SUBJECT, show.title)
        .putExtra(Intent.EXTRA_TEXT, "${show.title}\n${CarteleraRules.siteUrl(show)}")
    context.startActivity(Intent.createChooser(send, "Compartir"))
}

/** Lo que viene y la temporada: la misma cartelera del sitio. Con cuenta o sin ella. */
@Composable
fun CarteleraScreen(onBack: () -> Unit) {
    var data by remember { mutableStateOf<PublicShowsDto?>(null) }
    var failed by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    var selected by remember { mutableStateOf<PublicShowDto?>(null) }

    LaunchedEffect(attempt) {
        failed = null
        runCatching { ModulesClient.api.publicShows() }
            .onSuccess { data = it }
            .onFailure { failed = it.message ?: "Sin conexión. Revisa tu internet." }
    }

    selected?.let { show ->
        BackHandler { selected = null }
        ShowDetail(show, onBack = { selected = null })
        return
    }

    Column(Modifier.fillMaxSize().background(ArtaColors.Bg).systemBarsPadding()) {
        TopRow("Cartelera", onBack)
        val d = data
        when {
            d == null && failed != null -> ErrorState(failed.orEmpty(), onRetry = { attempt += 1 })
            d == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ArtaColors.Muted) }
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(22.dp),
            ) {
                item(key = "t", span = { GridItemSpan(maxLineSpan) }) { BigTitle("Lo que viene.") }
                if (d.upcoming.isEmpty()) {
                    item(key = "vacio", span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            "Estamos armando la próxima temporada. Muy pronto anunciamos fechas.",
                            color = ArtaColors.Muted,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
                gridItems(d.upcoming, key = { it.id }) { show -> ShowTile(show) { selected = show } }
                if (d.past.isNotEmpty()) {
                    item(key = "t2", span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.padding(top = 10.dp)) { BigTitle("Ya pasaron por aquí.") } }
                    item(key = "muro", span = { GridItemSpan(maxLineSpan) }) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(d.past, key = { it.id }) { show ->
                                ShowPoster(
                                    show,
                                    Modifier
                                        .width(150.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .clickable { selected = show },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TopRow(title: String, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver", tint = ArtaColors.Text)
        }
        Text(title, color = ArtaColors.Text, fontFamily = InterTight, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
    }
}

@Composable
private fun BigTitle(text: String) {
    Text(
        text,
        color = ArtaColors.Text,
        fontFamily = InterTight,
        fontWeight = FontWeight.SemiBold,
        fontSize = 32.sp,
        lineHeight = 36.sp,
        modifier = Modifier.semantics { heading() },
    )
}

/** La tarjeta de un show: el arte le da el color y se asoma abajo, como en el sitio. */
@Composable
private fun ShowTile(show: PublicShowDto, onOpen: () -> Unit) {
    // El póster va entero, sobre su propio color; abajo, cuándo, qué y dónde. Como en el sitio.
    Column(Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(0.8f)
                .clip(RoundedCornerShape(16.dp))
                .background(INK),
            contentAlignment = Alignment.Center,
        ) {
            posterUrl(show.coverUrl)?.let { url ->
                // `blur` solo funciona en Android 12 en adelante; antes queda el póster tenue, también se lee.
                AsyncImage(
                    model = url,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    alpha = 0.55f,
                    modifier = Modifier.matchParentSize().blur(24.dp),
                )
            }
            ShowPoster(show, Modifier.fillMaxWidth())
        }
        Text(
            listOfNotNull(CarteleraRules.dayMonth(show), CarteleraRules.timeLabel(show)).joinToString(" · "),
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(top = 10.dp),
        )
        Text(
            show.title,
            color = ArtaColors.Text,
            fontFamily = InterTight,
            fontWeight = FontWeight.SemiBold,
            fontSize = 17.sp,
            lineHeight = 20.sp,
            letterSpacing = (-0.2).sp,
            maxLines = 3,
            modifier = Modifier.padding(top = 2.dp),
        )
        show.venue?.let { venue ->
            Text(
                venue,
                color = ArtaColors.Muted,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

/** El detalle de un show: cuándo, dónde, boletos, calendario y compartir. */
@Composable
private fun ShowDetail(show: PublicShowDto, onBack: () -> Unit) {
    val context = LocalContext.current
    val past = CarteleraRules.isPast(show)
    Column(Modifier.fillMaxSize().background(ArtaColors.Bg).systemBarsPadding()) {
        TopRow("Show", onBack)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                ShowPoster(
                    show,
                    Modifier
                        .width(280.dp)
                        .shadow(20.dp, RoundedCornerShape(14.dp))
                        .clip(RoundedCornerShape(14.dp)),
                )
            }
            BigTitle(show.title)
            show.excerpt?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyLarge)
            }
            ArtaCard(Modifier.fillMaxWidth()) {
                Column {
                    CarteleraRules.longDate(show)?.let { Fact("Fecha", it) }
                    CarteleraRules.timeLabel(show)?.let { Fact("Hora", it) }
                    CarteleraRules.place(show)?.let { place ->
                        Fact("Lugar", place, onClick = {
                            openUrl(context, "https://www.google.com/maps/search/?api=1&query=${Uri.encode(place)}")
                        })
                    }
                    if (past) {
                        Fact("Estado", "Ya se presentó")
                    } else {
                        Fact("Boletos", listOfNotNull(CarteleraRules.statusLabel(show), CarteleraRules.countdown(show)).joinToString(" · "))
                    }
                }
            }
            val tickets = CarteleraRules.ticketUrl(show)
            if (!past && tickets != null) {
                Button(onClick = { openUrl(context, tickets) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(show.ctaLabel ?: "Comprar boletos")
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                if (!past && CarteleraRules.status(show) != "cancelado") {
                    OutlinedButton(onClick = { addToCalendar(context, show) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                        Icon(Icons.Outlined.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("Calendario", modifier = Modifier.padding(start = 6.dp))
                    }
                }
                OutlinedButton(onClick = { share(context, show) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                    Icon(Icons.Outlined.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text("Compartir", modifier = Modifier.padding(start = 6.dp))
                }
            }
            show.body.orEmpty().split("\n\n").map { it.trim() }.filter { it.isNotEmpty() }.forEach { paragraph ->
                Text(paragraph, color = ArtaColors.Text, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}

@Composable
private fun Fact(label: String, value: String, onClick: (() -> Unit)? = null) {
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(label, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(72.dp))
        Text(
            value,
            color = ArtaColors.Text,
            style = MaterialTheme.typography.bodyMedium.copy(textDecoration = if (onClick != null) TextDecoration.Underline else null),
            fontWeight = FontWeight.Medium,
        )
    }
}

/** En Inicio: los próximos shows, a un toque. Si no hay o no carga, no enseña nada. */
@Composable
fun CarteleraStrip(onOpen: () -> Unit) {
    var shows by remember { mutableStateOf<List<PublicShowDto>>(emptyList()) }
    LaunchedEffect(Unit) {
        shows = runCatching { ModulesClient.api.publicShows().upcoming }.getOrDefault(emptyList())
    }
    if (shows.isEmpty()) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "En cartelera",
                color = ArtaColors.Text,
                fontFamily = InterTight,
                fontWeight = FontWeight.SemiBold,
                fontSize = 20.sp,
                modifier = Modifier.weight(1f),
            )
            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = ArtaColors.Tertiary)
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(shows, key = { it.id }) { show ->
                Column(
                    Modifier
                        .width(112.dp)
                        .clickable(onClick = onOpen)
                        .semantics { contentDescription = show.title },
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    ShowPoster(show, Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)))
                    Text(
                        CarteleraRules.dayMonth(show).orEmpty(),
                        color = ArtaColors.Muted,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}
