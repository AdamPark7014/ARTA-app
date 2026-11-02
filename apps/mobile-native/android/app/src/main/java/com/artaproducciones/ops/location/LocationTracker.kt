package com.artaproducciones.ops.location

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.artaproducciones.ops.MainActivity
import com.artaproducciones.ops.R
import com.artaproducciones.ops.data.Rbac
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.LocationPointBody
import com.artaproducciones.ops.data.api.LocationPointsBody
import com.artaproducciones.ops.data.api.LocationStateBody
import com.artaproducciones.ops.data.api.LocationStatusDto
import com.artaproducciones.ops.data.api.UserDto
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.demo.DemoMode
import com.artaproducciones.ops.push.ArtaNotifications
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.HttpException
import java.time.Instant

/** Lo que la interfaz pinta: la hoja de aceptar, el diálogo del sistema y el aviso de Inicio. */
data class LocationUi(
    val askConsent: Boolean = false,
    val askPermission: Boolean = false,
    val problem: LocationState? = null,
)

/**
 * Ubicación del equipo, de 10:00 a 18:00 (docs/UBICACION.md). Manda aquí; [LocationService] solo mide.
 *
 * Solo corre con consentimiento y si el servidor dice `tracked`: a Chacho, a Arturo y a `super_admin` no les
 * sale hoja, permiso, medición ni notificación. Con «Ahora no» la app sigue igual y se pregunta otro día.
 *
 * El servicio de primer plano solo se arranca con la app a la vista: Android 12+ no deja hacerlo desde
 * segundo plano y Android 14 exige además el permiso «todo el tiempo», que esta app no pide. Por eso a las
 * 10:00, o si Android cerró el servicio, la alarma deja un aviso discreto para abrir la app y al abrirla vuelve.
 *
 * El proceso puede nacer de la alarma o de un push, sin pantalla y con `Session` todavía cargando: lo que hace
 * falta entonces se lee de las preferencias, no de la sesión.
 */
object LocationTracker {
    private const val TAG = "ArtaUbicacion"
    private const val PREFS = "arta_ubicacion"
    private const val KEY_USER = "user"
    private const val KEY_ACTIVE = "active"
    private const val KEY_LAST_TAKEN = "last_taken_ms"
    private const val KEY_RETRIES = "retries"
    private const val KEY_QUEUE = "queue"
    private const val KEY_STATE_SENT = "state_sent"
    private const val KEY_ASKED_PERMISSION = "asked_permission"
    private const val KEY_REMINDED = "reminded_ms"
    private const val KEY_ALARM_AT = "alarm_at_ms"
    private const val KEY_DISMISSED_PREFIX = "dismissed_"

    const val NOTIFICATION_ID = 4801
    private const val REMINDER_ID = 4802

    /** Un segundo de más: la alarma de las 18:00 tiene que sonar ya fuera del horario. */
    private const val ALARM_MARGIN_MS = 1_000L

    /** Los envíos no viven en el servicio: se detiene a las 18:00 y lo pendiente todavía se manda. */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val queueLock = Mutex()
    private val stateLock = Mutex()
    private val refreshLock = Mutex()

    private val _ui = MutableStateFlow(LocationUi())
    val ui: StateFlow<LocationUi> = _ui

    @Volatile
    private var visible = false

    /** Se pidió arrancar el servicio y todavía no sabemos de su `onDestroy`. */
    @Volatile
    private var serviceRequested = false

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun hasPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** Interruptor de ubicación del teléfono; si no se puede leer, se da por encendido. */
    fun locationEnabled(context: Context): Boolean {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return true
        return LocationManagerCompat.isLocationEnabled(manager)
    }

    /** Aceptó y el servidor lo mide. Sobrevive a que Android mate el proceso. */
    internal fun isActive(context: Context): Boolean =
        !DemoMode.isActive && prefs(context).getBoolean(KEY_ACTIVE, false) && ApiClient.hasSession()

    internal fun lastTaken(context: Context): Long? = prefs(context).getLong(KEY_LAST_TAKEN, 0L).takeIf { it > 0L }

    private fun currentState(context: Context): LocationState =
        LocationRules.stateOf(hasPermission(context), locationEnabled(context))

