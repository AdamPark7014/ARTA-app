package com.artaproducciones.ops.ui.more

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Brush
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.ConfirmationNumber
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.DirectionsBus
import androidx.compose.material.icons.outlined.DoNotDisturbOn
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Hotel
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.PersonRemove
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material.icons.outlined.RequestQuote
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Summarize
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material.icons.outlined.Webhook
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.BuildConfig
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.UserDto
import com.artaproducciones.ops.push.PushRegistration
import com.artaproducciones.ops.ui.chat.ModerationText
import com.artaproducciones.ops.ui.common.Avatar
import com.artaproducciones.ops.ui.common.LegalLinks
import com.artaproducciones.ops.ui.modules.ModuleNav
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Módulo del panel web que se abre en la vista web de la app. */
data class WebModule(
    val path: String,
    val label: String,
    val group: String,
    val icon: ImageVector,
    val hidden: Boolean,
)

/**
 * Espejo de `apps/web/lib/access-matrix.ts` (`NAV_ITEMS` + `visibleNavItems`) y de
 * `@arta/rbac` (`ROLE_PERMISSIONS`, `hasPermission`, `canAccessEventOps`). Si cambia
 * el menú lateral de la web, cambia aquí: la regla es «mismo menú, mismos permisos».
 */
object WebModules {
    private const val HIDDEN_GROUP = "Vistas de portafolio"
    private const val ARTA = "ARTA"
    private const val EXPLANADA = "EXPLANADA"

    /** Lo que ya es pestaña nativa no se repite en «Más». */
    private val NATIVE_TABS = setOf("/dashboard", "/chat", "/tasks")

    private val FOLDER_CENTRIC_ROLES = setOf("convenios", "enlace_gobierno", "solo_carpetas")

    private val ALL_PERMISSIONS = listOf(
        "finance.view", "finance.edit", "campaign.view", "campaign.edit", "po.authorize", "po.mark_paid",
        "event.create", "event.close", "checklist.edit", "studio.edit", "ticketing.edit", "folders.edit", "vendor.pin",
    )

    private val ROLE_PERMISSIONS: Map<String, List<String>> = mapOf(
        "super_admin" to listOf("everything"),
        "dir_general" to listOf("everything", "users.manage") + ALL_PERMISSIONS,
        "dir_adjunta" to ALL_PERMISSIONS,
        "gerente_arta" to listOf(
            "finance.edit", "finance.view", "campaign.edit", "campaign.view", "po.authorize", "po.mark_paid",
            "event.create", "event.close", "checklist.edit", "studio.edit", "ticketing.edit", "folders.edit", "vendor.pin",
        ),
        "dir_auditorio" to listOf(
            "finance.view", "campaign.view", "po.authorize", "po.mark_paid", "event.create", "event.close",
            "checklist.edit", "studio.edit", "ticketing.edit", "folders.edit", "vendor.pin",
        ),
        "logistica" to listOf("campaign.edit", "campaign.view", "checklist.edit", "event.create", "ticketing.edit", "finance.view", "folders.edit"),
        "convenios" to listOf("checklist.edit", "finance.view", "campaign.view", "folders.edit"),
        "enlace_gobierno" to listOf("checklist.edit", "finance.view", "po.mark_paid", "event.create", "folders.edit"),
        "solo_carpetas" to emptyList(),
    )

    private val ROLE_DEFAULT_ENTITIES: Map<String, List<String>> = mapOf(
        "gerente_arta" to listOf(ARTA),
        "dir_auditorio" to listOf(EXPLANADA, ARTA),
    )

    private val ROLE_LABELS = mapOf(
        "super_admin" to "Administración de plataforma",
        "dir_general" to "Dirección general",
        "dir_adjunta" to "Dirección adjunta",
        "gerente_arta" to "Gerencia Arta",
        "dir_auditorio" to "Dirección Auditorio",
        "logistica" to "Logística y producción",
        "convenios" to "Convenios y patrocinios",
        "enlace_gobierno" to "Enlace gobierno y pagos",
        "solo_carpetas" to "Solo carpetas",
    )

    private val EVERYONE_BUT_FOLDERS = listOf(
        "super_admin", "dir_general", "dir_adjunta", "gerente_arta", "dir_auditorio", "logistica", "convenios", "enlace_gobierno",
    )
    private val ADMINS = listOf("dir_general", "super_admin")
    private val DIRECTION = listOf("dir_general", "dir_adjunta", "super_admin")
    private val OPS = listOf("checklist.edit", "event.create", "everything")

