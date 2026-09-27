package com.artaproducciones.ops.ui.chat

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.OpenableColumns
import android.util.LruCache
import android.webkit.MimeTypeMap
import androidx.annotation.OptIn
import androidx.core.content.FileProvider
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ChatAttachment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Nombres y tipos de adjunto, igual que la tabla del API (`chat-attachments.ts`):
 * lo que el servidor no acepta se rechaza aquí antes de gastar datos subiéndolo.
 */
object AttachmentNames {
    const val MAX_BYTES = 100L * 1024 * 1024

    private val BY_EXT = mapOf(
        "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "png" to "image/png", "gif" to "image/gif",
        "webp" to "image/webp", "heic" to "image/heic", "heif" to "image/heif",
        "mp4" to "video/mp4", "m4v" to "video/mp4", "mov" to "video/quicktime", "3gp" to "video/3gpp",
        "webm" to "video/webm",
        "m4a" to "audio/mp4", "aac" to "audio/aac", "mp3" to "audio/mpeg", "ogg" to "audio/ogg",
        "opus" to "audio/ogg", "wav" to "audio/wav",
        "pdf" to "application/pdf", "doc" to "application/msword",
        "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" to "application/vnd.ms-excel",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" to "application/vnd.ms-powerpoint",
        "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pages" to "application/vnd.apple.pages", "numbers" to "application/vnd.apple.numbers",
        "key" to "application/vnd.apple.keynote", "zip" to "application/zip", "csv" to "text/csv",
        "txt" to "text/plain",
    )

    /** Tipo → extensión preferida (cuando el proveedor no da nombre, p. ej. la cámara). */
    private val BY_MIME = mapOf(
        "image/jpeg" to "jpg", "image/png" to "png", "image/gif" to "gif", "image/webp" to "webp",
        "image/heic" to "heic", "image/heif" to "heif",
        "video/mp4" to "mp4", "video/quicktime" to "mov", "video/3gpp" to "3gp", "video/webm" to "webm",
        "audio/mp4" to "m4a", "audio/m4a" to "m4a", "audio/x-m4a" to "m4a", "audio/aac" to "aac",
        "audio/mpeg" to "mp3", "audio/ogg" to "ogg", "audio/opus" to "opus", "audio/wav" to "wav",
        "audio/x-wav" to "wav", "audio/webm" to "webm", "audio/3gpp" to "3gp",
        "application/pdf" to "pdf", "application/zip" to "zip", "text/csv" to "csv", "text/plain" to "txt",
    ) + BY_EXT.entries.filter { it.value.startsWith("application/") }.associate { it.value to it.key }

    fun extensionOf(name: String): String = name.substringAfterLast('.', "").lowercase()

    fun isAllowed(name: String): Boolean = extensionOf(name) in BY_EXT

    fun mimeFor(name: String): String? = BY_EXT[extensionOf(name)]

    fun extensionFor(mime: String): String? = BY_MIME[mime.substringBefore(';').trim().lowercase()]

    /** Nombre final con extensión que el API entiende; [fallbackExt] viene de `MimeTypeMap`. */
    fun fileNameFor(name: String?, mime: String, fallbackExt: String? = null): String {
        val clean = name?.trim()?.replace(Regex("[\\\\/:*?\"<>|\\n\\r]"), "_")?.takeIf { it.isNotBlank() } ?: "archivo"
        if (isAllowed(clean)) return clean
        val ext = extensionFor(mime) ?: fallbackExt?.lowercase()?.takeIf { it in BY_EXT } ?: return clean
        return "$clean.$ext"
    }

    fun kindOf(mime: String): String = when {
        mime.startsWith("image/") -> "image"
        mime.startsWith("video/") -> "video"
        mime.startsWith("audio/") -> "audio"
        else -> "file"
    }
}

/** Archivo listo para subir. El cuerpo se lee en streaming: un video de 100 MB no pasa por la RAM. */
class PreparedUpload(
    val name: String,
    val mime: String,
    /** -1 si el proveedor no sabe el tamaño (se sube en chunked y se corta al pasar el límite). */
    val size: Long,
    private val open: () -> InputStream,
    private val cleanup: () -> Unit = {},
) {
    val kind: String get() = AttachmentNames.kindOf(mime)

    fun body(onProgress: (sent: Long, total: Long) -> Unit): RequestBody = object : RequestBody() {
        override fun contentType() = mime.toMediaTypeOrNull()
        override fun contentLength() = size
        override fun writeTo(sink: BufferedSink) {
            open().use { input ->
                val buf = ByteArray(64 * 1024)
                var sent = 0L
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    sent += n
                    if (sent > AttachmentNames.MAX_BYTES) throw IOException("El archivo pesa más de 100 MB")
                    sink.write(buf, 0, n)
                    onProgress(sent, size)
                }
            }
        }
    }

    fun dispose() = runCatching { cleanup() }
}

