package com.artaproducciones.ops.ui.notifications

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDefaults
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.artaproducciones.ops.data.NoticeChannel
import com.artaproducciones.ops.data.NoticeKinds
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.NotificationPrefsDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.demo.DemoMode
import com.artaproducciones.ops.push.ArtaNotifications
import com.artaproducciones.ops.push.PushRegistration
import com.artaproducciones.ops.ui.modules.DetailTopBar
import com.artaproducciones.ops.ui.modules.ErrorState
import com.artaproducciones.ops.ui.modules.ListPhase
import com.artaproducciones.ops.ui.modules.PhaseSwap
import com.artaproducciones.ops.ui.modules.SectionTitle
import com.artaproducciones.ops.ui.modules.SkeletonList
import com.artaproducciones.ops.ui.modules.bottomInset
import com.artaproducciones.ops.ui.modules.listPhase
import com.artaproducciones.ops.ui.modules.rememberHaptics
import com.artaproducciones.ops.ui.theme.ArtaCard
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.ArtaType
import com.artaproducciones.ops.ui.theme.Button
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.TABULAR
import com.artaproducciones.ops.ui.theme.TextButton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** ¿Android dejará pintar avisos? Desde Android 13 pide permiso; antes, el interruptor de la app. */
private fun systemAllowsNotifications(context: Context): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
        return false
    }
    return NotificationManagerCompat.from(context).areNotificationsEnabled()
}

/** Ajustes de avisos de la app en Android: ahí se ven los canales con su sonido y vibración. */
private fun openSystemNotificationSettings(context: Context) {
    // Sin esto, en un teléfono que aún no ha recibido nada la pantalla saldría sin canales.
    ArtaNotifications.ensureChannels(context)
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }.onFailure {
        runCatching {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }
}

/**
 * Qué llega al teléfono (`GET`/`PATCH /notifications/preferences`), lo mismo que Configuración en la
 * web. La campana siempre recibe todo. Cada cambio se ve al instante y se deshace si el API falla.
 */
