import { ForbiddenException } from '@nestjs/common';
import { DocStatus } from '@prisma/client';
import type { RoleKey } from './rbac/roles';

/**
 * El ÚNICO sitio donde se decide si un documento se puede escribir.
 *
 * Hay tres candados que se solapan —el estado del documento, el `locked` de la
 * corrida y el estado del evento— y si cada endpoint los comprobara por su
 * cuenta se reproduciría el bug que ya costó caro: la guarda de finanzas era
 * `if (existing.locked && body.locked !== false)`, así que mandando
 * `locked: false` junto con los datos se desbloqueaba y editaba en la misma
 * petición. Aquí se leen los tres juntos, una sola vez, y todo endpoint de
 * escritura pasa por esta función.
 */

export type WritableDoc = {
  status: DocStatus;
  /** Solo la corrida lo tiene; se conserva mientras `events` siga escribiéndolo. */
  locked?: boolean | null;
};

export type DocEvent = { status: string };

export type WriteBlock =
  | { reason: 'event_closed'; message: string }
  | { reason: 'approved'; message: string }
  | { reason: 'sealed'; message: string };

/** Quién puede aprobar y quién puede sellar o reabrir. */
const APPROVER_ROLES = new Set<string>([
  'dir_general',
  'super_admin',
  'gerente_arta',
  'dir_auditorio',
]);

const UNSEAL_ROLES = new Set<string>(['dir_general', 'super_admin']);

/**
 * ¿Por qué no se puede escribir? `null` = sí se puede.
 *
 * `REVIEW` **no** bloquea: es una bandera para pedir revisión, no un candado.
 * Si bloqueara, nadie cerraría su formato a las 23 h antes de un show porque
 * quien aprueba está dormido — y el atajo del equipo acabaría siendo editar la
 * base de datos.
 */
export function docWriteBlock(doc: WritableDoc, event: DocEvent): WriteBlock | null {
  if (event.status === 'CLOSED' || event.status === 'CANCELLED') {
    return { reason: 'event_closed', message: 'Evento cerrado / cancelado — solo lectura' };
  }
  if (doc.status === DocStatus.SEALED || doc.locked) {
    return {
      reason: 'sealed',
      message: 'Documento sellado — solo dirección puede reabrirlo, dejando el motivo',
    };
  }
  if (doc.status === DocStatus.APPROVED) {
    return {
      reason: 'approved',
      message: 'Documento aprobado — pídelo de vuelta a borrador para poder editarlo',
    };
  }
  return null;
}

/** Lanza si el documento no admite cambios. */
export function assertDocWritable(doc: WritableDoc, event: DocEvent) {
  const block = docWriteBlock(doc, event);
  if (block) throw new ForbiddenException(block.message);
}

/** ¿Se puede pasar de un estado al siguiente? Las transiciones válidas y nada más. */
export const ALLOWED_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  [DocStatus.DRAFT]: [DocStatus.REVIEW, DocStatus.APPROVED],
  [DocStatus.REVIEW]: [DocStatus.DRAFT, DocStatus.APPROVED],
  [DocStatus.APPROVED]: [DocStatus.DRAFT, DocStatus.SEALED],
  // Sellado es de un solo sentido: solo se sale reabriendo, con motivo.
  [DocStatus.SEALED]: [DocStatus.DRAFT],
};

export function assertTransitionAllowed(from: DocStatus, to: DocStatus) {
  if (from === to) throw new ForbiddenException(`El documento ya está en ${to}`);
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new ForbiddenException(`No se puede pasar de ${from} a ${to}`);
  }
}

/**
 * Quién puede hacer cada transición.
 *
 * `DRAFT → REVIEW` es autoservicio: no hay que pedir permiso para pedir que te
 * revisen. Aprobar y sellar sí son actos de responsabilidad.
 */
export function assertCanTransition(role: RoleKey | string, to: DocStatus, reason?: string) {
  if (to === DocStatus.REVIEW || to === DocStatus.DRAFT) {
    // Volver a borrador desde sellado es reabrir: eso lo cubre `assertCanReopen`.
    return;
  }
  if (to === DocStatus.APPROVED && !APPROVER_ROLES.has(String(role))) {
    throw new ForbiddenException('Solo gerencia y dirección pueden aprobar');
  }
  if (to === DocStatus.SEALED && !APPROVER_ROLES.has(String(role))) {
    throw new ForbiddenException('Solo gerencia y dirección pueden sellar');
  }
  if (to === DocStatus.SEALED && !(reason || '').trim()) {
    // Sellar no exige motivo; reabrir sí. Se deja el hueco explícito.
    return;
  }
}

/** Reabrir algo sellado: dirección, y con motivo por escrito. */
export function assertCanReopen(role: RoleKey | string, reason: string) {
  if (!UNSEAL_ROLES.has(String(role))) {
    throw new ForbiddenException('Solo dirección general puede reabrir un documento sellado');
  }
  if ((reason || '').trim().length < 5) {
    throw new ForbiddenException('Hace falta un motivo para reabrir un documento sellado');
  }
}

/** Etiquetas en español, para que API y panel digan lo mismo. */
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  [DocStatus.DRAFT]: 'Borrador',
  [DocStatus.REVIEW]: 'En revisión',
  [DocStatus.APPROVED]: 'Aprobado',
  [DocStatus.SEALED]: 'Sellado',
};