    private class Rule(
        val href: String,
        val label: String,
        val group: String,
        val icon: ImageVector,
        val query: String? = null,
        val permissions: List<String> = emptyList(),
        val roles: List<String> = emptyList(),
        val entities: List<String> = emptyList(),
        val requiresEventOps: Boolean = false,
        val hidden: Boolean = false,
    ) {
        val path: String get() = if (query != null) "$href?$query" else href
    }

    private val RULES = listOf(
        Rule("/dashboard", "Inicio", "Inicio", Icons.Outlined.Event),
        Rule("/chat", "Chat", "Inicio", Icons.Outlined.Event),
        Rule("/events/new", "Crear evento", "Eventos", Icons.Outlined.AddCircleOutline, permissions = listOf("event.create", "everything"), requiresEventOps = true),
        Rule("/events", "Eventos actuales", "Eventos", Icons.Outlined.Event, query = "scope=active", requiresEventOps = true),
        Rule("/events", "Eventos pasados", "Eventos", Icons.Outlined.History, query = "scope=past", requiresEventOps = true),
        Rule("/calendar", "Calendario", "Eventos", Icons.Outlined.CalendarMonth, requiresEventOps = true),
        Rule("/tasks", "Tareas", "Eventos", Icons.Outlined.Checklist, roles = EVERYONE_BUT_FOLDERS),
        Rule("/purchase-orders", "Órdenes de compra", "Control", Icons.Outlined.Receipt, permissions = listOf("po.authorize", "po.mark_paid", "everything"), requiresEventOps = true),
        Rule("/studio", "Studio web", "Marca", Icons.Outlined.Brush, permissions = listOf("studio.edit", "everything"), entities = listOf(ARTA)),
        Rule("/site", "Ver sitio Arta", "Marca", Icons.Outlined.Public, entities = listOf(ARTA)),
        Rule("/users", "Usuarios", "Admin", Icons.Outlined.Group, permissions = listOf("users.manage", "everything"), roles = ADMINS),
        Rule("/settings", "Configuración", "Admin", Icons.Outlined.Settings, permissions = listOf("users.manage", "everything"), roles = DIRECTION),
        Rule("/organizations", "Organizaciones", "Admin", Icons.Outlined.Business, permissions = listOf("users.manage", "everything"), roles = ADMINS),
        Rule("/security", "Seguridad", "Admin", Icons.Outlined.Security),
        Rule("/audit", "Auditoría", "Admin", Icons.AutoMirrored.Outlined.FactCheck, permissions = listOf("users.manage", "everything"), roles = DIRECTION),
        Rule("/webhooks", "Webhooks", "Admin", Icons.Outlined.Webhook, permissions = listOf("users.manage", "everything"), roles = DIRECTION),
        Rule("/digests", "Resúmenes", "Admin", Icons.Outlined.Summarize, permissions = listOf("users.manage", "everything"), roles = DIRECTION),
        Rule("/checklists", "Plantillas", HIDDEN_GROUP, Icons.Outlined.Checklist, permissions = listOf("checklist.edit", "everything"), requiresEventOps = true, hidden = true),
        Rule("/folders", "Carpetas generales", HIDDEN_GROUP, Icons.Outlined.Folder, permissions = listOf("folders.edit", "checklist.edit", "everything"), hidden = true),
        Rule("/finance", "Finanzas", HIDDEN_GROUP, Icons.Outlined.AccountBalance, permissions = listOf("finance.view", "finance.edit", "everything"), requiresEventOps = true, hidden = true),
        Rule("/campaigns", "Campañas", "Control", Icons.Outlined.Campaign, permissions = listOf("campaign.view", "campaign.edit", "everything"), requiresEventOps = true),
        Rule("/ticketing", "Boletera", "Control", Icons.Outlined.ConfirmationNumber, permissions = listOf("ticketing.edit", "everything"), requiresEventOps = true),
        Rule("/advances", "Anticipos", HIDDEN_GROUP, Icons.Outlined.RequestQuote, permissions = listOf("checklist.edit", "finance.view", "finance.edit", "everything"), requiresEventOps = true, hidden = true),
        Rule("/hospitality", "Hospedaje", HIDDEN_GROUP, Icons.Outlined.Hotel, permissions = OPS, requiresEventOps = true, hidden = true),
        Rule("/transport", "Transportación", HIDDEN_GROUP, Icons.Outlined.DirectionsBus, permissions = OPS, requiresEventOps = true, hidden = true),
        Rule("/catering", "Catering", HIDDEN_GROUP, Icons.Outlined.Restaurant, permissions = OPS, requiresEventOps = true, hidden = true),
        Rule("/press", "Rueda de prensa", HIDDEN_GROUP, Icons.Outlined.Mic, permissions = OPS, requiresEventOps = true, hidden = true),
        Rule("/arts", "Artes", HIDDEN_GROUP, Icons.Outlined.Palette, permissions = OPS, requiresEventOps = true, hidden = true),
        Rule("/pendones", "Pendones", HIDDEN_GROUP, Icons.Outlined.Flag, permissions = OPS, requiresEventOps = true, hidden = true),
        Rule("/risk", "Riesgo", HIDDEN_GROUP, Icons.Outlined.ReportProblem, permissions = OPS, requiresEventOps = true, hidden = true),
        Rule("/maintenance", "Mantenimiento", HIDDEN_GROUP, Icons.Outlined.Build, permissions = OPS, entities = listOf(EXPLANADA), requiresEventOps = true, hidden = true),
        Rule("/vendor", "PIN proveedores", HIDDEN_GROUP, Icons.Outlined.Key, permissions = listOf("vendor.pin", "everything"), requiresEventOps = true, hidden = true),
    )

