package com.example.conversation

import androidx.annotation.Keep
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.example.conversation.ui.theme.ActiveConversationTheme

@Keep
@Composable
fun ActiveConversation(
    @StringRes title: Int,
    onBackClick: () -> Unit
) {
    ActiveConversationTheme {
        // TODO: Implement conversation UI
    }
}

@Preview(showBackground = true)
@Composable
fun ActiveConversationPreview() {
    ActiveConversation(
        title = R.string.conversation_title,
        onBackClick = {}
    )
}