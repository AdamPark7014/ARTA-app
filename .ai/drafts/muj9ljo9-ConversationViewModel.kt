package com.artaproducciones.ops.ui.chat

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.models.Channel
import com.artaproducciones.ops.data.api.models.Message
import com.artaproducciones.ops.data.api.models.Reaction
import com.artaproducciones.ops.data.api.models.Thread
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.data.realtime.models.TypingIndicator
import com.artaproducciones.ops.data.realtime.models.ReadReceipt
import com.artaproducciones.ops.utils.*
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

class ConversationViewModel(application: Application) : AndroidViewModel(application) {

    private val apiClient = ApiClient.instance
    private val realtimeClient = RealtimeClient.instance
    private val coroutineExceptionHandler = CoroutineExceptionHandler { _, exception ->
        onError(exception)
    }

    private val _channel = MutableLiveData<Channel>()
    val channel: LiveData<Channel> = _channel

    private val _messages = MutableLiveData<List<Message>>()
    val messages: LiveData<List<Message>> = _messages

    private val _thread = MutableLiveData<Thread>()
    val thread: LiveData<Thread> = _thread

    private val _typingIndicators = MutableLiveData<Map<String, TypingIndicator>>()
    val typingIndicators: LiveData<Map<String, TypingIndicator>> = _typingIndicators

    private val _readReceipts = MutableLiveData<Map<String, ReadReceipt>>()
    val readReceipts: LiveData<Map<String, ReadReceipt>> = _readReceipts

    fun loadChannel(channelId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            val channel = apiClient.getChannel(channelId)
            _channel.value = channel
            loadMessages(channelId, null)
        }
    }

    fun loadMessages(channelId: String, beforeCursor: String?) {
        viewModelScope.launch(coroutineExceptionHandler) {
            val messages = apiClient.getMessages(channelId, beforeCursor)
            _messages.value = messages
        }
    }

    fun loadThread(channelId: String, threadId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            val thread = apiClient.getThread(channelId, threadId)
            _thread.value = thread
        }
    }

    fun sendTextMessage(channelId: String, text: String, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            val message = apiClient.sendMessage(channelId, text, clientId)
            _messages.value = _messages.value?.plus(message) ?: listOf(message)
        }
    }

    fun uploadAttachment(channelId: String, uri: Uri, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            val file = File(uri.path)
            val requestFile = file.asRequestBody("multipart/form-data".toMediaTypeOrNull())
            val body = MultipartBody.Part.createFormData("file", file.name, requestFile)
            val message = apiClient.uploadAttachment(channelId, body, clientId)
            _messages.value = _messages.value?.plus(message) ?: listOf(message)
        }
    }

    fun addReaction(channelId: String, messageId: String, reaction: Reaction, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            apiClient.addReaction(channelId, messageId, reaction, clientId)
        }
    }

    fun removeReaction(channelId: String, messageId: String, reaction: Reaction, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            apiClient.removeReaction(channelId, messageId, reaction, clientId)
        }
    }

    fun pinMessage(channelId: String, messageId: String, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            apiClient.pinMessage(channelId, messageId, clientId)
        }
    }

    fun unpinMessage(channelId: String, messageId: String, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            apiClient.unpinMessage(channelId, messageId, clientId)
        }
    }

    fun editMessage(channelId: String, messageId: String, text: String, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            val message = apiClient.editMessage(channelId, messageId, text, clientId)
            _messages.value = _messages.value?.map { if (it.id == messageId) message else it } ?: listOf(message)
        }
    }

    fun deleteMessage(channelId: String, messageId: String, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            apiClient.deleteMessage(channelId, messageId, clientId)
            _messages.value = _messages.value?.filterNot { it.id == messageId }
        }
    }

    fun muteChannel(channelId: String, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            apiClient.muteChannel(channelId, clientId)
        }
    }

    fun unmuteChannel(channelId: String, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            apiClient.unmuteChannel(channelId, clientId)
        }
    }

    fun sendTypingIndicator(channelId: String, clientId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            val typingIndicator = TypingIndicator(clientId)
            apiClient.sendTypingIndicator(channelId, typingIndicator)
            _typingIndicators.value = _typingIndicators.value?.plus(mapOf(channelId to typingIndicator))
            delay(2000)
            _typingIndicators.value = _typingIndicators.value?.minus(channelId)
        }
    }

    fun markRead(channelId: String) {
        viewModelScope.launch(coroutineExceptionHandler) {
            val lastReadAt = System.currentTimeMillis()
            apiClient.markRead(channelId, lastReadAt)
        }
    }

    fun onReconnect() {
        viewModelScope.launch(coroutineExceptionHandler) {
            val lastMessageId = _messages.value?.lastOrNull()?.id
            if (lastMessageId != null) {
                loadMessages(channel.value?.id.orEmpty(), lastMessageId)
            }
        }
    }

    private fun onError(exception: Exception) {
        // Handle error
    }
}