    fun roleLabel(roleKey: String?): String {
        if (roleKey.isNullOrBlank()) return ""
        ROLE_LABELS[roleKey]?.let { return it }
        val plain = roleKey.replace(Regex("[._-]+"), " ").trim()
        return plain.replaceFirstChar { it.uppercase() }
    }

    private fun isTop(role: String) = role == "super_admin" || role == "dir_general"

    private fun userEntities(user: UserDto?): List<String> {
        val role = user?.roleKey.orEmpty()
        return user?.entities?.takeIf { it.isNotEmpty() } ?: ROLE_DEFAULT_ENTITIES[role] ?: listOf(ARTA, EXPLANADA)
    }

    /** Entidad con la que trabaja la web: la del dominio del panel si la persona la tiene (igual que `user-context`). */
    fun entityFor(user: UserDto?): String {
        val host = ApiClient.originUrl.host.lowercase()
        val hostEntity = if (host.startsWith("auditorio.")) EXPLANADA else ARTA
        val role = user?.roleKey.orEmpty()
        val entities = userEntities(user)
        return if (isTop(role) || hostEntity in entities) hostEntity else entities.firstOrNull() ?: ARTA
    }

    private fun hasPermission(role: String, extra: List<String>, needed: String): Boolean {
        if (isTop(role)) return true
        if (role == "dir_adjunta" && needed != "users.manage") return true
        val fromRole = ROLE_PERMISSIONS[role].orEmpty()
        return "everything" in fromRole || needed in fromRole || needed in extra
    }

    private fun userHasPermission(role: String, extra: List<String>, needed: List<String>): Boolean {
        if (needed.isEmpty() || isTop(role) || "everything" in extra) return true
        return needed.any { hasPermission(role, extra, it) }
    }

    private fun canAccessEventOps(role: String, entity: String): Boolean {
        if (isTop(role)) return true
        if (role == "solo_carpetas") return false
        return !(role == "dir_auditorio" && entity == ARTA)
    }

    private fun canSee(role: String, extra: List<String>, rule: Rule, entity: String): Boolean {
        if (rule.entities.isNotEmpty() && entity !in rule.entities) return false
        if (rule.requiresEventOps && !canAccessEventOps(role, entity)) return false
        if (rule.roles.isNotEmpty() && role !in rule.roles && !isTop(role)) return false
        return userHasPermission(role, extra, rule.permissions)
    }

    /** Módulos que la barra lateral web le muestra a [user], sin los que ya son pestaña nativa. */
    fun visibleFor(user: UserDto): List<WebModule> {
        val role = user.roleKey.orEmpty()
        val entity = entityFor(user)
        val needsFolders = !canAccessEventOps(role, entity) || role in FOLDER_CENTRIC_ROLES
        return RULES
            .filter { it.href !in NATIVE_TABS && canSee(role, user.permissions, it, entity) }
            .map { rule ->
                if (needsFolders && rule.href == "/folders") {
                    WebModule(rule.path, rule.label, "Documentos", rule.icon, hidden = false)
                } else {
                    WebModule(rule.path, rule.label, rule.group, rule.icon, rule.hidden)
                }
            }
    }
}

