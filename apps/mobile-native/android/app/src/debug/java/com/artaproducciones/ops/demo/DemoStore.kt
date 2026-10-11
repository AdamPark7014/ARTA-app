package com.artaproducciones.ops.demo

import android.content.Context
import android.util.Log
import okhttp3.HttpUrl
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
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
 * Respuestas grabadas (`assets/fixtures/index.json` → archivo) más lo que se cambió durante
 * esta sesión de demo (mandar un mensaje, aprobar una tarea…), solo en memoria.
 */
internal class DemoStore(private val context: Context) {
    private val overlay = ConcurrentHashMap<String, String>()

    private val index: Map<String, String> by lazy {
        val raw = asset("index.json") ?: return@lazy emptyMap<String, String>().also {
            Log.e(TAG, "Sin assets/$DIR/index.json: ¿el build debug incluye apps/mobile-native/demo?")
        }
        val o = JSONObject(raw)
        o.keys().asSequence().associateWith { o.getString(it) }
    }

    fun keys(): Set<String> = index.keys + overlay.keys

    fun raw(key: String): String? = overlay[key] ?: index[key]?.let(::asset)

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
