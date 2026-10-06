-- Chat: reportar mensajes y bloquear personas (docs/chat-reportar-bloquear.md, Apple guía 1.2).
-- Solo aditivo: dos tablas nuevas con sus índices y llaves foráneas.

-- CreateTable
CREATE TABLE "ChatUserBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatUserBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "ChatReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "reporterId" TEXT NOT NULL,
    "messageId" TEXT,
    "reportedUserId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatUserBlock_blockedId_idx" ON "ChatUserBlock"("blockedId");

-- CreateIndex
CREATE INDEX "ChatReport_organizationId_status_createdAt_idx" ON "ChatReport"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ChatReport_messageId_idx" ON "ChatReport"("messageId");

-- AddForeignKey
ALTER TABLE "ChatUserBlock" ADD CONSTRAINT "ChatUserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatUserBlock" ADD CONSTRAINT "ChatUserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