/** Pestaña «Más»: perfil, todos los módulos web de mi rol y ajustes de la app. */
@Composable
fun MoreScreen(user: UserDto, nav: ModuleNav) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val modules = remember(user) { WebModules.visibleFor(user) }
    val visibleGroups = remember(modules) { modules.filter { !it.hidden }.groupBy { it.group }.toList() }
    val hiddenModules = remember(modules) { modules.filter { it.hidden } }
    var showMore by rememberSaveable { mutableStateOf(false) }
    var confirmLogout by remember { mutableStateOf(false) }
    var loggingOut by remember { mutableStateOf(false) }
    var dndUntil by remember { mutableStateOf<OffsetDateTime?>(null) }
    var dndDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        runCatching { chatPrefs(null) }.getOrNull()?.let { dndUntil = it }
    }

    fun setDnd(until: OffsetDateTime?) {
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        val previous = dndUntil
        dndUntil = until
        scope.launch {
            val body = JSONObject().put("dndUntil", until?.toString() ?: JSONObject.NULL).toString()
            runCatching { chatPrefs(body) }
                .onSuccess { dndUntil = it }
                .onFailure { dndUntil = previous }
        }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { ProfileHeader(user) }

        visibleGroups.forEach { (group, items) ->
            item(key = "h-$group") { SectionLabel(group) }
            items(items, key = { "m-${it.path}" }) { module ->
                MoreRow(
                    icon = module.icon,
                    label = module.label,
                    onClick = { nav.openWeb(module.path, module.label) },
                )
            }
        }

        if (hiddenModules.isNotEmpty()) {
            item(key = "more-toggle") {
                MoreRow(
                    icon = if (showMore) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                    label = if (showMore) "Ocultar herramientas" else "Más herramientas (${hiddenModules.size})",
                    tint = ArtaColors.Muted,
                    chevron = false,
                    onClick = { showMore = !showMore },
                )
            }
            if (showMore) {
                items(hiddenModules, key = { "x-${it.path}" }) { module ->
                    MoreRow(icon = module.icon, label = module.label, onClick = { nav.openWeb(module.path, module.label) })
                }
            }
        }

        item(key = "h-app") { SectionLabel("App") }
        item(key = "notif") {
            MoreRow(
                icon = Icons.Outlined.NotificationsActive,
                label = "Ajustes de avisos",
                supporting = if (PushRegistration.available) "Sonido, vibración y qué avisos te llegan" else "Esta compilación no tiene Firebase: no llegarán avisos push",
                onClick = {
                    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(intent) }.onFailure {
                        context.startActivity(
                            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    }
                },
            )
        }
        item(key = "dnd") {
            MoreRow(
                icon = Icons.Outlined.DoNotDisturbOn,
                label = "No molestar",
                supporting = dndLabel(dndUntil),
                onClick = { dndDialog = true },
            )
        }
        item(key = "blocked") {
            MoreRow(
                icon = Icons.Outlined.Block,
                label = ModerationText.BLOCKED_USERS,
                supporting = "Personas cuyos mensajes no ves en el chat",
                onClick = { nav.openBlockedUsers() },
            )
        }
        item(key = "browser") {
            MoreRow(
                icon = Icons.AutoMirrored.Outlined.OpenInNew,
                label = "Abrir en el navegador",
                onClick = {
                    runCatching {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ApiClient.origin + "/dashboard")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                },
            )
        }
        item(key = "logout") {
            MoreRow(
                icon = Icons.AutoMirrored.Outlined.Logout,
                label = if (loggingOut) "Cerrando sesión…" else "Cerrar sesión",
                tint = ArtaColors.Danger,
                textColor = ArtaColors.Danger,
                chevron = false,
                onClick = { if (!loggingOut) confirmLogout = true },
            )
        }

        // Política de datos de Play: privacidad, términos y borrado de cuenta a
        // la vista. Se abren en el navegador (son páginas públicas).
        item(key = "h-legal") { SectionLabel("Legal y soporte") }
        item(key = "privacy") {
            MoreRow(
                icon = Icons.Outlined.PrivacyTip,
                label = "Aviso de privacidad",
                onClick = { LegalLinks.open(context, LegalLinks.PRIVACY) },
            )
        }
        item(key = "terms") {
            MoreRow(
                icon = Icons.Outlined.Description,
                label = "Términos de uso",
                onClick = { LegalLinks.open(context, LegalLinks.TERMS) },
            )
        }
        item(key = "support") {
            MoreRow(
                icon = Icons.Outlined.SupportAgent,
                label = "Soporte",
                onClick = { LegalLinks.open(context, LegalLinks.SUPPORT) },
            )
        }
        item(key = "delete-account") {
            // No hay alta desde la app: las cuentas las crea el administrador de
            // la organización, así que el borrado también se solicita, no se ejecuta aquí.
            MoreRow(
                icon = Icons.Outlined.PersonRemove,
                label = "Eliminar mi cuenta",
                supporting = "Solicita el borrado de tu cuenta y tus datos",
                onClick = { LegalLinks.open(context, LegalLinks.DELETE_ACCOUNT) },
            )
        }
        item(key = "version") {
            Text(
                "ARTA · versión ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                color = ArtaColors.Muted,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp),
            )
        }
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("¿Cerrar sesión?") },
            text = { Text("Dejarás de recibir avisos en este teléfono hasta que vuelvas a entrar.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmLogout = false
                    loggingOut = true
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    scope.launch { Session.logout() }
                }) { Text("Cerrar sesión", color = ArtaColors.Danger) }
            },
            dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Cancelar") } },
        )
    }

    if (dndDialog) {
        val zone = ZoneId.systemDefault()
        val now = ZonedDateTime.now(zone)
        val tomorrow8 = ZonedDateTime.of(LocalDate.now(zone).plusDays(1), LocalTime.of(8, 0), zone)
        val options = listOf(
            "1 hora" to now.plusHours(1),
            "8 horas" to now.plusHours(8),
            "Hasta mañana 8:00" to tomorrow8,
        )
        AlertDialog(
            onDismissRequest = { dndDialog = false },
            title = { Text("No molestar") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Los mensajes del chat llegan sin sonido.", color = ArtaColors.Muted, style = MaterialTheme.typography.bodyMedium)
                    options.forEach { (label, until) ->
                        TextButton(onClick = {
                            dndDialog = false
                            setDnd(until.toOffsetDateTime())
                        }, modifier = Modifier.fillMaxWidth()) { Text(label, modifier = Modifier.fillMaxWidth()) }
                    }
                }
            },
            confirmButton = {
                if (dndUntil != null) {
                    TextButton(onClick = {
                        dndDialog = false
                        setDnd(null)
                    }) { Text("Apagar") }
                }
            },
            dismissButton = { TextButton(onClick = { dndDialog = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun ProfileHeader(user: UserDto) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Avatar(user.fullName, size = 64.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(user.fullName.ifBlank { "ARTA" }, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            val role = WebModules.roleLabel(user.roleKey)
            if (role.isNotBlank()) Text(role, color = ArtaColors.Gold, style = MaterialTheme.typography.bodyMedium)
            user.email?.takeIf { it.isNotBlank() }?.let { Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall) }
        }
    }
    HorizontalDivider(color = ArtaColors.Line)
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text.uppercase(Locale.forLanguageTag("es-MX")),
        color = ArtaColors.Muted,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 8.dp),
    )
}

