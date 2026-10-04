package com.artaproducciones.ops.push

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.service.notification.StatusBarNotification
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.StyleSpan
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.artaproducciones.ops.MainActivity
import com.artaproducciones.ops.R
import com.artaproducciones.ops.data.Session
import java.util.concurrent.Executors

/**
 * Conversación abierta en pantalla. Sus pushes no se muestran (el mensaje ya
 * aparece en vivo), igual que WhatsApp. Los avisos de procesos sí.
 */
object ActiveConversation {
    @Volatile
    var channelId: String? = null
        private set

    private val worker by lazy { Executors.newSingleThreadExecutor() }

    fun isOpen(chatChannelId: String): Boolean = chatChannelId.isNotBlank() && channelId == chatChannelId

    fun open(context: Context, chatChannelId: String) {
        if (chatChannelId.isBlank()) return
        channelId = chatChannelId
        val app = context.applicationContext
        worker.execute { ArtaPushRenderer.dismissChat(app, ArtaPushRenderer.threadIdFor(chatChannelId)) }
    }

    /** Solo limpia si sigue siendo la abierta (cambiar de chat no pisa a la nueva). */
    fun close(chatChannelId: String) {
        if (channelId == chatChannelId) channelId = null
    }
}

/**
 * Pinta todo push del API como notificación del sistema con aviso emergente.
 *
 * - Chat: `MessagingStyle` por conversación; cada mensaje se suma a la misma
 *   notificación (últimos 8), con acciones «Responder» (sin abrir la app) y
 *   «Marcar como leído», acceso de conversación (Android 11+) y resumen
 *   «N conversaciones» cuando hay varias.
 * - Procesos (OC, formatos, tareas…): `BigTextStyle`, id estable por `tag` para
 *   actualizar en su sitio y resumen por canal cuando hay 2 o más.
 * - Silenciosos: `chat.read` quita el aviso de lo que ya se leyó en otro lado.
 */
object ArtaPushRenderer {
    private const val TAG = "ArtaPush"
    private const val GROUP_CHAT = "arta_chat"
    private const val MAX_SUMMARY_LINES = 6
    private const val SHORTCUT_PREFIX = "chat_"
    private const val PERSON_ME = "arta_me"
    private const val BURST_WINDOW_MS = 8_000L
    private const val AVATAR_PX = 192

    const val EXTRA_URL = "arta_url"
    const val EXTRA_CHANNEL_ID = "arta_channel_id"
    const val EXTRA_MESSAGE_ID = "arta_message_id"
    const val EXTRA_NOTIFICATION_ID = "arta_notification_id"
    /** `type` del aviso (p. ej. `po.requested`): decide si una OC abre aprobaciones o la web. */
    const val EXTRA_TYPE = "arta_type"
    /** Destino forzado por una acción de la notificación. */
    const val EXTRA_TARGET = "arta_target"
    const val TARGET_APPROVALS = "approvals"
    /** Id de la notificación a quitar al abrir desde una acción. */
    const val EXTRA_DISMISS_ID = "arta_dismiss_id"

