package com.artaproducciones.ops.ui.chat

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BrokenImage
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.SubcomposeAsyncImage
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChatAttachment
import com.artaproducciones.ops.data.api.userMessage
import kotlinx.coroutines.launch
import kotlin.math.abs

private const val MAX_ZOOM = 5f
private const val DOUBLE_TAP_ZOOM = 2.5f

/** Galería de las fotos de la conversación: zoom con dos dedos, doble toque, deslizar entre fotos y hacia abajo para cerrar. */
@Composable
fun ImageGallery(images: List<ChatAttachment>, startIndex: Int, onDismiss: () -> Unit) {
    if (images.isEmpty()) return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pager = rememberPagerState(initialPage = startIndex.coerceIn(0, images.lastIndex)) { images.size }
    var zoomed by remember { mutableStateOf(false) }
    var dragFraction by remember { mutableFloatStateOf(0f) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = (1f - dragFraction).coerceIn(0.25f, 1f)))) {
            HorizontalPager(state = pager, userScrollEnabled = !zoomed, modifier = Modifier.fillMaxSize()) { page ->
                ZoomableImage(
                    a = images[page],
                    active = page == pager.currentPage,
                    onZoomChange = { if (page == pager.currentPage) zoomed = it },
                    onDrag = { dragFraction = it },
                    onDismiss = onDismiss,
                )
            }
            if (dragFraction < 0.05f) {
                Row(
                    Modifier.fillMaxWidth().align(Alignment.TopCenter).background(Color.Black.copy(alpha = 0.35f)).statusBarsPadding()
                        .padding(horizontal = Space.S, vertical = Space.XS),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onDismiss) { Icon(Icons.Outlined.Close, "Cerrar", tint = Color.White) }
                    Text(
                        if (images.size > 1) "${pager.currentPage + 1} de ${images.size}" else images[pager.currentPage].name.orEmpty(),
                        color = Color.White,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        modifier = Modifier.weight(1f).padding(horizontal = Space.S),
                    )
                    IconButton(onClick = {
                        val a = images[pager.currentPage]
                        scope.launch {
                            runCatching { shareAttachment(context, a) }
                                .onFailure { Toast.makeText(context, it.userMessage(), Toast.LENGTH_LONG).show() }
                        }
                    }) { Icon(Icons.Outlined.Share, "Compartir", tint = Color.White) }
                    Spacer(Modifier.padding(end = Space.XS))
                }
            }
        }
    }
}

private fun clamp(offset: Offset, scale: Float, size: IntSize): Offset {
    val maxX = size.width * (scale - 1f) / 2f
    val maxY = size.height * (scale - 1f) / 2f
    return Offset(offset.x.coerceIn(-maxX, maxX), offset.y.coerceIn(-maxY, maxY))
}

@Composable
private fun ZoomableImage(
    a: ChatAttachment,
    active: Boolean,
    onZoomChange: (Boolean) -> Unit,
    onDrag: (Float) -> Unit,
    onDismiss: () -> Unit,
) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var dragY by remember { mutableFloatStateOf(0f) }
    val dismissPx = with(LocalDensity.current) { 140.dp.toPx() }
    LaunchedEffect(active) {
        if (!active) {
            scale = 1f
            offset = Offset.Zero
        }
    }
    Box(
        Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures(onDoubleTap = { tap ->
                    if (scale > 1f) {
                        scale = 1f
                        offset = Offset.Zero
                    } else {
                        scale = DOUBLE_TAP_ZOOM
                        val center = Offset(size.width / 2f, size.height / 2f)
                        offset = clamp((center - tap) * (DOUBLE_TAP_ZOOM - 1f), scale, size)
                    }
                    onZoomChange(scale > 1f)
                })
            }
            .pointerInput(Unit) {
                // Con un dedo y sin zoom no se consume nada: así la galería puede pasar de foto.
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        val pressed = event.changes.count { it.pressed }
                        if (pressed >= 2 || scale > 1f) {
                            scale = (scale * event.calculateZoom()).coerceIn(1f, MAX_ZOOM)
                            offset = if (scale > 1f) clamp(offset + event.calculatePan(), scale, size) else Offset.Zero
                            onZoomChange(scale > 1f)
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                }
            }
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragEnd = {
                        if (abs(dragY) > dismissPx) onDismiss()
                        dragY = 0f
                        onDrag(0f)
                    },
                    onDragCancel = {
                        dragY = 0f
                        onDrag(0f)
                    },
                ) { change, delta ->
                    if (scale <= 1f) {
                        dragY += delta
                        change.consume()
                        onDrag((abs(dragY) / (dismissPx * 3f)).coerceIn(0f, 1f))
                    }
                }
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = offset.x
                translationY = offset.y + dragY
            },
        contentAlignment = Alignment.Center,
    ) {
        SubcomposeAsyncImage(
            model = ApiClient.resolveUrl(a.url),
            contentDescription = a.name,
            contentScale = ContentScale.Fit,
            loading = { CircularProgressIndicator(color = Color.White) },
            error = { Icon(Icons.Outlined.BrokenImage, "No se pudo mostrar", tint = Color.White) },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