object ChatMedia {
    private const val IMAGE_MAX_SIDE = 2560
    private const val JPEG_QUALITY = 85
    private const val KEEP_JPEG_UNDER = 1_500_000L
    private const val KEEP_PNG_UNDER = 5_000_000L

    /** Uri de FileProvider donde la cámara del sistema deja la foto o el video. */
    fun captureUri(context: Context, ext: String): Uri {
        val dir = File(context.cacheDir, "chat-capture").apply { mkdirs() }
        val prefix = if (ext == "mp4") "video" else "foto"
        val file = File(dir, "$prefix-${System.currentTimeMillis()}.$ext")
        return FileProvider.getUriForFile(context, context.packageName + ".files", file)
    }

    /**
     * Foto/video/documento de cualquier proveedor → subida lista. Las fotos grandes o HEIC
     * se pasan a JPEG (como WhatsApp): se ven en todos lados y suben en segundos con datos.
     */
    suspend fun prepare(context: Context, uri: Uri): PreparedUpload = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        var name: String? = null
        var size = -1L
        runCatching {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    name = c.getString(0)
                    if (!c.isNull(1)) size = c.getLong(1)
                }
            }
        }
        if (name == null) name = uri.lastPathSegment?.substringAfterLast('/')
        if (size < 0 && uri.scheme == "file") size = uri.path?.let { File(it).length() } ?: -1L

        val reported = resolver.getType(uri)?.lowercase()?.takeIf { it != "application/octet-stream" }
        val mime = name?.let { AttachmentNames.mimeFor(it) }?.takeIf { reported == null || !reported.startsWith("audio/") || !it.startsWith("video/") }
            ?: reported ?: "application/octet-stream"

        if (mime.startsWith("image/") && mime != "image/gif" && needsReencode(mime, size)) {
            return@withContext reencodeImage(context, uri, name)
        }

        val fallbackExt = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
        val finalName = AttachmentNames.fileNameFor(name, mime, fallbackExt)
        // IOException se leería como «Sin conexión»: estos son errores del archivo, no de la red.
        check(AttachmentNames.isAllowed(finalName)) { "Ese tipo de archivo no se puede compartir en el chat" }
        check(size <= AttachmentNames.MAX_BYTES) { "El archivo pesa más de 100 MB" }
        val ambiguous = AttachmentNames.extensionOf(finalName) in setOf("webm", "3gp") && mime.startsWith("audio/")
        PreparedUpload(
            name = finalName,
            mime = if (ambiguous) mime else AttachmentNames.mimeFor(finalName) ?: mime,
            size = size,
            open = { resolver.openInputStream(uri) ?: throw IOException("No se pudo leer el archivo") },
        )
    }

    /** Nota de voz grabada en la app (m4a/AAC: suena igual en Android, iPhone y navegador). */
    fun prepareFile(file: File): PreparedUpload = PreparedUpload(
        name = file.name,
        mime = AttachmentNames.mimeFor(file.name) ?: "application/octet-stream",
        size = file.length(),
        open = { file.inputStream() },
        cleanup = { file.delete() },
    )

    private fun needsReencode(mime: String, size: Long): Boolean = when (mime) {
        "image/heic", "image/heif" -> true
        "image/jpeg" -> size < 0 || size > KEEP_JPEG_UNDER
        else -> size < 0 || size > KEEP_PNG_UNDER
    }

    private fun reencodeImage(context: Context, uri: Uri, name: String?): PreparedUpload {
        val bitmap = decodeScaled(context, uri) ?: throw IOException("No se pudo leer la foto")
        val dir = File(context.cacheDir, "chat-upload").apply { mkdirs() }
        dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 24 * 3600_000L }?.forEach { it.delete() }
        val out = File(dir, UUID.randomUUID().toString() + ".jpg")
        out.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
        bitmap.recycle()
        val base = name?.substringBeforeLast('.')?.takeIf { it.isNotBlank() } ?: "foto-${System.currentTimeMillis()}"
        return PreparedUpload(
            name = AttachmentNames.fileNameFor("$base.jpg", "image/jpeg"),
            mime = "image/jpeg",
            size = out.length(),
            open = { out.inputStream() },
            cleanup = { out.delete() },
        )
    }

    private fun decodeScaled(context: Context, uri: Uri): Bitmap? {
        val resolver = context.contentResolver
        if (Build.VERSION.SDK_INT >= 28) {
            return runCatching {
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
                    val longest = max(info.size.width, info.size.height)
                    if (longest > IMAGE_MAX_SIDE) {
                        val scale = IMAGE_MAX_SIDE.toFloat() / longest
                        decoder.setTargetSize((info.size.width * scale).roundToInt(), (info.size.height * scale).roundToInt())
                    }
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                }
            }.getOrNull()
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= IMAGE_MAX_SIDE) sample *= 2
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return null
        val rotation = resolver.openInputStream(uri)?.use {
            when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        } ?: 0f
        if (rotation == 0f) return decoded
        val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, Matrix().apply { postRotate(rotation) }, true)
        if (rotated !== decoded) decoded.recycle()
        return rotated
    }
}

