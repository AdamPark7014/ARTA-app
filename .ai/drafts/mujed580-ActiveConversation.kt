class ActiveConversation {
    private val uploadQueue: MutableList<Pair<ByteArray, String>> = mutableListOf()

    fun addToQueue(prepare: ByteArray, caption: String) {
        validateUpload(prepare, caption)
        uploadQueue.add(Pair(prepare, caption))
    }

    private fun validateUpload(prepare: ByteArray, caption: String) {
        if (prepare.isEmpty()) throw IllegalStateException("Prepare data cannot be empty")
        if (caption.isBlank()) throw IllegalStateException("Caption cannot be blank")
    }

    fun getUploadQueue(): List<Pair<ByteArray, String>> {
        return uploadQueue.toList()
    }
}