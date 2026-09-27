package com.artaproducciones.ops

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
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
        enableEdgeToEdge()
        splash.setKeepOnScreenCondition { Session.state.value is Session.State.Loading }
        lifecycleScope.launch { Session.restore() }
        handle(intent)
        setContent {
            ArtaTheme {
                ArtaApp(pendingLink = pendingLink, onLinkConsumed = { pendingLink.value = null })
            }
        }
        requestNotificationPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        intent ?: return
        val notificationId = intent.getStringExtra(ArtaPushRenderer.EXTRA_NOTIFICATION_ID)
        if (!notificationId.isNullOrBlank()) {
            lifecycleScope.launch { runCatching { ApiClient.api.notificationRead(notificationId) } }
        }
        val link = DeepLink.from(
            channelId = intent.getStringExtra(ArtaPushRenderer.EXTRA_CHANNEL_ID),
            messageId = intent.getStringExtra(ArtaPushRenderer.EXTRA_MESSAGE_ID),
            url = intent.getStringExtra(ArtaPushRenderer.EXTRA_URL) ?: intent.data?.let(::fromUri),
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
