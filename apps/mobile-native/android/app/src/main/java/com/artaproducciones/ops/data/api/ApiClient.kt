package com.artaproducciones.ops.data.api

import android.content.Context
import android.os.Build
import com.artaproducciones.ops.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Único cliente HTTP de la app. Sesión por cookies + doble envío de CSRF: en
 * cada petición que modifica algo se copia la cookie `arta_csrf` al header
 * `x-csrf-token`, exactamente como hace la web.
 */
object ApiClient {
    private val SAFE_METHODS = setOf("GET", "HEAD", "OPTIONS")

    val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/') + "/"

    /** Origen sin `/api`: ahí viven los adjuntos (`/uploads/...`) y el socket (`/api/socket.io`). */
    val origin: String = baseUrl.toHttpUrl().let { u ->
        val port = if (u.port == HttpUrl.defaultPort(u.scheme)) "" else ":${u.port}"
        "${u.scheme}://${u.host}$port"
    }

    val originUrl: HttpUrl get() = origin.toHttpUrl()

    lateinit var cookies: PersistentCookieJar
        private set
    lateinit var http: OkHttpClient
        private set
    lateinit var api: ArtaApi
        private set

    private val _unauthorized = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    /** 401 en cualquier llamada: la sesión se venció o la cerraron desde otro lado. */
    val unauthorized: SharedFlow<Unit> = _unauthorized

    /** `ArtaApp/0.1.0 (Android 14; samsung SM-A536B)`: el API lo registra como «Móvil». */
    val userAgent: String by lazy {
        val model = listOf(Build.MANUFACTURER, Build.MODEL).filter { !it.isNullOrBlank() }.joinToString(" ")
        "ArtaApp/${BuildConfig.VERSION_NAME} (Android ${Build.VERSION.RELEASE}; $model)"
    }

    @Synchronized
    fun init(context: Context) {
        if (::api.isInitialized) return
        cookies = PersistentCookieJar(context)
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        }
        http = OkHttpClient.Builder()
            .cookieJar(cookies)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val req = chain.request()
                val builder = req.newBuilder().header("User-Agent", userAgent)
                if (req.method.uppercase() !in SAFE_METHODS) {
                    cookies.cookieValue("arta_csrf", req.url)?.let { builder.header("x-csrf-token", it) }
                }
                val res = chain.proceed(builder.build())
                val isLogin = req.url.encodedPath.contains("/auth/login") || req.url.encodedPath.contains("/auth/2fa")
                if (res.code == 401 && !isLogin) _unauthorized.tryEmit(Unit)
                res
            }
            .addInterceptor(logging)
            .build()
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        api = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(http)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(ArtaApi::class.java)
    }

    fun hasSession(): Boolean = ::cookies.isInitialized && cookies.hasSession(originUrl)

    /** `/uploads/x.jpg` → URL absoluta del mismo host (la cookie de sesión la autoriza). */
    fun resolveUrl(path: String): String = when {
        path.startsWith("http://") || path.startsWith("https://") -> path
        path.startsWith("/") -> origin + path
        else -> "$origin/$path"
    }
}

/** Mensaje legible de un error del API (Nest manda `{ message }`, a veces lista). */
fun Throwable.userMessage(): String = when (this) {
    is HttpException -> {
        val raw = runCatching { response()?.errorBody()?.string() }.getOrNull().orEmpty()
        val msg = runCatching {
            val o = JSONObject(raw)
            o.optJSONArray("message")?.let { arr -> (0 until arr.length()).joinToString(". ") { arr.optString(it) } }
                ?: o.optString("message")
        }.getOrNull()
        when {
            !msg.isNullOrBlank() -> msg
            code() == 401 -> "Tu sesión terminó. Vuelve a entrar."
            code() == 403 -> "No tienes permiso para esto."
            code() == 404 -> "Ya no existe."
            code() >= 500 -> "El servidor tuvo un problema. Intenta de nuevo."
            else -> "Error ${code()}"
        }
    }
    is IOException -> "Sin conexión. Revisa tu internet."
    else -> message ?: "Algo salió mal"
}
