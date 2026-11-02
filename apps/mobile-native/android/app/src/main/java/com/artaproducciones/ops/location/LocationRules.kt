package com.artaproducciones.ops.location

import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import kotlin.math.abs

/** Lo que se le dice al servidor del teléfono (`POST /ubicacion/estado`). */
enum class LocationState(val wire: String) {
    OK("ok"),
    NO_PERMISSION("sin_permiso"),
    OFF("apagada"),
}

/**
 * Reglas de la ubicación del equipo (docs/UBICACION.md), sin Android: se prueban en la JVM. Mismas cifras
 * que `apps/api/src/ubicacion/horario.ts` y que `Data/LocationRules.swift`. El candado de verdad es del
 * servidor; aquí se evita medir y gastar batería cuando no toca.
 */
object LocationRules {
    /** Manda la hora de Puebla, no la del teléfono: alguien de viaje mide en el mismo horario. */
    val ZONE: ZoneId = ZoneId.of("America/Mexico_City")
    const val START_HOUR = 10
    const val END_HOUR = 18

    /** Un punto cada media hora. */
    const val CADENCE_MS = 30 * 60_000L

    /** Nunca dos en menos de esto: la misma cifra con la que el servidor tira los repetidos. */
    const val MIN_GAP_MS = 20 * 60_000L

    /** Sin señal se reintenta antes de esperar la media hora completa. */
    const val RETRY_MS = 5 * 60_000L
    const val MAX_RETRIES = 3

    /** Android 11 ya no da ubicación a un servicio que arrancó en segundo plano, y Android 14 ni lo deja arrancar. */
    private const val LAST_SDK_WITH_BACKGROUND_START = 29

    /** El aviso para abrir la app, como el recordatorio de iOS: a lo más uno por hora. */
    const val REMINDER_GAP_MS = 60 * 60_000L

    /** Tras un reinicio Android olvida la alarma: pasado esto sin sonar, se da por perdida. */
    private const val LOST_ALARM_SLACK_MS = 5 * 60_000L

    /** De 10:00:00 a 17:59:59. */
    fun inWindow(now: Instant): Boolean = now.atZone(ZONE).hour.let { it >= START_HOUR && it < END_HOUR }

    /** El día en Puebla (`2026-11-01`): «Ahora no» vale hasta que cambia. */
    fun dayKey(now: Instant): String = now.atZone(ZONE).toLocalDate().toString()

    fun msUntilWindowEnd(now: Instant): Long {
        val end = now.atZone(ZONE).toLocalDate().atTime(END_HOUR, 0).atZone(ZONE).toInstant()
        return Duration.between(now, end).toMillis()
    }

    /** Hasta las 10:00 de hoy si todavía no llegan, o las de mañana. */
    fun msUntilNextStart(now: Instant): Long {
        val today = now.atZone(ZONE).toLocalDate()
        val startToday = today.atTime(START_HOUR, 0).atZone(ZONE).toInstant()
        val next = if (now.isBefore(startToday)) startToday else today.plusDays(1).atTime(START_HOUR, 0).atZone(ZONE).toInstant()
        return Duration.between(now, next).toMillis()
    }

    /** Un reloj movido hacia atrás (`elapsed < 0`) no deja a nadie sin medir. */
    fun isDue(nowMs: Long, lastTakenMs: Long?): Boolean {
        if (lastTakenMs == null) return true
        val elapsed = nowMs - lastTakenMs
        return elapsed < 0 || elapsed >= MIN_GAP_MS
    }

    /**
     * Cuándo volver a sonar: dentro del horario, a la media hora del último punto (a los 5 min si falló
     * la lectura) y nunca después de las 18:00; fuera del horario, a las 10:00.
     */
    fun nextAlarmDelayMs(now: Instant, lastTakenMs: Long?, retries: Int): Long {
        if (!inWindow(now)) return msUntilNextStart(now)
        val next = if (retries > 0) {
            RETRY_MS
        } else {
            val elapsed = lastTakenMs?.let { now.toEpochMilli() - it }
            if (elapsed == null || elapsed < 0 || elapsed >= CADENCE_MS) CADENCE_MS else CADENCE_MS - elapsed
        }
        return minOf(next, msUntilWindowEnd(now))
    }

    fun nextRetries(retries: Int): Int = if (retries + 1 > MAX_RETRIES) 0 else retries + 1

