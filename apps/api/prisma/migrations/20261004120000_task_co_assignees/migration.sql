-- Correcciones 30-09-2026: una tarea puede asignarse a 1 o más personas.
-- Solo tabla nueva; `TaskAssignment.assigneeId` no cambia.

-- CreateTable
CREATE TABLE "TaskCoAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCoAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "TaskCoAssignee_userId_idx" ON "TaskCoAssignee"("userId");

-- AddForeignKey
ALTER TABLE "TaskCoAssignee" ADD CONSTRAINT "TaskCoAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCoAssignee" ADD CONSTRAINT "TaskCoAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
