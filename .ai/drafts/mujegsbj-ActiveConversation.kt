@Composable
fun ActiveConversation() {
    var isMicPressed by remember { mutableStateOf(false) }

    Column {
        // Chat messages go here
        Spacer(modifier = Modifier.height(16.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            OutlinedTextField(
                value = "",
                onValueChange = {},
                label = { Text("Type a message") },
                modifier = Modifier.weight(1f),
                leadingIcon = {
                    Icon(
                        Icons.Default.Mic,
                        contentDescription = "Mic",
                        modifier = Modifier.clickable { isMicPressed = !isMicPressed }
                    )
                }
            )

            Spacer(modifier = Modifier.width(8.dp))

            Button(onClick = { /* Send message */ }) {
                Text("Send")
            }
        }
    }
}