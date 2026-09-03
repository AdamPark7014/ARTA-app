-- AlterTable
ALTER TABLE "EventFile" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "panelBlockReason" TEXT,
ADD COLUMN     "panelEditable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sha256" TEXT;

-- CreateIndex
CREATE INDEX "EventFile_eventId_deletedAt_idx" ON "EventFile"("eventId", "deletedAt");

-- AddForeignKey
ALTER TABLE "EventFile" ADD CONSTRAINT "EventFile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFile" ADD CONSTRAINT "EventFile_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