/** Graba notas de voz en AAC/m4a. El nombre `nota-de-voz-…` es lo que el API muestra como «🎤 Nota de voz». */
class VoiceRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var startedAt = 0L

    val isRecording: Boolean get() = recorder != null

    fun start() {
        val dir = File(context.cacheDir, "chat-capture").apply { mkdirs() }
        val out = File(dir, "nota-de-voz-${System.currentTimeMillis()}.m4a")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1)
            r.setAudioSamplingRate(44_100)
            r.setAudioEncodingBitRate(64_000)
            r.setOutputFile(out.absolutePath)
            r.prepare()
            r.start()
        } catch (e: Exception) {
            r.release()
            out.delete()
            throw IOException("No se pudo usar el micrófono", e)
        }
        recorder = r
        file = out
        startedAt = SystemClock.elapsedRealtime()
    }

    fun elapsedMs(): Long = if (recorder != null) SystemClock.elapsedRealtime() - startedAt else 0L

    /** 0‥1 para dibujar el nivel mientras se graba. */
    fun level(): Float = (runCatching { recorder?.maxAmplitude ?: 0 }.getOrDefault(0) / 20_000f).coerceIn(0f, 1f)

    /** Archivo listo, o null si fue un toque accidental (menos de 1 s). */
    fun stop(): File? {
        val r = recorder ?: return null
        val elapsed = elapsedMs()
        recorder = null
        val ok = runCatching { r.stop() }.isSuccess
        r.release()
        val out = file
        file = null
        if (!ok || elapsed < 1_000) {
            out?.delete()
            return null
        }
        return out
    }

    fun cancel() {
        val r = recorder ?: return
        recorder = null
        runCatching { r.stop() }
        r.release()
        file?.delete()
        file = null
    }
}

/** Primer cuadro y duración de un video/audio remoto, leyendo solo lo necesario por rangos. */
object RemoteMedia {
    class Probe(val durationMs: Long, val frame: Bitmap?)

    private val cache = LruCache<String, Probe>(40)

    fun cached(url: String): Probe? = cache.get(url)

    suspend fun probe(url: String, wantFrame: Boolean): Probe? = withContext(Dispatchers.IO) {
        cache.get(url)?.let { return@withContext it }
        val full = ApiClient.resolveUrl(url)
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(full, sessionHeaders(full))
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            val frame = if (!wantFrame) null else if (Build.VERSION.SDK_INT >= 27) {
                retriever.getScaledFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 480, 480)
            } else {
                retriever.getFrameAtTime(0)
            }
            Probe(duration, frame).also { cache.put(url, it) }
        } catch (_: Exception) {
            null
        } finally {
            runCatching { retriever.release() }
        }
    }

    fun sessionHeaders(url: String): Map<String, String> {
        val cookies = runCatching { ApiClient.cookies.loadForRequest(url.toHttpUrl()) }.getOrDefault(emptyList())
        return if (cookies.isEmpty()) emptyMap() else mapOf("Cookie" to cookies.joinToString("; ") { "${it.name}=${it.value}" })
    }
}

