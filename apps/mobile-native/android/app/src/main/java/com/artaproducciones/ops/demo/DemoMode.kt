package com.artaproducciones.ops.demo

import android.content.Context
import okhttp3.Interceptor

/**
 * Modo demostración: la app entera con datos ficticios, sin cuenta y sin red (como `DemoMode`
 * de iOS).
 *
 * Existe en todas las compilaciones, también la de Play: cualquier persona puede explorar la app
 * desde la ficha con el botón «Explorar ARTA con datos de muestra» de la pantalla de entrada
 * (`Session.enterDemo`), y la revisión no depende de credenciales. También lo usan las capturas de
 * tienda, que arrancan la variante debug con extras ([DemoLaunch], `--ez arta_demo true`).
 *
 * Con el demo activo:
 *  - la app entra como la persona de `fixtures/auth__me.json`, solo en memoria: ni cookie, ni
 *    preferencias, ni entidad guardada;
 *  - cada petición del OkHttp de la app la contesta [DemoInterceptor] con las respuestas grabadas
 *    por `apps/mobile-native/demo/grabar-fixtures.mjs` (organización ficticia), con las fechas
 *    movidas a hoy ([DemoClock]); lo que no es del API responde 404;
 *  - no se abre el socket, no se pide permiso de avisos ni se registra push;
 *  - las secciones que abren el panel web enseñan un aviso en vez de la web.
 */
object DemoMode {
    @Volatile
    private var active = false

    @Volatile
    private var fromLogin = false

    private var interceptor: DemoInterceptor? = null

    /** Seguro de leer desde cualquier hilo (el interceptor corre en los de OkHttp). */
    val isActive: Boolean get() = active

    /**
     * Entró con el botón de la pantalla de entrada (no por extras de arranque): se enseña la
     * pastilla «Modo demo · datos de muestra» con «Salir». Las capturas de tienda no la llevan.
     */
    val enteredFromLogin: Boolean get() = active && fromLogin

    /**
     * Va siempre primero en la cadena de OkHttp (`ApiClient.init`): con el demo apagado deja pasar
     * la petición tal cual; encendido, ninguna sale a la red.
     */
    @Synchronized
    fun interceptor(context: Context): Interceptor =
        interceptor ?: DemoInterceptor(context.applicationContext).also { interceptor = it }

    /** Botón «Explorar ARTA con datos de muestra». */
    fun activateFromLogin() {
        fromLogin = true
        active = true
    }

    /** Extras de arranque de las capturas de tienda ([DemoLaunch]): sin pastilla. */
    internal fun activateFromLaunch() {
        fromLogin = false
        active = true
    }

    /** «Salir» de la pastilla o «Cerrar sesión»: se apaga y se olvida lo que se cambió en el demo. */
    fun deactivate() {
        active = false
        fromLogin = false
        synchronized(this) { interceptor }?.reset()
    }
}
