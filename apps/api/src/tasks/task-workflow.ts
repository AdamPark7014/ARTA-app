import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { isDirectionRole } from '../common/rbac/roles';

type TaskRow = {
  id: string;
  assigneeId: string | null;
  createdById: string | null;
  organizationId: string | null;
  /** Más responsables (correcciones 30-09-2026). */
  coAssignees?: Array<{ userId: string }> | null;
};

/** Todos los responsables de la tarea: el principal primero, sin repetir. */
export function taskAssigneeIds(task: Pick<TaskRow, 'assigneeId' | 'coAssignees'>): string[] {
  const ids = [task.assigneeId, ...(task.coAssignees ?? []).map((c) => c.userId)].filter(
    (id): id is string => !!id,
  );
  return [...new Set(ids)];
}

export function isTaskAssignee(userId: string, task: Pick<TaskRow, 'assigneeId' | 'coAssignees'>) {
  return taskAssigneeIds(task).includes(userId);
}

type Person = { id: string; fullName: string; email?: string | null };

/**
 * Lo que el panel lee de una tarea con varias personas: `assigneeIds` y
 * `assignees` (el principal primero). Se calcula aquí para que el panel no
 * tenga que juntar `assignee` con `coAssignees` en cada pantalla.
 */
export function withAssignees<
  T extends {
    assigneeId: string | null;
    assignee?: Person | null;
    coAssignees?: Array<{ userId: string; user?: Person | null }> | null;
  },
>(task: T): T & { assigneeIds: string[]; assignees: Person[] } {
  const people: Person[] = [];
  const seen = new Set<string>();
  for (const p of [task.assignee, ...(task.coAssignees ?? []).map((c) => c.user)]) {
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      people.push(p);
    }
  }
  return { ...task, assigneeIds: taskAssigneeIds(task), assignees: people };
}

/**
 * Lista de responsables como llega del panel: sin vacíos ni repetidos, en el
 * orden elegido (el primero queda como responsable principal).
 */
export function normalizeAssigneeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const clean = ids.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim());
  return [...new Set(clean)];
}

/** Hay quien pidió y no está entre los responsables → hace falta visto bueno. */
export function taskNeedsApproval(task: Pick<TaskRow, 'assigneeId' | 'createdById' | 'coAssignees'>) {
  return !!task.createdById && !isTaskAssignee(task.createdById, task);
}

export function canApproveTask(
  userId: string,
  roleKey: string,
  task: Pick<TaskRow, 'createdById'>,
) {
  if (task.createdById === userId) return true;
  return isDirectionRole(roleKey);
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

export function assertCanSubmit(userId: string, task: Pick<TaskRow, 'assigneeId' | 'coAssignees'>) {
  if (!isTaskAssignee(userId, task)) {
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