/** Un solo audio sonando a la vez en toda la app, como WhatsApp. */
@OptIn(UnstableApi::class)
object ChatAudio {
    private var player: ExoPlayer? = null
    private val _current = MutableStateFlow<String?>(null)
    val current: StateFlow<String?> = _current
    private val _playing = MutableStateFlow(false)
    val playing: StateFlow<Boolean> = _playing

    fun positionMs(): Long = player?.currentPosition ?: 0L
    fun durationMs(): Long = player?.duration?.takeIf { it > 0 } ?: 0L

    fun toggle(context: Context, url: String) {
        val p = player ?: build(context.applicationContext).also { player = it }
        if (_current.value == url) {
            if (p.isPlaying) p.pause() else {
                if (p.playbackState == Player.STATE_ENDED) p.seekTo(0)
                p.play()
            }
            return
        }
        _current.value = url
        p.setMediaItem(MediaItem.fromUri(ApiClient.resolveUrl(url)))
        p.prepare()
        p.play()
    }

    fun seek(url: String, fraction: Float) {
        val p = player ?: return
        if (_current.value != url) return
        val d = durationMs()
        if (d > 0) p.seekTo((d * fraction.coerceIn(0f, 1f)).toLong())
    }

    fun stop() {
        player?.release()
        player = null
        _current.value = null
        _playing.value = false
    }

    private fun build(context: Context): ExoPlayer = ExoPlayer.Builder(context)
        .setMediaSourceFactory(DefaultMediaSourceFactory(OkHttpDataSource.Factory(ApiClient.http)))
        .build()
        .apply {
            setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(),
                true,
            )
            setHandleAudioBecomingNoisy(true)
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    _playing.value = isPlaying
                }

                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_ENDED) {
                        pause()
                        seekTo(0)
                    }
                }
            })
        }

    /** Reproductor de video con la cookie de sesión (lo libera quien lo crea). */
    fun videoPlayer(context: Context, url: String): ExoPlayer = ExoPlayer.Builder(context)
        .setMediaSourceFactory(DefaultMediaSourceFactory(OkHttpDataSource.Factory(ApiClient.http)))
        .build()
        .apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
            setMediaItem(MediaItem.fromUri(ApiClient.resolveUrl(url)))
            prepare()
            playWhenReady = true
        }
}

/** Baja el adjunto con la sesión a la caché (para abrirlo o compartirlo con otra app). */
suspend fun downloadAttachment(context: Context, a: ChatAttachment): File = withContext(Dispatchers.IO) {
    val dir = File(context.cacheDir, "chat-files").apply { mkdirs() }
    val safeName = (a.name ?: a.url.substringAfterLast('/')).replace(Regex("[^\\p{L}\\p{N}._\\- ]"), "_")
    val target = File(dir, safeName)
    if (target.exists() && a.size != null && target.length() == a.size) return@withContext target
    ApiClient.http.newCall(Request.Builder().url(ApiClient.resolveUrl(a.url)).build()).execute().use { res ->
        if (!res.isSuccessful) throw IOException("No se pudo descargar (${res.code})")
        val body = res.body ?: throw IOException("Respuesta vacía")
        target.outputStream().use { out -> body.byteStream().copyTo(out) }
    }
    target
}

private fun attachmentMime(a: ChatAttachment): String =
    a.mime?.substringBefore(';') ?: AttachmentNames.mimeFor(a.name ?: a.url) ?: "application/octet-stream"

/** Abre el documento con la app que el teléfono tenga para ese tipo (Word, Excel, visor PDF…). */
suspend fun openAttachment(context: Context, a: ChatAttachment) {
    val file = downloadAttachment(context, a)
    val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
    val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, attachmentMime(a))
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (_: android.content.ActivityNotFoundException) {
        context.startActivity(Intent.createChooser(intent, a.name ?: "Abrir con").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/** Hoja de «Compartir» del sistema: WhatsApp, Drive, Gmail, Guardar en archivos… */
suspend fun shareAttachment(context: Context, a: ChatAttachment) {
    val file = downloadAttachment(context, a)
    val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
    val intent = Intent(Intent.ACTION_SEND)
        .setType(attachmentMime(a))
        .putExtra(Intent.EXTRA_STREAM, uri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(Intent.createChooser(intent, "Compartir").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
