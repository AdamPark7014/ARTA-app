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
import com.artaproducciones.ops.data.BizEntity
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
 *   actualizar en su sitio sin volver a sonar, los botones del caso ([PushButton]),
 *   «Marcar como leído» y agrupados por `thread_id` con tarjeta resumen
 *   («3 avisos de Noche de Boleros»).
 * - Una tarea arrobada en un mensaje trae `channel_id` pero se pinta como proceso: sus
 *   botones actúan sobre la tarea, no sobre la conversación.
 * - `passive`: entra a la bandeja sin sonar, sin aviso emergente y sin encender la pantalla.
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
    /** Avisos de la campana ligados a una conversación (menciones): se marcan leídos al abrirla. */
    const val EXTRA_NOTIFICATION_IDS = "arta_notification_ids"
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
        val key = p.dedupeKey ?: return true
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
            when {
                payload.isChat && !payload.hasTaskButton -> renderChat(app, payload)
                // La conversación está en pantalla: ahí mismo se ve la tarjeta con su botón.
                ActiveConversation.isOpen(payload.chatChannelId) -> Unit
                else -> renderEvent(app, payload)
            }
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
                dismissEvent(app, "evt:arta-$notificationId".hashCode())
            } else {
                activeNotifications(app)
                    .filter { it.notification.group != GROUP_CHAT && it.notification.group?.startsWith(PushGrouping.PREFIX) == true }
                    .forEach { nm.cancel(it.id) }
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudieron quitar los avisos: ${e.message}")
        }
    }

    /** Quita un aviso de proceso y deja su tarjeta resumen al día (o la quita si ya no queda ninguno). */
    fun dismissEvent(context: Context, androidId: Int) {
        if (androidId == 0) return
        val app = context.applicationContext
        try {
            val group = activeNotifications(app).firstOrNull { it.id == androidId }?.notification?.group
            NotificationManagerCompat.from(app).cancel(androidId)
            if (group != null && group != GROUP_CHAT) rebuildEventSummary(app, group, excluding = androidId)
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo quitar el aviso: ${e.message}")
        }
    }

    /**
     * Tocar el último aviso de un grupo lo cancela el sistema, y su resumen se quedaría como tarjeta
     * vacía: se limpia al abrir la app. Con hijas sigue igual (se actualiza con el siguiente aviso).
     */
    fun sweepSummaries(context: Context) {
        val app = context.applicationContext
        try {
            val active = activeNotifications(app)
            val nm = NotificationManagerCompat.from(app)
            active.filter { it.isSummary() && it.notification.group?.startsWith(PushGrouping.PREFIX) == true }
                .filter { s -> active.none { !it.isSummary() && it.notification.group == s.notification.group } }
                .forEach { nm.cancel(it.id) }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudieron limpiar los resúmenes: ${e.message}")
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
                noticeId = p.notificationId,
            ),
            entity = p.entity?.key.orEmpty(),
        )
        postConversation(app, conversation, alert = !p.passive, refreshSummary = true)
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
        postConversation(app, conversation, alert = false, refreshSummary = false)
    }

    private fun postConversation(app: Context, c: ChatNotificationStore.Conversation, alert: Boolean, refreshSummary: Boolean) {
        val notificationId = chatNotificationId(c.threadId)
        val isGroup = c.title.isNotBlank()
        val entity = BizEntity.of(c.entity)
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
                    .setIcon(IconCompat.createWithBitmap(initials(m.senderName, entity)))
                    .build()
            }
            style.addMessage(m.text, m.at, author)
        }

        val name = if (isGroup) c.title else peerName
        val icon = initials(name, entity)
        val lastText = c.messages.lastOrNull()?.let { if (isGroup && !it.mine) "${it.senderName}: ${it.text}" else it.text }.orEmpty()
        val pendingCount = c.messages.count { !it.mine }

        val builder = baseBuilder(app, ArtaNotifications.CHANNEL_CHAT, c.messages.lastOrNull()?.at ?: System.currentTimeMillis(), entity)
            .setContentTitle(name)
            .setContentText(lastText)
            .setStyle(style)
            .setLargeIcon(icon)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setGroup(GROUP_CHAT)
            .setNumber(pendingCount)
            .setOnlyAlertOnce(!alert)
            .setContentIntent(contentIntent(app, notificationId, c.url, c.chatChannelId, lastOther?.messageId.orEmpty(), "", noticeIds = c.noticeIds))
            .setPublicVersion(publicVersion(app, ArtaNotifications.CHANNEL_CHAT, "Nuevo mensaje", entity))
        entity?.let { builder.setSubText(it.short) }
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
        if (refreshSummary) refreshChatSummary(app, notificationId, summaryLine(name, lastText), pendingCount)
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
        val group = PushGrouping.groupFor(p)
        val title = p.title.ifBlank { "ARTA" }
        val builder = baseBuilder(app, channelId, p.sentAtMillis, p.entity)
            .setContentTitle(title)
            // La entidad dice de dónde viene; sin ella (cuenta, directos), la categoría.
            .setSubText(p.entity?.short ?: ArtaNotifications.label(channelId))
            .setCategory(if (channelId == ArtaNotifications.CHANNEL_CHAT) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_EVENT)
            .setGroup(group)
            // La misma etiqueta otra vez (una ráfaga) actualiza la tarjeta sin volver a sonar.
            .setOnlyAlertOnce(true)
            .setLargeIcon(initials(p.senderName.ifBlank { ArtaNotifications.label(channelId) }, p.entity))
            .setContentIntent(contentIntent(app, notificationId, p.url, p.chatChannelId, p.messageId, p.notificationId, p.type))
            .setPublicVersion(publicVersion(app, channelId, "Nuevo aviso", p.entity))
        if (p.passive) builder.setSilent(true).setPriority(NotificationCompat.PRIORITY_LOW)
        if (p.body.isNotBlank()) {
            builder.setContentText(p.body).setStyle(NotificationCompat.BigTextStyle().setBigContentTitle(title).bigText(p.body))
        }
        // Dinero y firmas nunca se aprueban aquí: «Revisar» lleva a la pantalla donde se decide.
        val buttons = p.buttons
        if (buttons.isEmpty()) builder.addAction(eventAction(app, notificationId, p, if (p.isApproval) "Abrir" else "Ver"))
        buttons.forEach { button ->
            builder.addAction(
                when (button) {
                    PushButton.DELIVER -> deliverAction(app, notificationId, p)
                    PushButton.APPROVE -> approveAction(app, notificationId, p)
                    PushButton.REVIEW, PushButton.OPEN -> eventAction(app, notificationId, p, button.label)
                },
            )
        }
        if (p.notificationId.isNotBlank()) builder.addAction(markNoticeReadAction(app, notificationId, p.notificationId))
        notify(app, notificationId, builder.build())
        rebuildEventSummary(app, group, posted = PostedEvent(notificationId, channelId, summaryLine(title, p.body), p.body, p.threadTitle, p.entity))
    }

    private fun markNoticeReadAction(app: Context, androidId: Int, noticeId: String): NotificationCompat.Action {
        val intent = Intent(app, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_MARK_NOTICE_READ
            putExtra(NotificationActionReceiver.EXTRA_NOTICE_ID, noticeId)
            putExtra(NotificationActionReceiver.EXTRA_ANDROID_ID, androidId)
        }
        val pi = PendingIntent.getBroadcast(
            app,
            androidId * 31 + 4,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Action.Builder(IconCompat.createWithResource(app, R.drawable.ic_action_read), "Marcar como leído", pi)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
            .setShowsUserInterface(false)
            .build()
    }

    private fun taskIntent(app: Context, action: String, androidId: Int, p: PushPayload) =
        Intent(app, NotificationActionReceiver::class.java).apply {
            this.action = action
            putExtra(NotificationActionReceiver.EXTRA_TASK_ID, p.targetId)
            putExtra(NotificationActionReceiver.EXTRA_ANDROID_ID, androidId)
            putExtra(NotificationActionReceiver.EXTRA_NOTICE_ID, p.notificationId)
        }

    /** «Entregar» con texto, igual que «Responder»: la nota viaja sin abrir la app. */
    private fun deliverAction(app: Context, androidId: Int, p: PushPayload): NotificationCompat.Action {
        val input = RemoteInput.Builder(NotificationActionReceiver.KEY_NOTE).setLabel("¿Qué hiciste?").build()
        // Mutable a propósito: el sistema escribe el texto de RemoteInput en el intent.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        val pi = PendingIntent.getBroadcast(app, androidId * 31 + 5, taskIntent(app, NotificationActionReceiver.ACTION_TASK_DELIVER, androidId, p), flags)
        return NotificationCompat.Action.Builder(IconCompat.createWithResource(app, R.drawable.ic_action_reply), PushButton.DELIVER.label, pi)
            .addRemoteInput(input)
            .setAllowGeneratedReplies(false)
            .setShowsUserInterface(false)
            .setAuthenticationRequired(true)
            .build()
    }

    private fun approveAction(app: Context, androidId: Int, p: PushPayload): NotificationCompat.Action {
        val pi = PendingIntent.getBroadcast(
            app,
            androidId * 31 + 6,
            taskIntent(app, NotificationActionReceiver.ACTION_TASK_APPROVE, androidId, p),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Action.Builder(IconCompat.createWithResource(app, R.drawable.ic_action_read), PushButton.APPROVE.label, pi)
            .setShowsUserInterface(false)
            .setAuthenticationRequired(true)
            .build()
    }

    /**
     * La entrega o el visto bueno no salieron: el aviso (mismo id, así se quita la espera de
     * Android) lo dice y lleva a la tarea para hacerlo ahí.
     */
    fun taskActionFailed(context: Context, androidId: Int, taskId: String, title: String) {
        val app = context.applicationContext
        try {
            val group = activeNotifications(app).firstOrNull { it.id == androidId }?.notification?.group
            val text = "Abre la tarea para intentarlo de nuevo."
            val open = PendingIntent.getActivity(
                app,
                androidId * 31 + 7,
                Intent(app, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra(EXTRA_URL, "/tasks/$taskId")
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val builder = baseBuilder(app, ArtaNotifications.CHANNEL_TASKS, System.currentTimeMillis())
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().setBigContentTitle(title).bigText(text))
                .setCategory(NotificationCompat.CATEGORY_ERROR)
                .setSubText(ArtaNotifications.label(ArtaNotifications.CHANNEL_TASKS))
                .setOnlyAlertOnce(true)
                .setContentIntent(open)
                .addAction(NotificationCompat.Action.Builder(IconCompat.createWithResource(app, R.drawable.ic_stat_arta), "Abrir", open).setShowsUserInterface(true).build())
                .setPublicVersion(publicVersion(app, ArtaNotifications.CHANNEL_TASKS, "Nuevo aviso"))
            group?.let { builder.setGroup(it) }
            notify(app, androidId, builder.build())
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo avisar del fallo: ${e.message}")
        }
    }

    private fun eventAction(app: Context, notificationId: Int, p: PushPayload, label: String): NotificationCompat.Action {
        val intent = Intent(app, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (p.url.isNotBlank()) putExtra(EXTRA_URL, p.url)
            if (p.type.isNotBlank()) putExtra(EXTRA_TYPE, p.type)
            if (p.notificationId.isNotBlank()) putExtra(EXTRA_NOTIFICATION_ID, p.notificationId)
            if (p.opensApprovals) putExtra(EXTRA_TARGET, TARGET_APPROVALS)
            // Las acciones no cancelan solas (autoCancel solo aplica al toque): la app la quita.
            putExtra(EXTRA_DISMISS_ID, notificationId)
        }
        val pi = PendingIntent.getActivity(
            app,
            notificationId * 31 + 3,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Action.Builder(IconCompat.createWithResource(app, R.drawable.ic_stat_arta), label, pi)
            .setShowsUserInterface(true)
            .build()
    }

    private fun eventNotificationId(p: PushPayload): Int {
        val key = p.tag.ifBlank { p.notificationId }
        return if (key.isNotBlank()) "evt:$key".hashCode() else (System.currentTimeMillis() and 0x7FFFFFFFL).toInt()
    }

    /** Lo recién pintado: quizá todavía no se ve entre los activos (`notify` va en cola). */
    private class PostedEvent(
        val id: Int,
        val channelId: String,
        val line: CharSequence,
        val body: String,
        val threadTitle: String,
        val entity: BizEntity?,
    )

    /**
     * Tarjeta resumen del grupo con lo que hay en la barra. Sin nada, se quita: un resumen sin hijas
     * se quedaría como tarjeta vacía. Con una sola no hace falta tocarla: se ve el aviso mismo.
     */
    private fun rebuildEventSummary(app: Context, group: String, excluding: Int? = null, posted: PostedEvent? = null) {
        val active = activeNotifications(app).filter { it.notification.group == group }
        val others = active
            .filter { !it.isSummary() && it.id != excluding && it.id != posted?.id }
            .sortedByDescending { it.postTime }
        val total = others.size + (if (posted != null) 1 else 0)
        val summary = active.firstOrNull { it.isSummary() }
        if (total == 0) {
            summary?.let { NotificationManagerCompat.from(app).cancel(it.id) }
            return
        }
        if (total < 2) return
        val channelId = posted?.channelId ?: others.first().notification.channelId
        val bodies = listOfNotNull(posted?.body) + others.map { textOf(it) }
        val subject = PushGrouping.subject(posted?.threadTitle.orEmpty(), bodies)
        val entity = posted?.entity
        val fallbackSub = others.firstOrNull()?.notification?.extras?.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()
        postSummary(
            app = app,
            channelId = channelId,
            group = group,
            title = PushGrouping.summaryTitle(total, subject),
            summaryText = entity?.short ?: fallbackSub ?: ArtaNotifications.label(channelId),
            lines = listOfNotNull(posted?.line) + others.map { lineOf(it) },
            total = total,
            url = "/notifications",
            color = entity?.let(ArtaNotifications::accentFor) ?: others.firstOrNull()?.notification?.color ?: ArtaNotifications.ACCENT_COLOR,
        )
    }

    private fun textOf(sbn: StatusBarNotification): String =
        sbn.notification.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()

    // ─── Comunes ────────────────────────────────────────────────────────────

    private fun baseBuilder(app: Context, channelId: String, sentAt: Long, entity: BizEntity? = null): NotificationCompat.Builder =
        NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.drawable.ic_stat_arta)
            .setColor(ArtaNotifications.accentFor(entity))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setWhen(minOf(sentAt, System.currentTimeMillis()))
            .setShowWhen(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)

    private fun publicVersion(app: Context, channelId: String, text: String, entity: BizEntity? = null): Notification =
        NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.drawable.ic_stat_arta)
            .setColor(ArtaNotifications.accentFor(entity))
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
        color: Int = ArtaNotifications.ACCENT_COLOR,
    ) {
        val id = summaryId(group)
        val style = NotificationCompat.InboxStyle().setBigContentTitle(title)
        lines.take(MAX_SUMMARY_LINES).forEach { style.addLine(it) }
        val extra = lines.size - MAX_SUMMARY_LINES
        style.setSummaryText(if (extra > 0) "$summaryText · +$extra más" else summaryText)
        val n = NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.drawable.ic_stat_arta)
            .setColor(color)
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
        noticeIds: List<String> = emptyList(),
    ): PendingIntent {
        val intent = Intent(app, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (url.isNotBlank()) putExtra(EXTRA_URL, url)
            if (chatChannelId.isNotBlank()) putExtra(EXTRA_CHANNEL_ID, chatChannelId)
            if (messageId.isNotBlank()) putExtra(EXTRA_MESSAGE_ID, messageId)
            if (notificationId.isNotBlank()) putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            if (noticeIds.isNotEmpty()) putExtra(EXTRA_NOTIFICATION_IDS, noticeIds.toTypedArray())
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

    /** Círculo del acento de la entidad con las iniciales (máx. 2): blanco sobre tinta, tinta sobre plata. */
    fun initials(name: String, entity: BizEntity? = null): Bitmap {
        val letters = name.trim().removePrefix("#")
            .split(Regex("\\s+"))
            .mapNotNull { w -> w.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar() }
            .take(2)
            .joinToString("")
            .ifBlank { "A" }
        val out = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val half = AVATAR_PX / 2f
        canvas.drawCircle(half, half, half, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ArtaNotifications.accentFor(entity) })
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = ArtaNotifications.onAccentFor(entity)
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
