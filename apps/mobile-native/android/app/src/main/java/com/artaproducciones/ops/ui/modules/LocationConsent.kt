package com.artaproducciones.ops.ui.modules

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.LocationOff
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.location.LocationState
import com.artaproducciones.ops.location.LocationTracker
import com.artaproducciones.ops.ui.common.LegalLinks
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.Button
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.TextButton
import kotlinx.coroutines.launch

/**
 * La hoja de aceptar y el diálogo del sistema, sobre toda la app con sesión (docs/UBICACION.md). La app nunca se
 * bloquea por esto: con «Ahora no» sigue igual y vuelve a preguntar a otro día.
 */
@Composable
fun LocationConsentHost() {
    val ui by LocationTracker.ui.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        LocationTracker.onPermissionResult(context)
    }

    fun askPermission() {
        LocationTracker.onPermissionAsked(context)
        runCatching { permissions.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) }
            .onFailure { LocationTracker.onPermissionResult(context) }
    }

    // Ya había aceptado (en otro teléfono o antes de reinstalar) y aquí nunca se le pidió el permiso.
    LaunchedEffect(ui.askPermission) {
        if (ui.askPermission) askPermission()
    }

    if (ui.askConsent) {
        LocationConsentSheet(
            busy = busy,
            error = error,
            onAccept = {
                busy = true
                error = null
                scope.launch {
                    val failure = LocationTracker.acceptConsent(context)
                    busy = false
                    when {
                        failure != null -> error = failure
                        LocationTracker.hasPermission(context) -> LocationTracker.onPermissionResult(context)
                        else -> askPermission()
                    }
                }
            },
            onLater = {
                error = null
                LocationTracker.declineConsent(context)
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LocationConsentSheet(busy: Boolean, error: String?, onAccept: () -> Unit, onLater: () -> Unit) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onLater, sheetState = sheetState, containerColor = ArtaColors.BgElev) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Compartir tu ubicación", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = ArtaColors.Text)
            Text("Para coordinar al equipo, ARTA registra:", color = ArtaColors.Muted)
            ConsentRow(Icons.Outlined.Schedule, "Tu ubicación cada media hora, de 10:00 a 18:00, hora de Puebla.")
            ConsentRow(Icons.Outlined.NotificationsActive, "También con la app cerrada. Mientras se registra, verás un aviso fijo en el teléfono.")
            ConsentRow(Icons.Outlined.Visibility, "Solo la ve dirección general.")
            ConsentRow(Icons.Outlined.Delete, "Se borra a los 90 días.")
            TextButton(onClick = { LegalLinks.open(context, LegalLinks.PRIVACY) }) { Text("Aviso de privacidad") }
            error?.let { Text(it, color = ArtaColors.Danger, style = MaterialTheme.typography.bodySmall) }
            Button(onClick = onAccept, enabled = !busy, modifier = Modifier.fillMaxWidth()) { BusyLabel(busy, "Aceptar") }
            TextButton(onClick = onLater, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Ahora no") }
            Text(
                "Si eliges «Ahora no», la app sigue igual y te preguntamos otro día.",
                color = ArtaColors.Tertiary,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun ConsentRow(icon: ImageVector, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, tint = ArtaColors.Muted, modifier = Modifier.size(20.dp))
        Text(text, color = ArtaColors.Text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
}

/** Aviso discreto en Inicio, sin relleno teñido: permiso negado o ubicación apagada, con el camino para arreglarlo. */
@Composable
fun LocationNotice() {
    val ui by LocationTracker.ui.collectAsState()
    val problem = ui.problem ?: return
    val context = LocalContext.current
    val shape = LocalArtaTokens.current.itemShape
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(shape)
            .border(1.dp, ArtaColors.LineStrong, shape)
            .padding(start = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Outlined.LocationOff, contentDescription = null, tint = ArtaColors.Muted, modifier = Modifier.size(18.dp))
        Text(
            if (problem == LocationState.OFF) "La ubicación de tu teléfono está apagada." else "ARTA no tiene permiso para ver tu ubicación.",
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f),
        )
        TextButton(
            onClick = { openLocationSettings(context, problem) },
            colors = ButtonDefaults.textButtonColors(contentColor = ArtaColors.Text),
        ) { Text("Ir a Ajustes") }
    }
}

private fun openLocationSettings(context: Context, problem: LocationState) {
    val intent = if (problem == LocationState.OFF) {
        Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
    } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.fromParts("package", context.packageName, null))
    }
    runCatching { context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}
