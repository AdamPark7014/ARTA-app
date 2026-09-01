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
  createdById?: string | null;
  createdBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
  rejectedBy?: { id: string; fullName: string } | null;
  event?: { id: string; name: string; status: string; entity?: string } | null;
  evidences?: TaskEvidence[];
  activities?: TaskActivity[];
};

export function taskNeedsApproval(t: Pick<TaskRecord, 'assigneeId' | 'createdById'>) {
  return !!t.createdById && t.createdById !== t.assigneeId;
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