    // ─── Sesión ──────────────────────────────────────────────────────────────

    /** Al entrar con sesión (`Session.signedIn`): pregunta al servidor qué le toca a esta persona. */
    fun onSignedIn(context: Context, user: UserDto) {
        val app = context.applicationContext
        val p = prefs(app)
        // Lo medido es de una persona: si entra otra en este teléfono, no se mezcla.
        if (p.getString(KEY_USER, null) != user.id) {
            forgetPerson(p)
            p.edit().putString(KEY_USER, user.id).apply()
        }
        // A un exento no le queda nada encendido aunque el servidor no conteste.
        if (!Rbac.isLocationTracked(user.roleKey)) stopEverything(app, clearQueue = true)
        scope.launch { refresh(app) }
    }

    /** Modo demo: la hoja y el permiso se pueden ver, nada sale a la red. Con los extras de las capturas, ni hoja. */
    fun onDemoEntered() {
        _ui.value = LocationUi(askConsent = DemoMode.enteredFromLogin)
    }

    fun onDemoExit() {
        _ui.value = LocationUi()
    }

    /** «Cerrar sesión»: se detiene todo y se vacía la cola de esa persona. */
    fun onLogout(context: Context) {
        val app = context.applicationContext
        stopEverything(app, clearQueue = true)
        val p = prefs(app)
        forgetPerson(p)
        p.edit().remove(KEY_USER).apply()
    }

    /**
     * La sesión terminó sin pedirlo (401): se detiene todo pero la cola se queda, con su dueño. Si vuelve a
     * entrar la misma persona, se manda; si entra otra, [onSignedIn] la tira.
     */
    fun onSessionEnded(context: Context) {
        stopEverything(context.applicationContext, clearQueue = false)
    }

    private fun forgetPerson(p: SharedPreferences) {
        p.edit()
            .remove(KEY_ACTIVE)
            .remove(KEY_LAST_TAKEN)
            .remove(KEY_RETRIES)
            .remove(KEY_QUEUE)
            .remove(KEY_STATE_SENT)
            .remove(KEY_REMINDED)
            .remove(KEY_ALARM_AT)
            .apply()
    }

    private fun stopEverything(app: Context, clearQueue: Boolean) {
        val p = prefs(app)
        p.edit().putBoolean(KEY_ACTIVE, false).apply()
        LocationAlarm.cancel(app)
        stopService(app)
        cancelReminder(app)
        _ui.value = LocationUi()
        if (clearQueue) {
            p.edit().remove(KEY_QUEUE).apply()
            // Un envío a medias no la vuelve a escribir: al terminar relee la cola ya vacía.
            scope.launch { queueLock.withLock { p.edit().remove(KEY_QUEUE).apply() } }
        }
    }

    // ─── Primer plano ────────────────────────────────────────────────────────

    /** La app se ve. Si Android cerró el servicio, aquí vuelve. */
    fun onForeground(context: Context) {
        visible = true
        if (DemoMode.isActive || Session.state.value !is Session.State.SignedIn) return
        val app = context.applicationContext
        scope.launch { refresh(app) }
    }

    fun onBackground() {
        visible = false
    }

    private suspend fun refresh(app: Context) {
        if (DemoMode.isActive || !ApiClient.hasSession()) return
        refreshLock.withLock<Unit> {
            val status = try {
                ApiClient.api.locationStatus()
            } catch (e: CancellationException) {
                throw e
            } catch (e: HttpException) {
                // 401: lo atiende `Session.expire`. Otro error: se sigue con lo último que se supo.
                if (e.code() == 401) return
                null
            } catch (e: Exception) {
                Log.w(TAG, "Sin estado de ubicación: ${e.message}")
                null
            }
            if (status != null) applyStatus(app, status)
            if (isActive(app)) sync(app)
        }
    }

    private fun applyStatus(app: Context, status: LocationStatusDto) {
        val p = prefs(app)
        when {
            !status.tracked -> stopEverything(app, clearQueue = true)
            status.consentAt.isNullOrBlank() -> {
                stopEverything(app, clearQueue = true)
                val today = LocationRules.dayKey(Instant.now())
                _ui.value = LocationUi(askConsent = LocationRules.shouldAskConsent(null, dismissedDay(p), today))
            }
            else -> p.edit().putBoolean(KEY_ACTIVE, true).apply()
        }
    }