    /** Sin aceptar y sin haber dicho «Ahora no» hoy. */
    fun shouldAskConsent(consentAt: String?, dismissedDay: String?, today: String): Boolean =
        consentAt.isNullOrBlank() && dismissedDay != today

    /** Con el interruptor apagado da igual el permiso: es lo primero que hay que arreglar. */
    fun stateOf(hasPermission: Boolean, enabled: Boolean): LocationState = when {
        !enabled -> LocationState.OFF
        !hasPermission -> LocationState.NO_PERMISSION
        else -> LocationState.OK
    }

    /** Una vez al cambiar. Lo primero que se manda solo si es un problema: sin dato ya se lee como «bien». */
    fun shouldReport(lastSent: String?, current: LocationState): Boolean =
        if (lastSent == null) current != LocationState.OK else lastSent != current.wire

    /** ¿Tiene caso intentar arrancar el servicio sin la app a la vista? */
    fun canStartFromBackground(sdkInt: Int): Boolean = sdkInt <= LAST_SDK_WITH_BACKGROUND_START

    fun shouldRemind(lastReminderMs: Long, nowMs: Long): Boolean = lastReminderMs <= 0L || nowMs - lastReminderMs >= REMINDER_GAP_MS

    fun alarmLost(alarmAtMs: Long, nowMs: Long): Boolean = alarmAtMs <= 0L || nowMs - alarmAtMs > LOST_ALARM_SLACK_MS

    /** El (0,0) de una lectura vacía no es un sitio donde haya estado nadie. */
    fun isRealFix(lat: Double, lng: Double): Boolean {
        if (!lat.isFinite() || !lng.isFinite()) return false
        if (lat == 0.0 && lng == 0.0) return false
        return abs(lat) <= 90.0 && abs(lng) <= 180.0
    }
}

data class QueuedPoint(val lat: Double, val lng: Double, val accuracyM: Double?, val capturedAtMs: Long) {
    /** `2026-11-01T16:00:00.123Z`. La hora del teléfono al medir, aunque se mande más tarde. */
    val capturedAt: String get() = Instant.ofEpochMilli(capturedAtMs).toString()
}

/**
 * La cola de puntos sin mandar. Todo punto entra aquí antes de salir: si no hay red, la sesión se cerró
 * (401) o Android mata la app a medio envío, sigue guardado con su hora. Un envío repetido no estorba: el
 * servidor tira lo que quede a menos de 20 minutos de otro punto.
 */
object LocationQueue {
    /** Lo que acepta `POST /ubicacion/puntos`. */
    const val BATCH_MAX = 50

    /** Un día de horario son 16 puntos: esto es tope de seguridad, no un límite que se alcance. */
    const val MAX_SIZE = 100

    /** Más viejo el servidor ya no lo guarda. */
    const val MAX_AGE_MS = 24 * 60 * 60_000L

    fun add(queue: List<QueuedPoint>, point: QueuedPoint): List<QueuedPoint> =
        (queue + point).sortedBy { it.capturedAtMs }.takeLast(MAX_SIZE)

    fun fresh(queue: List<QueuedPoint>, nowMs: Long): List<QueuedPoint> =
        queue.filter { nowMs - it.capturedAtMs <= MAX_AGE_MS }

    fun nextBatch(queue: List<QueuedPoint>): List<QueuedPoint> = queue.take(BATCH_MAX)

    fun serialize(queue: List<QueuedPoint>): String {
        val out = JSONArray()
        queue.forEach { p ->
            val o = JSONObject().put("lat", p.lat).put("lng", p.lng).put("at", p.capturedAtMs)
            p.accuracyM?.takeIf { it.isFinite() }?.let { o.put("acc", it) }
            out.put(o)
        }
        return out.toString()
    }

    /** Lo que no se pueda leer se tira: una cola dañada no debe tumbar la medición. */
    fun parse(raw: String?): List<QueuedPoint> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).map { i ->
                val o = array.getJSONObject(i)
                QueuedPoint(
                    lat = o.getDouble("lat"),
                    lng = o.getDouble("lng"),
                    accuracyM = if (o.has("acc")) o.getDouble("acc") else null,
                    capturedAtMs = o.getLong("at"),
                )
            }
        }.getOrDefault(emptyList())
    }
}
