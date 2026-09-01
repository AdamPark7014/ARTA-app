-- Evidencia + aprobación de tareas (entrega documentada)

ALTER TYPE "TaskStatus" ADD VALUE 'PENDING_APPROVAL';

ALTER TABLE "TaskAssignment" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "TaskAssignment" ADD COLUMN IF NOT EXISTS "completionNote" TEXT;
ALTER TABLE "TaskAssignment" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "TaskAssignment" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "TaskAssignment" ADD COLUMN IF NOT EXISTS "rejectedById" TEXT;
ALTER TABLE "TaskAssignment" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "TaskAssignment" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT;

ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "TaskEvidence" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "label" TEXT,
  "note" TEXT,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TaskActivity" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT,
  "metaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TaskEvidence_taskId_idx" ON "TaskEvidence"("taskId");
CREATE INDEX IF NOT EXISTS "TaskActivity_taskId_createdAt_idx" ON "TaskActivity"("taskId", "createdAt");

ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "TaskAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "TaskAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
