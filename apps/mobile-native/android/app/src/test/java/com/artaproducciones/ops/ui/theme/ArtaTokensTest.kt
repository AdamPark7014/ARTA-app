package com.artaproducciones.ops.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.luminance
import com.artaproducciones.ops.data.BizEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Sistema visual aprobado (docs/diseno/SISTEMA-VISUAL.md): ARTA claro, Auditorio oscuro, contraste AA. */
class ArtaTokensTest {
    private fun contrast(fg: Color, bg: Color): Double {
        val a = fg.compositeOver(bg).luminance() + 0.05
        val b = bg.luminance() + 0.05
        return maxOf(a, b) / minOf(a, b)
    }

    private fun assertAA(name: String, fg: Color, bg: Color) {
        val ratio = contrast(fg, bg)
        assertTrue("$name: contraste $ratio < 4.5", ratio >= 4.5)
    }

    @Test
    fun eachEntityHasItsOwnMode() {
        assertEquals(ArtaTokens.ARTA, ArtaTokens.of(BizEntity.ARTA))
        assertEquals(ArtaTokens.AUDITORIO, ArtaTokens.of(BizEntity.EXPLANADA))
        assertFalse(ArtaTokens.ARTA.isDark)
        assertTrue(ArtaTokens.AUDITORIO.isDark)
    }

    @Test
    fun artaIsPaperAndInkWithPills() {
        val t = ArtaTokens.ARTA
        assertEquals(Color(0xFFF7F6F3), t.bg)
        assertEquals(Color(0xFF0C0C0D), t.accent)
        assertEquals(Color.White, t.onAccent)
        assertNull(t.controlRadius)
        assertEquals(16f, t.cardRadius.value)
    }

    @Test
    fun auditorioIsDarkSilverAndStraight() {
        val t = ArtaTokens.AUDITORIO
        assertEquals(Color(0xFF08080A), t.bg)
        assertEquals(Color(0xFFC7CCD4), t.accent)
        assertEquals(Color(0xFF0A0A0B), t.onAccent)
        assertEquals(4f, t.controlRadius?.value)
        assertEquals(6f, t.cardRadius.value)
    }

    @Test
    fun textMeetsAaInBothEntities() {
        listOf(ArtaTokens.ARTA, ArtaTokens.AUDITORIO).forEach { t ->
            val n = t.entity.short
            assertAA("$n texto/fondo", t.text, t.bg)
            assertAA("$n texto/superficie", t.text, t.surface)
            assertAA("$n secundario/fondo", t.secondary, t.bg)
            assertAA("$n secundario/superficie", t.secondary, t.surface)
            assertAA("$n acento/fondo", t.accent, t.bg)
            assertAA("$n sobre acento", t.onAccent, t.accent)
            assertAA("$n peligro/fondo", t.danger, t.bg)
            assertAA("$n mi burbuja", t.onMine, t.mine)
        }
    }

    @Test
    fun insideMyBubbleTextStaysReadable() {
        listOf(ArtaTokens.ARTA, ArtaTokens.AUDITORIO).forEach { t ->
            val inside = t.inMine()
            assertAA("${t.entity.short} texto en burbuja", inside.text, t.mine)
            assertAA("${t.entity.short} secundario en burbuja", inside.secondary, t.mine)
        }
    }
}
