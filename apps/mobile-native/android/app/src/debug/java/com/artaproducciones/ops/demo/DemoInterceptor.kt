package com.artaproducciones.ops.demo

import android.content.Context
import android.util.Log
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ApiDebugHooks
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Solo debug, modo demo (ver [DemoLaunch]): contesta TODO lo que pase por el OkHttp de la app
 * sin tocar la red. Es el primero de la cadena, así que con el modo encendido nunca se llama
 * a `chain.proceed`.
 *
 * - GET del API → fixture por clave exacta (ruta + `entity`/`scope`), luego sin `scope`, luego
 *   sin query. Sin fixture: lista vacía donde el DTO es una lista, página vacía en mensajes,
 *   404 en lo demás (las pantallas lo muestran como «Sin datos en el modo demo»).
 * - Escrituras → 200 con lo que espera quien llama (el mensaje enviado, la tarea con su nuevo
 *   estado…) y el cambio se guarda en memoria para que la siguiente lectura lo vea.
 * - Fuera del API (`/uploads/…`, otros hosts) → 404, salvo lo que se subió en esta sesión.
 */
internal class DemoInterceptor(context: Context) : Interceptor {
    private val store = DemoStore(context.applicationContext)
    private val uploads = ConcurrentHashMap<String, Pair<ByteArray, String>>()
    private val base: HttpUrl by lazy { ApiClient.baseUrl.toHttpUrl() }

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!ApiDebugHooks.demo) return chain.proceed(request)

        val path = DemoKeys.apiPath(request.url, base)
        if (path == null) {
            uploads[request.url.encodedPath]?.let { (bytes, mime) ->
                return respond(request, 200, bytes.toResponseBody(mime.toMediaTypeOrNull()))
            }
            return respond(request, 404, NOT_FOUND.toResponseBody(JSON))
        }
        val method = request.method.uppercase()
        val body = runCatching {
            synchronized(this) { if (method == "GET" || method == "HEAD") read(path, request.url) else write(method, path, request) }
        }.onFailure { Log.w(TAG, "$method $path", it) }.getOrNull()
        if (body == null) Log.i(TAG, "sin datos: $method $path")
        return respond(request, if (body != null) 200 else 404, (body ?: NOT_FOUND).toResponseBody(JSON))
    }

    private fun respond(request: Request, code: Int, body: okhttp3.ResponseBody): Response = Response.Builder()
        .request(request)
        .protocol(Protocol.HTTP_1_1)
        .code(code)
        .message(if (code == 200) "OK" else "Not Found")
        .header("X-Arta-Demo", "1")
        .body(body)
        .build()

    // ─── Lecturas ───────────────────────────────────────────────────────────

    private fun read(path: String, url: HttpUrl): String? {
        DemoKeys.candidates(path, url).firstNotNullOfOrNull { store.raw(it) }?.let { return it }
        val s = path.split('/')
        return when {
            s.size == 4 && s[0] == "chat" && s[1] == "messages" && s[3] == "thread" -> thread(s[2])
            path == "chat/search" -> search(url.queryParameter("q").orEmpty(), url.queryParameter("channelId"))
            s.size == 4 && s[0] == "chat" && s[1] == "channels" && s[3] == "messages" -> EMPTY_PAGE
            s.size == 4 && s[0] == "chat" && s[1] == "channels" && s[3] == "pins" -> """{"messages":[]}"""
            path == "analytics/purchase-orders" -> """{"orders":[]}"""
            path in LISTS || path.startsWith("tasks/event/") -> "[]"
            else -> null
        }
    }

    private fun thread(rootId: String): String? {
        val root = findMessage(rootId) ?: return null
        return JSONObject().put("root", root).put("replies", store.arr(repliesKey(rootId)) ?: JSONArray()).toString()
    }

    private fun search(q: String, channelId: String?): String {
        val needle = q.trim().lowercase()
        val out = JSONArray()
        if (needle.isNotEmpty()) {
            for ((key, page) in messagePages()) {
                val cid = key.split('/')[2]
                if (channelId != null && cid != channelId) continue
                val ref = channelRef(cid)
                page.optJSONArray("messages").objects()
                    .filter { !it.optBoolean("deleted") && it.optString("body").lowercase().contains(needle) }
                    .forEach { out.put(JSONObject(it.toString()).put("channel", ref)) }
            }
        }
        return JSONObject().put("messages", out).toString()
    }

    // ─── Escrituras ─────────────────────────────────────────────────────────

    private fun write(method: String, path: String, request: Request): String? {
        val s = path.split('/')
        val body = jsonBody(request)
        return when {
            // Chat
            method == "POST" && s.size == 4 && s[0] == "chat" && s[1] == "channels" && s[3] == "messages" -> postMessage(s[2], body)
            s.size in 3..4 && s[0] == "chat" && s[1] == "messages" -> messageAction(method, s[2], s.getOrNull(3), body)
            path == "chat/prefs" -> JSONObject().put("dndUntil", body.opt("dndUntil") ?: JSONObject.NULL).toString()
            path == "chat/upload" -> upload(request)?.toString()
            path == "chat/dm" -> channelDetail(channels().firstOrNull { it.optJSONObject("peer")?.str("id") == body.str("userId") })
            s.size == 3 && s[0] == "chat" && s[1] == "event" -> channelDetail(channels().firstOrNull { it.str("eventId") == s[2] })
            s.size == 3 && s[0] == "chat" && s[1] == "channels" && method == "PATCH" -> updateChannel(s[2], body)
            s.size == 4 && s[0] == "chat" && s[1] == "channels" && s[3] == "members" -> store.raw("chat/channels/${s[2]}")
            s.size == 4 && s[0] == "chat" && s[1] == "channels" && s[3] == "mute" -> {
                changeChannel(s[2]) { it.put("muted", body.optBoolean("muted")) }
                OK
            }
            // Crear canal o grupo: sin pantalla de destino en las fixtures.
            path == "chat/channels" || path == "chat/group-dm" -> null
            // Avisos
            s.size == 3 && s[0] == "notifications" && s[2] == "read" -> notificationRead(s[1])
            path == "notifications/read-all" -> {
                store.arr("notifications")?.let { list ->
                    store.put("notifications", JSONArray(list.objects().map { if (it.isNull("readAt")) it.put("readAt", now()) else it }))
                }
                store.put("notifications/unread-count", JSONObject().put("count", 0))
                OK
            }
            // Tareas
            path == "tasks" && method == "POST" -> createTask(body)
            s.size == 2 && s[0] == "tasks" && method == "PATCH" -> changeTask(s[1]) { t -> mergeTask(t, body) }
            s.size == 2 && s[0] == "tasks" && method == "DELETE" -> {
                findTask(s[1])?.let { replaceInTaskLists(it, remove = true) }
                OK
            }
            s.size == 3 && s[0] == "tasks" -> taskAction(s[1], s[2], body, request)
            // Órdenes de compra y anticipos
            s.size == 3 && s[0] == "purchase-orders" && s[2] == "status" -> {
                setPoStatus(s[1], body.str("status").orEmpty())
                OK
            }
            s.size == 4 && s[0] == "finance" && s[1] == "advances" -> {
                resolveAdvance(s[2], s[3], body.str("reason"))
                OK
            }
            // Lo demás (leído, archivar, salir, push, logout…): basta un OK.
            else -> OK
        }
    }

    private fun jsonBody(request: Request): JSONObject {
        val body = request.body ?: return JSONObject()
        if (body is MultipartBody) return JSONObject()
        val text = Buffer().also { body.writeTo(it) }.readUtf8()
        return runCatching { JSONObject(text) }.getOrDefault(JSONObject())
    }

    private fun now(): String = Instant.now().toString()

    private fun newId(): String = "demo" + UUID.randomUUID().toString().replace("-", "").take(20)

    // ─── Chat ───────────────────────────────────────────────────────────────

    private fun me(): JSONObject = store.obj("auth/me")?.optJSONObject("user") ?: JSONObject().put("id", "demo").put("fullName", "Demo")

    private fun meId(): String = me().optString("id")

    private fun author(): JSONObject = me().let { u -> JSONObject().put("id", u.optString("id")).put("fullName", u.optString("fullName")).put("title", u.opt("title") ?: JSONObject.NULL) }

    private fun channels(): List<JSONObject> = store.arr("chat/channels").objects()

    private fun channelRef(id: String): JSONObject {
        val c = channels().firstOrNull { it.optString("id") == id }
        return JSONObject()
            .put("id", id)
            .put("name", c?.optString("name").orEmpty())
            .put("kind", c?.optString("kind") ?: "PUBLIC")
            .put("isGroupDm", c?.optBoolean("isGroupDm") ?: false)
    }

    private fun channelDetail(summary: JSONObject?): String? = summary?.str("id")?.let { store.raw("chat/channels/$it") }

    /** Cambia el canal en su detalle y en la lista de chats. */
    private fun changeChannel(id: String, change: (JSONObject) -> Unit): JSONObject? {
        store.arr("chat/channels")?.let { list ->
            store.put("chat/channels", JSONArray(list.objects().map { if (it.optString("id") == id) it.also(change) else it }))
        }
        val detail = store.obj("chat/channels/$id") ?: return null
        change(detail)
        store.put("chat/channels/$id", detail)
        return detail
    }

    private fun updateChannel(id: String, body: JSONObject): String? = changeChannel(id) { c ->
        for (k in listOf("name", "topic", "description")) if (body.has(k)) c.put(k, body.opt(k))
    }?.toString()

    private fun messagesKey(channelId: String) = "chat/channels/$channelId/messages"

    private fun repliesKey(rootId: String) = "chat/messages/$rootId/replies"

    private fun messagePages(): List<Pair<String, JSONObject>> =
        store.keys().filter { MESSAGES.matches(it) }.mapNotNull { k -> store.obj(k)?.let { k to it } }

    private fun findMessage(id: String): JSONObject? {
        messagePages().forEach { (_, page) -> page.optJSONArray("messages").objects().firstOrNull { it.optString("id") == id }?.let { return it } }
        store.keys().filter { it.startsWith("chat/messages/") && it.endsWith("/replies") }.forEach { k ->
            store.arr(k).objects().firstOrNull { it.optString("id") == id }?.let { return it }
        }
        return null
    }

    /** Cambia el mensaje donde esté (página del canal o respuestas de un hilo) y lo devuelve. */
    private fun updateMessage(id: String, change: (JSONObject) -> Unit): JSONObject? {
        for ((key, page) in messagePages()) {
            val m = page.optJSONArray("messages").objects().firstOrNull { it.optString("id") == id } ?: continue
            change(m)
            store.put(key, page)
            return m
        }
        for (key in store.keys().filter { it.startsWith("chat/messages/") && it.endsWith("/replies") }) {
            val list = store.arr(key) ?: continue
            val m = list.objects().firstOrNull { it.optString("id") == id } ?: continue
            change(m)
            store.put(key, list)
            return m
        }
        return null
    }

    private fun postMessage(channelId: String, body: JSONObject): String {
        val parentId = body.str("parentId")
        val attachment = body.str("attachmentUrl")?.let { url ->
            JSONObject()
                .put("url", url)
                .put("name", body.opt("attachmentName") ?: JSONObject.NULL)
                .put("mime", body.opt("attachmentMime") ?: JSONObject.NULL)
                .put("size", body.opt("attachmentSize") ?: JSONObject.NULL)
        }
        val replyTo = body.str("replyToId")?.let(::findMessage)?.let { r ->
            val a = r.optJSONObject("author")
            JSONObject()
                .put("id", r.optString("id"))
                .put("authorId", a?.optString("id"))
                .put("authorName", a?.optString("fullName"))
                .put("excerpt", r.optString("body").take(140))
                .put("kind", r.optString("kind"))
                .put("attachmentName", r.optJSONObject("attachment")?.opt("name") ?: JSONObject.NULL)
                .put("deleted", r.optBoolean("deleted"))
        }
        val createdAt = now()
        val m = JSONObject()
            .put("id", newId())
            .put("channelId", channelId)
            .put("parentId", parentId ?: JSONObject.NULL)
            .put("kind", "TEXT")
            .put("body", body.str("body").orEmpty())
            .put("attachment", attachment ?: JSONObject.NULL)
            .put("pinnedAt", JSONObject.NULL)
            .put("editedAt", JSONObject.NULL)
            .put("createdAt", createdAt)
            .put("author", author())
            .put("replyCount", 0)
            .put("reactions", JSONArray())
            .put("replyTo", replyTo ?: JSONObject.NULL)
            .put("saved", false)
            .put("deleted", false)
            .put("clientId", body.opt("clientId") ?: JSONObject.NULL)
        if (parentId != null) {
            store.put(repliesKey(parentId), (store.arr(repliesKey(parentId)) ?: JSONArray()).put(m))
            updateMessage(parentId) { it.put("replyCount", it.optInt("replyCount") + 1) }
        } else {
            val page = store.obj(messagesKey(channelId)) ?: JSONObject(EMPTY_PAGE)
            page.put("messages", (page.optJSONArray("messages") ?: JSONArray()).put(m))
            store.put(messagesKey(channelId), page)
            val preview = m.optString("body").ifBlank { attachment?.optString("name").orEmpty() }
            changeChannel(channelId) { it.put("lastMessageAt", createdAt).put("lastMessagePreview", preview) }
        }
        return m.toString()
    }

    private fun messageAction(method: String, id: String, action: String?, body: JSONObject): String? = when {
        action == null && method == "PATCH" ->
            updateMessage(id) { it.put("body", body.str("body").orEmpty()).put("editedAt", now()) }?.toString()
        action == null && method == "DELETE" ->
            updateMessage(id) { it.put("deleted", true).put("body", "").put("attachment", JSONObject.NULL) }?.let { OK }
        action == "reactions" -> updateMessage(id) { toggleReaction(it, body.str("emoji").orEmpty()) }?.toString()
        action == "pin" -> updateMessage(id) { it.put("pinnedAt", if (it.isNull("pinnedAt")) now() else JSONObject.NULL) }?.toString()
        action == "save" -> updateMessage(id) { it.put("saved", !it.optBoolean("saved")) }
            ?.let { JSONObject().put("saved", it.optBoolean("saved")).toString() }
        else -> OK
    }

    private fun toggleReaction(m: JSONObject, emoji: String) {
        if (emoji.isEmpty()) return
        val me = author()
        val myId = me.optString("id")
        val out = JSONArray()
        var found = false
        for (r in m.optJSONArray("reactions").objects()) {
            if (r.optString("emoji") != emoji) {
                out.put(r)
                continue
            }
            found = true
            val ids = r.optJSONArray("userIds").strings().toMutableList()
            val users = r.optJSONArray("users").objects().toMutableList()
            val count = r.optInt("count", ids.size)
            if (myId in ids) {
                ids.remove(myId)
                users.removeAll { it.optString("id") == myId }
                if (count > 1) out.put(r.put("count", count - 1).put("userIds", JSONArray(ids)).put("users", JSONArray(users)))
            } else {
                ids.add(myId)
                users.add(JSONObject().put("id", myId).put("fullName", me.optString("fullName")))
                out.put(r.put("count", count + 1).put("userIds", JSONArray(ids)).put("users", JSONArray(users)))
            }
        }
        if (!found) {
            out.put(
                JSONObject()
                    .put("emoji", emoji)
                    .put("count", 1)
                    .put("userIds", JSONArray().put(myId))
                    .put("users", JSONArray().put(JSONObject().put("id", myId).put("fullName", me.optString("fullName")))),
            )
        }
        m.put("reactions", out)
    }

    /** El archivo se queda en memoria y se sirve desde su URL: la foto enviada se ve en la conversación. */
    private fun upload(request: Request): JSONObject? {
        val part = (request.body as? MultipartBody)?.parts?.firstOrNull() ?: return null
        val disposition = part.headers?.get("Content-Disposition").orEmpty()
        val name = Regex("filename=\"([^\"]*)\"").find(disposition)?.groupValues?.get(1)?.ifBlank { null } ?: "archivo"
        val mime = part.body.contentType()?.let { "${it.type}/${it.subtype}" } ?: "application/octet-stream"
        val bytes = Buffer().also { part.body.writeTo(it) }.readByteArray()
        val url = "/uploads/demo/${newId()}/" + name.replace(Regex("[^A-Za-z0-9._-]"), "_")
        if (bytes.size <= MAX_UPLOAD) uploads[url] = bytes to mime
        return JSONObject()
            .put("url", url)
            .put("name", name)
            .put("mime", mime)
            .put("size", bytes.size)
            .put("kind", mime.substringBefore('/'))
    }

    // ─── Avisos ─────────────────────────────────────────────────────────────

    private fun notificationRead(id: String): String? {
        val list = store.arr("notifications") ?: return null
        val n = list.objects().firstOrNull { it.optString("id") == id } ?: return null
        if (n.isNull("readAt")) n.put("readAt", now())
        store.put("notifications", list)
        return n.toString()
    }

    // ─── Tareas ─────────────────────────────────────────────────────────────

    private val taskListKeys: List<String>
        get() = store.keys().filter { it == "tasks/mine" || it == "tasks/requested" || it.startsWith("tasks/event/") }

    private fun findTask(id: String): JSONObject? =
        store.obj("tasks/$id") ?: taskListKeys.firstNotNullOfOrNull { k -> store.arr(k).objects().firstOrNull { it.optString("id") == id } }

    private fun replaceInTaskLists(t: JSONObject, remove: Boolean = false) {
        val id = t.optString("id")
        for (key in taskListKeys) {
            val list = store.arr(key).objects()
            if (list.none { it.optString("id") == id }) continue
            store.put(key, JSONArray(list.mapNotNull { if (it.optString("id") != id) it else if (remove) null else t }))
        }
    }

    private fun changeTask(id: String, change: (JSONObject) -> Unit): String? {
        val t = findTask(id) ?: return null
        change(t)
        t.put("updatedAt", now())
        store.put("tasks/$id", t)
        replaceInTaskLists(t)
        return t.toString()
    }

    private fun person(id: String): JSONObject {
        val u = store.arr("users/directory").objects().firstOrNull { it.optString("id") == id }
            ?: me().takeIf { it.optString("id") == id }
        return JSONObject().put("id", id).put("fullName", u?.optString("fullName").orEmpty()).put("email", u?.opt("email") ?: JSONObject.NULL)
    }

    private fun setAssignees(t: JSONObject, ids: List<String>) {
        val people = ids.map(::person)
        t.put("assigneeIds", JSONArray(ids))
            .put("assignees", JSONArray(people))
            .put("assigneeId", ids.firstOrNull() ?: JSONObject.NULL)
            .put("assignee", people.firstOrNull() ?: JSONObject.NULL)
    }

    private fun mergeTask(t: JSONObject, body: JSONObject) {
        for (k in body.keys()) {
            if (k == "assigneeIds") setAssignees(t, body.optJSONArray(k).strings()) else t.put(k, body.opt(k))
        }
    }

    private fun createTask(body: JSONObject): String {
        val id = newId()
        val createdAt = now()
        val eventId = body.str("eventId")
        val event = eventId?.let { eid ->
            (store.arr("events").objects()).firstOrNull { it.optString("id") == eid }?.let { e ->
                JSONObject().put("id", eid).put("name", e.optString("name")).put("status", e.opt("status")).put("entity", e.opt("entity"))
            }
        }
        val t = JSONObject()
            .put("id", id)
            .put("title", body.str("title").orEmpty())
            .put("module", body.opt("module") ?: JSONObject.NULL)
            .put("detail", body.opt("detail") ?: JSONObject.NULL)
            .put("status", "OPEN")
            .put("dueAt", body.opt("dueAt") ?: JSONObject.NULL)
            .put("createdAt", createdAt)
            .put("updatedAt", createdAt)
            .put("eventId", eventId ?: JSONObject.NULL)
            .put("event", event ?: JSONObject.NULL)
            .put("createdById", meId())
            .put("createdBy", person(meId()))
            .put("evidences", JSONArray())
            .put("activities", JSONArray())
        val assignees = body.optJSONArray("assigneeIds").strings()
        setAssignees(t, assignees)
        store.put("tasks/$id", t)
        fun prepend(key: String) = store.put(key, JSONArray(listOf(t) + store.arr(key).objects()))
        prepend("tasks/requested")
        if (meId() in assignees) prepend("tasks/mine")
        eventId?.let { prepend("tasks/event/$it") }
        return t.toString()
    }

    private fun taskAction(id: String, action: String, body: JSONObject, request: Request): String? = when (action) {
        "submit" -> changeTask(id) { t ->
            // Como el API: si la pidió otra persona, queda esperando su visto bueno.
            val review = t.str("createdById") != meId()
            t.put("status", if (review) "PENDING_APPROVAL" else "DONE")
                .put("submittedAt", now())
                .put("completionNote", body.str("completionNote") ?: JSONObject.NULL)
                .put("rejectionNote", JSONObject.NULL)
                .put("rejectedAt", JSONObject.NULL)
            if (!review) t.put("approvedAt", now()).put("approvedBy", person(meId()))
        }
        "approve" -> changeTask(id) { t ->
            t.put("status", "DONE").put("approvedAt", now()).put("approvedBy", person(meId()))
                .put("rejectionNote", JSONObject.NULL).put("rejectedAt", JSONObject.NULL)
        }
        "reject" -> changeTask(id) { t ->
            t.put("status", "IN_PROGRESS").put("rejectedAt", now()).put("rejectedBy", person(meId()))
                .put("rejectionNote", body.str("note") ?: JSONObject.NULL)
                .put("submittedAt", JSONObject.NULL).put("completionNote", JSONObject.NULL)
                .put("approvedAt", JSONObject.NULL).put("seenAt", JSONObject.NULL)
        }
        "evidence" -> upload(request)?.let { file ->
            val evidence = JSONObject()
                .put("id", newId())
                .put("fileUrl", file.getString("url"))
                .put("label", file.optString("name"))
                .put("createdAt", now())
                .put("uploadedBy", person(meId()))
            changeTask(id) { t -> t.put("evidences", (t.optJSONArray("evidences") ?: JSONArray()).put(evidence)) }
            evidence.toString()
        }
        else -> OK
    }

    // ─── Órdenes de compra y anticipos ─────────────────────────────────────

    private fun setPoStatus(id: String, status: String) {
        if (status.isEmpty()) return
        fun stamp(o: JSONObject) {
            o.put("status", status)
            if (status == "AUTHORIZED") o.put("authorizedAt", now())
            if (status == "PAID") o.put("paidAt", now())
        }
        store.obj("purchase-orders/$id")?.let { po ->
            stamp(po)
            store.put("purchase-orders/$id", po)
        }
        for (key in store.keys().filter { it.startsWith("analytics/purchase-orders") }) {
            val page = store.obj(key) ?: continue
            val row = page.optJSONArray("orders").objects().firstOrNull { it.optString("id") == id } ?: continue
            stamp(row)
            store.put(key, page)
        }
    }

    private fun resolveAdvance(id: String, action: String, reason: String?) {
        val list = store.arr("finance/advances/pending") ?: return
        val out = list.objects().mapNotNull { a ->
            when {
                a.optString("id") != id -> a
                // Aprobado sigue en la lista como «Por pagar» (quien aprueba también puede pagar).
                action == "approve" -> a.put("advanceStatus", "APPROVED").put("decidedAt", now()).put("decidedBy", person(meId()))
                else -> null.also { if (action == "reject") Log.i(TAG, "anticipo $id rechazado: $reason") }
            }
        }
        store.put("finance/advances/pending", JSONArray(out))
    }

    companion object {
        private const val TAG = "ArtaDemo"
        private const val OK = """{"ok":true}"""
        private const val NOT_FOUND = """{"statusCode":404,"message":"Sin datos en el modo demo"}"""
        private const val EMPTY_PAGE = """{"messages":[],"hasMore":false,"hasNewer":false}"""
        private const val MAX_UPLOAD = 32 * 1024 * 1024
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private val MESSAGES = Regex("^chat/channels/[^/]+/messages$")

        /** Endpoints cuyo DTO es una lista: sin fixture contestan `[]` en vez de 404. */
        private val LISTS = setOf(
            "chat/channels", "chat/colleagues", "users/directory", "notifications", "events", "calendar/notes",
            "tasks/mine", "tasks/requested", "tasks/workload", "finance/advances/pending",
        )
    }
}
