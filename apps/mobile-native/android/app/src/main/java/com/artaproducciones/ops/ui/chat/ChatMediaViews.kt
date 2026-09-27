package com.artaproducciones.ops.ui.chat

import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.BrokenImage
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FolderZip
import androidx.compose.material.icons.outlined.Headphones
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Slideshow
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import coil.compose.SubcomposeAsyncImage
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChatAttachment
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.common.fileSize
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class AttachSource { Camera, Video, Gallery, Document }

/** Hoja de adjuntar, como la de WhatsApp: cámara, video, galería (varias a la vez) y documento. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttachSheet(onPick: (AttachSource) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = ArtaColors.BgElev) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            AttachOption(Icons.Outlined.PhotoCamera, "Cámara", Color(0xFFE85D75)) { onPick(AttachSource.Camera) }
            AttachOption(Icons.Outlined.Videocam, "Video", Color(0xFFB86BE0)) { onPick(AttachSource.Video) }
            AttachOption(Icons.Outlined.PhotoLibrary, "Galería", Color(0xFF4F9DF7)) { onPick(AttachSource.Gallery) }
            AttachOption(Icons.Outlined.Description, "Documento", Color(0xFF7C6CF2)) { onPick(AttachSource.Document) }
        }
        Text(
            "Fotos, videos, notas de voz y documentos hasta 100 MB",
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 4.dp),
        )
        Spacer(Modifier.navigationBarsPadding().padding(bottom = 16.dp))
    }
}

@Composable
private fun AttachOption(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(
        Modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(56.dp).background(tint, CircleShape), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Color.White, modifier = Modifier.size(26.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium)
    }
}

/** Adjunto dentro de la burbuja: foto, video con miniatura, reproductor de audio o documento. */
@Composable
fun AttachmentView(a: ChatAttachment, mine: Boolean, onOpen: () -> Unit) {
    when {
        a.isImage -> ImageAttachment(a, onOpen)
        a.isVideo -> VideoAttachment(a, onOpen)
        a.isAudio -> AudioAttachment(a, mine)
        else -> DocumentAttachment(a, onOpen)
    }
}

@Composable
private fun ImageAttachment(a: ChatAttachment, onOpen: () -> Unit) {
    SubcomposeAsyncImage(
        model = ApiClient.resolveUrl(a.url),
        contentDescription = a.name,
        contentScale = ContentScale.Crop,
        loading = { Box(Modifier.fillMaxSize().background(ArtaColors.Surface2)) },
        error = {
            Box(Modifier.fillMaxSize().background(ArtaColors.Surface2), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.BrokenImage, "No se pudo mostrar", tint = ArtaColors.Muted)
            }
        },
        modifier = Modifier
            .padding(vertical = 4.dp)
            .widthIn(min = 160.dp, max = 260.dp)
            .heightIn(min = 120.dp, max = 300.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onOpen),
    )
}