@Composable
private fun MoreRow(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    supporting: String? = null,
    tint: Color = ArtaColors.Gold,
    textColor: Color = ArtaColors.Text,
    chevron: Boolean = true,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, color = textColor, style = MaterialTheme.typography.bodyLarge)
            supporting?.let { Text(it, color = ArtaColors.Muted, style = MaterialTheme.typography.bodySmall) }
        }
        if (chevron) Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = ArtaColors.Muted)
    }
}

/**
 * «No molestar» del chat (`GET`/`PATCH /api/chat/prefs`). JSON crudo: `dndUntil: null`
 * tiene que viajar explícito para apagarlo.
 */
private suspend fun chatPrefs(patchBody: String?): OffsetDateTime? = withContext(Dispatchers.IO) {
    val builder = Request.Builder().url(ApiClient.baseUrl + "chat/prefs")
    if (patchBody != null) builder.patch(patchBody.toRequestBody("application/json; charset=utf-8".toMediaType()))
    ApiClient.http.newCall(builder.build()).execute().use { res ->
        if (!res.isSuccessful) throw IOException("chat/prefs ${res.code}")
        val raw = JSONObject(res.body?.string().orEmpty()).optString("dndUntil").takeIf { it.isNotBlank() && it != "null" }
        parseDnd(raw)
    }
}

private fun parseDnd(raw: String?): OffsetDateTime? =
    raw?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }?.takeIf { it.isAfter(OffsetDateTime.now()) }

private fun dndLabel(until: OffsetDateTime?): String {
    if (until == null) return "Apagado"
    val local = until.atZoneSameInstant(ZoneId.systemDefault())
    val time = local.format(DateTimeFormatter.ofPattern("H:mm"))
    return when (local.toLocalDate()) {
        LocalDate.now() -> "Activo hasta hoy $time"
        LocalDate.now().plusDays(1) -> "Activo hasta mañana $time"
        else -> "Activo hasta el " + local.format(DateTimeFormatter.ofPattern("d MMM H:mm", Locale.forLanguageTag("es-MX")))
    }
}
