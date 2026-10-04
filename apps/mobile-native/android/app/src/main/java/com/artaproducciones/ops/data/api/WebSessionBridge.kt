package com.artaproducciones.ops.data.api

import android.util.Log
import android.webkit.CookieManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Puente de sesión entre el almacén nativo (`PersistentCookieJar`) y la vista web
 * (`android.webkit.CookieManager`). Una sola sesión para la app y la web:
 *
 * 1. Si la vista web ya trae la misma `arta_access` que la app, se carga directo.
 * 2. Si no, acceso de un solo uso (`POST /api/auth/handoff`, 60 s) y se carga
 *    `<ruta>?_nxt=<code>`; la web lo canjea y recibe cookies propias.
 * 3. Si el handoff falla, respaldo: se copian las cookies nativas a la vista web.
 *
 * Tras cada carga, [syncBack] devuelve al almacén nativo la sesión que tenga la
 * vista web (p. ej. la del handoff), para que ambas usen la misma.
 */
object WebSessionBridge {
    private const val TAG = "WebSession"
    const val HANDOFF_PARAM = "_nxt"
    private val SESSION_COOKIES = listOf("arta_access", "arta_session", "arta_csrf")
    private const val DEFAULT_MAX_AGE_MS = 7L * 24 * 60 * 60 * 1000
    private val JSON = "application/json; charset=utf-8".toMediaType()

    /** URL absoluta con la que debe arrancar la vista web para [path]. */
    suspend fun entryUrl(path: String, entity: String): String {
        val clean = normalizePath(path)
        if (webHasNativeSession()) return ApiClient.origin + clean
        val code = runCatching { createHandoff(entity, clean) }
            .onFailure { Log.w(TAG, "Handoff no disponible: ${it.message}") }
            .getOrNull()
        if (code.isNullOrBlank()) {
            copyNativeToWeb()
            return ApiClient.origin + clean
        }
        val sep = if (clean.contains('?')) '&' else '?'
        return ApiClient.origin + clean + sep + HANDOFF_PARAM + "=" + code
    }

    /** `/ruta` relativa al panel; nunca otra cosa (evita abrir hosts ajenos con la sesión). */
    fun normalizePath(path: String): String {
        val p = path.trim()
        if (p.startsWith(ApiClient.origin)) return normalizePath(p.removePrefix(ApiClient.origin))
        return if (p.startsWith("/")) p else "/$p"
    }

    private suspend fun createHandoff(entity: String, path: String): String? = withContext(Dispatchers.IO) {
        val body = JSONObject().put("entity", entity).put("path", path.substringBefore('#')).toString()
        val req = Request.Builder()
            .url(ApiClient.baseUrl + "auth/handoff")
            .post(body.toRequestBody(JSON))
            .build()
        ApiClient.http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return@withContext null
            JSONObject(res.body?.string().orEmpty()).optString("code").takeIf { it.isNotBlank() }
        }
    }

    private fun webCookies(): Map<String, String> {
        val raw = runCatching { CookieManager.getInstance().getCookie(ApiClient.origin) }.getOrNull().orEmpty()
        return raw.split(';').mapNotNull { part ->
            val i = part.indexOf('=')
            if (i <= 0) null else part.substring(0, i).trim() to part.substring(i + 1).trim()
        }.toMap()
    }

    private fun webHasNativeSession(): Boolean {
        val native = ApiClient.cookies.cookieValue("arta_access", ApiClient.originUrl) ?: return false
        return webCookies()["arta_access"] == native
    }

    /** Respaldo: cookies nativas → vista web, con los mismos atributos que pone el API. */
    fun copyNativeToWeb() {
        val cm = CookieManager.getInstance()
        val secure = ApiClient.originUrl.isHttps
        ApiClient.cookies.loadForRequest(ApiClient.originUrl).forEach { c ->
            val maxAge = ((c.expiresAt - System.currentTimeMillis()) / 1000).coerceAtLeast(0)
            val attrs = buildString {
                append("${c.name}=${c.value}; Path=${c.path}; Max-Age=$maxAge; SameSite=Lax")
                if (c.secure || secure) append("; Secure")
                if (c.httpOnly) append("; HttpOnly")
            }
            cm.setCookie(ApiClient.origin, attrs)
        }
        cm.flush()
    }

    /**
     * Vista web → almacén nativo. Solo cuando la vista web tiene `arta_access` y es
     * distinta: nunca borra la sesión nativa por una vista web vacía.
     */
    fun syncBack() {
        val web = webCookies()
        val access = web["arta_access"]?.takeIf { it.isNotBlank() } ?: return
        val url = ApiClient.originUrl
        val native = ApiClient.cookies.loadForRequest(url).associateBy { it.name }
        if (native["arta_access"]?.value == access) return
        val now = System.currentTimeMillis()
        val updated = SESSION_COOKIES.mapNotNull { name ->
            val value = web[name]?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val prev = native[name]
            Cookie.Builder()
                .name(name)
                .value(value)
                .hostOnlyDomain(url.host)
                .path("/")
                .expiresAt(now + DEFAULT_MAX_AGE_MS)
                .apply {
                    if (url.isHttps || prev?.secure == true) secure()
                    if (name == "arta_access") httpOnly()
                }
                .build()
        }
        ApiClient.cookies.saveFromResponse(url, updated)
    }

    /** Cierre de sesión: la vista web no conserva nada de la sesión anterior. */
    fun clear() {
        runCatching {
            val cm = CookieManager.getInstance()
            cm.removeAllCookies(null)
            cm.flush()
        }
    }
}
