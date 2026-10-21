package com.artaproducciones.ops.ui.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artaproducciones.ops.R
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.ui.common.LegalLinks
import com.artaproducciones.ops.ui.theme.ArtaCard
import com.artaproducciones.ops.ui.theme.ArtaColors
import com.artaproducciones.ops.ui.theme.ArtaType
import com.artaproducciones.ops.ui.theme.Button
import com.artaproducciones.ops.ui.theme.LocalArtaTokens
import com.artaproducciones.ops.ui.theme.Nunito
import com.artaproducciones.ops.ui.theme.OutlinedButton
import com.artaproducciones.ops.ui.theme.TextButton
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Entrada (sin sesión la app es ARTA, papel y tinta), igual que iOS: logotipo con «La experiencia
 * del Show», tarjeta con «Inicia sesión» y los campos rotulados, la acción principal en el acento
 * (apagada a propósito mientras falta algo), debajo «Explorar ARTA con datos de muestra» (modo demo,
 * sin cuenta) con el enlace a cómo contratarla, y el aviso de privacidad y los términos al pie.
 * Centrada en la pantalla; con el teclado arriba se encoge y se desplaza.
 */
@Composable
fun LoginScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val t = LocalArtaTokens.current
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var challengeId by rememberSaveable { mutableStateOf<String?>(null) }
    var showPassword by rememberSaveable { mutableStateOf(false) }
    var busy by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var enteringDemo by remember { mutableStateOf(false) }

    fun apply(result: Session.LoginResult) {
        busy = false
        when (result) {
            Session.LoginResult.Success -> Unit
            is Session.LoginResult.NeedsCode -> {
                challengeId = result.challengeId
                error = null
            }
            Session.LoginResult.NeedsEnrollment ->
                error = "Tu organización pide verificación en dos pasos. Actívala primero en el panel web y vuelve a entrar."
            is Session.LoginResult.Error -> error = result.message
        }
    }

    fun submit() {
        if (busy) return
        error = null
        busy = true
        val challenge = challengeId
        scope.launch {
            apply(if (challenge == null) Session.login(email, password) else Session.verifyCode(challenge, code))
        }
    }

    val ready = if (challengeId == null) email.isNotBlank() && password.length >= 4 else code.length >= 6

    BoxWithConstraints(Modifier.fillMaxSize().imePadding()) {
        val screen = maxHeight
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .heightIn(min = screen)
                .padding(horizontal = 24.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Spacer(Modifier.height(8.dp))

            Column(
                Modifier.widthIn(max = 440.dp).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Image(
                    painter = painterResource(R.drawable.arta_logo),
                    contentDescription = "ARTA",
                    colorFilter = ColorFilter.tint(t.text),
                    modifier = Modifier.height(64.dp),
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    "La experiencia del Show",
                    style = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Light, fontSize = 20.sp, lineHeight = 26.sp, letterSpacing = (-0.3).sp),
                    color = ArtaColors.Muted,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(32.dp))

                ArtaCard(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    if (challengeId == null) {
                        Heading("Inicia sesión", "Con la misma cuenta del panel web.")
                        Field("Correo") {
                            OutlinedTextField(
                                value = email,
                                onValueChange = { email = it; error = null },
                                placeholder = { Text("nombre@empresa.com") },
                                singleLine = true,
                                shape = fieldShape(),
                                colors = fieldColors(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Field("Contraseña") {
                            OutlinedTextField(
                                value = password,
                                onValueChange = { password = it; error = null },
                                placeholder = { Text("Tu contraseña") },
                                singleLine = true,
                                shape = fieldShape(),
                                colors = fieldColors(),
                                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                                trailingIcon = {
                                    IconButton(onClick = { showPassword = !showPassword }) {
                                        Icon(
                                            if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                            if (showPassword) "Ocultar contraseña" else "Mostrar contraseña",
                                            tint = ArtaColors.Tertiary,
                                        )
                                    }
                                },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                                keyboardActions = KeyboardActions(onDone = { if (ready) submit() }),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    } else {
                        Heading("Verificación en dos pasos", "Escribe el código de 6 dígitos de tu app de autenticación.")
                        OutlinedTextField(
                            value = code,
                            onValueChange = { v -> code = v.filter { it.isDigit() }.take(8); error = null },
                            placeholder = { Text("000000") },
                            singleLine = true,
                            shape = fieldShape(),
                            colors = fieldColors(),
                            textStyle = MaterialTheme.typography.titleLarge.copy(letterSpacing = 4.sp, textAlign = TextAlign.Center),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { if (ready) submit() }),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    error?.let {
                        Row(verticalAlignment = Alignment.Top) {
                            Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = ArtaColors.Danger, modifier = Modifier.padding(top = 1.dp).size(16.dp))
                            Spacer(Modifier.size(6.dp))
                            Text(it, color = ArtaColors.Danger, style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    Button(
                        onClick = { submit() },
                        enabled = !busy && ready,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        if (busy) {
                            CircularProgressIndicator(Modifier.size(20.dp), color = ArtaColors.OnAccent, strokeWidth = 2.dp)
                        } else {
                            Text(if (challengeId == null) "Entrar" else "Verificar", fontWeight = FontWeight.SemiBold)
                        }
                    }

                    if (challengeId != null) {
                        TextButton(
                            onClick = {
                                challengeId = null
                                code = ""
                                error = null
                            },
                            modifier = Modifier.align(Alignment.CenterHorizontally),
                        ) { Text("Usar otra cuenta", color = ArtaColors.Muted) }
                    }
                }

                Spacer(Modifier.height(20.dp))
                DemoEntry(
                    enabled = !busy && !enteringDemo,
                    onExplore = {
                        if (!enteringDemo) {
                            error = null
                            enteringDemo = true
                            scope.launch {
                                Session.enterDemo()
                                enteringDemo = false
                            }
                        }
                    },
                    onContract = { LegalLinks.open(context, LegalLinks.CONTRACT) },
                )
            }

            // Play pide que el aviso de privacidad se pueda leer antes de entrar: discreto pero
            // claramente un enlace (subrayado fino).
            Row(
                Modifier.padding(top = 24.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                LegalLink("Aviso de privacidad") { LegalLinks.open(context, LegalLinks.PRIVACY) }
                Text("·", color = ArtaColors.Tertiary, style = MaterialTheme.typography.bodySmall)
                LegalLink("Términos") { LegalLinks.open(context, LegalLinks.TERMS) }
            }
        }
    }
}

/**
 * Para quien aún no tiene cuenta (y para la revisión de las tiendas): la app entera con datos
 * ficticios, sin cuenta ni conexión (`Session.enterDemo`). Debajo, cómo contratarla.
 */
@Composable
private fun DemoEntry(enabled: Boolean, onExplore: () -> Unit, onContract: () -> Unit) {
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        OutlinedButton(onClick = onExplore, enabled = enabled, modifier = Modifier.fillMaxWidth().height(48.dp)) {
            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Explorar ARTA con datos de muestra", fontWeight = FontWeight.SemiBold)
        }
        Text(
            "Sin cuenta ni conexión. Datos ficticios de una productora de ejemplo.",
            color = ArtaColors.Tertiary,
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
        )
        TextButton(onClick = onContract) {
            Text(
                "¿Tu organización aún no usa ARTA? Conoce cómo contratarlo",
                color = ArtaColors.Muted,
                style = MaterialTheme.typography.bodySmall.copy(textDecoration = TextDecoration.Underline),
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun Heading(title: String, detail: String) {
    Column(Modifier.padding(bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            title,
            style = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = (-0.3).sp),
            color = ArtaColors.Text,
            modifier = Modifier.semantics { heading() },
        )
        Text(detail, style = MaterialTheme.typography.bodyMedium, color = ArtaColors.Muted)
    }
}

/** Rótulo en MAYÚSCULAS sobre el campo (más claro que la etiqueta que flota dentro). */
@Composable
private fun Field(label: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label.uppercase(Locale("es", "MX")), style = ArtaType.Cap, color = ArtaColors.Muted)
        content()
    }
}

@Composable
private fun fieldShape() = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)

/** Superficie suave con línea fuerte; con el foco, el borde pasa al texto al 45 %. */
@Composable
private fun fieldColors() = LocalArtaTokens.current.let { t ->
    OutlinedTextFieldDefaults.colors(
        focusedBorderColor = t.text.copy(alpha = 0.45f),
        unfocusedBorderColor = t.lineStrong,
        focusedContainerColor = t.surfaceSoft,
        unfocusedContainerColor = t.surfaceSoft,
        cursorColor = t.text,
        focusedPlaceholderColor = t.tertiary,
        unfocusedPlaceholderColor = t.tertiary,
    )
}

@Composable
private fun LegalLink(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick) {
        Text(
            text,
            color = ArtaColors.Muted,
            style = MaterialTheme.typography.bodySmall.copy(textDecoration = TextDecoration.Underline),
        )
    }
}
