package com.artaproducciones.ops.ui.modules

import com.artaproducciones.ops.data.api.EventChecklistRef
import java.time.LocalDate

/**
 * Responsable y fecha del formato (paridad web 21-11-2026: «Lo debe … · vence…»).
 * Reusa [dueLabel] del mismo paquete; la web lo muestra en minúsculas.
 */
fun checklistAssignmentLine(
    ownerName: String?,
    dueAtIso: String?,
    today: LocalDate = LocalDate.now(),
): String {
    val who = ownerName?.trim()?.takeIf { it.isNotEmpty() }?.let { "Lo debe $it" } ?: "Sin responsable"
    val due = dueAtIso?.let { dueLabel(it, today) }?.replaceFirstChar { it.lowercase() }
    return if (due.isNullOrBlank()) who else "$who · $due"
}

fun EventChecklistRef.assignmentLine(today: LocalDate = LocalDate.now()): String =
    checklistAssignmentLine(owner?.fullName, dueAt, today)
