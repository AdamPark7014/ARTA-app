package com.artaproducciones.ops.data.api

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import java.util.concurrent.ConcurrentHashMap

class PersistentCookieJar(context: Context) : CookieJar {

    private val cookieStore = ConcurrentHashMap<String, List<Cookie>>()
    private val sharedPreferences: EncryptedSharedPreferences

    init {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        sharedPreferences = EncryptedSharedPreferences.create(
            "cookie_store",
            masterKeyAlias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        loadCookiesFromSharedPreferences()
    }

    private fun loadCookiesFromSharedPreferences() {
        sharedPreferences.all.forEach { (key, value) ->
            if (value is String) {
                val cookie = parseCookie(value)
                if (cookie != null && !cookie.expiresAt.isBefore(System.currentTimeMillis())) {
                    cookieStore[key] = cookieStore.getOrDefault(key, emptyList()) + cookie
                }
            }
        }
    }

    private fun parseCookie(cookieString: String): Cookie? {
        val parts = cookieString.split(";")
        if (parts.size < 2) return null
        val cookieParts = parts[0].trim().split("=")
        if (cookieParts.size != 2) return null
        val name = cookieParts[0].trim()
        val value = cookieParts[1].trim()
        val expiresAt = parts.getOrNull(1)?.trim()?.split(";")?.getOrNull(0)?.trim()?.let {
            try {
                it.toLong()
            } catch (e: NumberFormatException) {
                null
            }
        } ?: System.currentTimeMillis() + 3600 * 1000 // Default expiration in 1 hour
        return Cookie.Builder()
            .name(name)
            .value(value)
            .expiresAt(expiresAt)
            .build()
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookies.forEach { cookie ->
            if (cookie.expiresAt.isBefore(System.currentTimeMillis())) return@forEach
            val key = url.host
            cookieStore[key] = cookieStore.getOrDefault(key, emptyList()) + cookie
            sharedPreferences.edit().putString(key, serializeCookie(cookie)).apply()
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        return cookieStore.getOrDefault(url.host, emptyList()).filter { !it.expiresAt.isBefore(System.currentTimeMillis()) }
    }

    fun cookieValue(name: String): String? {
        for (cookies in cookieStore.values) {
            for (cookie in cookies) {
                if (cookie.name == name) return cookie.value
            }
        }
        return null
    }

    fun clear() {
        cookieStore.clear()
        sharedPreferences.edit().clear().apply()
    }

    private fun serializeCookie(cookie: Cookie): String {
        return "${cookie.name}=${cookie.value}; expires=${cookie.expiresAt}"
    }
}