    private fun dismissedDay(p: SharedPreferences): String? =
        p.getString(KEY_USER, null)?.let { p.getString(KEY_DISMISSED_PREFIX + it, null) }

    /** Con consentimiento: pone al día el estado, la cola, el servicio y la alarma. */
    private suspend fun sync(app: Context) {
        val now = Instant.now()
        val inWindow = LocationRules.inWindow(now)
        val permission = hasPermission(app)
        // Aceptó en otro teléfono o reinstaló: el diálogo del sistema sale una vez; luego ya es ir a Ajustes.
        val prompt = !permission && !prefs(app).getBoolean(KEY_ASKED_PERMISSION, false)
        _ui.value = LocationUi(askPermission = prompt, problem = problemToShow(app, inWindow, prompt))
        if (inWindow && !prompt) reportState(app)
        sendQueue(app)
        when {
            !inWindow -> endWindow(app)
            !permission -> scheduleNext(app)
            else -> {
                val service = LocationService.instance
                when {
                    service != null -> service.takePoint()
                    visible && startService(app) -> Unit
                    else -> scheduleNext(app)
                }
            }
        }
    }

    /** Fuera del horario no se molesta a nadie por tener la ubicación apagada. */
    private fun problemToShow(app: Context, inWindow: Boolean, prompt: Boolean): LocationState? {
        if (!inWindow || prompt) return null
        return currentState(app).takeIf { it != LocationState.OK }
    }

    // ─── La hoja ─────────────────────────────────────────────────────────────

    /** «Aceptar». Devuelve el error para la hoja o null si quedó. El diálogo del sistema lo lanza la hoja. */
    suspend fun acceptConsent(context: Context): String? {
        val app = context.applicationContext
        if (DemoMode.isActive) {
            _ui.value = LocationUi()
            return null
        }
        return try {
            ApiClient.api.locationConsent()
            prefs(app).edit().putBoolean(KEY_ACTIVE, true).apply()
            _ui.value = LocationUi()
            null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            e.userMessage()
        }
    }

    /** «Ahora no» o la hoja cerrada: vuelve a preguntar a otro día. En el demo no se guarda nada. */
    fun declineConsent(context: Context) {
        if (!DemoMode.isActive) {
            val p = prefs(context)
            p.getString(KEY_USER, null)?.let { user ->
                p.edit().putString(KEY_DISMISSED_PREFIX + user, LocationRules.dayKey(Instant.now())).apply()
            }
        }
        _ui.value = _ui.value.copy(askConsent = false)
    }

    fun onPermissionAsked(context: Context) {
        if (!DemoMode.isActive) prefs(context).edit().putBoolean(KEY_ASKED_PERMISSION, true).apply()
        _ui.value = _ui.value.copy(askPermission = false)
    }

    /** Contestó el diálogo del sistema (cualquier respuesta). */
    fun onPermissionResult(context: Context) {
        if (DemoMode.isActive) return
        val app = context.applicationContext
        scope.launch { refresh(app) }
    }

    // ─── Estado y cola ───────────────────────────────────────────────────────

    /** El interruptor cambió con el servicio corriendo: dirección y la app lo saben sin esperar al siguiente punto. */
    internal fun onProvidersChanged(context: Context) {
        val app = context.applicationContext
        if (!isActive(app)) return
        val inWindow = LocationRules.inWindow(Instant.now())
        _ui.value = _ui.value.copy(problem = problemToShow(app, inWindow, prompt = false))
        scope.launch {
            if (inWindow) reportState(app)
            // Se volvió a encender después de un intento sin señal: se mide ya.
            if (locationEnabled(app) && prefs(app).getInt(KEY_RETRIES, 0) > 0) LocationService.instance?.takePoint()
        }
    }

