package com.artaproducciones.ops.ui.chat

import com.artaproducciones.ops.data.api.ChatAttachment
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AttachmentNamesTest {

    @Test
    fun keepsAllowedNames() {
        assertEquals("cotización.pdf", AttachmentNames.fileNameFor("cotización.pdf", "application/pdf"))
        assertEquals("Presupuesto.XLSX", AttachmentNames.fileNameFor("Presupuesto.XLSX", "application/octet-stream"))
    }

    @Test
    fun addsExtensionFromMimeWhenProviderHasNoName() {
        assertEquals("archivo.mp4", AttachmentNames.fileNameFor(null, "video/mp4"))
        assertEquals("1000012345.jpg", AttachmentNames.fileNameFor("1000012345", "image/jpeg"))
        assertEquals("grabacion.m4a", AttachmentNames.fileNameFor("grabacion", "audio/mp4"))
        assertEquals("clip.mov", AttachmentNames.fileNameFor("clip", "video/quicktime"))
        assertEquals("doc.docx", AttachmentNames.fileNameFor("doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
        assertEquals("x.ogg", AttachmentNames.fileNameFor("x", "application/x-unknown", fallbackExt = "ogg"))
    }

    @Test
    fun rejectsWhatTheApiRejects() {
        assertFalse(AttachmentNames.isAllowed(AttachmentNames.fileNameFor("setup.exe", "application/x-msdownload")))
        assertFalse(AttachmentNames.isAllowed(AttachmentNames.fileNameFor("pagina", "text/html")))
        assertTrue(AttachmentNames.isAllowed("nota-de-voz-1.m4a"))
    }

    @Test
    fun stripsPathCharacters() {
        assertEquals("a_b.pdf", AttachmentNames.fileNameFor("a/b.pdf", "application/pdf"))
    }

    @Test
    fun attachmentKindsFromMimeOrExtension() {
        assertTrue(ChatAttachment("/uploads/chat/1.mp4", "v.mp4", "video/mp4").isVideo)
        assertTrue(ChatAttachment("/uploads/chat/1.m4a", "nota-de-voz-1.m4a", "audio/mp4").isVoiceNote)
        assertFalse(ChatAttachment("/uploads/chat/1.mp3", "cancion.mp3", "audio/mpeg").isVoiceNote)
        assertTrue(ChatAttachment("/uploads/chat/1.heic", "foto.heic").isImage)
        assertFalse(ChatAttachment("/uploads/chat/1.pdf", "x.pdf", "application/pdf").isImage)
    }
}
