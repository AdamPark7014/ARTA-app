package com.artaproducciones.ops.ui

import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.UserDto
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.ui.chat.ChannelInfoScreen
import com.artaproducciones.ops.ui.chat.ChatListScreen
import com.artaproducciones.ops.ui.chat.ChatSearchScreen
import com.artaproducciones.ops.ui.chat.ConversationScreen
import com.artaproducciones.ops.ui.chat.NewConversationScreen
import com.artaproducciones.ops.ui.chat.SavedMessagesScreen
import com.artaproducciones.ops.ui.login.LoginScreen
import com.artaproducciones.ops.ui.modules.ApprovalsScreen
import com.artaproducciones.ops.ui.modules.EventDetailScreen
import com.artaproducciones.ops.ui.modules.EventsScreen
import com.artaproducciones.ops.ui.modules.InicioScreen
import com.artaproducciones.ops.ui.modules.ModuleNav
import com.artaproducciones.ops.ui.modules.TaskDetailScreen
import com.artaproducciones.ops.ui.modules.TasksScreen
import com.artaproducciones.ops.ui.more.BlockedUsersScreen
import com.artaproducciones.ops.ui.more.MoreScreen
import com.artaproducciones.ops.ui.notifications.NotificationsScreen
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.web.ArtaWebScreen
import kotlinx.coroutines.flow.StateFlow

/** `navigate("approvals")` sigue valiendo: el argumento es opcional. */
private const val APPROVALS_ROUTE = "approvals?advance={advance}"

/** Más › Usuarios bloqueados (chat). */
private const val BLOCKED_USERS_ROUTE = "blocked-users"

/** Pestañas del cascarón, en el orden del contrato de paridad. */
enum class Tab { Inicio, Chats, Tareas, Avisos, Mas }

/**
 * A dónde lleva un enlace interno del panel (`url` de avisos push y campana, enlaces
 * de la vista web). Reglas en `docs/PARIDAD-MOVIL-CONTRATO.md` §4.
 */
sealed interface DeepLink {
    data class Chat(val channelId: String, val messageId: String?) : DeepLink
    data class Task(val taskId: String) : DeepLink
    data class Event(val eventId: String) : DeepLink
    data object Approvals : DeepLink
    /** Aprobaciones con la tarjeta de ese anticipo enfocada (`/advances?advance=<id>`). */
    data class Advance(val advanceId: String) : DeepLink
    data object Events : DeepLink
    data class Section(val tab: Tab) : DeepLink
    data class Web(val path: String, val title: String? = null) : DeepLink

    val isNative: Boolean get() = this !is Web

