import androidx.compose.foundation.layout.*
import androidx.compose.material.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController

@Composable
fun ActiveConversationScreen(navController: NavController) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Active Conversation") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            // Attach sheet launchers
            Row {
                Button(onClick = { /* Launch attach sheet */ }) {
                    Text("Attach")
                }
                Spacer(modifier = Modifier.weight(1f))
                Button(onClick = { /* Launch voice recording sheet */ }) {
                    Text("Record")
                }
                Spacer(modifier = Modifier.weight(1f))
                Button(onClick = { /* Launch media viewer sheet */ }) {
                    Text("Media")
                }
            }

            // Placeholder for conversation content
            Text("Conversation content goes here")
        }
    }
}