package com.artaproducciones.ops.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.data.ActiveEntity
import com.artaproducciones.ops.data.BizEntity
import com.artaproducciones.ops.ui.modules.Dot
import com.artaproducciones.ops.ui.modules.ModulesStore
import com.artaproducciones.ops.ui.modules.rememberHaptics
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.EntityPalette
import com.artaproducciones.ops.ui.theme.LocalActiveEntity

/**
 * Cambia la entidad activa (docs/entidades-arta-auditorio.md). La caché de listas era de la
 * otra entidad: se tira para que ninguna pantalla enseñe un instante lo que no toca.
 * El aviso «Ahora en …» y la recarga de los globos los hace el cascarón al ver el cambio.
 */
fun switchEntity(target: BizEntity): Boolean {
    if (!ActiveEntity.select(target)) return false
    ModulesStore.clear()
    return true
}

/** Arta ⇄ Auditorio. Null si la persona no es híbrida (no cambia nada). */
fun toggleEntity(): BizEntity? = ActiveEntity.current.other.takeIf { switchEntity(it) }

/** Texto del aviso breve tras cambiar. */
fun entitySwitchedMessage(entity: BizEntity): String = "Ahora en ${entity.short}"

/**
 * Chip de marca del encabezado de Inicio: «Arta Producciones» o «Auditorio Explanada».
 * Para un híbrido es un botón que cambia de entidad; para los demás solo dice dónde está.
 */
@Composable
fun EntityChip(modifier: Modifier = Modifier) {
    val entity = LocalActiveEntity.current
    val hybrid = ActiveEntity.isHybrid
    val haptics = rememberHaptics()
    val accent = EntityPalette.of(entity).accent
    val shape = RoundedCornerShape(50)
    val base = modifier
        .clip(shape)
        .background(accent.copy(alpha = 0.12f))
        .border(1.dp, accent.copy(alpha = 0.35f), shape)
    val clickable = if (hybrid) {
        base.clickable(onClickLabel = "Cambiar a ${entity.other.short}", role = Role.Button) {
            if (toggleEntity() != null) haptics.confirm()
        }
    } else {
        base
    }
    Row(
        clickable.padding(start = 10.dp, end = if (hybrid) 8.dp else 12.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Dot(accent, 8)
        Spacer(Modifier.width(8.dp))
        Text(
            entity.brand,
            color = accent,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (hybrid) {
            Spacer(Modifier.width(6.dp))
            Icon(Icons.Outlined.SwapHoriz, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
        }
    }
}

/** Selector «Arta | Auditorio» de Más (solo híbridos). Cada opción con su propio acento. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntitySelector(modifier: Modifier = Modifier) {
    val entity = LocalActiveEntity.current
    val options = ActiveEntity.available
    val haptics = rememberHaptics()
    SingleChoiceSegmentedButtonRow(modifier.fillMaxWidth()) {
        options.forEachIndexed { i, option ->
            val accent = EntityPalette.of(option).accent
            SegmentedButton(
                selected = option == entity,
                onClick = { if (switchEntity(option)) haptics.confirm() },
                shape = SegmentedButtonDefaults.itemShape(index = i, count = options.size),
                colors = SegmentedButtonDefaults.colors(
                    activeContainerColor = accent.copy(alpha = 0.18f),
                    activeContentColor = accent,
                    activeBorderColor = accent.copy(alpha = 0.6f),
                    inactiveContainerColor = Color.Transparent,
                    inactiveContentColor = ArtaColors.Muted,
                    inactiveBorderColor = ArtaColors.Line,
                ),
            ) { Text(option.short, maxLines = 1) }
        }
    }
}
