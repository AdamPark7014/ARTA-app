-- Chat v2 (docs/CHAT-V2-CONTRATO.md): responder citando, guardados, directos de grupo y no molestar.
-- Solo aditivo: columnas nuevas con valor por defecto o nulas y una tabla nueva.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "chatDndUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ChatChannel" ADD COLUMN "isGroupDm" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "replyToId" TEXT;

-- CreateTable
CREATE TABLE "ChatSavedMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSavedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSavedMessage_userId_messageId_key" ON "ChatSavedMessage"("userId", "messageId");

-- CreateIndex
CREATE INDEX "ChatSavedMessage_userId_createdAt_idx" ON "ChatSavedMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSavedMessage_messageId_idx" ON "ChatSavedMessage"("messageId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSavedMessage" ADD CONSTRAINT "ChatSavedMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSavedMessage" ADD CONSTRAINT "ChatSavedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
