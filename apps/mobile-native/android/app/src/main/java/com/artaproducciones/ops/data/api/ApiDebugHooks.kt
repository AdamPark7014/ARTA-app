package com.artaproducciones.ops.data.api

import android.content.Intent
import com.artaproducciones.ops.ui.DeepLink
import okhttp3.Interceptor

/**
 * Ganchos que solo llena la variante debug: modo demo para las capturas de tienda
 * (ver `src/debug/.../demo`). En release nadie los toca: sin interceptores, sin
 * lector de extras y `demo` siempre en `false`.
 */
object ApiDebugHooks {
    /** Van primero en la cadena de OkHttp (antes de cookies/CSRF y del 401). */
    @Volatile
    var interceptors: List<Interceptor> = emptyList()

    /** Modo demo: sesión ficticia en memoria, sin login, sin red, sin socket ni push. */
    @Volatile
    var demo: Boolean = false

    /** Lee los extras de arranque (`arta_demo`, `arta_demo_tab`…) y dice a dónde ir, si a algún lado. */
    @Volatile
    var launch: ((Intent) -> DeepLink?)? = null
}
