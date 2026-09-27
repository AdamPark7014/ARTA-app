package com.artaproducciones.ops.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.UserDto
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.push.PushRegistration
import com.artaproducciones.ops.ui.chat.ChatListScreen
import com.artaproducciones.ops.ui.chat.ConversationScreen
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.login.LoginScreen
import com.artaproducciones.ops.ui.notifications.NotificationsScreen
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** A dónde lleva un aviso tocado (mismas URLs internas que genera el API). */
sealed interface DeepLink {
    data class Chat(val channelId: String, val messageId: String?) : DeepLink
    data class Notifications(val url: String?) : DeepLink

    companion object {
        fun from(channelId: String?, messageId: String?, url: String?): DeepLink? {
            if (!channelId.isNullOrBlank()) return Chat(channelId, messageId?.takeIf { it.isNotBlank() })
            if (url.isNullOrBlank()) return null
            val uri = Uri.parse(url)
            if (uri.path == "/chat") {
                val channel = uri.getQueryParameter("channel")
                if (!channel.isNullOrBlank()) return Chat(channel, uri.getQueryParameter("msg"))
            }
            return Notifications(url)
        }
    }
}

@Composable
fun ArtaApp(pendingLink: StateFlow<DeepLink?>, onLinkConsumed: () -> Unit) {
    val state by Session.state.collectAsState()
    when (val s = state) {
        Session.State.Loading -> Box(Modifier.fillMaxSize())
        Session.State.SignedOut -> LoginScreen()
        is Session.State.SignedIn -> SignedInNav(s.user, pendingLink, onLinkConsumed)
    }
}

private enum class Tab { Chats, Avisos, Perfil }

@Composable
private fun SignedInNav(user: UserDto, pendingLink: StateFlow<DeepLink?>, onLinkConsumed: () -> Unit) {
    val nav = rememberNavController()
    var tab by rememberSaveable { mutableStateOf(Tab.Chats) }
    val link by pendingLink.collectAsState()

    LaunchedEffect(link) {
        when (val l = link) {
            is DeepLink.Chat -> {
                nav.popBackStack("home", inclusive = false)
                nav.navigate("chat/${l.channelId}" + (l.messageId?.let { "?msg=$it" } ?: ""))
                onLinkConsumed()
            }
            is DeepLink.Notifications -> {
                nav.popBackStack("home", inclusive = false)
                tab = Tab.Avisos
                onLinkConsumed()
            }
            null -> Unit
        }
    }

    NavHost(navController = nav, startDestination = "home") {
        composable("home") {
            HomeScreen(
                user = user,
                tab = tab,
                onTab = { tab = it },
                openChat = { id -> nav.navigate("chat/$id") },
            )
        }
        composable(
            route = "chat/{channelId}?msg={msg}",
            arguments = listOf(
                navArgument("channelId") { type = NavType.StringType },
                navArgument("msg") { type = NavType.StringType; nullable = true; defaultValue = null },
            ),
        ) { entry ->
            val channelId = entry.arguments?.getString("channelId").orEmpty()
            ConversationScreen(
                channelId = channelId,
                parentId = null,
                focusMessageId = entry.arguments?.getString("msg"),
                onBack = { nav.popBackStack() },
                openThread = { rootId -> nav.navigate("thread/$channelId/$rootId") },
                openChat = { id -> nav.navigate("chat/$id") },
            )
        }
        composable(
            route = "thread/{channelId}/{rootId}",
            arguments = listOf(
                navArgument("channelId") { type = NavType.StringType },
                navArgument("rootId") { type = NavType.StringType },
            ),
        ) { entry ->
            ConversationScreen(
                channelId = entry.arguments?.getString("channelId").orEmpty(),
                parentId = entry.arguments?.getString("rootId"),
                focusMessageId = null,
                onBack = { nav.popBackStack() },
                openThread = {},
                openChat = { id -> nav.navigate("chat/$id") },
            )
        }
    }
}

@Composable
private fun HomeScreen(user: UserDto, tab: Tab, onTab: (Tab) -> Unit, openChat: (String) -> Unit) {
    var chatUnread by remember { mutableIntStateOf(0) }
    var noticeUnread by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        runCatching { chatUnread = ApiClient.api.chatUnread().total }
        runCatching { noticeUnread = ApiClient.api.notificationsUnread().count }
    }
    LaunchedEffect(Unit) { RealtimeClient.chatUnread.collect { chatUnread = it } }
    LaunchedEffect(Unit) { RealtimeClient.notificationsUnread.collect { noticeUnread = it } }

    Scaffold(
        containerColor = ArtaColors.Bg,
        bottomBar = {
            NavigationBar(containerColor = ArtaColors.BgElev) {
                val colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = ArtaColors.Bg,
                    indicatorColor = ArtaColors.Gold,
                    selectedTextColor = ArtaColors.Gold,
                    unselectedIconColor = ArtaColors.Muted,
                    unselectedTextColor = ArtaColors.Muted,
                )
                NavigationBarItem(
                    selected = tab == Tab.Chats,
                    onClick = { onTab(Tab.Chats) },
                    icon = { Counted(chatUnread) { Icon(Icons.AutoMirrored.Outlined.Chat, null) } },
                    label = { Text("Chats") },
                    colors = colors,
                )
                NavigationBarItem(
                    selected = tab == Tab.Avisos,
                    onClick = { onTab(Tab.Avisos) },
                    icon = { Counted(noticeUnread) { Icon(Icons.Outlined.Notifications, null) } },
                    label = { Text("Avisos") },
                    colors = colors,
                )
                NavigationBarItem(
                    selected = tab == Tab.Perfil,
                    onClick = { onTab(Tab.Perfil) },
                    icon = { Icon(Icons.Outlined.Person, null) },
                    label = { Text("Perfil") },
                    colors = colors,
                )
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when (tab) {
                Tab.Chats -> ChatListScreen(openChat = openChat)
                Tab.Avisos -> NotificationsScreen(openChat = openChat, onUnreadChange = { noticeUnread = it })
                Tab.Perfil -> ProfileTab(user)
            }
        }
    }
}

@Composable
private fun Counted(count: Int, icon: @Composable () -> Unit) {
    if (count <= 0) icon() else BadgedBox(badge = { Badge { Text(if (count > 99) "99+" else "$count") } }) { icon() }
}

@Composable
private fun ProfileTab(user: UserDto) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Avatar(user.fullName, size = 88.dp)
        Text(user.fullName, style = MaterialTheme.typography.headlineSmall)
        user.email?.let { Text(it, color = ArtaColors.Muted) }
        if (!PushRegistration.available) {
            Text(
                "Esta compilación no tiene Firebase configurado: no llegarán avisos push.",
                color = ArtaColors.Muted,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        OutlinedButton(
            onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ApiClient.origin))) },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Abrir el panel web") }
        Button(
            onClick = {
                busy = true
                scope.launch { Session.logout() }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (busy) "Cerrando sesión…" else "Cerrar sesión") }
    }
}
