package com.artaproducciones.ops.demo

import android.content.Context
import android.util.Log
import okhttp3.HttpUrl
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.concurrent.ConcurrentHashMap

/**
 * Clave de fixture (igual que `apps/mobile-native/demo/grabar-fixtures.mjs`): la ruta después
 * de la base del API más solo `entity` y `scope`, en orden alfabético. `before`, `limit`,
 * `take`, `from`, `to`… no cuentan.
 */
internal object DemoKeys {
    fun key(path: String, entity: String?, scope: String?): String {
        val query = listOfNotNull(entity?.let { "entity=$it" }, scope?.let { "scope=$it" }).joinToString("&")
        return if (query.isEmpty()) path else "$path?$query"
    }

    /**
     * De más a menos específica: exacta, sin `scope` (p. ej. `scope=active` no se grabó), sin
     * `entity` (las apps ahora mandan la entidad activa en todo listado; lo grabado sin ella lo
     * filtra [DemoEntities]) y sin query.
     */
    fun candidates(path: String, url: HttpUrl): List<String> {
        val entity = url.queryParameter("entity")?.takeIf { it.isNotBlank() }
        val scope = url.queryParameter("scope")?.takeIf { it.isNotBlank() }
        return listOf(key(path, entity, scope), key(path, entity, null), key(path, null, scope), path).distinct()
    }

    /** `chat/channels/x` si [url] es del API ([base] = `…/api/`); null para `/uploads`, otro host, etc. */
    fun apiPath(url: HttpUrl, base: HttpUrl): String? {
        if (!url.host.equals(base.host, ignoreCase = true) || url.port != base.port) return null
        val prefix = base.pathSegments.filter { it.isNotEmpty() }
        val segments = url.pathSegments.filter { it.isNotEmpty() }
        if (segments.size < prefix.size || segments.subList(0, prefix.size) != prefix) return null
        return segments.drop(prefix.size).joinToString("/")
    }
}

/**
 * Modo demo con `?entity=` (docs/entidades-arta-auditorio.md): una lista grabada sin entidad se
 * filtra como lo haría el API, para que el cambio Arta ⇄ Auditorio se vea también en la demo.
 */
internal object DemoEntities {
    /**
     * Entidad de una fila: la suya, la de su evento o, sin evento, la que le puso la migración
     * (canales y tareas de ARTA; directos y grupos de directos, de nadie). Null = se ve en las dos.
     */
    fun of(path: String, item: JSONObject, eventEntity: (String) -> String?): String? {
        item.str("entity")?.let { return it }
        item.optJSONObject("event")?.str("entity")?.let { return it }
        item.str("eventId")?.let { id -> eventEntity(id)?.let { return it } }
        return when {
            path == "chat/channels" -> if (item.optString("kind") == "DIRECT" || item.optBoolean("isGroupDm")) null else "ARTA"
            path.startsWith("tasks/") || path.startsWith("finance/advances") -> "ARTA"
            else -> null
        }
    }

    fun keep(path: String, item: JSONObject, entity: String, eventEntity: (String) -> String?): Boolean =
        of(path, item, eventEntity).let { it == null || it == entity }

    /** Solo lo de [entity] (más lo personal). Lo que no es una lista se devuelve igual. */
    fun filter(path: String, raw: String, entity: String, eventEntity: (String) -> String?): String {
        if (!raw.trimStart().startsWith("[")) return raw
        val list = runCatching { JSONArray(raw) }.getOrNull() ?: return raw
        return JSONArray(list.objects().filter { keep(path, it, entity, eventEntity) }).toString()
    }
}

/**
 * Avisos en el modo demo, como `GET /notifications` y `/notifications/preferences` del API: una
 * sola fixture sirve a todas las páginas y filtros, y las preferencias se recuerdan en memoria.
 */
internal object DemoNotices {
    const val PREFS_KEY = "notifications/preferences"
    const val DEFAULT_PREFS = """{"muted":[],"quietHours":{"enabled":false,"start":"22:00","end":"07:00"}}"""
    const val SENT_PATH = "notifications/sent"
    const val SEEN_PATH = "notifications/seen"

    /** En el demo nadie recibe acuses: se acepta y no cambia nada. */
    const val SEEN_ACCEPTED = """{"seen":0}"""

    private val CHANNELS = listOf("chat", "approvals", "tasks", "finance", "events", "documents", "general")
    private val HHMM = Regex("^([01]\\d|2[0-3]):[0-5]\\d\$")

