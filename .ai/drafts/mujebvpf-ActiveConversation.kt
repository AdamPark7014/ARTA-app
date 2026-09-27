package com.example.chatapp

import android.content.Context
import android.os.Bundle
import android.widget.Button
import android.widget.ListView
import androidx.appcompat.app.AppCompatActivity
import com.example.chatapp.adapters.MessageAdapter
import com.example.chatapp.models.Message
import com.example.chatapp.models.MessageType
import com.example.chatapp.services.AttachmentService
import com.example.chatapp.services.MessageService
import com.example.chatapp.services.StreamingUploadService
import com.example.chatapp.services.VoiceNoteService
import com.example.chatapp.utils.FileUtils
import com.example.chatapp.utils.ProgressDialogUtil
import java.io.File

class ActiveConversationActivity : AppCompatActivity() {

    private lateinit var messageListView: ListView
    private lateinit var messageAdapter: MessageAdapter
    private lateinit var messageService: MessageService
    private lateinit var attachmentService: AttachmentService
    private lateinit var streamingUploadService: StreamingUploadService
    private lateinit var voiceNoteService: VoiceNoteService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_active_conversation)

        messageListView = findViewById(R.id.messageListView)
        val sendMessageButton = findViewById<Button>(R.id.sendMessageButton)

        messageAdapter = MessageAdapter(this, mutableListOf())
        messageListView.adapter = messageAdapter

        messageService = MessageService()
        attachmentService = AttachmentService()
        streamingUploadService = StreamingUploadService(this)
        voiceNoteService = VoiceNoteService(this)

        sendMessageButton.setOnClickListener {
            // Handle send message logic
        }

        // Simulate receiving messages
        val messages = mutableListOf(
            Message("Hello!", MessageType.TEXT),
            Message(FileUtils.getFilePathForAttachment(this, "video.mp4"), MessageType.VIDEO),
            Message(FileUtils.getFilePathForAttachment(this, "audio.mp3"), MessageType.AUDIO),
            Message(FileUtils.getFilePathForAttachment(this, "voice_note.wav"), MessageType.VOICE_NOTE)
        )
        messageAdapter.addAll(messages)
    }

    fun sendAttachment(file: File, mimeType: String) {
        when (mimeType) {
            "video/mp4", "audio/mpeg", "audio/x-wav" -> {
                attachmentService.sendAttachment(file, mimeType)
            }
            else -> {
                // Handle unsupported attachment type
            }
        }
    }

    fun startStreamingUpload(file: File) {
        streamingUploadService.startStreamingUpload(file) { progress ->
            ProgressDialogUtil.showProgressDialog(this, "Uploading...", progress)
        }
    }

    fun sendVoiceNote(file: File) {
        voiceNoteService.sendVoiceNote(file)
    }
}