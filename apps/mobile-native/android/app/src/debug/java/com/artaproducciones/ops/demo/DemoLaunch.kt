package com.artaproducciones.ops.demo

import android.content.Intent
import android.util.Log
import com.artaproducciones.ops.data.api.ApiDebugHooks
import com.artaproducciones.ops.ui.DeepLink
import com.artaproducciones.ops.ui.Tab

/**
 * Solo debug: extras de arranque del modo demo (capturas de tienda sin login ni red).
 *
 *   adb shell am start -S -n com.artaproducciones.ops/.MainActivity --ez arta_demo true --es arta_demo_tab chats
 *
 * - `arta_demo` (boolean): enciende el modo demo para toda la vida del proceso. Solo cuenta en el
 *   primer arranque del proceso (`-S` lo reinicia): a media sesión real mezclaría datos de los dos.
 * - `arta_demo_tab`: home | chats | tasks | notifications | more | approvals | events
 *   (también inicio, tareas, avisos, mas, aprobaciones, eventos).
 * - `arta_demo_channel` / `arta_demo_task` / `arta_demo_event`: abre esa conversación, tarea o evento.
 * - `arta_demo_path`: cualquier ruta del panel que la app sepa abrir (`/events/<id>?tab=tasks`).
 *
 * Con el modo ya encendido, otro `am start` sin `-S` cambia de pantalla sin reiniciar.
 */
object DemoLaunch {
    private const val TAG = "ArtaDemo"
    const val EXTRA_DEMO = "arta_demo"
    const val EXTRA_TAB = "arta_demo_tab"
    const val EXTRA_CHANNEL = "arta_demo_channel"
    const val EXTRA_TASK = "arta_demo_task"
    const val EXTRA_EVENT = "arta_demo_event"
    const val EXTRA_PATH = "arta_demo_path"

    @Volatile
    private var first = true

    fun onIntent(intent: Intent): DeepLink? {
        val wants = intent.getBooleanExtra(EXTRA_DEMO, false)
        if (first) {
            first = false
            if (wants) {
                ApiDebugHooks.demo = true
                Log.i(TAG, "Modo demo encendido: datos de assets/fixtures, sin red")
            }
        } else if (wants && !ApiDebugHooks.demo) {
            Log.w(TAG, "arta_demo se ignora con la app ya abierta: arranca con `am start -S`")
        }
        if (!ApiDebugHooks.demo) return null
        return linkFrom(intent)
    }

    private fun linkFrom(intent: Intent): DeepLink? {
        fun extra(name: String) = intent.getStringExtra(name)?.trim()?.takeIf { it.isNotEmpty() }
        extra(EXTRA_CHANNEL)?.let { return DeepLink.Chat(it, null) }
        extra(EXTRA_TASK)?.let { return DeepLink.Task(it) }
        extra(EXTRA_EVENT)?.let { return DeepLink.Event(it) }
        extra(EXTRA_PATH)?.let { return DeepLink.parse(it) }
        return when (extra(EXTRA_TAB)?.lowercase()) {
            null -> null
            "home", "inicio" -> DeepLink.Section(Tab.Inicio)
            "chats", "chat" -> DeepLink.Section(Tab.Chats)
            "tasks", "tareas" -> DeepLink.Section(Tab.Tareas)
            "notifications", "avisos" -> DeepLink.Section(Tab.Avisos)
            "more", "mas", "más" -> DeepLink.Section(Tab.Mas)
            "approvals", "aprobaciones" -> DeepLink.Approvals
            "events", "eventos", "calendar" -> DeepLink.Events
            else -> null.also { Log.w(TAG, "arta_demo_tab desconocida: ${intent.getStringExtra(EXTRA_TAB)}") }
        }
    }
}
