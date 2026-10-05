package com.artaproducciones.ops

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ApiDebugHooks
import com.artaproducciones.ops.push.ArtaPushRenderer
import com.artaproducciones.ops.ui.ArtaApp
import com.artaproducciones.ops.ui.DeepLink
import com.artaproducciones.ops.ui.theme.ArtaTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    /** Destino pendiente de un aviso tocado; la navegación lo consume y lo limpia. */
    private val pendingLink = MutableStateFlow<DeepLink?>(null)

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // La app siempre es oscura: íconos claros en las barras aunque el teléfono esté en modo claro
        // (con el estilo automático salían negros sobre negro).
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        splash.setKeepOnScreenCondition { Session.state.value is Session.State.Loading }
        // Solo debug: `--ez arta_demo true` enciende el modo demo; tiene que ir antes de restaurar la sesión.
        val demoLink = ApiDebugHooks.launch?.invoke(intent)
        lifecycleScope.launch { Session.restore() }
        // Al recrear (rotación) el sistema vuelve a entregar el mismo intent: no se reabre el aviso.
        if (savedInstanceState == null) handle(intent, demoLink)
        setContent {
            ArtaTheme {
                ArtaApp(pendingLink = pendingLink, onLinkConsumed = { pendingLink.value = null })
            }
        }
        // Capturas de tienda: sin el diálogo de permisos encima.
        if (!ApiDebugHooks.demo) requestNotificationPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent, ApiDebugHooks.launch?.invoke(intent))
    }

    private fun handle(intent: Intent?, demoLink: DeepLink? = null) {
        intent ?: return
        val notificationId = intent.getStringExtra(ArtaPushRenderer.EXTRA_NOTIFICATION_ID)
        if (!notificationId.isNullOrBlank()) {
            lifecycleScope.launch { runCatching { ApiClient.api.notificationRead(notificationId) } }
        }
        val dismissId = intent.getIntExtra(ArtaPushRenderer.EXTRA_DISMISS_ID, 0)
        if (dismissId != 0) NotificationManagerCompat.from(this).cancel(dismissId)
        val link = demoLink ?: DeepLink.from(
            channelId = intent.getStringExtra(ArtaPushRenderer.EXTRA_CHANNEL_ID),
            messageId = intent.getStringExtra(ArtaPushRenderer.EXTRA_MESSAGE_ID),
            url = intent.getStringExtra(ArtaPushRenderer.EXTRA_URL) ?: intent.data?.let(::fromUri),
            type = intent.getStringExtra(ArtaPushRenderer.EXTRA_TYPE),
            forceApprovals = intent.getStringExtra(ArtaPushRenderer.EXTRA_TARGET) == ArtaPushRenderer.TARGET_APPROVALS,
        )
        if (link != null) pendingLink.value = link
    }

    /** `arta://chat?channel=…&msg=…` → `/chat?channel=…&msg=…` (mismo formato que las URLs del API). */
    private fun fromUri(uri: Uri): String? =
        if (uri.scheme == "arta") "/${uri.host.orEmpty()}${uri.path.orEmpty()}" + (uri.query?.let { "?$it" } ?: "") else null

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
