package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddReaction
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.launch

/** Mismas 8 reacciones rápidas y en el mismo orden que web e iOS (contrato §8). */
val QUICK_REACTIONS = listOf("👍", "❤️", "😂", "🎉", "👀", "🔥", "✅", "🙏")

private fun emojis(s: String) = s.split(' ').filter { it.isNotBlank() }

/** Lista local por categorías: sin CDN ni fuentes externas. */
val EMOJI_CATEGORIES: List<Pair<String, List<String>>> = listOf(
    "Caras" to emojis(
        "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 " +
            "😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 " +
            "😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖",
    ),
    "Gestos" to emojis(
        "👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶 👀 🧠 🫡 🤷 🤦 🙋 🙇 💁 🙆 🙅",
    ),
    "Corazones" to emojis("❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟"),
    "Celebración" to emojis("🎉 🎊 🥳 🎈 🎁 🎂 🍾 🥂 🍻 🏆 🥇 🥈 🥉 🏅 🎖️ ⭐ 🌟 ✨ 💫 🔥 💥 🎆 🎇"),
    "Escenario" to emojis("🎤 🎧 🎼 🎵 🎶 🎹 🥁 🎷 🎺 🎸 🎻 🎬 🎭 🎟️ 🎫 📸 📷 🎥 📹 💡 🔦 🔊 📢 📣 🎪"),
    "Trabajo" to emojis(
        "✅ ☑️ ✔️ ❌ ❗ ❓ ⚠️ 🚫 ⏰ ⏳ 📅 📆 🗓️ 📌 📍 📎 📝 📋 📁 📂 📊 📈 📉 💼 💰 💵 💳 🧾 📦 🚚 🚗 ✈️ 🏨 🔑 🔒 🔓 " +
            "💻 📱 ☎️ 📞 📧 ✉️ 🔗 🛠️ 🔧 🔨 ⚙️",
    ),
    "Comida" to emojis("☕ 🍵 🥤 🍺 🍷 🍸 🍹 🍕 🍔 🌮 🌯 🍟 🌭 🥪 🍣 🍜 🍝 🥗 🍰 🍩 🍪 🍫 🍿 🍎 🍌 🍉 🍓 🥑"),
    "Naturaleza" to emojis("☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌈 ❄️ 🌙 🌊 🌵 🌴 🌲 🌸 🌹 🌻 🍀 🐶 🐱 🦁 🐯 🐻 🐼 🐵 🦄 🐝 🦋 🐢"),
    "Símbolos" to emojis("💯 🆗 🆕 🆒 🔝 ➕ ➖ ✖️ ➗ ♻️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟩 🟦 ⬆️ ⬇️ ➡️ ⬅️ 🔁 🔄 ▶️ ⏸️ ⏹️ 🔔 🔕 💤"),
)

/** Fila de reacciones rápidas + botón para el selector completo. */
@Composable
fun QuickReactionRow(onReact: (String) -> Unit, onMore: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().padding(horizontal = Space.M, vertical = Space.S),
        horizontalArrangement = Arrangement.spacedBy(Space.XS),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        QUICK_REACTIONS.forEach { e ->
            Box(
                Modifier.weight(1f).aspectRatio(1f).clip(CircleShape).background(ArtaColors.Surface2).clickable { onReact(e) },
                contentAlignment = Alignment.Center,
            ) { Text(e, fontSize = 20.sp) }
        }
        Box(
            Modifier.weight(1f).aspectRatio(1f).clip(CircleShape).background(ArtaColors.Surface2).clickable(onClick = onMore),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Outlined.AddReaction, "Más reacciones", tint = ArtaColors.Muted, modifier = Modifier.size(20.dp)) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmojiPickerSheet(onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val gridState = rememberLazyGridState()
    val scope = rememberCoroutineScope()
    // Posición del encabezado de cada categoría dentro de la cuadrícula.
    val headerIndex = remember {
        var i = 0
        EMOJI_CATEGORIES.map { (_, list) -> i.also { i += list.size + 1 } }
    }
    val selected by remember {
        derivedStateOf { headerIndex.indexOfLast { it <= gridState.firstVisibleItemIndex }.coerceAtLeast(0) }
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = ArtaColors.BgElev,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        ScrollableTabRow(
            selectedTabIndex = selected,
            containerColor = ArtaColors.BgElev,
            contentColor = ArtaColors.Gold,
            edgePadding = Space.S,
            divider = {},
        ) {
            EMOJI_CATEGORIES.forEachIndexed { i, (label, list) ->
                Tab(
                    selected = i == selected,
                    onClick = { scope.launch { gridState.animateScrollToItem(headerIndex[i]) } },
                    text = { Text("${list.first()} $label", maxLines = 1) },
                    unselectedContentColor = ArtaColors.Muted,
                )
            }
        }
        LazyVerticalGrid(
            columns = GridCells.Adaptive(48.dp),
            state = gridState,
            contentPadding = PaddingValues(horizontal = Space.S, vertical = Space.S),
            modifier = Modifier.fillMaxWidth().height(400.dp),
        ) {
            EMOJI_CATEGORIES.forEach { (label, list) ->
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        label,
                        color = ArtaColors.Muted,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(horizontal = Space.S, vertical = Space.S),
                    )
                }
                items(list) { e ->
                    Box(
                        Modifier.size(48.dp).clip(CircleShape).clickable { onPick(e) },
                        contentAlignment = Alignment.Center,
                    ) { Text(e, fontSize = 26.sp) }
                }
            }
        }
        Spacer(Modifier.navigationBarsPadding().padding(bottom = Space.S))
    }
}
