package com.artaproducciones.ops.ui.web

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.provider.MediaStore
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.artaproducciones.ops.data.Session
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.WebSessionBridge
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.ui.modules.ModuleNav
import com.artaproducciones.ops.ui.more.WebModules
import com.artaproducciones.ops.ui.theme.ArtaColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import retrofit2.HttpException
import java.io.File
import java.io.IOException

private val FILE_EXTENSIONS = setOf("pdf", "xlsx", "xls", "docx", "doc", "pptx", "csv", "zip", "png", "jpg", "jpeg")

/** Estado que no debe provocar recomposición (callbacks del WebView, banderas de reintento). */
private class WebHost {
    var webView: WebView? = null
    var swipe: SwipeRefreshLayout? = null
    var fileCallback: ValueCallback<Array<Uri>>? = null
    var cameraFile: File? = null
    var cameraUri: Uri? = null
    var verifying = false
    var retriedWithCookies = false
    var lastInterceptAt = 0L
}

/**
 * Vista web del panel con la misma sesión de la app. Lo que tiene pantalla nativa
 * ([resolveNative] devuelve la acción) sale de aquí; lo externo va al navegador.
 */
@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtaWebScreen(
    path: String,
    title: String?,
    nav: ModuleNav,
    resolveNative: (String) -> (() -> Unit)?,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val host = remember { WebHost() }
    val currentNav by rememberUpdatedState(nav)
    val currentResolve by rememberUpdatedState(resolveNative)

    var currentPath by rememberSaveable { mutableStateOf(WebSessionBridge.normalizePath(path)) }
    var pageTitle by remember { mutableStateOf(title.orEmpty()) }
    var progress by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var downloading by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }

    val chooser = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = host.fileCallback
        host.fileCallback = null
        callback?.onReceiveValue(pickedUris(result.resultCode, result.data, host.cameraFile, host.cameraUri))
        host.cameraFile = null
        host.cameraUri = null
    }

    fun publicUrl(): String = ApiClient.origin + currentPath

    fun load() {
        val wv = host.webView ?: return
        error = null
        scope.launch {
            val entity = WebModules.entityFor(Session.currentUser)
            wv.loadUrl(WebSessionBridge.entryUrl(currentPath, entity))
        }
    }

    /** `/login` o 401: si el API también rechaza la sesión nativa, se cierra la sesión de la app. */
    fun verifySession(fromLogin: Boolean) {
        if (host.verifying) return
        host.verifying = true
        scope.launch {
            val result = runCatching { ApiClient.api.me() }
            val failure = result.exceptionOrNull()
            when {
                failure is HttpException && failure.code() == 401 -> Session.logout()
                result.isSuccess && fromLogin && !host.retriedWithCookies -> {
                    host.retriedWithCookies = true
                    WebSessionBridge.copyNativeToWeb()
                    host.webView?.loadUrl(publicUrl())
                }
                result.isSuccess && fromLogin -> error = "No se pudo abrir tu sesión en esta vista."
                failure != null && fromLogin -> error = failure.userMessage()
            }
            host.verifying = false
        }
    }

    fun download(url: String, contentDisposition: String?, mime: String?) {
        val uri = Uri.parse(url)
        when {
            url.startsWith("blob:") || url.startsWith("data:") ->
                toast(context, "Este archivo solo se puede bajar desde el navegador.")
            !isSameOrigin(uri) -> openExternal(context, uri)
            else -> {
                downloading = true
                scope.launch {
                    runCatching { fetchToCache(context, url, contentDisposition, mime) }
                        .onSuccess { (file, type) -> openFile(context, file, type) }
                        .onFailure { toast(context, it.userMessage()) }
                    downloading = false
                }
            }
        }
    }

    /** true = la vista web no carga la URL (se abrió nativo, externo o como archivo). */
    fun handleNavigation(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase().orEmpty()
        if (scheme in setOf("blob", "data", "about", "javascript")) return false
        if (scheme != "http" && scheme != "https") {
            openExternal(context, uri)
            return true
        }
        if (!isSameOrigin(uri)) {
            openExternal(context, uri)
            return true
        }
        if (isLoginPath(uri.path)) {
            verifySession(fromLogin = true)
            return true
        }
        if (looksLikeFile(uri)) {
            download(uri.toString(), null, null)
            return true
        }
        val action = currentResolve(relativeOf(uri)) ?: return false
        host.lastInterceptAt = System.currentTimeMillis()
        action()
        return true
    }

    /** Navegación interna de la web (pushState) que no pasa por shouldOverrideUrlLoading. */
    fun onUrlChanged(view: WebView, url: String?) {
        val uri = url?.let(Uri::parse) ?: return
        if (!isSameOrigin(uri)) return
        if (isLoginPath(uri.path)) {
            verifySession(fromLogin = true)
            return
        }
        val rel = relativeOf(uri)
        val action = currentResolve(rel)
        if (action == null) {
            currentPath = rel
            return
        }
        val now = System.currentTimeMillis()
        if (now - host.lastInterceptAt < 1_000) return
        host.lastInterceptAt = now
        if (view.canGoBack()) view.goBack() else currentNav.back()
        action()
    }

    BackHandler {
        val wv = host.webView
        if (wv != null && wv.canGoBack()) wv.goBack() else currentNav.back()
    }

    DisposableEffect(Unit) {
        onDispose {
            host.fileCallback?.onReceiveValue(null)
            host.fileCallback = null
            host.webView?.apply {
                stopLoading()
                destroy()
            }
            host.webView = null
        }
    }

    Scaffold(
        containerColor = ArtaColors.Bg,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        pageTitle.ifBlank { "ARTA" },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = {
                        val wv = host.webView
                        if (wv != null && wv.canGoBack()) wv.goBack() else currentNav.back()
                    }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Atrás") }
                },
                actions = {
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(Icons.Outlined.MoreVert, contentDescription = "Más opciones")
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text("Recargar") },
                                leadingIcon = { Icon(Icons.Outlined.Refresh, null) },
                                onClick = {
                                    menuOpen = false
                                    error = null
                                    host.webView?.reload()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Abrir en el navegador") },
                                leadingIcon = { Icon(Icons.AutoMirrored.Outlined.OpenInNew, null) },
                                onClick = {
                                    menuOpen = false
                                    openExternal(context, Uri.parse(publicUrl()))
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Compartir enlace") },
                                leadingIcon = { Icon(Icons.Outlined.Share, null) },
                                onClick = {
                                    menuOpen = false
                                    shareLink(context, publicUrl(), pageTitle)
                                },
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ArtaColors.BgElev,
                    titleContentColor = ArtaColors.Text,
                    navigationIconContentColor = ArtaColors.Text,
                    actionIconContentColor = ArtaColors.Text,
                ),
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            when {
                downloading -> LinearProgressIndicator(Modifier.fillMaxWidth(), color = ArtaColors.Gold, trackColor = ArtaColors.Surface2)
                progress in 1..99 -> LinearProgressIndicator(
                    progress = { progress / 100f },
                    modifier = Modifier.fillMaxWidth(),
                    color = ArtaColors.Gold,
                    trackColor = ArtaColors.Surface2,
                )
                !loaded && error == null -> LinearProgressIndicator(Modifier.fillMaxWidth(), color = ArtaColors.Gold, trackColor = ArtaColors.Surface2)
            }
            Box(Modifier.fillMaxSize()) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        val wv = WebView(ctx)
                        configure(wv)
                        wv.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
                            download(url, contentDisposition, mimeType)
                        }
                        wv.webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                                request.isForMainFrame && handleNavigation(request.url)

                            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                                error = null
                            }

                            override fun onPageFinished(view: WebView, url: String?) {
                                loaded = true
                                host.swipe?.isRefreshing = false
                                canGoBack = view.canGoBack()
                                WebSessionBridge.syncBack()
                            }

                            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                                canGoBack = view.canGoBack()
                                onUrlChanged(view, url)
                            }

                            override fun onReceivedError(view: WebView, request: WebResourceRequest, err: WebResourceError) {
                                if (!request.isForMainFrame) return
                                host.swipe?.isRefreshing = false
                                error = "No se pudo cargar la página. Revisa tu conexión."
                            }

                            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                                if (!isSameOrigin(request.url)) return
                                when {
                                    response.statusCode == 401 -> verifySession(fromLogin = false)
                                    request.isForMainFrame && response.statusCode >= 500 -> {
                                        host.swipe?.isRefreshing = false
                                        error = "El servidor tuvo un problema. Intenta de nuevo."
                                    }
                                }
                            }
                        }
                        wv.webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView, newProgress: Int) {
                                progress = newProgress
                            }

                            override fun onReceivedTitle(view: WebView, t: String?) {
                                if (!title.isNullOrBlank()) return
                                val clean = t?.trim().orEmpty()
                                if (clean.isNotBlank() && !clean.startsWith("http")) pageTitle = clean
                            }

                            override fun onShowFileChooser(
                                view: WebView,
                                callback: ValueCallback<Array<Uri>>,
                                params: FileChooserParams,
                            ): Boolean {
                                host.fileCallback?.onReceiveValue(null)
                                host.fileCallback = callback
                                val (intent, file, uri) = chooserIntent(ctx, params)
                                host.cameraFile = file
                                host.cameraUri = uri
                                return try {
                                    chooser.launch(intent)
                                    true
                                } catch (e: ActivityNotFoundException) {
                                    host.fileCallback = null
                                    callback.onReceiveValue(null)
                                    toast(ctx, "No hay una app para elegir archivos.")
                                    false
                                }
                            }
                        }
                        host.webView = wv
                        SwipeRefreshLayout(ctx).apply {
                            setColorSchemeColors(ArtaColors.Gold.toArgb())
                            setProgressBackgroundColorSchemeColor(ArtaColors.Surface2.toArgb())
                            // Solo con la página arriba del todo: si no, el gesto es scroll de la web.
                            setOnChildScrollUpCallback { _, _ -> wv.scrollY > 0 }
                            setOnRefreshListener {
                                error = null
                                wv.reload()
                            }
                            addView(wv, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                            host.swipe = this
                        }
                    },
                )
                error?.let { message ->
                    ErrorState(message) {
                        error = null
                        if (host.webView?.url.isNullOrBlank()) load() else host.webView?.reload()
                    }
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        while (host.webView == null) delay(16)
        load()
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Icon(Icons.Outlined.CloudOff, contentDescription = null, tint = ArtaColors.Muted, modifier = Modifier.size(48.dp))
        Text("No se pudo abrir", style = MaterialTheme.typography.titleMedium)
        Text(message, color = ArtaColors.Muted, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
        Button(onClick = onRetry) { Text("Reintentar") }
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun configure(wv: WebView) {
    wv.setBackgroundColor(ArtaColors.Bg.toArgb())
    wv.settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        allowFileAccess = false
        allowContentAccess = true
        loadWithOverviewMode = true
        useWideViewPort = true
        setSupportMultipleWindows(false)
        userAgentString = "${ApiClient.userAgent} $userAgentString"
    }
    CookieManager.getInstance().apply {
        setAcceptCookie(true)
        setAcceptThirdPartyCookies(wv, false)
    }
}

private fun isSameOrigin(uri: Uri): Boolean {
    val origin = ApiClient.originUrl
    if (!uri.scheme.equals(origin.scheme, ignoreCase = true)) return false
    if (!uri.host.equals(origin.host, ignoreCase = true)) return false
    val port = if (uri.port == -1) (if (origin.isHttps) 443 else 80) else uri.port
    return port == origin.port
}

private fun isLoginPath(path: String?): Boolean = path == "/login" || path?.startsWith("/login/") == true

private fun looksLikeFile(uri: Uri): Boolean {
    val path = uri.path.orEmpty()
    if (path.startsWith("/uploads/")) return true
    return path.substringAfterLast('/').substringAfterLast('.', "").lowercase() in FILE_EXTENSIONS
}

/** `/ruta?query` sin el código de un solo uso. */
private fun relativeOf(uri: Uri): String {
    val query = uri.encodedQuery
        ?.split('&')
        ?.filterNot { it.startsWith(WebSessionBridge.HANDOFF_PARAM + "=") }
        ?.joinToString("&")
        ?.takeIf { it.isNotBlank() }
    return uri.encodedPath.orEmpty().ifBlank { "/" } + (query?.let { "?$it" } ?: "")
}

private fun chooserIntent(context: Context, params: WebChromeClient.FileChooserParams): Triple<Intent, File?, Uri?> {
    val content = runCatching { params.createIntent() }.getOrNull()
        ?: Intent(Intent.ACTION_GET_CONTENT).setType("*/*")
    content.addCategory(Intent.CATEGORY_OPENABLE)
    if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
        content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    }
    val accepts = params.acceptTypes.orEmpty().map { it.trim().lowercase() }.filter { it.isNotBlank() }
    val wantsImages = accepts.isEmpty() || accepts.any { it.startsWith("image") || it == "*/*" || it.startsWith(".jp") || it == ".png" }
    val extras = mutableListOf<Intent>()
    var file: File? = null
    var uri: Uri? = null
    if (wantsImages) {
        runCatching {
            val dir = File(context.cacheDir, "chat-capture").apply { mkdirs() }
            val f = File(dir, "web-${System.currentTimeMillis()}.jpg")
            val u = FileProvider.getUriForFile(context, "${context.packageName}.files", f)
            extras += Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, u)
                clipData = ClipData.newRawUri("", u)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            extras += Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
            file = f
            uri = u
        }
    }
    val chooser = Intent.createChooser(content, "Adjuntar archivo")
    if (extras.isNotEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extras.toTypedArray())
    return Triple(chooser, file, uri)
}