    /** `sin_permiso`, `apagada` y, cuando se arregla, `ok`: una vez al cambiar. Solo dentro del horario. */
    internal suspend fun reportState(app: Context) {
        if (!isActive(app) || !LocationRules.inWindow(Instant.now())) return
        stateLock.withLock<Unit> {
            // Dentro del candado: si Android avisa tres veces seguidas, se manda lo que hay ahora.
            val current = currentState(app)
            val p = prefs(app)
            if (!LocationRules.shouldReport(p.getString(KEY_STATE_SENT, null), current)) return
            try {
                ApiClient.api.locationState(LocationStateBody(current.wire))
                p.edit().putString(KEY_STATE_SENT, current.wire).apply()
            } catch (e: CancellationException) {
                throw e
            } catch (e: HttpException) {
                if (e.code() == 403) stopEverything(app, clearQueue = true)
            } catch (e: Exception) {
                // No se anota: el siguiente aviso o arranque lo vuelve a intentar.
                Log.w(TAG, "Estado de ubicación sin enviar: ${e.message}")
            }
        }
    }

    /** Guarda el punto y lo manda con lo que hubiera pendiente. */
    internal suspend fun savePoint(app: Context, reading: LocationReading, takenAtMs: Long) {
        val p = prefs(app)
        // Se marca como tomado aunque no llegue: queda en la cola con su hora y no se repite a los segundos.
        p.edit().putLong(KEY_LAST_TAKEN, takenAtMs).putInt(KEY_RETRIES, 0).apply()
        queueLock.withLock {
            val queue = LocationQueue.parse(p.getString(KEY_QUEUE, null))
            val point = QueuedPoint(reading.lat, reading.lng, reading.accuracyM, takenAtMs)
            p.edit().putString(KEY_QUEUE, LocationQueue.serialize(LocationQueue.add(queue, point))).apply()
        }
        sendQueue(app)
    }

