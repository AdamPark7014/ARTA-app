package com.artaproducciones.ops.ui.chat

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.style.TextDecoration
import com.artaproducciones.ops.data.api.ChatRefDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dónde cae el chip dentro del formato del mensaje (contrato chat v2, §7 y §9). */
class ChatMarkdownChipsTest {
    private val open = ChatRefDto(kind = "task", id = "t1", label = "Luces", canOpen = true, href = "/tasks?task=t1")
    private var opened: ChatRefDto? = null

    private fun chips(vararg refs: ChatRefDto) = RefChips(refs.toList(), Color.Gray) { opened = it }

    /** Espacio fino + ícono + espacio fino + etiqueta + espacio fino; la arroba no se ve. */
    private fun chip(label: String) = " � $label "

    @Test
    fun theLabelBecomesAChipThatOpensItsLink() {
        val text = inlineMarkdown("revisa @Luces hoy", chips(open))
        assertEquals("revisa ${chip("Luces")} hoy", text.text)
        val link = text.getLinkAnnotations(0, text.length).single().item as LinkAnnotation.Clickable
        link.linkInteractionListener!!.onClick(link)
        assertEquals(open, opened)
    }

    @Test
    fun withoutAccessOrIfItIsGoneThereIsNothingToTap() {
        val locked = inlineMarkdown("@Luces", chips(open.copy(canOpen = false)))
        assertEquals(chip("Luces"), locked.text)
        assertTrue(locked.getLinkAnnotations(0, locked.length).isEmpty())

        val gone = inlineMarkdown("@Luces", chips(open.copy(missing = true)))
        assertTrue(gone.getLinkAnnotations(0, gone.length).isEmpty())
        assertTrue(gone.spanStyles.any { it.item.textDecoration == TextDecoration.LineThrough })
    }

    @Test
    fun itRespectsTheMessageFormat() {
        // Dentro de código no se aplica nada; dentro de negritas, sí.
        assertEquals(" @Luces ", inlineMarkdown("`@Luces`", chips(open)).text)
        assertEquals(chip("Luces"), inlineMarkdown("*@Luces*", chips(open)).text)
        // Una persona con el mismo nombre sigue siendo persona.
        assertEquals(" @Luces ", inlineMarkdown("[@Luces](user:u1)", chips(open)).text)
    }

    @Test
    fun aRefNamedLikeTheChannelMentionIsStillARef() {
        val canal = open.copy(id = "t2", label = "canal de ventas")
        assertEquals(chip("canal de ventas"), inlineMarkdown("@canal de ventas", chips(canal)).text)
    }

    @Test
    fun withoutRefsNothingChanges() {
        assertEquals("revisa @Luces hoy", inlineMarkdown("revisa @Luces hoy").text)
        assertEquals("revisa @Luces hoy", inlineMarkdown("revisa @Luces hoy", chips(open.copy(label = "Otra"))).text)
    }
}
