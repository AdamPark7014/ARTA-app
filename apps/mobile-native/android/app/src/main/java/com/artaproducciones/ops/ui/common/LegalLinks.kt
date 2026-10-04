package com.artaproducciones.ops.ui.common

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Páginas legales públicas de ARTA. La política de datos de Google Play exige
 * que el aviso de privacidad y la forma de pedir el borrado de la cuenta se
 * puedan abrir desde la app, incluso sin iniciar sesión; tienen que ser las
 * mismas URL que se declaran en Play Console.
 */
object LegalLinks {
    const val PRIVACY = "https://artaproducciones.com/legal/privacidad"
    const val TERMS = "https://artaproducciones.com/legal/terminos"
    const val DELETE_ACCOUNT = "https://artaproducciones.com/legal/eliminar-cuenta"
    const val SUPPORT = "https://artaproducciones.com/legal/soporte"

    /**
     * Abre [url] en el navegador del sistema y no en la vista web de la app:
     * son páginas públicas y no deben cargar con la cookie de sesión.
     */
    fun open(context: Context, url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
    }
}
