package com.artaproducciones.ops.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
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
import com.artaproducciones.ops.ui.theme.LocalActiveEntity
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.SegmentedControl

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
 * Chip de entidad del encabezado de Inicio: «● Arta» (píldora tinta) o «● Auditorio» (plata,
 * recto). Para un híbrido es un botón que cambia de entidad; para los demás solo dice dónde está.
 */
@Composable
fun EntityChip(modifier: Modifier = Modifier) {
    val entity = LocalActiveEntity.current
    val t = LocalArtaTokens.current
    val hybrid = ActiveEntity.isHybrid
    val haptics = rememberHaptics()
    val shape = t.controlShape
    val fg = if (t.isDark) t.accent else t.onAccent
    // Para un híbrido es un botón: el recuadro de toque llega a 48 dp, el dibujo sigue siendo la píldora.
    val base = modifier
        .then(if (hybrid) Modifier.minimumInteractiveComponentSize() else Modifier)
        .clip(shape)
        .then(
            if (t.isDark) Modifier.background(Color(0x0AFFFFFF)).border(1.dp, Color(0x1AFFFFFF), shape)
            else Modifier.background(t.accent),
        )
    val clickable = if (hybrid) {
        base.clickable(onClickLabel = "Cambiar a ${entity.other.short}", role = Role.Button) {
            if (toggleEntity() != null) haptics.confirm()
        }
    } else {
        base
    }
    Row(
        clickable.padding(start = 11.dp, end = if (hybrid) 9.dp else 12.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Dot(fg, 6)
        Spacer(Modifier.width(7.dp))
        Text(
            entity.short,
            color = fg,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (hybrid) {
            Spacer(Modifier.width(5.dp))
            Icon(Icons.Outlined.SwapHoriz, contentDescription = null, tint = fg.copy(alpha = 0.75f), modifier = Modifier.size(15.dp))
        }
    }
}

/** Selector «Arta | Auditorio» de Más (solo híbridos). */
@Composable
fun EntitySelector(modifier: Modifier = Modifier) {
    val entity = LocalActiveEntity.current
    val options = ActiveEntity.available
    val haptics = rememberHaptics()
    SegmentedControl(
        options = options.map { it.short },
        selected = options.indexOf(entity).coerceAtLeast(0),
        onSelect = { i -> if (switchEntity(options[i])) haptics.confirm() },
        modifier = modifier,
    )
}
