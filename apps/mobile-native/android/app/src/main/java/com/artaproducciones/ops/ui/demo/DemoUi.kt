package com.artaproducciones.ops.ui.demo

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.WebAssetOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.artaproducciones.ops.ui.common.LegalLinks
import com.artaproducciones.ops.ui.modules.DetailTopBar
import com.artaproducciones.ops.ui.modules.EmptyState
import com.artaproducciones.ops.ui.theme.LocalArtaTokens

/** Texto del aviso donde el modo demo no puede abrir el panel web. */
const val DEMO_WEB_TITLE = "Disponible con una cuenta de tu organización"
const val DEMO_WEB_DETAIL =
    "Esta sección abre el panel web de tu organización con tu sesión. En el modo demo no está disponible; " +
        "con una cuenta se abre aquí mismo, sin volver a iniciar sesión."

/**
 * Pastilla fija arriba mientras se explora con datos de muestra (entró con el botón de la
 * entrada). «Salir» vuelve a la pantalla de entrada. Mismo estilo que el aviso «Ahora en …»:
 * píldora tinta en ARTA, plata con texto negro en Auditorio. Es pastilla y no banda detrás de la
 * barra de estado (Apple rechazó a NEXARA por una franja así en las capturas).
 */
@Composable
fun DemoBanner(onExit: () -> Unit, modifier: Modifier = Modifier) {
    val t = LocalArtaTokens.current
    val shape = if (t.isPill) RoundedCornerShape(percent = 50) else RoundedCornerShape(6.dp)
    Row(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 4.dp)
            .clip(shape)
            .background(t.accentBrush)
            .padding(start = 16.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = t.onAccent, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(
            "Modo demo · datos de muestra",
            color = t.onAccent,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Box(
            Modifier
                .minimumInteractiveComponentSize()
                .clip(t.controlShape)
                .clickable(role = Role.Button, onClickLabel = "Salir del modo demo", onClick = onExit),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "Salir",
                color = t.onAccent,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(t.controlShape)
                    .background(t.onAccent.copy(alpha = if (t.isDark) 0.10f else 0.16f))
                    .padding(horizontal = 14.dp, vertical = 6.dp),
            )
        }
    }
}

/**
 * En vez de la vista web: en el modo demo no hay sesión que compartir con el panel, así que se
 * explica en lugar de enseñar el login de la web (igual que `DemoWebUnavailableView` de iOS).
 */
@Composable
fun DemoWebUnavailableScreen(title: String?, onBack: () -> Unit) {
    val context = LocalContext.current
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(title?.takeIf { it.isNotBlank() } ?: "Panel web", onBack = onBack)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
        ) {
            EmptyState(
                title = DEMO_WEB_TITLE,
                text = DEMO_WEB_DETAIL,
                actionLabel = "Conoce cómo contratar ARTA",
                onAction = { LegalLinks.open(context, LegalLinks.CONTRACT) },
                icon = Icons.Outlined.WebAssetOff,
                modifier = Modifier.padding(bottom = 48.dp),
            )
        }
    }
}
