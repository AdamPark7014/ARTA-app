-- Referencias del chat: arrobar tareas, eventos, OC, formatos, documentos y anticipos.
-- Idempotente: en producción se aplicó a mano el 01-11-2026 para restablecer el chat.
CREATE TABLE IF NOT EXISTS "ChatMessageRef" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageRef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessageRef_messageId_kind_targetId_key" ON "ChatMessageRef"("messageId", "kind", "targetId");
CREATE INDEX IF NOT EXISTS "ChatMessageRef_kind_targetId_idx" ON "ChatMessageRef"("kind", "targetId");
CREATE INDEX IF NOT EXISTS "ChatMessageRef_channelId_createdAt_idx" ON "ChatMessageRef"("channelId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessageRef_messageId_fkey') THEN
    ALTER TABLE "ChatMessageRef" ADD CONSTRAINT "ChatMessageRef_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- De qué trata un aviso: sobre eso actúan sus botones.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "targetKind" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "targetId" TEXT;