    /** El mismo aviso puede llegar dos veces (reintento de FCM). */
    private val seen = object : LinkedHashMap<String, Unit>(64, 0.75f, false) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Unit>?) = size > 300
    }

    private fun firstTime(p: PushPayload): Boolean {
        val key = when {
            p.silent -> return true
            p.messageId.isNotBlank() -> "m:${p.messageId}"
            p.notificationId.isNotBlank() -> "n:${p.notificationId}"
            else -> return true
        }
        synchronized(seen) {
            if (seen.containsKey(key)) return false
            seen[key] = Unit
            return true
        }
    }

    fun threadIdFor(chatChannelId: String) = "chat-$chatChannelId"

    fun chatNotificationId(threadId: String): Int = "chat:$threadId".hashCode()

    fun render(context: Context, payload: PushPayload) {
        val app = context.applicationContext
        try {
            if (!firstTime(payload)) return
            if (payload.silent) {
                when (payload.type) {
                    "chat.read" -> dismissChat(app, payload.threadId)
                    "notification.read" -> dismissEvents(app, payload.notificationId)
                }
                return
            }
            ArtaNotifications.ensureChannels(app)
            if (!canPost(app)) return
            if (payload.isChat) renderChat(app, payload) else renderEvent(app, payload)
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo mostrar la notificación: ${e.message}", e)
        }
    }

    fun dismissChat(context: Context, threadId: String) {
        if (threadId.isBlank()) return
        val app = context.applicationContext
        try {
            val id = chatNotificationId(threadId)
            val nm = NotificationManagerCompat.from(app)
            nm.cancel(id)
            ChatNotificationStore.clear(app, threadId)
            val remaining = activeNotifications(app).count { it.id != id && it.notification.group == GROUP_CHAT && !it.isSummary() }
            // Cancelar el resumen se lleva a las hijas: solo se quita si ya no queda ninguna.
            if (remaining == 0) nm.cancel(summaryId(GROUP_CHAT))
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo quitar el aviso: ${e.message}")
        }
    }

    /**
     * Aviso de proceso leído en otro lado: quita ese (el API lo etiqueta `arta-<id>`),
     * o todos los que no son chat cuando no viene id (se marcaron todos).
     */
    fun dismissEvents(context: Context, notificationId: String) {
        val app = context.applicationContext
        try {
            val nm = NotificationManagerCompat.from(app)
            if (notificationId.isNotBlank()) {
                nm.cancel("evt:arta-$notificationId".hashCode())
            } else {
                activeNotifications(app)
                    .filter { it.notification.group != GROUP_CHAT && it.notification.group?.startsWith("arta_") == true }
                    .forEach { nm.cancel(it.id) }
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudieron quitar los avisos: ${e.message}")
        }
    }

    /** Cierre de sesión: nada de lo anterior se queda en la bandeja ni en accesos directos. */
    fun clearAll(context: Context) {
        val app = context.applicationContext
        try {
            NotificationManagerCompat.from(app).cancelAll()
            ChatNotificationStore.clearAll(app)
            val ids = ShortcutManagerCompat.getDynamicShortcuts(app).map { it.id }.filter { it.startsWith(SHORTCUT_PREFIX) }
            if (ids.isNotEmpty()) {
                ShortcutManagerCompat.removeDynamicShortcuts(app, ids)
                ShortcutManagerCompat.removeLongLivedShortcuts(app, ids)
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudieron limpiar los avisos: ${e.message}")
        }
    }

    // ─── Chat ───────────────────────────────────────────────────────────────

    private fun renderChat(app: Context, p: PushPayload) {
        if (ActiveConversation.isOpen(p.chatChannelId)) return
        val threadId = p.threadId
        val notificationId = chatNotificationId(threadId)
        // Si ya no está en la bandeja (se abrió o se descartó) se empieza de cero; con
        // margen para ráfagas, en las que el `notify` anterior aún no se ve activo.
        val stillShown = activeNotifications(app).any { it.id == notificationId }
        if (!stillShown) {
            val updatedAt = ChatNotificationStore.get(app, threadId)?.updatedAt ?: 0L
            if (System.currentTimeMillis() - updatedAt > BURST_WINDOW_MS) ChatNotificationStore.clear(app, threadId)
        }
        val senderName = p.senderName.ifBlank { p.title }.ifBlank { "ARTA" }
        val conversation = ChatNotificationStore.append(
            context = app,
            threadId = threadId,
            chatChannelId = p.chatChannelId,
            title = p.threadTitle,
            url = p.url,
            entry = ChatNotificationStore.Entry(
                messageId = p.messageId,
                senderId = p.senderId,
                senderName = senderName,
                text = p.body.ifBlank { "Mensaje nuevo" },
                at = p.sentAtMillis,
            ),
        )
        postConversation(app, conversation, alert = true, badge = p.badge)
    }

    /**
     * Respuesta enviada desde la notificación: se agrega como «Tú» y se vuelve a
     * pintar sin sonido, que es lo que confirma el envío (Android quita el spinner).
     */
    fun appendMyReply(context: Context, threadId: String, text: String, failed: Boolean) {
        val app = context.applicationContext
        val me = Session.currentUser
        val conversation = ChatNotificationStore.append(
            context = app,
            threadId = threadId,
            chatChannelId = "",
            title = "",
            url = "",
            entry = ChatNotificationStore.Entry(
                messageId = "",
                senderId = me?.id.orEmpty(),
                senderName = "Tú",
                text = if (failed) "$text  (no se envió)" else text,
                at = System.currentTimeMillis(),
                mine = true,
            ),
        )
        postConversation(app, conversation, alert = false, badge = null)
    }

    private fun postConversation(app: Context, c: ChatNotificationStore.Conversation, alert: Boolean, badge: Int?) {
        val notificationId = chatNotificationId(c.threadId)
        val isGroup = c.title.isNotBlank()
        val lastOther = c.messages.lastOrNull { !it.mine }
        val peerName = lastOther?.senderName ?: "ARTA"

        val people = HashMap<String, Person>()
        val me = Person.Builder().setKey(PERSON_ME).setName("Tú").build()
        val style = NotificationCompat.MessagingStyle(me).setGroupConversation(isGroup)
        if (isGroup) style.setConversationTitle(c.title)
        c.messages.forEach { m ->
            val author = if (m.mine) null else people.getOrPut(personKey(m.senderId, m.senderName)) {
                Person.Builder()
                    .setKey(personKey(m.senderId, m.senderName))
                    .setName(m.senderName.ifBlank { "ARTA" })
                    .setIcon(IconCompat.createWithBitmap(initials(m.senderName)))
                    .build()
            }
            style.addMessage(m.text, m.at, author)
        }

        val name = if (isGroup) c.title else peerName
        val icon = initials(name)
        val lastText = c.messages.lastOrNull()?.let { if (isGroup && !it.mine) "${it.senderName}: ${it.text}" else it.text }.orEmpty()
        val pendingCount = c.messages.count { !it.mine }

        val builder = baseBuilder(app, ArtaNotifications.CHANNEL_CHAT, c.messages.lastOrNull()?.at ?: System.currentTimeMillis())
            .setContentTitle(name)
            .setContentText(lastText)
            .setStyle(style)
            .setLargeIcon(icon)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setGroup(GROUP_CHAT)
            .setNumber(pendingCount)
            .setOnlyAlertOnce(!alert)
            .setContentIntent(contentIntent(app, notificationId, c.url, c.chatChannelId, lastOther?.messageId.orEmpty(), ""))
            .setPublicVersion(publicVersion(app, ArtaNotifications.CHANNEL_CHAT, "Nuevo mensaje"))
        if (!alert) builder.setSilent(true)

        if (c.chatChannelId.isNotBlank()) {
            builder.addAction(replyAction(app, c.threadId, c.chatChannelId, notificationId))
            builder.addAction(markReadAction(app, c.threadId, c.chatChannelId, notificationId))
        }

        publishShortcut(app, c.threadId, c.chatChannelId, name, icon, isGroup, people.values.firstOrNull())?.let { id ->
            builder.setShortcutId(id)
            builder.setLocusId(LocusIdCompat(id))
        }

        notify(app, notificationId, builder.build())
        if (alert) refreshChatSummary(app, notificationId, summaryLine(name, lastText), pendingCount)
    }

    private fun replyAction(app: Context, threadId: String, chatChannelId: String, notificationId: Int): NotificationCompat.Action {
        val input = RemoteInput.Builder(NotificationActionReceiver.KEY_REPLY).setLabel("Responder").build()
        val intent = Intent(app, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_REPLY
            putExtra(NotificationActionReceiver.EXTRA_THREAD_ID, threadId)
            putExtra(NotificationActionReceiver.EXTRA_CHANNEL_ID, chatChannelId)
        }
        // Mutable a propósito: el sistema escribe el texto de RemoteInput en el intent.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        val pi = PendingIntent.getBroadcast(app, notificationId * 31 + 1, intent, flags)
        return NotificationCompat.Action.Builder(IconCompat.createWithResource(app, R.drawable.ic_action_reply), "Responder", pi)
            .addRemoteInput(input)
            .setAllowGeneratedReplies(true)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            .build()
    }

    private fun markReadAction(app: Context, threadId: String, chatChannelId: String, notificationId: Int): NotificationCompat.Action {
        val intent = Intent(app, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_MARK_READ
            putExtra(NotificationActionReceiver.EXTRA_THREAD_ID, threadId)
            putExtra(NotificationActionReceiver.EXTRA_CHANNEL_ID, chatChannelId)
        }
        val pi = PendingIntent.getBroadcast(
            app,
            notificationId * 31 + 2,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Action.Builder(IconCompat.createWithResource(app, R.drawable.ic_action_read), "Marcar como leído", pi)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
            .setShowsUserInterface(false)
            .build()
    }

    private fun refreshChatSummary(app: Context, postedId: Int, postedLine: CharSequence, postedCount: Int) {
        val others = activeNotifications(app)
            .filter { it.id != postedId && it.notification.group == GROUP_CHAT && !it.isSummary() }
            .sortedByDescending { it.postTime }
        val conversations = others.size + 1
        if (conversations < 2) return
        val messages = postedCount + others.sumOf { maxOf(it.notification.number, 1) }
        postSummary(
            app = app,
            channelId = ArtaNotifications.CHANNEL_CHAT,
            group = GROUP_CHAT,
            title = "$conversations conversaciones",
            summaryText = if (messages == 1) "1 mensaje" else "$messages mensajes",
            lines = listOf(postedLine) + others.map { lineOf(it) },
            total = conversations,
            url = "/chat",
        )
    }

    private fun personKey(senderId: String, senderName: String) = "arta_user_" + senderId.ifBlank { senderName.trim().lowercase() }

    /** Acceso de conversación: en Android 11+ el aviso entra en «Conversaciones» (prioridad, burbuja). */
    private fun publishShortcut(
        app: Context,
        threadId: String,
        chatChannelId: String,
        name: String,
        icon: Bitmap,
        isGroup: Boolean,
        person: Person?,
    ): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || chatChannelId.isBlank()) return null
        return try {
            val id = SHORTCUT_PREFIX + threadId
            val intent = Intent(app, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra(EXTRA_CHANNEL_ID, chatChannelId)
            }
            val info = ShortcutInfoCompat.Builder(app, id)
                .setShortLabel(name.ifBlank { "Chat" })
                .setLongLabel(name.ifBlank { "Chat" })
                .setIcon(IconCompat.createWithBitmap(icon))
                .setIntent(intent)
                .setLongLived(true)
                .setIsConversation()
                .setLocusId(LocusIdCompat(id))
                .apply { if (!isGroup && person != null) setPerson(person) }
                .build()
            ShortcutManagerCompat.pushDynamicShortcut(app, info)
            id
        } catch (e: Exception) {
            Log.d(TAG, "Sin acceso de conversación: ${e.message}")
            null
        }
    }

    // ─── Procesos ───────────────────────────────────────────────────────────

    private fun renderEvent(app: Context, p: PushPayload) {
        val channelId = p.androidChannel
        val notificationId = eventNotificationId(p)
        val group = "arta_" + channelId.removePrefix("arta_")
        val title = p.title.ifBlank { "ARTA" }
        val builder = baseBuilder(app, channelId, p.sentAtMillis)
            .setContentTitle(title)
            .setSubText(ArtaNotifications.label(channelId))
            .setCategory(if (channelId == ArtaNotifications.CHANNEL_CHAT) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_EVENT)
            .setGroup(group)
            .setLargeIcon(initials(p.senderName.ifBlank { ArtaNotifications.label(channelId) }))
            .setContentIntent(contentIntent(app, notificationId, p.url, p.chatChannelId, p.messageId, p.notificationId, p.type))
            .setPublicVersion(publicVersion(app, channelId, "Nuevo aviso"))
        if (p.body.isNotBlank()) {
            builder.setContentText(p.body).setStyle(NotificationCompat.BigTextStyle().setBigContentTitle(title).bigText(p.body))
        }
        // Sin aprobar desde la notificación: «Abrir» lleva a la pantalla donde se decide.
        builder.addAction(eventAction(app, notificationId, p))
        notify(app, notificationId, builder.build())
        refreshEventSummary(app, channelId, group, notificationId, summaryLine(title, p.body))
    }

    private fun eventAction(app: Context, notificationId: Int, p: PushPayload): NotificationCompat.Action {
        val intent = Intent(app, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (p.url.isNotBlank()) putExtra(EXTRA_URL, p.url)
            if (p.type.isNotBlank()) putExtra(EXTRA_TYPE, p.type)
            if (p.notificationId.isNotBlank()) putExtra(EXTRA_NOTIFICATION_ID, p.notificationId)
            if (p.isApproval) putExtra(EXTRA_TARGET, TARGET_APPROVALS)
            // Las acciones no cancelan solas (autoCancel solo aplica al toque): la app la quita.
            putExtra(EXTRA_DISMISS_ID, notificationId)
        }
        val pi = PendingIntent.getActivity(
            app,
            notificationId * 31 + 3,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val label = if (p.isApproval) "Abrir" else "Ver"
        return NotificationCompat.Action.Builder(IconCompat.createWithResource(app, R.drawable.ic_stat_arta), label, pi)
            .setShowsUserInterface(true)
            .build()
    }

    private fun eventNotificationId(p: PushPayload): Int {
        val key = p.tag.ifBlank { p.notificationId }
        return if (key.isNotBlank()) "evt:$key".hashCode() else (System.currentTimeMillis() and 0x7FFFFFFFL).toInt()
    }

    private fun refreshEventSummary(app: Context, channelId: String, group: String, postedId: Int, postedLine: CharSequence) {
        val others = activeNotifications(app)
            .filter { it.id != postedId && it.notification.group == group && !it.isSummary() }
            .sortedByDescending { it.postTime }
        val total = others.size + 1
        if (total < 2) return
        postSummary(
            app = app,
            channelId = channelId,
            group = group,
            title = "$total avisos",
            summaryText = ArtaNotifications.label(channelId),
            lines = listOf(postedLine) + others.map { lineOf(it) },
            total = total,
            url = "/notifications",
        )
    }

    // ─── Comunes ────────────────────────────────────────────────────────────

    private fun baseBuilder(app: Context, channelId: String, sentAt: Long): NotificationCompat.Builder =
        NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.drawable.ic_stat_arta)
            .setColor(ArtaNotifications.ACCENT_COLOR)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setWhen(minOf(sentAt, System.currentTimeMillis()))
            .setShowWhen(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)

    private fun publicVersion(app: Context, channelId: String, text: String): Notification =
        NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.drawable.ic_stat_arta)
            .setColor(ArtaNotifications.ACCENT_COLOR)
            .setContentTitle("ARTA")
            .setContentText(text)
            .build()

    private fun postSummary(
        app: Context,
        channelId: String,
        group: String,
        title: String,
        summaryText: String,
        lines: List<CharSequence>,
        total: Int,
        url: String,
    ) {
        val id = summaryId(group)
        val style = NotificationCompat.InboxStyle().setBigContentTitle(title)
        lines.take(MAX_SUMMARY_LINES).forEach { style.addLine(it) }
        val extra = lines.size - MAX_SUMMARY_LINES
        style.setSummaryText(if (extra > 0) "$summaryText · +$extra más" else summaryText)
        val n = NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.drawable.ic_stat_arta)
            .setColor(ArtaNotifications.ACCENT_COLOR)
            .setContentTitle(title)
            .setContentText(lines.firstOrNull() ?: "")
            .setSubText(summaryText)
            .setStyle(style)
            .setGroup(group)
            .setGroupSummary(true)
            // El resumen nunca suena: el aviso lo da la notificación hija.
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setNumber(total)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(app, channelId, "Nuevos avisos"))
            .setContentIntent(contentIntent(app, id, url, "", "", ""))
            .build()
        notify(app, id, n)
    }

    private fun summaryId(group: String): Int = "summary:$group".hashCode()

    private fun contentIntent(
        app: Context,
        requestCode: Int,
        url: String,
        chatChannelId: String,
        messageId: String,
        notificationId: String,
        type: String = "",
    ): PendingIntent {
        val intent = Intent(app, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (url.isNotBlank()) putExtra(EXTRA_URL, url)
            if (chatChannelId.isNotBlank()) putExtra(EXTRA_CHANNEL_ID, chatChannelId)
            if (messageId.isNotBlank()) putExtra(EXTRA_MESSAGE_ID, messageId)
            if (notificationId.isNotBlank()) putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            if (type.isNotBlank()) putExtra(EXTRA_TYPE, type)
        }
        return PendingIntent.getActivity(app, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun summaryLine(title: String, text: String): CharSequence {
        val sb = SpannableStringBuilder()
        if (title.isNotBlank()) {
            sb.append(title, StyleSpan(Typeface.BOLD), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            if (text.isNotBlank()) sb.append("  ")
        }
        sb.append(text)
        return sb
    }

    private fun lineOf(sbn: StatusBarNotification): CharSequence {
        val extras = sbn.notification.extras
        return summaryLine(
            extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty(),
            extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty(),
        )
    }

    /** Círculo dorado con las iniciales (máx. 2) en negro, como el resto de la marca. */
    fun initials(name: String): Bitmap {
        val letters = name.trim().removePrefix("#")
            .split(Regex("\\s+"))
            .mapNotNull { w -> w.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar() }
            .take(2)
            .joinToString("")
            .ifBlank { "A" }
        val out = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val half = AVATAR_PX / 2f
        canvas.drawCircle(half, half, half, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ArtaNotifications.ACCENT_COLOR })
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#09090B")
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = AVATAR_PX * if (letters.length > 1) 0.38f else 0.46f
        }
        canvas.drawText(letters, half, half - (text.descent() + text.ascent()) / 2f, text)
        return out
    }

    private fun StatusBarNotification.isSummary(): Boolean = (notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0

    private fun activeNotifications(context: Context): List<StatusBarNotification> = try {
        context.getSystemService(NotificationManager::class.java)?.activeNotifications?.toList().orEmpty()
    } catch (e: Exception) {
        emptyList()
    }

    private fun canPost(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    @SuppressLint("MissingPermission")
    private fun notify(context: Context, id: Int, notification: Notification) {
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (e: SecurityException) {
            // Sin POST_NOTIFICATIONS (Android 13+): se ignora.
        } catch (e: Exception) {
            Log.w(TAG, "notify falló: ${e.message}")
        }
    }
}