    /** Reenvía la cola del más viejo al más nuevo, en lotes de 50. Se detiene en el primer fallo de red o de sesión. */
    internal suspend fun sendQueue(app: Context) {
        if (!isActive(app)) return
        val p = prefs(app)
        queueLock.withLock {
            val saved = p.getString(KEY_QUEUE, null) ?: return
            var pending = LocationQueue.fresh(LocationQueue.parse(saved), System.currentTimeMillis())
            p.edit().putString(KEY_QUEUE, LocationQueue.serialize(pending)).apply()
            while (pending.isNotEmpty()) {
                val batch = LocationQueue.nextBatch(pending)
                val body = LocationPointsBody(
                    points = batch.map { LocationPointBody(it.lat, it.lng, it.accuracyM, it.capturedAt) },
                )
                try {
                    val result = ApiClient.api.locationPoints(body)
                    // El servidor pasa a `ok` cuando guarda un punto.
                    if (result.saved > 0) p.edit().putString(KEY_STATE_SENT, LocationState.OK.wire).apply()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: HttpException) {
                    when (e.code()) {
                        // Ya no es de los que se miden.
                        403 -> {
                            stopEverything(app, clearQueue = true)
                            return
                        }
                        // Algo que el servidor nunca va a aceptar no debe atorar lo demás.
                        400, 422 -> Log.w(TAG, "Puntos rechazados: ${e.code()}")
                        else -> return
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Puntos en cola: ${e.message}")
                    return
                }
                // Se relee: si a media llamada se cerró la sesión, la cola vacía se queda vacía.
                pending = LocationQueue.parse(p.getString(KEY_QUEUE, null)).filter { it !in batch }
                p.edit().putString(KEY_QUEUE, LocationQueue.serialize(pending)).apply()
            }
        }
    }

    // ─── Alarma y latido ─────────────────────────────────────────────────────

    /** Suena la alarma: toma el punto, se detiene a las 18:00 o, sin servicio, intenta volver. */
    internal fun onAlarm(context: Context) {
        val app = context.applicationContext
        if (!isActive(app)) return
        if (!LocationRules.inWindow(Instant.now())) {
            endWindow(app)
            return
        }
        val service = LocationService.instance
        if (service != null) {
            service.takePoint()
            return
        }
        if (hasPermission(app) && !tryStartWithoutUi(app)) remind(app)
        scope.launch {
            reportState(app)
            sendQueue(app)
        }
        // Los reintentos eran del servicio que ya no está.
        prefs(app).edit().putInt(KEY_RETRIES, 0).apply()
        scheduleNext(app)
    }

    /**
     * `location.ping` del servidor, que lleva 35 min sin un punto: mide sin mostrar nada. Sin servicio no hay con
     * qué medir, y como llega cada 5 min solo recupera la alarma si se perdió (reinicio); el aviso lo pone ella.
     */
    fun onPing(context: Context) {
        val app = context.applicationContext
        if (!isActive(app) || !LocationRules.inWindow(Instant.now())) return
        val service = LocationService.instance
        if (service != null) {
            service.takePoint()
            return
        }
        if (hasPermission(app)) tryStartWithoutUi(app)
        scope.launch { sendQueue(app) }
        if (LocationRules.alarmLost(prefs(app).getLong(KEY_ALARM_AT, 0L), System.currentTimeMillis())) scheduleNext(app)
    }

    private fun tryStartWithoutUi(app: Context): Boolean =
        (visible || LocationRules.canStartFromBackground(Build.VERSION.SDK_INT)) && startService(app)

    /** Las 18:00: no queda servicio ni aviso, y la alarma vuelve a las 10:00. */
    internal fun endWindow(app: Context) {
        stopService(app)
        cancelReminder(app)
        _ui.value = _ui.value.copy(problem = null)
        scope.launch { sendQueue(app) }
        scheduleNext(app)
    }

    internal fun scheduleNext(app: Context) {
        val p = prefs(app)
        val delay = LocationRules.nextAlarmDelayMs(Instant.now(), lastTaken(app), p.getInt(KEY_RETRIES, 0)) + ALARM_MARGIN_MS
        LocationAlarm.schedule(app, delay)
        p.edit().putLong(KEY_ALARM_AT, System.currentTimeMillis() + delay).apply()
    }

    /** La lectura no salió: reintenta a los 5 min, tres veces, y luego espera la media hora. */
    internal fun onReadingFailed(app: Context) {
        val p = prefs(app)
        p.edit().putInt(KEY_RETRIES, LocationRules.nextRetries(p.getInt(KEY_RETRIES, 0))).apply()
        scheduleNext(app)
    }

    // ─── Servicio ────────────────────────────────────────────────────────────

    private fun startService(app: Context): Boolean = try {
        ContextCompat.startForegroundService(app, Intent(app, LocationService::class.java))
        serviceRequested = true
        cancelReminder(app)
        true
    } catch (e: Exception) {
        // `ForegroundServiceStartNotAllowedException` en Android 12+: no se pudo sin la app a la vista.
        Log.w(TAG, "No se pudo iniciar el servicio de ubicación: ${e.message}")
        false
    }

    /**
     * Por `startService` y no `stopService`: si el servicio apenas va arrancando, detenerlo antes de su
     * `startForeground` tumba la app. Así los dos comandos le llegan en orden.
     */
    internal fun stopService(app: Context) {
        if (!serviceRequested && LocationService.instance == null) return
        val intent = Intent(app, LocationService::class.java).setAction(LocationService.ACTION_STOP)
        try {
            app.startService(intent)
        } catch (_: Exception) {
            app.stopService(intent)
        }
        serviceRequested = false
    }

    internal fun onServiceDestroyed() {
        serviceRequested = false
    }

    // ─── Aviso para abrir la app ─────────────────────────────────────────────

    private fun remind(app: Context) {
        val p = prefs(app)
        val now = System.currentTimeMillis()
        if (!LocationRules.shouldRemind(p.getLong(KEY_REMINDED, 0L), now)) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ArtaNotifications.ensureLocationChannel(app)
        val open = PendingIntent.getActivity(
            app,
            REMINDER_ID,
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(app, ArtaNotifications.CHANNEL_LOCATION)
            .setSmallIcon(R.drawable.ic_stat_arta)
            .setColor(ArtaNotifications.ACCENT_COLOR)
            .setContentTitle("Comparte tu ubicación")
            .setContentText("Abre ARTA para registrar tu ubicación de hoy.")
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        runCatching { NotificationManagerCompat.from(app).notify(REMINDER_ID, notification) }
        p.edit().putLong(KEY_REMINDED, now).apply()
    }

    private fun cancelReminder(app: Context) {
        runCatching { NotificationManagerCompat.from(app).cancel(REMINDER_ID) }
    }
}