private fun pickedUris(resultCode: Int, data: Intent?, cameraFile: File?, cameraUri: Uri?): Array<Uri>? {
    if (resultCode != Activity.RESULT_OK) return null
    data?.clipData?.let { clip ->
        if (clip.itemCount > 0) return Array(clip.itemCount) { clip.getItemAt(it).uri }
    }
    data?.data?.let { return arrayOf(it) }
    if (cameraFile != null && cameraUri != null && cameraFile.length() > 0) return arrayOf(cameraUri)
    return null
}

/** Baja el archivo con la sesión nativa a la caché compartible (misma carpeta que los adjuntos del chat). */
private suspend fun fetchToCache(context: Context, url: String, contentDisposition: String?, mime: String?): Pair<File, String> =
    withContext(Dispatchers.IO) {
        ApiClient.http.newCall(Request.Builder().url(url).build()).execute().use { res ->
            if (!res.isSuccessful) throw IOException("No se pudo bajar el archivo (${res.code}).")
            val type = res.body?.contentType()?.let { "${it.type}/${it.subtype}" } ?: mime ?: "application/octet-stream"
            val name = URLUtil.guessFileName(url, contentDisposition ?: res.header("Content-Disposition"), type)
            val dir = File(context.cacheDir, "chat-files").apply { mkdirs() }
            val file = File(dir, name)
            res.body?.byteStream()?.use { input -> file.outputStream().use { input.copyTo(it) } }
                ?: throw IOException("El archivo llegó vacío.")
            file to type
        }
    }

private fun openFile(context: Context, file: File, mime: String) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, mime)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (e: ActivityNotFoundException) {
        toast(context, "No hay una app para abrir este archivo.")
    }
}

private fun openExternal(context: Context, uri: Uri) {
    val intent = if (uri.scheme == "intent") {
        runCatching { Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME) }.getOrNull()
    } else {
        Intent(Intent.ACTION_VIEW, uri)
    } ?: return
    try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: ActivityNotFoundException) {
        toast(context, "No hay una app para abrir este enlace.")
    }
}

private fun shareLink(context: Context, url: String, title: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, url)
        if (title.isNotBlank()) putExtra(Intent.EXTRA_SUBJECT, title)
    }
    context.startActivity(Intent.createChooser(send, "Compartir enlace").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

private fun toast(context: Context, message: String) {
    Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
}
