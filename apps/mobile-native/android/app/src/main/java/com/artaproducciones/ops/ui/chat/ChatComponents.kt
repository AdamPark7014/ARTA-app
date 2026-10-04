package com.artaproducciones.ops.ui.chat

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.theme.ArtaColors

/** Escala de espacios del chat (4/8/12/16/24). */
object Space {
    val XS = 4.dp
    val S = 8.dp
    val M = 12.dp
    val L = 16.dp
    val XL = 24.dp
}

val OnlineGreen = Color(0xFF22C55E)

/** Nombres de un directo de grupo: el API los manda como «Ana, Luis, Marta». */
fun groupNames(name: String): List<String> = name.split(',').map { it.trim() }.filter { it.isNotBlank() }

fun kindLabel(kind: String?, isGroupDm: Boolean): String = when {
    isGroupDm -> "Grupo"
    kind == "DIRECT" -> "Mensaje directo"
    kind == "PRIVATE" -> "Canal privado"
    else -> "Canal público"
}

@Composable
fun PresenceAvatar(name: String, size: Dp = 44.dp, online: Boolean = false, modifier: Modifier = Modifier) {
    Box(modifier.size(size)) {
        Avatar(name, size = size)
        if (online) {
            val dot = (size * 0.3f).coerceAtLeast(10.dp)
            Box(
                Modifier.align(Alignment.BottomEnd).size(dot)
                    .background(ArtaColors.Bg, CircleShape).padding(2.dp)
                    .background(OnlineGreen, CircleShape),
            )
        }
    }
}

/** Dos avatares encimados para los directos de grupo. */
@Composable
fun StackedAvatars(names: List<String>, size: Dp = 44.dp, modifier: Modifier = Modifier) {
    val small = size * 0.68f
    Box(modifier.size(size)) {
        Avatar(names.getOrElse(0) { "?" }, size = small, modifier = Modifier.align(Alignment.TopStart))
        Box(
            Modifier.align(Alignment.BottomEnd).size(small).background(ArtaColors.Bg, CircleShape).padding(2.dp),
            contentAlignment = Alignment.Center,
        ) {
            Avatar(if (names.size > 2) "+ ${names.size - 1}" else names.getOrElse(1) { "+" }, size = small - 4.dp)
        }
    }
}

@Composable
fun ConversationAvatar(name: String, kind: String?, isGroupDm: Boolean, online: Boolean, size: Dp = 44.dp) {
    when {
        isGroupDm -> StackedAvatars(groupNames(name), size)
        kind == "DIRECT" -> PresenceAvatar(name, size, online)
        else -> Avatar(name, size = size, channel = true)
    }
}

@Composable
fun skeletonAlpha(): Float {
    val t = rememberInfiniteTransition(label = "skeleton")
    val a by t.animateFloat(0.35f, 0.75f, infiniteRepeatable(tween(850), RepeatMode.Reverse), label = "alpha")
    return a
}

@Composable
fun SkeletonBox(modifier: Modifier, alpha: Float, shape: Shape = RoundedCornerShape(6.dp)) {
    Box(modifier.alpha(alpha).background(ArtaColors.Surface2, shape))
}

/** Esqueleto de filas tipo lista (chats, búsqueda, guardados). */
@Composable
fun ListSkeleton(rows: Int = 8, modifier: Modifier = Modifier) {
    val a = skeletonAlpha()
    Column(modifier.fillMaxWidth()) {
        repeat(rows) { i ->
            Row(Modifier.fillMaxWidth().padding(horizontal = Space.L, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                SkeletonBox(Modifier.size(44.dp), a, CircleShape)
                Spacer(Modifier.width(Space.M))
                Column(Modifier.weight(1f)) {
                    SkeletonBox(Modifier.width((110 + (i * 37) % 90).dp).height(14.dp), a)
                    Spacer(Modifier.height(Space.S))
                    SkeletonBox(Modifier.fillMaxWidth(0.55f + ((i * 13) % 30) / 100f).height(12.dp), a)
                }
            }
        }
    }
}

/** Esqueleto de burbujas mientras carga la conversación. */
@Composable
fun ConversationSkeleton(modifier: Modifier = Modifier) {
    val a = skeletonAlpha()
    val pattern = listOf(false to 180, false to 240, true to 150, false to 210, true to 260, true to 120, false to 190)
    Column(modifier.fillMaxSize().padding(Space.M), verticalArrangement = Arrangement.spacedBy(Space.S, Alignment.Bottom)) {
        pattern.forEach { (mine, w) ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                if (!mine) {
                    SkeletonBox(Modifier.size(32.dp), a, CircleShape)
                    Spacer(Modifier.width(Space.S))
                }
                SkeletonBox(Modifier.width(w.dp).height(44.dp), a, RoundedCornerShape(16.dp))
            }
        }
    }
}

@Composable
fun ErrorState(message: String?, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(Space.XL),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Space.S),
    ) {
        Icon(Icons.Outlined.CloudOff, null, tint = ArtaColors.Muted, modifier = Modifier.size(40.dp))
        Text("No se pudo cargar", style = MaterialTheme.typography.titleMedium)
        if (!message.isNullOrBlank()) {
            Text(message, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(Space.XS))
        Button(
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(containerColor = ArtaColors.Gold, contentColor = ArtaColors.Bg),
        ) { Text("Reintentar") }
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, subtitle: String? = null, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(Space.XL),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Space.S),
    ) {
        Box(Modifier.size(64.dp).background(ArtaColors.GoldSoft, CircleShape), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = ArtaColors.Gold, modifier = Modifier.size(30.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (!subtitle.isNullOrBlank()) {
            Text(subtitle, color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        }
    }
}
