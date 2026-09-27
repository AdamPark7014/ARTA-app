package com.artaproducciones.ops

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.push.ArtaNotifications
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ArtaApplication : Application(), ImageLoaderFactory {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onCreate() {
        super.onCreate()
        ApiClient.init(this)
        Session.init(this)
        ArtaNotifications.ensureChannels(this)

        scope.launch { ApiClient.unauthorized.collect { Session.expire() } }

        // Socket solo con la app a la vista: en segundo plano los avisos llegan por FCM.
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                if (ApiClient.hasSession()) RealtimeClient.connect()
            }

            override fun onStop(owner: LifecycleOwner) {
                RealtimeClient.disconnect()
            }
        })
    }

    /** Coil con el mismo cliente HTTP: las fotos de `/uploads` exigen la cookie de sesión. */
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .okHttpClient { ApiClient.http }
        .crossfade(true)
        .build()
}