    /** Aplica `unread`, `before` y `take` sobre la lista grabada, de lo más nuevo a lo más viejo. */
    fun page(raw: String, url: HttpUrl): String {
        val list = runCatching { JSONArray(raw) }.getOrNull() ?: return raw
        val unreadOnly = url.queryParameter("unread").let { it == "1" || it == "true" }
        val before = url.queryParameter("before")?.let { runCatching { Instant.parse(it) }.getOrNull() }
        val take = url.queryParameter("take")?.toIntOrNull()?.coerceIn(1, 100) ?: 30
        val rows = list.objects()
            .filter { !unreadOnly || it.isNull("readAt") }
            .filter { n -> before == null || createdAt(n)?.isBefore(before) == true }
            .sortedByDescending { createdAt(it) ?: Instant.EPOCH }
            .take(take)
        return JSONArray(rows).toString()
    }

    /**
     * Como `GET /notifications/sent` del API, de lo más nuevo a lo más viejo: las tareas que la cuenta
     * de demo pidió (`tasks/requested` de las fixtures) y su equipo. Las fechas salen de [now]: «Visto
     * hace 5 min» se lee igual cualquier día. [entity] null = todas.
     */
    fun sent(now: Instant, entity: String?): String {
        val mateo = "c7c0ae50aaa46fda9060d0947" to "Mateo Ríos Calderón"
        val lucia = "c56ea4d06e6e4b57237532cd4" to "Lucía Méndez Arriaga"
        val valeria = "ce08d1dd4a18c703877519be3" to "Valeria Ortega Luna"
        val hospedaje = "/events/cbf9b2784b0797342c1629b09?tab=tasks&task=c40c99ec13d86f7ea7b453962"
        val medios = "/events/c159b2f535555db3effcb05ba?tab=tasks&task=ced2acc3fbe422e89ea322ed0"

        fun ago(minutes: Long?): Any = minutes?.let { now.minus(it, ChronoUnit.MINUTES).toString() } ?: JSONObject.NULL
        fun recipient(person: Pair<String, String>, seen: Long? = null, read: Long? = null) = JSONObject()
            .put("id", person.first)
            .put("fullName", person.second)
            .put("seenAt", ago(seen))
            .put("readAt", ago(read))
        fun row(type: String, title: String, body: String, link: String, minutes: Long, recipients: List<JSONObject>) = JSONObject()
            .put("key", "$type|$link|$title")
            .put("type", type)
            .put("title", title)
            .put("body", body)
            .put("linkUrl", link)
            .put("createdAt", ago(minutes))
            .put("recipients", JSONArray(recipients))

        val arta = listOf(
            row("task.rejected", "Demo R. pide corregir: Reservar hospedaje para el trío", "Noche de Boleros", hospedaje, 12, listOf(recipient(mateo))),
            row(
                "task.mention",
                "Demo R. te mencionó en: Reservar hospedaje para el trío",
                "«Pidan factura a nombre de Arta».",
                hospedaje,
                190,
                listOf(recipient(mateo, seen = 5), recipient(lucia, read = 95), recipient(valeria)),
            ),
            row("task.assigned", "Demo R. te asignó: Reservar hospedaje para el trío", "Noche de Boleros", hospedaje, 1560, listOf(recipient(mateo, seen = 1500, read = 1490))),
        )
        val auditorio = listOf(
            row(
                "task.mention",
                "Demo R. te mencionó en: Cerrar la lista de medios para la rueda de prensa",
                "«Falta confirmar la radio».",
                medios,
                40,
                listOf(recipient(lucia), recipient(valeria)),
            ),
            row(
                "task.assigned",
                "Demo R. te asignó: Cerrar la lista de medios para la rueda de prensa",
                "Eco de Volcanes · Gira 2026",
                medios,
                310,
                listOf(recipient(mateo, seen = 300), recipient(lucia, seen = 45, read = 44)),
            ),
        )
        val rows = when (entity) {
            "ARTA" -> arta
            "EXPLANADA" -> auditorio
            else -> (arta + auditorio).sortedByDescending { createdAt(it) ?: Instant.EPOCH }
        }
        return JSONArray(rows).toString()
    }

    /** Lo mismo que `normalizePrefs` del API: la forma completa, con valores válidos. */
    fun normalizePrefs(body: JSONObject): JSONObject {
        val muted = body.optJSONArray("muted").strings().toSet()
        val quiet = body.optJSONObject("quietHours")
        fun hour(key: String, fallback: String) = quiet?.str(key)?.takeIf { HHMM.matches(it) } ?: fallback
        return JSONObject()
            .put("muted", JSONArray(CHANNELS.filter { it in muted }))
            .put(
                "quietHours",
                JSONObject()
                    .put("enabled", quiet?.optBoolean("enabled") == true)
                    .put("start", hour("start", "22:00"))
                    .put("end", hour("end", "07:00")),
            )
    }

    private fun createdAt(n: JSONObject): Instant? = n.str("createdAt")?.let { runCatching { Instant.parse(it) }.getOrNull() }
}

/**
 * Las fixtures traen fechas absolutas del día en que se grabaron (la cuenta se resiembra justo
 * antes: tareas que vencen «hoy», mensajes de hace minutos, eventos de la semana). Para que el demo
 * se vea igual cualquier otro día, todas las fechas se mueven los días enteros que separan aquel
 * día de hoy (calendario local: la hora del reloj se conserva). Igual que `DemoClock` de iOS.
 */