@Composable
fun NotificationPrefsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    val snackbar = remember { SnackbarHostState() }
    val saveLock = remember { Mutex() }
    var prefs by remember { mutableStateOf<NotificationPrefsDto?>(null) }
    var confirmed by remember { mutableStateOf<NotificationPrefsDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var latestEdit by remember { mutableIntStateOf(0) }
    var pickingStart by remember { mutableStateOf<Boolean?>(null) }
    var allowed by remember { mutableStateOf(systemAllowsNotifications(context)) }

    // Vuelve de los ajustes de Android con el permiso ya cambiado.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) allowed = systemAllowsNotifications(context)
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(tick) {
        try {
            val loaded = ApiClient.api.notificationPrefs()
            prefs = loaded
            confirmed = loaded
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage()
        }
    }

    /**
     * El PATCH va completo y en orden (dos toques seguidos no se cruzan en la red). Corre fuera de la
     * pantalla: salir justo después de tocar no cancela el guardado.
     */
    fun save(next: NotificationPrefsDto) {
        prefs = next
        val edit = ++latestEdit
        noticeScope.launch {
            saveLock.withLock {
                try {
                    val saved = ApiClient.api.setNotificationPrefs(next)
                    confirmed = saved
                    if (edit == latestEdit) prefs = saved
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    if (edit == latestEdit) {
                        prefs = confirmed
                        haptics.reject()
                        scope.launch { snackbar.showSnackbar(e.userMessage()) }
                    }
                }
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            DetailTopBar("Preferencias de avisos", onBack = onBack)
            PhaseSwap(listPhase(prefs != null, error)) { phase ->
                when (phase) {
                    ListPhase.Error -> ErrorState(error.orEmpty(), onRetry = { tick++ })
                    ListPhase.Loading -> SkeletonList(4)
                    ListPhase.Ready -> prefs?.let { value ->
                        PrefsBody(
                            prefs = value,
                            allowed = allowed,
                            onOpenSystem = { openSystemNotificationSettings(context) },
                            onChannel = { channel, on ->
                                haptics.tick()
                                save(NoticeKinds.withChannel(value, channel, on))
                            },
                            onQuiet = { on ->
                                haptics.tick()
                                save(value.copy(quietHours = value.quietHours.copy(enabled = on)))
                            },
                            onPick = { start -> pickingStart = start },
                        )
                    }
                }
            }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
    }

    val picking = pickingStart
    val current = prefs
    if (picking != null && current != null) {
        QuietTimeDialog(
            title = if (picking) "Empieza a las" else "Termina a las",
            value = if (picking) current.quietHours.start else current.quietHours.end,
            onDismiss = { pickingStart = null },
            onPick = { value ->
                pickingStart = null
                haptics.confirm()
                val quiet = if (picking) current.quietHours.copy(start = value) else current.quietHours.copy(end = value)
                save(current.copy(quietHours = quiet))
            },
        )
    }
}

@Composable
private fun PrefsBody(
    prefs: NotificationPrefsDto,
    allowed: Boolean,
    onOpenSystem: () -> Unit,
    onChannel: (NoticeChannel, Boolean) -> Unit,
    onQuiet: (Boolean) -> Unit,
    onPick: (Boolean) -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 12.dp, bottom = bottomInset()),
    ) {
        Text(
            "La campana siempre recibe todo: aquí decides qué llega como aviso a tu teléfono. Lo mismo vale en la web.",
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(horizontal = 20.dp),
        )

        SectionTitle("Este teléfono", Modifier.padding(top = 8.dp))
        PermissionCard(allowed = allowed, onOpenSystem = onOpenSystem)

        SectionTitle("Qué te llega", Modifier.padding(top = 8.dp))
        ArtaCard(Modifier.padding(horizontal = 16.dp), contentPadding = PaddingValues(0.dp)) {
            NoticeChannel.entries.forEachIndexed { i, channel ->
                if (i > 0) HorizontalDivider(color = ArtaColors.Line, modifier = Modifier.padding(start = 66.dp))
                SwitchRow(
                    icon = channel.icon(),
                    title = channel.label,
                    detail = channel.hint,
                    checked = channel.key !in prefs.muted,
                    onChange = { onChannel(channel, it) },
                )
            }
        }

        SectionTitle("Horario silencioso", Modifier.padding(top = 8.dp))
        ArtaCard(Modifier.padding(horizontal = 16.dp), contentPadding = PaddingValues(0.dp)) {
            SwitchRow(
                icon = Icons.Outlined.Bedtime,
                title = "Silenciar por la noche",
                detail = "Solo llega lo urgente: aprobaciones, tareas y eventos. Lo demás espera en la campana. Se mide en la hora de Puebla.",
                checked = prefs.quietHours.enabled,
                onChange = onQuiet,
            )
            AnimatedVisibility(prefs.quietHours.enabled) {
                Column {
                    HorizontalDivider(color = ArtaColors.Line, modifier = Modifier.padding(start = 66.dp))
                    TimeRow("Empieza", prefs.quietHours.start) { onPick(true) }
                    HorizontalDivider(color = ArtaColors.Line, modifier = Modifier.padding(start = 66.dp))
                    TimeRow("Termina", prefs.quietHours.end) { onPick(false) }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

/** Estado del permiso: si Android los tiene apagados, ninguna preferencia de abajo sirve de nada. */
@Composable
private fun PermissionCard(allowed: Boolean, onOpenSystem: () -> Unit) {
    val t = LocalArtaTokens.current
    val note = when {
        DemoMode.isActive -> "En el modo demo no llegan avisos; lo que cambies aquí se olvida al salir."
        !PushRegistration.available -> "Esta compilación no tiene Firebase: no llegarán avisos push."
        else -> null
    }
    ArtaCard(Modifier.padding(horizontal = 16.dp), contentPadding = PaddingValues(0.dp)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.Top) {
            Icon(
                if (allowed) Icons.Outlined.NotificationsActive else Icons.Outlined.NotificationsOff,
                contentDescription = null,
                tint = if (allowed) t.secondary else t.danger,
                modifier = Modifier.padding(top = 1.dp).size(22.dp),
            )
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    if (allowed) "Avisos permitidos" else "Avisos apagados en Android",
                    style = ArtaType.PanelTitle,
                    color = ArtaColors.Text,
                )
                Text(
                    if (allowed) "Android deja pasar los avisos de ARTA." else "Este teléfono no mostrará nada hasta que los permitas.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArtaColors.Muted,
                )
                note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Tertiary) }
                if (!allowed) {
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = onOpenSystem) { Text("Permitir en ajustes") }
                }
            }
        }
        HorizontalDivider(color = ArtaColors.Line, modifier = Modifier.padding(start = 66.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClickLabel = "Abrir ajustes de Android", onClick = onOpenSystem)
                .heightIn(min = 56.dp)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Tune, contentDescription = null, tint = t.secondary, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Sonido y vibración por categoría", style = MaterialTheme.typography.bodyLarge, color = ArtaColors.Text)
                Text("Los canales de Android", style = MaterialTheme.typography.bodySmall, color = ArtaColors.Tertiary)
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = t.tertiary)
        }
    }
}

/** Toda la fila es el interruptor: objetivo grande y una sola parada para el lector de pantalla. */
@Composable
private fun SwitchRow(icon: ImageVector, title: String, detail: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    val t = LocalArtaTokens.current
    Row(
        Modifier
            .fillMaxWidth()
            .toggleable(value = checked, role = Role.Switch, onValueChange = onChange)
            .heightIn(min = 64.dp)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = t.secondary, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, color = ArtaColors.Text)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Tertiary)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked,
            onCheckedChange = null,
            colors = SwitchDefaults.colors(
                checkedThumbColor = t.onAccent,
                checkedTrackColor = t.accent,
                checkedBorderColor = t.accent,
                uncheckedThumbColor = t.tertiary,
                uncheckedTrackColor = t.fill,
                uncheckedBorderColor = t.lineStrong,
            ),
        )
    }
}

@Composable
private fun TimeRow(label: String, value: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClickLabel = "Cambiar la hora", onClick = onClick)
            .heightIn(min = 52.dp)
            .padding(start = 54.dp, end = 16.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, color = ArtaColors.Text, modifier = Modifier.weight(1f))
        Text(
            value,
            style = MaterialTheme.typography.bodyLarge.copy(fontFeatureSettings = TABULAR),
            fontWeight = FontWeight.SemiBold,
            color = ArtaColors.Text,
        )
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = ArtaColors.Tertiary)
    }
}

/** Selector de hora de 24 horas, como se guarda en el API. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuietTimeDialog(title: String, value: String, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    val t = LocalArtaTokens.current
    val (hour, minute) = remember(value) { NoticeKinds.parseHhMm(value) }
    val state = rememberTimePickerState(initialHour = hour, initialMinute = minute, is24Hour = true)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                TimePicker(
                    state = state,
                    colors = TimePickerDefaults.colors(
                        clockDialColor = t.fill,
                        clockDialSelectedContentColor = t.onAccent,
                        clockDialUnselectedContentColor = t.text,
                        selectorColor = t.accent,
                        containerColor = t.surface,
                        timeSelectorSelectedContainerColor = t.accent,
                        timeSelectorSelectedContentColor = t.onAccent,
                        timeSelectorUnselectedContainerColor = t.fill,
                        timeSelectorUnselectedContentColor = t.text,
                    ),
                )
            }
        },
        confirmButton = { Button(onClick = { onPick(NoticeKinds.hhMm(state.hour, state.minute)) }) { Text("Listo") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        containerColor = ArtaColors.BgElev,
    )
}
