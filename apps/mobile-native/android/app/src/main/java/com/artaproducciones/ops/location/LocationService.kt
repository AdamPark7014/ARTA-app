package com.artaproducciones.ops.location

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.artaproducciones.ops.MainActivity
import com.artaproducciones.ops.R
import com.artaproducciones.ops.push.ArtaNotifications
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Instant

private const val TAG = "ArtaUbicacion"

/** Lo que importa de una lectura. */
internal data class LocationReading(val lat: Double, val lng: Double, val accuracyM: Double?)

/** La lectura de cada punto. */
internal object LocationReader {
    /**
     * Primero la balanceada (Wi-Fi y celda, unos 100 m: es lo que dice la hoja). Adentro o con datos malos puede
     * no contestar aunque haya permiso, y entonces va el GPS. Sin nada, null: el servicio reintenta.
     */
    @SuppressLint("MissingPermission")
    suspend fun read(context: Context): LocationReading? {
        if (!LocationTracker.hasPermission(context)) return null
        val fused = LocationServices.getFusedLocationProviderClient(context)
        val cancel = CancellationTokenSource()
        try {
            return once(fused, cancel, Priority.PRIORITY_BALANCED_POWER_ACCURACY, durationMs = 15_000L, maxAgeMs = 5 * 60_000L)
                ?: once(fused, cancel, Priority.PRIORITY_HIGH_ACCURACY, durationMs = 30_000L, maxAgeMs = 2 * 60_000L)
        } finally {
            cancel.cancel()
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun once(
        fused: FusedLocationProviderClient,
        cancel: CancellationTokenSource,
        priority: Int,
        durationMs: Long,
        maxAgeMs: Long,
    ): LocationReading? {
        val request = CurrentLocationRequest.Builder()
            .setPriority(priority)
            .setDurationMillis(durationMs)
            .setMaxUpdateAgeMillis(maxAgeMs)
            .build()
        val location: Location? = try {
            // Red de seguridad por si el teléfono no respeta la duración.
            withTimeoutOrNull(durationMs + 3_000L) { fused.getCurrentLocation(request, cancel.token).await() }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Lectura de ubicación fallida: ${e.message}")
            null
        }
        return location?.takeIf { LocationRules.isRealFix(it.latitude, it.longitude) }?.let {
            val accuracy = if (it.hasAccuracy()) it.accuracy.toDouble().takeIf { a -> a.isFinite() && a >= 0.0 } else null
            LocationReading(it.latitude, it.longitude, accuracy)
        }
    }
}

/** La alarma de los puntos y de las 18:00 y las 10:00. Inexacta pero permitida en reposo: no pide permisos especiales. */
internal object LocationAlarm {
    private const val REQUEST = 4803

    private fun pendingIntent(context: Context): PendingIntent {
        val app = context.applicationContext
        return PendingIntent.getBroadcast(
            app,
            REQUEST,
            Intent(app, LocationAlarmReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun schedule(context: Context, delayMs: Long) {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        try {
            manager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + delayMs, pendingIntent(context))
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo programar la alarma de ubicación: ${e.message}")
        }
    }

    fun cancel(context: Context) {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        runCatching { manager.cancel(pendingIntent(context)) }
    }
}

class LocationAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        LocationTracker.onAlarm(context)
    }
}

/**
 * Corre de 10:00 a 18:00 con la notificación fija que lo dice: si la notificación no está, el servicio no está.
 * Mide con lecturas sueltas, no con el GPS encendido. La alarma y el latido del servidor le piden cada punto.
 *
 * `START_NOT_STICKY`: si Android lo cierra no puede reabrirlo solo sin el permiso «todo el tiempo». Vuelve al abrir la app.
 */
class LocationService : Service() {

    companion object {
        internal const val ACTION_STOP = "com.artaproducciones.ops.UBICACION_STOP"

        /** El servicio vivo, para que la alarma y el latido le pidan un punto. */
        @Volatile
        var instance: LocationService? = null
            private set

        private const val WAKE_LOCK_MS = 90_000L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val measuring = Mutex()
    private var providersReceiver: BroadcastReceiver? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Primero esto aunque sea para detenerse: Android exige `startForeground` tras `startForegroundService`.
        if (!goForeground()) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        listenProviders()
        takePoint()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        providersReceiver?.let { receiver -> runCatching { unregisterReceiver(receiver) } }
        providersReceiver = null
        if (instance === this) instance = null
        LocationTracker.onServiceDestroyed()
        scope.cancel()
        super.onDestroy()
    }

    private fun goForeground(): Boolean = try {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(LocationTracker.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(LocationTracker.NOTIFICATION_ID, notification)
        }
        true
    } catch (e: Exception) {
        // Android 14+ no deja abrir un servicio de ubicación desde segundo plano.
        Log.w(TAG, "startForeground rechazado: ${e.message}")
        false
    }

    /** Pide un punto y programa el siguiente. Si ya hay una lectura en curso, no hace nada. */
    fun takePoint() {
        scope.launch {
            if (!measuring.tryLock()) return@launch
            // La alarma despierta el teléfono solo unos segundos: la lectura y el envío tardan más.
            val wake = (getSystemService(Context.POWER_SERVICE) as? PowerManager)
                ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "arta:ubicacion")
                ?.apply {
                    setReferenceCounted(false)
                    acquire(WAKE_LOCK_MS)
                }
            try {
                measureOnce()
            } finally {
                runCatching { if (wake?.isHeld == true) wake.release() }
                measuring.unlock()
            }
        }
    }

    private suspend fun measureOnce() {
        val app = applicationContext
        if (!LocationTracker.isActive(app)) {
            LocationTracker.stopService(app)
            return
        }
        if (!LocationRules.inWindow(Instant.now())) {
            LocationTracker.endWindow(app)
            return
        }
        LocationTracker.reportState(app)
        if (!LocationRules.isDue(System.currentTimeMillis(), LocationTracker.lastTaken(app))) {
            LocationTracker.sendQueue(app)
            LocationTracker.scheduleNext(app)
            return
        }
        val reading = if (LocationTracker.locationEnabled(app)) LocationReader.read(app) else null
        if (reading == null) {
            LocationTracker.onReadingFailed(app)
            return
        }
        // La lectura pudo tardar hasta casi un minuto y cruzar las 18:00.
        val takenAt = Instant.now()
        if (!LocationRules.inWindow(takenAt)) {
            LocationTracker.endWindow(app)
            return
        }
        LocationTracker.savePoint(app, reading, takenAt.toEpochMilli())
        LocationTracker.scheduleNext(app)
    }

    private fun listenProviders() {
        if (providersReceiver != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                LocationTracker.onProvidersChanged(context)
            }
        }
        try {
            // Exportado como pide Android para avisos del sistema: PROVIDERS_CHANGED es protegido, ninguna app puede mandarlo.
            ContextCompat.registerReceiver(this, receiver, IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION), ContextCompat.RECEIVER_EXPORTED)
            providersReceiver = receiver
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo escuchar el interruptor de ubicación: ${e.message}")
        }
    }

    private fun buildNotification(): Notification {
        ArtaNotifications.ensureLocationChannel(this)
        val open = PendingIntent.getActivity(
            this,
            LocationTracker.NOTIFICATION_ID,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, ArtaNotifications.CHANNEL_LOCATION)
            .setSmallIcon(R.drawable.ic_stat_arta)
            .setColor(ArtaNotifications.ACCENT_COLOR)
            .setContentTitle("ARTA registra tu ubicación hasta las 18:00")
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            // Android 12+ retrasa 10 s la notificación de un servicio corto; esta sale de una vez.
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open)
            .build()
    }
}
