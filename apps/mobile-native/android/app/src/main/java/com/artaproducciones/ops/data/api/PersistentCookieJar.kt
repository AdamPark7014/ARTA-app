package com.artaproducciones.ops.data.api

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import org.json.JSONObject

/**
 * La sesión del API vive solo en cookies (`arta_access` httpOnly, `arta_session`
 * y `arta_csrf`), igual que en la web. Se guardan cifradas para que la sesión
 * sobreviva a reinicios y a que el sistema mate el proceso entre dos pushes.
 */
class PersistentCookieJar(context: Context) : CookieJar {
    private val prefs: SharedPreferences = openPrefs(context.applicationContext)
    private val cookies = LinkedHashMap<String, Cookie>()

    init {
        synchronized(cookies) {
            prefs.all.forEach { (key, raw) ->
                val cookie = (raw as? String)?.let(::decode) ?: return@forEach
                if (cookie.expiresAt > System.currentTimeMillis()) cookies[key] = cookie
            }
        }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val now = System.currentTimeMillis()
        val editor = prefs.edit()
        synchronized(this.cookies) {
            cookies.forEach { c ->
                val key = keyOf(c)
                if (c.expiresAt <= now) {
                    this.cookies.remove(key)
                    editor.remove(key)
                } else {
                    this.cookies[key] = c
                    editor.putString(key, encode(c))
                }
            }
        }
        editor.apply()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        synchronized(cookies) {
            return cookies.values.filter { it.expiresAt > now && it.matches(url) }
        }
    }

    /** Valor vigente de [name] para [url] (p. ej. `arta_csrf` para el header de CSRF). */
    fun cookieValue(name: String, url: HttpUrl): String? =
        loadForRequest(url).firstOrNull { it.name == name }?.value

    /** Header `Cookie` listo para clientes que no pasan por OkHttp (Socket.IO). */
    fun cookieHeader(url: HttpUrl): String =
        loadForRequest(url).joinToString("; ") { "${it.name}=${it.value}" }

    fun hasSession(url: HttpUrl): Boolean = cookieValue("arta_access", url) != null

    fun clear() {
        synchronized(cookies) { cookies.clear() }
        prefs.edit().clear().apply()
    }

    private fun keyOf(c: Cookie) = "${c.domain}|${c.path}|${c.name}"

    private fun encode(c: Cookie): String = JSONObject()
        .put("name", c.name)
        .put("value", c.value)
        .put("expiresAt", c.expiresAt)
        .put("domain", c.domain)
        .put("path", c.path)
        .put("secure", c.secure)
        .put("httpOnly", c.httpOnly)
        .put("hostOnly", c.hostOnly)
        .toString()

    private fun decode(raw: String): Cookie? = runCatching {
        val o = JSONObject(raw)
        Cookie.Builder()
            .name(o.getString("name"))
            .value(o.getString("value"))
            .expiresAt(o.getLong("expiresAt"))
            .path(o.optString("path", "/"))
            .apply {
                val domain = o.getString("domain")
                if (o.optBoolean("hostOnly")) hostOnlyDomain(domain) else domain(domain)
                if (o.optBoolean("secure")) secure()
                if (o.optBoolean("httpOnly")) httpOnly()
            }
            .build()
    }.getOrNull()

    private companion object {
        const val PREFS = "arta_cookies"

        fun openPrefs(context: Context): SharedPreferences = try {
            create(context)
        } catch (e: Exception) {
            // Llave del Keystore perdida (p. ej. tras restaurar el teléfono): se
            // borra el archivo ilegible y se empieza sin sesión. Nunca en claro.
            context.deleteSharedPreferences(PREFS)
            create(context)
        }

        private fun create(context: Context): SharedPreferences {
            val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            return EncryptedSharedPreferences.create(
                context,
                PREFS,
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }
    }
}
