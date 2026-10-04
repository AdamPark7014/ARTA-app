export type TaskEvidence = {
  id: string;
  fileUrl: string;
  label?: string | null;
  note?: string | null;
  createdAt?: string;
  uploadedBy?: { id: string; fullName: string } | null;
};

export type TaskActivity = {
  id: string;
  action: string;
  detail?: string | null;
  metaJson?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { id: string; fullName: string } | null;
};

export type TaskRecord = {
  id: string;
  title: string;
  module?: string | null;
  detail?: string | null;
  status: string;
  dueAt?: string | null;
  seenAt?: string | null;
  submittedAt?: string | null;
  completionNote?: string | null;
  rejectionNote?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; fullName: string; email?: string } | null;
  /** Todos los responsables, el principal primero (correcciones 30-09-2026). */
  assigneeIds?: string[];
  assignees?: Array<{ id: string; fullName: string; email?: string | null }>;
  createdById?: string | null;
  createdBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
  rejectedBy?: { id: string; fullName: string } | null;
  event?: { id: string; name: string; status: string; entity?: string } | null;
  evidences?: TaskEvidence[];
  activities?: TaskActivity[];
};

type AssigneeFields = Pick<TaskRecord, 'assigneeId' | 'assignee' | 'assigneeIds' | 'assignees'>;

/** Responsables de la tarea (1 o más), el principal primero. */
export function taskAssigneeIds(t: AssigneeFields): string[] {
  if (t.assigneeIds?.length) return t.assigneeIds;
  return t.assigneeId ? [t.assigneeId] : [];
}

export function taskAssigneeNames(t: AssigneeFields): string[] {
  if (t.assignees?.length) return t.assignees.map((p) => p.fullName);
  return t.assignee?.fullName ? [t.assignee.fullName] : [];
}

export function isTaskAssignee(t: AssigneeFields, userId?: string | null): boolean {
  return !!userId && taskAssigneeIds(t).includes(userId);
}

/** Hay quien pidió y no está entre los responsables → hace falta visto bueno. */
export function taskNeedsApproval(t: AssigneeFields & Pick<TaskRecord, 'createdById'>) {
  return !!t.createdById && !isTaskAssignee(t, t.createdById);
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierta',
  IN_PROGRESS: 'En curso',
  PENDING_APPROVAL: 'Por aprobar',
  DONE: 'Aprobada',
  BLOCKED: 'Bloqueada',
};

export const TASK_ACTION_LABEL: Record<string, string> = {
  created: 'Tarea creada',
  assigned: 'Asignada',
  reassigned: 'Reasignada',
  status_changed: 'Estado cambiado',
  submitted: 'Entregada para revisión',
  completed: 'Completada',
  approved: 'Aprobada',
  rejected: 'Rechazada — corrección pedida',
  evidence_added: 'Evidencia agregada',
  deleted: 'Eliminada',
};
