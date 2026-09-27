package com.artaproducciones.ops.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.RemoteException
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import com.artaproducciones.ops.model.PostMessageBody
import com.artaproducciones.ops.api.ApiClient

class NotificationActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val channelId = intent.getStringExtra("channelId")
        val action = intent.action

        when (action) {
            ACTION_REPLY -> {
                val replyText = intent.getCharSequenceExtra("reply_text")
                if (replyText != null) {
                    GlobalScope.launch(Dispatchers.IO) {
                        try {
                            ApiClient.api.post(channelId!!, PostMessageBody(body = replyText.toString()))
                            appendToNotification(context, channelId, replyText.toString())
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                }
            }
            ACTION_MARK_READ -> {
                GlobalScope.launch(Dispatchers.IO) {
                    try {
                        ApiClient.api.markRead(channelId!!)
                        cancelNotification(context, channelId)
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }
        }
    }

    private fun appendToNotification(context: Context, channelId: String, replyText: String) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("New Message")
            .setContentText(replyText)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)

        val remoteViews = RemoteViews(context.packageName, R.layout.custom_notification)
        remoteViews.setTextViewText(R.id.reply_text, replyText)
        builder.setContent(remoteViews)

        notificationManager.notify(channelId.toInt(), builder.build())
    }

    private fun cancelNotification(context: Context, channelId: String) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(channelId.toInt())
    }

    companion object {
        const val ACTION_REPLY = "com.artaproducciones.ops.ACTION_REPLY"
        const val ACTION_MARK_READ = "com.artaproducciones.ops.ACTION_MARK_READ"
    }
}