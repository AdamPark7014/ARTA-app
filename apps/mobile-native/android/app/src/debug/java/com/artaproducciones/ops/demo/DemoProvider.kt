package com.artaproducciones.ops.demo

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import com.artaproducciones.ops.data.api.ApiDebugHooks

/**
 * Solo debug: instala el interceptor del modo demo antes de que exista el cliente HTTP
 * (un ContentProvider arranca antes que `Application.onCreate`). No expone datos.
 * El interceptor no hace nada hasta que el arranque trae `arta_demo` (ver [DemoLaunch]).
 */
class DemoProvider : ContentProvider() {
    override fun onCreate(): Boolean {
        val ctx = context ?: return true
        ApiDebugHooks.interceptors = listOf(DemoInterceptor(ctx))
        ApiDebugHooks.launch = DemoLaunch::onIntent
        return true
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
