import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type TaskRow = {
  id: string;
  assigneeId: string | null;
  createdById: string | null;
  organizationId: string | null;
};

/** Hay quien pidió y no es el mismo asignado → hace falta visto bueno. */
export function taskNeedsApproval(task: Pick<TaskRow, 'assigneeId' | 'createdById'>) {
  return !!task.createdById && task.createdById !== task.assigneeId;
}

export function canApproveTask(
  userId: string,
  roleKey: string,
  task: Pick<TaskRow, 'createdById'>,
) {
  if (task.createdById === userId) return true;
  return roleKey === 'super_admin' || roleKey === 'dir_general';
}

export async function logTaskActivity(
  prisma: PrismaService,
  taskId: string,
  actorId: string | undefined,
  action: string,
  detail?: string,
  metaJson?: Prisma.InputJsonValue,
) {
  await prisma.taskActivity.create({
    data: {
      taskId,
      actorId,
      action,
      detail,
      metaJson,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: `task.${action}`,
      resource: 'TaskAssignment',
      resourceId: taskId,
      metaJson: metaJson ?? { detail },
    },
  });
}

export function assertCanSubmit(userId: string, task: Pick<TaskRow, 'assigneeId'>) {
  if (task.assigneeId !== userId) {
    throw new ForbiddenException('Solo quien tiene la tarea puede entregarla');
  }
}

export function assertCanReview(
  userId: string,
  roleKey: string,
  task: Pick<TaskRow, 'createdById'>,
) {
  if (!canApproveTask(userId, roleKey, task)) {
    throw new ForbiddenException('Solo quien pidió la tarea puede aprobar o rechazar');
  }
}

export function assertEvidencePresent(
  completionNote: string | undefined,
  fileUrls: string[] | undefined,
  existingCount: number,
) {
  const hasNote = !!completionNote?.trim();
  const hasFiles = (fileUrls?.length || 0) + existingCount > 0;
  if (!hasNote && !hasFiles) {
    throw new BadRequestException('Agrega una nota de entrega o al menos un archivo de evidencia');
  }
}
