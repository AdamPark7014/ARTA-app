package com.artaproducciones.ops.ui.modules

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.AdvanceDto
import com.artaproducciones.ops.ui.theme.ArtaColors

// ─── Anticipos (docs/ANTICIPOS-CONTRATO.md) ─────────────────────────────────

internal const val ADVANCE_REASON_MIN = 3

/** El Decimal de Prisma llega como texto («1234.50»); se toleran comas de miles y espacios. */
fun advanceAmount(raw: String?): Double? =
    raw?.trim()?.replace(",", "")?.takeIf { it.isNotEmpty() }?.toBigDecimalOrNull()?.toDouble()

fun advanceAmountLabel(raw: String?): String = money(advanceAmount(raw))

fun advanceStatusLabel(status: String?): String = when (status) {
    "PENDING" -> "Por aprobar"
    "APPROVED" -> "Por pagar"
    "REJECTED" -> "Rechazado"
    "PAID" -> "Pagado"
    else -> "Anticipo"
}

fun advanceStatusColor(status: String?): Color = when (status) {
    "PENDING" -> ArtaColors.Gold
    "APPROVED" -> ArtaColors.Read
    "REJECTED" -> ArtaColors.Danger
    "PAID" -> OkGreen
    else -> ArtaColors.Muted
}

fun advanceReasonValid(reason: String): Boolean = reason.trim().length >= ADVANCE_REASON_MIN

/** Solo lo que espera una acción mía: aprobar/rechazar (`PENDING`) o marcar pagado (`APPROVED`). */
fun AdvanceDto.isActionable(): Boolean = advanceStatus == "PENDING" || advanceStatus == "APPROVED"

fun AdvanceDto.conceptLabel(): String = label?.takeIf { it.isNotBlank() } ?: "Anticipo"

@Composable
internal fun AdvanceCard(
    advance: AdvanceDto,
    highlighted: Boolean,
    onOpenFile: (String) -> Unit,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onPaid: () -> Unit,
) {
    val outer = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
    ModuleCard(if (highlighted) outer.border(1.5.dp, ArtaColors.Gold, RoundedCornerShape(12.dp)) else outer) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                advance.conceptLabel(),
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Text(advanceAmountLabel(advance.amount), fontWeight = FontWeight.Bold, color = ArtaColors.Gold)
        }
        advance.event?.name?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = ArtaColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Pill(advanceStatusLabel(advance.advanceStatus), advanceStatusColor(advance.advanceStatus))
            Spacer(Modifier.width(8.dp))
            val who = advance.uploadedBy?.fullName?.takeIf { it.isNotBlank() }?.let { "Pidió ${firstName(it)}" }
            val stamp = stampLabel(advance.createdAt).takeIf { it.isNotBlank() }
            Text(
                listOfNotNull(who, stamp).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = ArtaColors.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        if (advance.advanceStatus == "APPROVED") {
            advance.decidedBy?.fullName?.takeIf { it.isNotBlank() }?.let { name ->
                Text(
                    "Aprobó ${firstName(name)}" + (advance.decidedAt?.let { " · ${stampLabel(it)}" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = ArtaColors.Muted,
                )
            }
        }
        advance.note?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(4.dp))
            Text(it, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        advance.fileUrl?.takeIf { it.isNotBlank() }?.let { url ->
            Row(
                Modifier.fillMaxWidth().clickable { onOpenFile(url) }.padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.AttachFile, contentDescription = null, tint = ArtaColors.Gold, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Ver archivo", color = ArtaColors.Gold, style = MaterialTheme.typography.bodyMedium)
            }
        }
        when (advance.advanceStatus) {
            "PENDING" -> {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = onReject,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = ArtaColors.Danger),
                        modifier = Modifier.weight(1f),
                    ) { Text("Rechazar") }
                    Button(onClick = onApprove, modifier = Modifier.weight(1f)) { Text("Aprobar") }
                }
            }
            "APPROVED" -> {
                Spacer(Modifier.height(8.dp))
                Button(onClick = onPaid, modifier = Modifier.fillMaxWidth()) { Text("Marcar pagado") }
            }
        }
    }
}

/** Rechazar un anticipo: el motivo es obligatorio (≥3 caracteres, como el API) y le llega a quien lo pidió. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AdvanceRejectSheet(advance: AdvanceDto, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var reason by remember { mutableStateOf("") }
    var showError by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = ArtaColors.BgElev) {
        Column(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Rechazar anticipo", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                listOfNotNull(advance.conceptLabel(), advanceAmountLabel(advance.amount), advance.event?.name?.takeIf { it.isNotBlank() })
                    .joinToString(" · "),
                color = ArtaColors.Muted,
            )
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it; showError = false },
                placeholder = { Text("Por qué se rechaza…") },
                minLines = 3,
                isError = showError,
                modifier = Modifier.fillMaxWidth(),
            )
            if (showError) {
                Text(
                    "Escribe el motivo (mínimo $ADVANCE_REASON_MIN caracteres)",
                    color = ArtaColors.Danger,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Cancelar") }
                Button(
                    onClick = { if (advanceReasonValid(reason)) onConfirm(reason.trim()) else showError = true },
                    colors = ButtonDefaults.buttonColors(containerColor = ArtaColors.Danger, contentColor = Color.White),
                    modifier = Modifier.weight(1f),
                ) { Text("Rechazar") }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
