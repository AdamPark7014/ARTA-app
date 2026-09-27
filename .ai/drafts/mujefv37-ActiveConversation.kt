import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.graphics.Color

@Composable
fun ActiveConversationScreen() {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Active Conversation") },
                actions = {
                    IconButton(onClick = { /* Handle share action */ }) {
                        Icon(Icons.Filled.Share, contentDescription = "Share")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { /* Handle mic action */ }) {
                Icon(Icons.Filled.Mic, contentDescription = "Mic")
            }
        },
        content = { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                // Conversation messages will be displayed here
            }
        }
    )
}

@Composable
fun MediaViewerDialog() {
    Dialog(onDismissRequest = { /* Handle dialog dismissal */ }) {
        Surface(
            shape = MaterialTheme.shapes.small,
            color = Color.White
        ) {
            Column {
                // Media viewer content will be displayed here
            }
        }
    }
}

@Preview
@Composable
fun PreviewActiveConversationScreen() {
    ActiveConversationScreen()
}

@Preview
@Composable
fun PreviewMediaViewerDialog() {
    MediaViewerDialog()
}