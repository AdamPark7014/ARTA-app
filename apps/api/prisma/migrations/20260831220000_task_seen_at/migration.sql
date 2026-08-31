-- TaskAssignment.seenAt: assignee opened / saw the task
ALTER TABLE "TaskAssignment" ADD COLUMN IF NOT EXISTS "seenAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "TaskAssignment_createdById_status_idx" ON "TaskAssignment"("createdById", "status");