@Composable
private fun VideoAttachment(a: ChatAttachment, onOpen: () -> Unit) {
    val probe by produceState(RemoteMedia.cached(a.url), a.url) {
        if (value == null) value = RemoteMedia.probe(a.url, wantFrame = true)
    }
    Box(
        Modifier
            .padding(vertical = 4.dp)
            .width(240.dp)
            .height(160.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color.Black)
            .clickable(onClick = onOpen),
        contentAlignment = Alignment.Center,
    ) {
        probe?.frame?.let { Image(it.asImageBitmap(), a.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
        Box(Modifier.size(52.dp).background(Color.Black.copy(alpha = 0.55f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.PlayArrow, "Reproducir", tint = Color.White, modifier = Modifier.size(32.dp))
        }
        val meta = listOfNotNull(probe?.durationMs?.takeIf { it > 0 }?.let(::clock), fileSize(a.size).ifBlank { null }).joinToString(" · ")
        if (meta.isNotBlank()) {
            Text(
                meta,
                color = Color.White,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.align(Alignment.BottomStart).padding(6.dp)
                    .background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

/** Nota de voz o audio: play/pausa, barra para adelantar y tiempo, sin salir del chat. */
@Composable
private fun AudioAttachment(a: ChatAttachment, mine: Boolean) {
    val context = LocalContext.current
    val current by ChatAudio.current.collectAsState()
    val playing by ChatAudio.playing.collectAsState()
    val isCurrent = current == a.url
    val probe by produceState(RemoteMedia.cached(a.url), a.url) {
        if (value == null) value = RemoteMedia.probe(a.url, wantFrame = false)
    }
    var position by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var dragging by remember { mutableStateOf(false) }
    var dragValue by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(isCurrent, playing) {
        if (!isCurrent) {
            position = 0L
            return@LaunchedEffect
        }
        do {
            position = ChatAudio.positionMs()
            duration = ChatAudio.durationMs()
            delay(200)
        } while (playing)
    }
    val total = duration.takeIf { isCurrent && it > 0 } ?: probe?.durationMs ?: 0L
    val progress = if (total > 0) (position.toFloat() / total).coerceIn(0f, 1f) else 0f

    Row(
        Modifier.padding(vertical = 2.dp).width(250.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp).background(if (a.isVoiceNote) ArtaColors.Gold else ArtaColors.Surface2, CircleShape)
                .clip(CircleShape).clickable { ChatAudio.toggle(context, a.url) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (isCurrent && playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                if (isCurrent && playing) "Pausar" else "Reproducir",
                tint = if (a.isVoiceNote) ArtaColors.Bg else ArtaColors.Text,
            )
        }
        Column(Modifier.weight(1f).padding(start = 6.dp)) {
            if (!a.isVoiceNote) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Headphones, null, tint = ArtaColors.Muted, modifier = Modifier.size(14.dp))
                    Text(" " + (a.name ?: "Audio"), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelMedium)
                }
            }
            Slider(
                value = if (dragging) dragValue else progress,
                onValueChange = {
                    dragging = true
                    dragValue = it
                },
                onValueChangeFinished = {
                    if (!isCurrent) ChatAudio.toggle(context, a.url)
                    ChatAudio.seek(a.url, dragValue)
                    dragging = false
                },
                colors = SliderDefaults.colors(
                    thumbColor = if (mine) ArtaColors.Read else ArtaColors.Gold,
                    activeTrackColor = if (mine) ArtaColors.Read else ArtaColors.Gold,
                    inactiveTrackColor = ArtaColors.Line,
                ),
                modifier = Modifier.height(24.dp),
            )
            Text(
                if (isCurrent && position > 0) clock(position) else clock(total),
                color = ArtaColors.Muted,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

@Composable
private fun DocumentAttachment(a: ChatAttachment, onOpen: () -> Unit) {
    val ext = AttachmentNames.extensionOf(a.name ?: a.url)
    val (icon, tint) = when (ext) {
        "pdf" -> Icons.Outlined.PictureAsPdf to Color(0xFFE5534B)
        "xls", "xlsx", "csv", "numbers" -> Icons.Outlined.TableChart to Color(0xFF3FB950)
        "ppt", "pptx", "key" -> Icons.Outlined.Slideshow to Color(0xFFF0883E)
        "zip" -> Icons.Outlined.FolderZip to ArtaColors.Muted
        else -> Icons.Outlined.Description to Color(0xFF4F9DF7)
    }
    Row(
        Modifier
            .padding(vertical = 4.dp)
            .widthIn(min = 200.dp, max = 260.dp)
            .background(ArtaColors.Surface2, RoundedCornerShape(10.dp))
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onOpen)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(30.dp))
        Spacer(Modifier.width(10.dp))
        Column {
            Text(a.name ?: "Archivo", maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium)
            val meta = listOfNotNull(ext.uppercase().ifBlank { null }, fileSize(a.size).ifBlank { null }).joinToString(" · ")
            if (meta.isNotBlank()) Text(meta, color = ArtaColors.Muted, style = MaterialTheme.typography.labelSmall)
        }
    }
}

/** Pantalla completa para fotos y videos, con «Compartir» (guardar, reenviar por otra app). */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun MediaViewer(a: ChatAttachment, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            if (a.isVideo) {
                val player = remember(a.url) {
                    ChatAudio.stop()
                    ChatAudio.videoPlayer(context, a.url)
                }
                DisposableEffect(player) { onDispose { player.release() } }
                AndroidView(
                    factory = { ctx -> PlayerView(ctx).apply { this.player = player; setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS) } },
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                SubcomposeAsyncImage(
                    model = ApiClient.resolveUrl(a.url),
                    contentDescription = a.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize().clickable(onClick = onDismiss),
                )
            }
            Row(Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp)) {
                IconButton(onClick = {
                    scope.launch {
                        runCatching { shareAttachment(context, a) }
                            .onFailure { Toast.makeText(context, it.userMessage(), Toast.LENGTH_LONG).show() }
                    }
                }) { Icon(Icons.Outlined.Share, "Compartir", tint = Color.White) }
                IconButton(onClick = onDismiss) { Icon(Icons.Outlined.Close, "Cerrar", tint = Color.White) }
            }
        }
    }
}

/** Barra que sustituye al campo de texto mientras se graba una nota de voz. */
@Composable
fun RecordingBar(recorder: VoiceRecorder, onCancel: () -> Unit, onSend: () -> Unit) {
    var elapsed by remember { mutableLongStateOf(0L) }
    var level by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(recorder) {
        while (recorder.isRecording) {
            elapsed = recorder.elapsedMs()
            level = recorder.level()
            delay(120)
        }
    }
    Row(
        Modifier.fillMaxWidth().background(ArtaColors.BgElev).padding(horizontal = 6.dp, vertical = 6.dp).navigationBarsPadding(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onCancel) { Icon(Icons.Outlined.DeleteOutline, "Descartar nota de voz", tint = ArtaColors.Danger) }
        Box(Modifier.size(10.dp).background(ArtaColors.Danger, CircleShape))
        Text(" " + clock(elapsed), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 8.dp))
        LinearProgressIndicator(
            progress = { level },
            color = ArtaColors.Gold,
            trackColor = ArtaColors.Surface2,
            modifier = Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(3.dp)),
        )
        Spacer(Modifier.width(10.dp))
        IconButton(onClick = onSend, modifier = Modifier.background(ArtaColors.Gold, CircleShape)) {
            Icon(Icons.AutoMirrored.Filled.Send, "Enviar nota de voz", tint = ArtaColors.Bg)
        }
    }
}

/** Progreso de subida sobre el composer: «Subiendo video (2 de 3) · 45 %». */
@Composable
fun UploadBar(progress: UploadProgress) {
    Column(Modifier.fillMaxWidth().background(ArtaColors.Surface2).padding(horizontal = 16.dp, vertical = 8.dp)) {
        val count = if (progress.total > 1) " (${progress.index} de ${progress.total})" else ""
        val pct = progress.fraction?.let { " · ${(it * 100).toInt()} %" }.orEmpty()
        Text("Subiendo ${progress.label}$count$pct", style = MaterialTheme.typography.labelMedium, color = ArtaColors.Muted)
        Spacer(Modifier.height(4.dp))
        val f = progress.fraction
        if (f == null) {
            LinearProgressIndicator(color = ArtaColors.Gold, trackColor = ArtaColors.Line, modifier = Modifier.fillMaxWidth())
        } else {
            LinearProgressIndicator(progress = { f }, color = ArtaColors.Gold, trackColor = ArtaColors.Line, modifier = Modifier.fillMaxWidth())
        }
    }
}

/** Botón de micrófono del composer cuando no hay texto (tocar para grabar). */
@Composable
fun MicButton(onClick: () -> Unit) {
    Surface(color = ArtaColors.Gold, shape = CircleShape, modifier = Modifier.size(48.dp).clip(CircleShape).clickable(onClick = onClick)) {
        Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Mic, "Grabar nota de voz", tint = ArtaColors.Bg) }
    }
}

fun clock(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}
