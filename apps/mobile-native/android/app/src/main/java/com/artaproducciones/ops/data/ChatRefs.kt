package com.artaproducciones.ops.data

import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.data.api.ChatRefDto
import com.artaproducciones.ops.data.api.RefInput

/**
 * Referencias del chat (docs/CHAT-V2-CONTRATO.md §9), la misma lógica que
 * `apps/web/components/chat/chat-refs.ts`. El cuerpo lleva `@Etiqueta` en texto plano; `refs` dice
 * qué cosa es y la tarjeta trae su estado al momento de leer. Sin Android: se prueba en la JVM.
 */
object ChatRefs {
    const val ACTION_DELIVER = "deliver"
    const val ACTION_COMPLETE = "complete"
    const val ACTION_APPROVE = "approve"

    const val TONE_ACTION = "action"
    const val TONE_LATE = "late"
    const val TONE_DONE = "done"

    /** Tope del API por mensaje (`ArrayMaxSize`): pasarse da 400. */
    const val MAX_PER_MESSAGE = 8

    /** Tope del API por petición de tarjetas. */
    const val MAX_CARDS_PER_REQUEST = 60

    /** Tarjetas a la vista bajo un mensaje; lo demás con «Ver N más». */
    const val CARDS_SHOWN = 3

    /** Orden del selector, el mismo de la web. */
    private val GROUPS = listOf(
        "task" to "Tareas",
        "event" to "Eventos",
        "po" to "Órdenes de compra",
        "format" to "Formatos",
        "doc" to "Documentos",
        "advance" to "Anticipos",
    )

    data class Group(val kind: String, val title: String, val items: List<ChatRefDto>)

    /** Dónde aparece una referencia dentro de un texto. */
    data class Hit(val ref: ChatRefDto, val start: Int, val end: Int)

    sealed interface Piece {
        data class Plain(val text: String) : Piece
        data class Chip(val ref: ChatRefDto) : Piece
    }

    enum class ChipState { OPEN, LOCKED, MISSING }

    fun key(kind: String, id: String): String = "$kind:$id"

    /** La siguiente `@Etiqueta` desde [from]; en empate gana lo largo, para que «Luces 2» no pierda ante «Luces». */
    fun nextIn(text: String, from: Int, refs: List<ChatRefDto>): Hit? {
        var best: Hit? = null
        for (r in refs) {
            if (r.label.isBlank()) continue
            val mark = "@" + r.label
            val at = text.indexOf(mark, from)
            if (at < 0) continue
            val current = best
            if (current == null || at < current.start || (at == current.start && at + mark.length > current.end)) {
                best = Hit(r, at, at + mark.length)
            }
        }
        return best
    }

    /** Parte un texto donde aparece `@Etiqueta`. */
    fun split(text: String, refs: List<ChatRefDto>): List<Piece> {
        val out = ArrayList<Piece>()
        var pos = 0
        while (pos < text.length) {
            val hit = nextIn(text, pos, refs)
            if (hit == null) {
                out.add(Piece.Plain(text.substring(pos)))
                break
            }
            if (hit.start > pos) out.add(Piece.Plain(text.substring(pos, hit.start)))
            out.add(Piece.Chip(hit.ref))
            pos = hit.end
        }
        return out
    }

    /** Sin acceso (o sin tarjeta todavía) se queda como etiqueta apagada, sin liga ni detalle. */
    fun chipState(r: ChatRefDto): ChipState = when {
        r.missing == true -> ChipState.MISSING
        r.canOpen != false && !r.href.isNullOrBlank() -> ChipState.OPEN
        else -> ChipState.LOCKED
    }

    /** Debajo del mensaje: solo lo que esta persona puede abrir. */
    fun cards(refs: List<ChatRefDto>): List<ChatRefDto> = refs.filter { it.canOpen == true && it.missing != true }

    /** Lo elegido en el selector que sigue escrito en el texto al enviar. */
    fun inText(text: String, picked: Collection<ChatRefDto>): List<ChatRefDto> =
        picked.filter { it.label.isNotBlank() && text.contains("@" + it.label) }.distinctBy { it.key }.take(MAX_PER_MESSAGE)

    fun inputs(refs: List<ChatRefDto>): List<RefInput> = refs.map { RefInput(it.kind, it.id) }

    /** Las tarjetas ya pedidas van sobre las del mensaje; `label` es lo escrito y no cambia. */
    fun view(refs: List<ChatRefDto>?, cards: Map<String, ChatRefDto>): List<ChatRefDto> = refs.orEmpty().map { r ->
        val card = cards[r.key] ?: return@map r
        card.copy(label = r.label.ifBlank { card.label }, title = card.title?.takeIf { it.isNotBlank() } ?: r.label)
    }

    /**
     * Lo que llega por socket trae solo la etiqueta: no borra la tarjeta que ya se tenía (una
     * reacción reenvía el mensaje entero). Sin el campo se conserva lo que había.
     */
    fun keepResolved(incoming: List<ChatRefDto>?, known: List<ChatRefDto>?): List<ChatRefDto>? {
        if (incoming == null) return known
        if (known.isNullOrEmpty()) return incoming
        val byKey = known.associateBy { it.key }
        return incoming.map { r ->
            val old = byKey[r.key]
            if (r.resolved == false && old != null && old.resolved != false) old.copy(label = r.label.ifBlank { old.label }) else r
        }
    }

    /** Lo que falta pedir: sin resolver, sin tarjeta y sin haberlo pedido ya. Una vez cada cosa. */
    fun unresolved(messages: List<ChatMessage>, cards: Map<String, ChatRefDto>, asked: Set<String> = emptySet()): List<RefInput> {
        val out = LinkedHashMap<String, RefInput>()
        for (m in messages) {
            for (r in m.refs.orEmpty()) {
                if (r.resolved == false && r.id.isNotBlank() && r.key !in cards && r.key !in asked) out[r.key] = RefInput(r.kind, r.id)
            }
        }
        return out.values.toList()
    }

    /** Resultados del selector agrupados por tipo. Un tipo que esta versión no conoce no se ofrece. */
    fun grouped(results: List<ChatRefDto>): List<Group> = GROUPS.mapNotNull { (kind, title) ->
        results.filter { it.kind == kind }.takeIf { it.isNotEmpty() }?.let { Group(kind, title, it) }
    }

    /** ¿Lo que sigue a la arroba ya es algo elegido («@Luces hola»)? Entonces no se vuelve a sugerir. */
    fun alreadyWritten(query: String, labels: Collection<String>): Boolean =
        labels.any { it.isNotBlank() && query.startsWith("$it ") }

    /**
     * Aplica [transform] sin tocar las etiquetas: la tarea «Ana Ruiz contrato» no debe volverse
     * mención de la persona Ana Ruiz, o el chip ya no se encontraría en el cuerpo.
     */
    fun protectingLabels(text: String, labels: Collection<String>, transform: (String) -> String): String {
        val holds = labels.filter { it.isNotBlank() }.distinct().sortedByDescending { it.length }
            .mapIndexed { i, label -> "@$label" to "$i" }
        var out = text
        holds.forEach { (mark, hold) -> out = out.replace(mark, hold) }
        out = transform(out)
        holds.forEach { (mark, hold) -> out = out.replace(hold, mark) }
        return out
    }

    // ─── Borradores: las referencias sobreviven a salir de la conversación ──

    fun encodeDraft(refs: List<ChatRefDto>): String = refs.joinToString("\n") { "${it.kind}\t${it.id}\t${it.label}" }

    fun decodeDraft(raw: String?): List<ChatRefDto> = raw.orEmpty().lineSequence().mapNotNull { line ->
        val parts = line.split('\t', limit = 3)
        if (parts.size == 3 && parts.all { it.isNotBlank() }) {
            ChatRefDto(kind = parts[0], id = parts[1], label = parts[2], resolved = false)
        } else {
            null
        }
    }.toList()
}
