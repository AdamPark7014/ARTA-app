package com.artaproducciones.ops.ui.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.launch

/** Motivos de `POST /chat/messages/:id/report`, en el orden y con los textos del contrato. */
enum class ReportReason(val api: String, val label: String) {
    SPAM("SPAM", "Spam"),
    ACOSO("ACOSO", "Acoso o intimidación"),
    OFENSIVO("OFENSIVO", "Contenido ofensivo o inapropiado"),
    OTRO("OTRO", "Otro"),
    ;

    companion object {
        const val MAX_DETAILS = 1000
    }
}

/** Textos fijos de docs/chat-reportar-bloquear.md (iOS dice lo mismo). */
object ModerationText {
    const val REPORT = "Reportar"
    const val REPORT_THANKS = "Gracias. Un administrador lo revisará en menos de 24 horas."
    const val BLOCK = "Bloquear"
    const val UNBLOCK = "Desbloquear"
    const val BLOCK_EXPLANATION =
        "No verás sus mensajes y no podrá escribirte por mensaje directo. Puedes desbloquearlo en Más › Usuarios bloqueados."
    const val BLOCKED_USERS = "Usuarios bloqueados"

    fun blockUser(name: String) = "Bloquear a $name"
    fun blocked(name: String) = "Bloqueaste a $name"
    fun unblocked(name: String) = "Desbloqueaste a $name"
}

/** Persona a bloquear desde el menú de un mensaje o el encabezado de un directo. */
data class BlockTarget(val id: String, val name: String)

@Composable
fun BlockUserDialog(target: BlockTarget, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = ArtaColors.BgElev,
        title = { Text("¿${ModerationText.blockUser(target.name)}?") },
        text = { Text(ModerationText.BLOCK_EXPLANATION, color = ArtaColors.Muted) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(ModerationText.BLOCK, color = ArtaColors.Danger) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

/**
 * Hoja «Reportar»: un motivo obligatorio y detalles opcionales (hasta 1000). [onSubmit]
 * llama al API; si falla, el error se queda en la hoja para reintentar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportMessageSheet(
    authorName: String,
    onSubmit: suspend (ReportReason, String) -> Result<Unit>,
    onSent: () -> Unit,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var reason by rememberSaveable { mutableStateOf<ReportReason?>(null) }
    var details by rememberSaveable { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun send() {
        val r = reason ?: return
        sending = true
        error = null
        scope.launch {
            onSubmit(r, details)
                .onSuccess { onSent() }
                .onFailure { error = it.userMessage() }
            sending = false
        }
    }

    ModalBottomSheet(
        onDismissRequest = { if (!sending) onDismiss() },
        sheetState = sheetState,
        containerColor = ArtaColors.BgElev,
    ) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding()) {
            Text(
                ModerationText.REPORT,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = Space.XL),
            )
            Text(
                "¿Por qué reportas este mensaje de $authorName?",
                color = ArtaColors.Muted,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(start = Space.XL, end = Space.XL, top = Space.XS, bottom = Space.S),
            )
            Column(Modifier.selectableGroup()) {
                ReportReason.entries.forEach { r ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(selected = reason == r, enabled = !sending, role = Role.RadioButton, onClick = { reason = r })
                            .padding(horizontal = Space.L, vertical = Space.XS),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(
                            selected = reason == r,
                            onClick = null,
                            enabled = !sending,
                            colors = RadioButtonDefaults.colors(selectedColor = ArtaColors.Gold, unselectedColor = ArtaColors.Muted),
                        )
                        Spacer(Modifier.width(Space.M))
                        Text(r.label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
            OutlinedTextField(
                value = details,
                onValueChange = { details = it.take(ReportReason.MAX_DETAILS) },
                enabled = !sending,
                label = { Text("Detalles (opcional)") },
                supportingText = {
                    Text("${details.length} / ${ReportReason.MAX_DETAILS}", textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth())
                },
                minLines = 3,
                maxLines = 6,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = ArtaColors.Gold,
                    unfocusedBorderColor = ArtaColors.Line,
                    focusedLabelColor = ArtaColors.Gold,
                    cursorColor = ArtaColors.Gold,
                ),
                modifier = Modifier.fillMaxWidth().padding(horizontal = Space.XL, vertical = Space.S),
            )
            error?.let {
                Text(
                    it,
                    color = ArtaColors.Danger,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = Space.XL),
                )
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = Space.L, vertical = Space.S),
                horizontalArrangement = Arrangement.spacedBy(Space.S, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss, enabled = !sending) { Text("Cancelar") }
                Button(
                    onClick = ::send,
                    enabled = reason != null && !sending,
                    colors = ButtonDefaults.buttonColors(containerColor = ArtaColors.Gold, contentColor = ArtaColors.Bg),
                ) {
                    if (sending) {
                        CircularProgressIndicator(Modifier.size(18.dp), color = ArtaColors.Bg, strokeWidth = 2.dp)
                    } else {
                        Text("Enviar reporte")
                    }
                }
            }
            Spacer(Modifier.navigationBarsPadding().padding(bottom = Space.M))
        }
    }
}