internal object DemoClock {
    /** `2026-10-05T01:08:40.463Z` (con o sin fracción de segundo). */
    private val ISO = Regex("""\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z""")

    /** Una fecha sola como valor JSON: `"2026-10-29"`. */
    private val DAY = Regex("""(?<=")\d{4}-\d{2}-\d{2}(?=")""")

    private val WITH_MILLIS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)
    private val PLAIN = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'").withZone(ZoneOffset.UTC)

    /**
     * La fecha más reciente entre [sources] (lista JSON grabada → campo de fecha). Con avisos y
     * chats es el momento de la grabación: se graba minutos después de sembrar.
     */
    fun latest(sources: List<Pair<String?, String>>): Instant? =
        sources.flatMap { (raw, field) ->
            val list = raw?.let { runCatching { JSONArray(it) }.getOrNull() }
            list.objects().mapNotNull { o -> o.str(field)?.let { runCatching { Instant.parse(it) }.getOrNull() } }
        }.maxOrNull()

    /** Días de calendario (en [zone]) entre la grabación y [today]. Sin grabación, cero. */
    fun dayOffset(recorded: Instant?, today: LocalDate, zone: ZoneId): Long =
        if (recorded == null) 0 else ChronoUnit.DAYS.between(recorded.atZone(zone).toLocalDate(), today)

    /** Mueve todas las fechas de [text] [days] días. Sin desfase, no toca nada. */
    fun shift(text: String, days: Long, zone: ZoneId): String {
        if (days == 0L) return text
        val moved = ISO.replace(text) { m ->
            runCatching {
                val at = Instant.parse(m.value).atZone(zone).plusDays(days).toInstant()
                (if ('.' in m.value) WITH_MILLIS else PLAIN).format(at)
            }.getOrDefault(m.value)
        }
        return DAY.replace(moved) { m -> runCatching { LocalDate.parse(m.value).plusDays(days).toString() }.getOrDefault(m.value) }
    }
}

/**
 * Respuestas grabadas (`assets/fixtures/index.json` → archivo, con las fechas movidas a hoy) más
 * lo que se cambió durante esta sesión de demo (mandar un mensaje, aprobar una tarea…), solo en
 * memoria: [clear] lo olvida al salir del demo.
 */
internal class DemoStore(private val context: Context) {
    private val overlay = ConcurrentHashMap<String, String>()
    private val shifted = ConcurrentHashMap<String, String>()

    private val index: Map<String, String> by lazy {
        val raw = asset("index.json") ?: return@lazy emptyMap<String, String>().also {
            Log.e(TAG, "Sin assets/$DIR/index.json: ¿el build incluye apps/mobile-native/demo?")
        }
        val o = JSONObject(raw)
        o.keys().asSequence().associateWith { o.getString(it) }
    }

    private val zone: ZoneId by lazy { ZoneId.systemDefault() }

    private val dayOffset: Long by lazy {
        val recorded = DemoClock.latest(
            listOf(
                index["notifications"]?.let(::asset) to "createdAt",
                index["chat/channels"]?.let(::asset) to "lastMessageAt",
            ),
        )
        DemoClock.dayOffset(recorded, LocalDate.now(zone), zone)
    }

    fun keys(): Set<String> = index.keys + overlay.keys

    fun raw(key: String): String? = overlay[key] ?: fixture(key)

    /** Lo grabado no cambia: se lee y se mueve de fecha una sola vez por clave. */
    private fun fixture(key: String): String? {
        shifted[key]?.let { return it }
        val text = index[key]?.let(::asset) ?: return null
        return DemoClock.shift(text, dayOffset, zone).also { shifted[key] = it }
    }

    /** Al salir del demo: lo cambiado en esta sesión se olvida. */
    fun clear() = overlay.clear()

    fun obj(key: String): JSONObject? = raw(key)?.let { runCatching { JSONObject(it) }.getOrNull() }

    fun arr(key: String): JSONArray? = raw(key)?.let { runCatching { JSONArray(it) }.getOrNull() }

    fun put(key: String, json: Any) {
        overlay[key] = json.toString()
    }

    private fun asset(name: String): String? = try {
        context.assets.open("$DIR/$name").bufferedReader().use { it.readText() }
    } catch (_: IOException) {
        null
    }

    companion object {
        private const val TAG = "ArtaDemo"
        private const val DIR = "fixtures"
    }
}

internal fun JSONArray?.objects(): List<JSONObject> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

internal fun JSONArray?.strings(): List<String> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optString(it).takeIf { s -> s.isNotEmpty() } }

/** `optString` devuelve "null" para un null de JSON; aquí es null de verdad. */
internal fun JSONObject.str(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }
