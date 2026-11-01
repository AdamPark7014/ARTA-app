package com.artaproducciones.ops.data

import com.artaproducciones.ops.data.api.ChatAuthor
import com.artaproducciones.ops.data.api.ChatMessage
import com.artaproducciones.ops.data.api.ChatRefDto
import com.artaproducciones.ops.data.api.RefBacklinks
import com.artaproducciones.ops.data.api.RefInput
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** Debe decir lo mismo que `apps/web/components/chat/chat-refs.ts` y `docs/CHAT-V2-CONTRATO.md` §9. */
class ChatRefsTest {
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private fun ref(label: String, kind: String = "task", id: String = label) = ChatRefDto(kind = kind, id = id, label = label)

    private fun msg(id: String, vararg refs: ChatRefDto) =
        ChatMessage(id = id, channelId = "c", createdAt = "2026-11-01T12:00:00Z", author = ChatAuthor("a", "Ana"), refs = refs.toList())

    // ─── Decodificar: el API de producción todavía no manda nada de esto ─────

    @Test
    fun aMessageFromTheOldApiDecodesWithoutRefs() {
        val json = """{"id":"m1","channelId":"c1","body":"hola","createdAt":"2026-11-01T12:00:00Z","author":{"id":"a","fullName":"Ana"}}"""
        val m = moshi.adapter(ChatMessage::class.java).fromJson(json)!!
        assertEquals("hola", m.body)
        assertNull(m.refs)
        assertEquals(emptyList<ChatRefDto>(), ChatRefs.view(m.refs, emptyMap()))
    }

    @Test
    fun whatArrivesBySocketIsJustTheLabel() {
        val json = """{"id":"m1","channelId":"c1","createdAt":"2026-11-01T12:00:00Z","author":{"id":"a","fullName":"Ana"},
            "refs":[{"kind":"task","id":"t1","label":"Cotizar luces","resolved":false,"canOpen":false,"href":null,"people":[],"actions":[]}]}"""
        val r = moshi.adapter(ChatMessage::class.java).fromJson(json)!!.refs!!.single()
        assertEquals("task:t1", r.key)
        assertEquals(false, r.resolved)
        assertEquals(ChatRefs.ChipState.LOCKED, ChatRefs.chipState(r))
    }

    @Test
    fun aFullCardDecodesAndUnknownFieldsOrKindsDoNotBreakIt() {
        val json = """{"kind":"po","id":"p1","label":"OC 123","title":"Audio","resolved":true,"canOpen":true,"missing":false,
            "href":"/purchase-orders?po=p1","status":"PENDING_AUTH","statusLabel":"Por autorizar","tone":"action","subtitle":"Yamaha",
            "dueAt":null,"progress":33.5,"people":[{"id":"u","fullName":"Luis"}],"amount":"$ 1,000.00","actions":["approve","algo-nuevo"],"campoNuevo":7}"""
        val r = moshi.adapter(ChatRefDto::class.java).fromJson(json)!!
        assertEquals(33.5, r.progress!!, 0.001)
        assertEquals("Luis", r.people!!.single().fullName)
        assertEquals(listOf("approve", "algo-nuevo"), r.actions)
        assertEquals(ChatRefDto(), moshi.adapter(ChatRefDto::class.java).fromJson("{}"))
    }

    @Test
    fun backlinksDecodeWithOrWithoutTheList() {
        val adapter = moshi.adapter(RefBacklinks::class.java)
        assertNull(adapter.fromJson("{}")!!.links)
        val link = adapter.fromJson("""{"links":[{"messageId":"m","channelId":"c","channelName":"#produccion","href":"/chat?channel=c&msg=m"}]}""")!!.links!!.single()
        assertEquals("/chat?channel=c&msg=m", link.href)
        assertNull(link.author)
    }

    // ─── Partir el texto en chips ────────────────────────────────────────────

    @Test
    fun splitsTheBodyAroundEachLabel() {
        val luces = ref("Cotizar luces")
        val show = ref("Noche de Boleros", kind = "event")
        assertEquals(
            listOf(
                ChatRefs.Piece.Plain("revisa "),
                ChatRefs.Piece.Chip(luces),
                ChatRefs.Piece.Plain(" para "),
                ChatRefs.Piece.Chip(show),
            ),
            ChatRefs.split("revisa @Cotizar luces para @Noche de Boleros", listOf(luces, show)),
        )
    }

    @Test
    fun theLongestLabelWinsAtTheSamePlace() {
        val corta = ref("Luces")
        val larga = ref("Luces 2")
        assertEquals(
            listOf(ChatRefs.Piece.Chip(larga), ChatRefs.Piece.Plain(" y "), ChatRefs.Piece.Chip(corta)),
            ChatRefs.split("@Luces 2 y @Luces", listOf(corta, larga)),
        )
    }

    @Test
    fun withoutLabelsTheTextStaysWhole() {
        assertEquals(listOf(ChatRefs.Piece.Plain("sin nada")), ChatRefs.split("sin nada", listOf(ref("Luces"))))
        assertEquals(listOf(ChatRefs.Piece.Plain("a @b")), ChatRefs.split("a @b", listOf(ref(""))))
        assertEquals(emptyList<ChatRefs.Piece>(), ChatRefs.split("", listOf(ref("Luces"))))
        assertNull(ChatRefs.nextIn("@Luces", 1, listOf(ref("Luces"))))
    }

    // ─── Estados y tarjetas ──────────────────────────────────────────────────

    @Test
    fun chipStateFollowsAccess() {
        val open = ChatRefDto(kind = "task", id = "1", label = "x", canOpen = true, href = "/tasks?task=1")
        assertEquals(ChatRefs.ChipState.OPEN, ChatRefs.chipState(open))
        assertEquals(ChatRefs.ChipState.LOCKED, ChatRefs.chipState(open.copy(canOpen = false)))
        assertEquals(ChatRefs.ChipState.LOCKED, ChatRefs.chipState(open.copy(href = null)))
        assertEquals(ChatRefs.ChipState.MISSING, ChatRefs.chipState(open.copy(missing = true)))
    }

    @Test
    fun onlyWhatICanOpenGetsACard() {
        val mine = ref("a").copy(canOpen = true)
        val locked = ref("b").copy(canOpen = false)
        val gone = ref("c").copy(canOpen = true, missing = true)
        val stub = ref("d")
        assertEquals(listOf(mine), ChatRefs.cards(listOf(mine, locked, gone, stub)))
    }

    @Test
    fun aCardKeepsWhatWasWrittenAndShowsTodaysName() {
        val written = ref("Cotizar luces", id = "t1").copy(resolved = false)
        val card = ChatRefDto(kind = "task", id = "t1", label = "Cotizar luces y audio", title = "Cotizar luces y audio", canOpen = true)
        val shown = ChatRefs.view(listOf(written), mapOf(card.key to card)).single()
        assertEquals("Cotizar luces", shown.label)
        assertEquals("Cotizar luces y audio", shown.title)
        assertEquals(true, shown.canOpen)

        // «Ya no existe»: la tarjeta llega sin etiqueta y el chip se sigue encontrando.
        val gone = ChatRefDto(kind = "task", id = "t1", label = "", missing = true)
        assertEquals("Cotizar luces", ChatRefs.view(listOf(written), mapOf(gone.key to gone)).single().title)
        assertEquals(emptyList<ChatRefDto>(), ChatRefs.view(null, mapOf(gone.key to gone)))
    }

    @Test
    fun aSocketUpdateDoesNotEraseAResolvedCard() {
        val known = listOf(ChatRefDto(kind = "task", id = "t1", label = "Luces", title = "Luces", resolved = true, canOpen = true))
        val stub = listOf(ChatRefDto(kind = "task", id = "t1", label = "Luces", resolved = false))
        assertEquals(known, ChatRefs.keepResolved(stub, known))

        val fresh = listOf(ChatRefDto(kind = "task", id = "t1", label = "Luces", resolved = true, statusLabel = "Terminada"))
        assertEquals(fresh, ChatRefs.keepResolved(fresh, known))
        // Sin el campo (API viejo) se queda lo que había; lista vacía sí es «se quitaron».
        assertSame(known, ChatRefs.keepResolved(null, known))
        assertEquals(emptyList<ChatRefDto>(), ChatRefs.keepResolved(emptyList(), known))
        assertSame(stub, ChatRefs.keepResolved(stub, null))
    }

    @Test
    fun asksOnceForEachThingWithoutACard() {
        val stub1 = ChatRefDto(kind = "task", id = "t1", label = "Luces", resolved = false)
        val stub2 = ChatRefDto(kind = "po", id = "p1", label = "OC", resolved = false)
        val resolved = ChatRefDto(kind = "event", id = "e1", label = "Show", resolved = true)
        val messages = listOf(msg("a", stub1, resolved), msg("b", stub1, stub2), msg("c"))
        assertEquals(listOf(RefInput("task", "t1"), RefInput("po", "p1")), ChatRefs.unresolved(messages, emptyMap()))
        assertEquals(listOf(RefInput("po", "p1")), ChatRefs.unresolved(messages, mapOf(stub1.key to stub1)))
        assertEquals(listOf(RefInput("task", "t1")), ChatRefs.unresolved(messages, emptyMap(), asked = setOf(stub2.key)))
        val noRefs = ChatMessage(id = "x", channelId = "c", createdAt = "2026-11-01T12:00:00Z", author = ChatAuthor("a", "Ana"))
        assertEquals(emptyList<RefInput>(), ChatRefs.unresolved(listOf(noRefs), emptyMap()))
    }

    // ─── Redactor ────────────────────────────────────────────────────────────

    @Test
    fun onlyWhatIsStillWrittenTravels() {
        val a = ref("Cotizar luces")
        val b = ref("Rider")
        assertEquals(listOf(a), ChatRefs.inText("revisa @Cotizar luces hoy", listOf(a, b)))
        assertEquals(emptyList<ChatRefDto>(), ChatRefs.inText("ya sin nada", listOf(a, b)))
        assertEquals(listOf(RefInput("task", "Rider")), ChatRefs.inputs(listOf(b)))
    }

    @Test
    fun neverMoreThanTheApiAccepts() {
        val many = (1..12).map { ref("Cosa $it", id = "$it") }
        val text = many.joinToString(" ") { "@" + it.label }
        assertEquals(ChatRefs.MAX_PER_MESSAGE, ChatRefs.inText(text, many).size)
    }

    @Test
    fun theSelectorGroupsByKindInTheWebOrder() {
        val results = listOf(ref("OC", kind = "po"), ref("T1"), ref("Show", kind = "event"), ref("T2"), ref("Raro", kind = "nuevo"))
        val groups = ChatRefs.grouped(results)
        assertEquals(listOf("Tareas", "Eventos", "Órdenes de compra"), groups.map { it.title })
        assertEquals(listOf("T1", "T2"), groups.first().items.map { it.label })
    }

    @Test
    fun whatWasPickedIsNotSuggestedAgain() {
        assertTrue(ChatRefs.alreadyWritten("Luces ", listOf("Luces")))
        assertTrue(ChatRefs.alreadyWritten("Luces hola", listOf("Otra", "Luces")))
        assertFalse(ChatRefs.alreadyWritten("Luces", listOf("Luces")))
        assertFalse(ChatRefs.alreadyWritten("Lu", listOf("Luces")))
    }

    @Test
    fun aLabelIsNotTurnedIntoAPersonMention() {
        val out = ChatRefs.protectingLabels("@Ana Ruiz contrato y @Ana Ruiz", listOf("Ana Ruiz contrato")) { it.replace("@Ana Ruiz", "[@Ana Ruiz](user:u1)") }
        assertEquals("@Ana Ruiz contrato y [@Ana Ruiz](user:u1)", out)
        assertEquals("hola", ChatRefs.protectingLabels("hola", emptyList()) { it })
    }

    @Test
    fun draftsKeepTheirRefs() {
        val refs = listOf(ref("Cotizar luces", id = "t1"), ref("Show", kind = "event", id = "e1"))
        val back = ChatRefs.decodeDraft(ChatRefs.encodeDraft(refs))
        assertEquals(listOf("task:t1", "event:e1"), back.map { it.key })
        assertEquals("Cotizar luces", back.first().label)
        assertEquals(emptyList<ChatRefDto>(), ChatRefs.decodeDraft(null))
        assertEquals(emptyList<ChatRefDto>(), ChatRefs.decodeDraft("basura"))
    }
}