    companion object {
        /** Pestañas del hub del evento que tienen versión nativa; las demás abren la web. */
        private val NATIVE_EVENT_TABS = setOf("", "overview", "summary", "resumen", "tasks", "tareas")

        fun from(
            channelId: String?,
            messageId: String?,
            url: String?,
            type: String? = null,
            forceApprovals: Boolean = false,
        ): DeepLink? {
            if (!channelId.isNullOrBlank()) return Chat(channelId, messageId?.takeIf { it.isNotBlank() })
            val link = url?.takeIf { it.isNotBlank() }?.let { parse(it, type) }
            if (forceApprovals) return link as? Task ?: link as? Advance ?: Approvals
            return link
        }

        /**
         * `/ruta?query` (o URL absoluta del mismo panel) → destino. [type] es el `type`
         * del aviso: una OC o anticipo con acción pendiente abre aprobaciones nativas.
         * Devuelve null para hosts ajenos.
         */
        fun parse(url: String, type: String? = null): DeepLink? {
            val uri = Uri.parse(url.trim())
            if (uri.isAbsolute) {
                val origin = Uri.parse(ApiClient.origin)
                if (!uri.host.equals(origin.host, ignoreCase = true)) return null
            }
            val segments = uri.pathSegments.orEmpty().filter { it.isNotBlank() }
            val relative = (uri.encodedPath ?: "/").ifBlank { "/" } + (uri.encodedQuery?.let { "?$it" } ?: "")
            fun q(name: String) = runCatching { uri.getQueryParameter(name) }.getOrNull()?.takeIf { it.isNotBlank() }

            return when (segments.firstOrNull()) {
                null, "dashboard" -> Section(Tab.Inicio)
                "notifications" -> Section(Tab.Avisos)
                "chat" -> q("channel")?.let { Chat(it, q("msg")) } ?: Section(Tab.Chats)
                "tasks" -> (segments.getOrNull(1) ?: q("task"))?.let(::Task) ?: Section(Tab.Tareas)
                "calendar" -> Events
                "events" -> {
                    val id = segments.getOrNull(1)
                    when {
                        id == null -> if (q("scope") == "past") Web(relative) else Events
                        id == "new" -> Web(relative)
                        q("task") != null -> Task(q("task")!!)
                        segments.size > 2 -> Web(relative)
                        (q("tab") ?: "").lowercase() in NATIVE_EVENT_TABS -> Event(id)
                        else -> Web(relative)
                    }
                }
                "purchase-orders", "advances" -> when {
                    !isPendingApproval(type) -> Web(relative)
                    segments.first() == "advances" -> q("advance")?.let(::Advance) ?: Approvals
                    else -> Approvals
                }
                else -> Web(relative)
            }
        }

        private fun isPendingApproval(type: String?): Boolean {
            val t = type?.trim()?.lowercase().orEmpty()
            return t == "po.requested" || t == "advance.to_pay" || t.endsWith(".review") || t.endsWith(".requested")
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

@Composable
private fun SignedInNav(user: UserDto, pendingLink: StateFlow<DeepLink?>, onLinkConsumed: () -> Unit) {
    val nav = rememberNavController()
    var tab by rememberSaveable { mutableStateOf(Tab.Inicio) }
    val link by pendingLink.collectAsState()

    fun go(target: DeepLink) {
        when (target) {
            is DeepLink.Chat -> nav.navigate("chat/${target.channelId}" + (target.messageId?.let { "?msg=$it" } ?: ""))
            is DeepLink.Task -> nav.navigate("task/${Uri.encode(target.taskId)}")
            is DeepLink.Event -> nav.navigate("event/${Uri.encode(target.eventId)}")
            DeepLink.Approvals -> nav.navigate("approvals") { launchSingleTop = true }
            is DeepLink.Advance -> nav.navigate("approvals?advance=${Uri.encode(target.advanceId)}")
            DeepLink.Events -> nav.navigate("events") { launchSingleTop = true }
            is DeepLink.Section -> {
                nav.popBackStack("home", inclusive = false)
                tab = target.tab
            }
            is DeepLink.Web -> nav.navigate("web?path=${Uri.encode(target.path)}&title=${Uri.encode(target.title.orEmpty())}")
        }
    }

    /** ¿[target] es justo la pantalla nativa de arriba? Entonces se pide su versión web, no la misma. */
    fun isCurrent(target: DeepLink): Boolean {
        val entry = nav.currentBackStackEntry ?: return false
        val args = entry.arguments
        return when (target) {
            is DeepLink.Task -> entry.destination.route == "task/{id}" && args?.getString("id") == target.taskId
            is DeepLink.Event -> entry.destination.route == "event/{id}" && args?.getString("id") == target.eventId
            DeepLink.Approvals -> entry.destination.route == APPROVALS_ROUTE
            is DeepLink.Advance -> entry.destination.route == APPROVALS_ROUTE && args?.getString("advance") == target.advanceId
            DeepLink.Events -> entry.destination.route == "events"
            else -> false
        }
    }

    val moduleNav = remember(nav) {
        object : ModuleNav {
            override fun openTask(id: String) = go(DeepLink.Task(id))
            override fun openEvent(id: String) = go(DeepLink.Event(id))
            override fun openApprovals() = go(DeepLink.Approvals)
            override fun openChat(channelId: String) = go(DeepLink.Chat(channelId, null))
            override fun openBlockedUsers() {
                nav.navigate(BLOCKED_USERS_ROUTE) { launchSingleTop = true }
            }
            override fun back() {
                if (nav.previousBackStackEntry != null) nav.popBackStack() else tab = Tab.Inicio
            }

            // Lo que tiene pantalla nativa se abre nativo aunque lo pidan como web.
            override fun openWeb(path: String, title: String?) {
                val target = DeepLink.parse(path)
                if (target != null && target.isNative && !isCurrent(target)) go(target) else go(DeepLink.Web(path, title))
            }
        }
    }

    LaunchedEffect(link) {
        val l = link ?: return@LaunchedEffect
        nav.popBackStack("home", inclusive = false)
        go(l)
        onLinkConsumed()
    }

    NavHost(navController = nav, startDestination = "home") {
        composable("home") {
            HomeScreen(
                user = user,
                tab = tab,
                onTab = { tab = it },
                openChat = { id -> nav.navigate("chat/$id") },
                moduleNav = moduleNav,
                openLink = ::go,
            )
        }
        composable(
            route = "task/{id}",
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            TaskDetailScreen(taskId = entry.arguments?.getString("id").orEmpty(), nav = moduleNav)
        }
        composable(
            route = "event/{id}",
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            EventDetailScreen(eventId = entry.arguments?.getString("id").orEmpty(), nav = moduleNav)
        }
        composable(
            route = APPROVALS_ROUTE,
            arguments = listOf(navArgument("advance") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry ->
            ApprovalsScreen(nav = moduleNav, focusAdvanceId = entry.arguments?.getString("advance"))
        }
        composable("events") { EventsScreen(nav = moduleNav) }
        composable(BLOCKED_USERS_ROUTE) { BlockedUsersScreen(onBack = { nav.popBackStack() }) }
        composable(
            route = "web?path={path}&title={title}",
            arguments = listOf(
                navArgument("path") { type = NavType.StringType; defaultValue = "/dashboard" },
                navArgument("title") { type = NavType.StringType; defaultValue = "" },
            ),
        ) { entry ->
            ArtaWebScreen(
                path = entry.arguments?.getString("path").orEmpty().ifBlank { "/dashboard" },
                title = entry.arguments?.getString("title")?.takeIf { it.isNotBlank() },
                nav = moduleNav,
                resolveNative = { path ->
                    DeepLink.parse(path)?.takeIf { it.isNative }?.let { target -> { go(target) } }
                },
            )
        }
        // Rutas literales de chat: van antes de "chat/{channelId}" y la coincidencia exacta gana.
        composable("chat/buscar") {
            ChatSearchScreen(onBack = { nav.popBackStack() }, openMessage = { c, m -> nav.navigate("chat/$c?msg=$m") })
        }
        composable("chat/guardados") {
            SavedMessagesScreen(onBack = { nav.popBackStack() }, openMessage = { c, m -> nav.navigate("chat/$c?msg=$m") })
        }
        composable("chat/nueva") {
            NewConversationScreen(
                onBack = { nav.popBackStack() },
                openChat = { id ->
                    nav.popBackStack()
                    nav.navigate("chat/$id")
                },
            )
        }
        composable(
            route = "chat/{channelId}/info",
            arguments = listOf(navArgument("channelId") { type = NavType.StringType }),
        ) { entry ->
            ChannelInfoScreen(
                channelId = entry.arguments?.getString("channelId").orEmpty(),
                onBack = { nav.popBackStack() },
                openChat = { id -> nav.navigate("chat/$id") },
                openMessage = { c, m -> nav.navigate("chat/$c?msg=$m") },
                onLeft = { nav.popBackStack("home", inclusive = false) },
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
private fun HomeScreen(
    user: UserDto,
    tab: Tab,
    onTab: (Tab) -> Unit,
    openChat: (String) -> Unit,
    moduleNav: ModuleNav,
    openLink: (DeepLink) -> Unit,
) {
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
                    selected = tab == Tab.Inicio,
                    onClick = { onTab(Tab.Inicio) },
                    icon = { Icon(Icons.Outlined.Home, null) },
                    label = { Text("Inicio") },
                    colors = colors,
                )
                NavigationBarItem(
                    selected = tab == Tab.Chats,
                    onClick = { onTab(Tab.Chats) },
                    icon = { Counted(chatUnread) { Icon(Icons.AutoMirrored.Outlined.Chat, null) } },
                    label = { Text("Chats") },
                    colors = colors,
                )
                NavigationBarItem(
                    selected = tab == Tab.Tareas,
                    onClick = { onTab(Tab.Tareas) },
                    icon = { Icon(Icons.Outlined.TaskAlt, null) },
                    label = { Text("Tareas") },
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
                    selected = tab == Tab.Mas,
                    onClick = { onTab(Tab.Mas) },
                    icon = { Icon(Icons.Outlined.Menu, null) },
                    label = { Text("Más") },
                    colors = colors,
                )
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when (tab) {
                Tab.Inicio -> InicioScreen(user = user, nav = moduleNav)
                Tab.Chats -> ChatListScreen(openChat = openChat)
                Tab.Tareas -> TasksScreen(nav = moduleNav)
                Tab.Avisos -> NotificationsScreen(openLink = openLink, onUnreadChange = { noticeUnread = it })
                Tab.Mas -> MoreScreen(user = user, nav = moduleNav)
            }
        }
    }
}

@Composable
private fun Counted(count: Int, icon: @Composable () -> Unit) {
    if (count <= 0) icon() else BadgedBox(badge = { Badge { Text(if (count > 99) "99+" else "$count") } }) { icon() }
}
