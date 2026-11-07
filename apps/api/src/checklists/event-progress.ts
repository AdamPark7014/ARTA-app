import { eventDoneWhere, formatProgress } from '../common/checklist-progress';
import type { PrismaService } from '../common/prisma/prisma.service';
import { VISIBLE_CHECKLIST_WHERE } from './checklist-visibility';

type Db = Pick<PrismaService, 'checklistInstance' | 'event'>;

/**
 * Formatos de eventos que ya terminaron (cerrados o pasados) a 100 % — Adam, 07-11-2026.
 *
 * Solo los que se enseñan: un formato vacío de una plantilla retirada sigue oculto
 * (`VISIBLE_CHECKLIST_WHERE`), no aparece de pronto como «listo». Lo corren el cierre del evento y
 * el escaneo horario, que es quien nota que una fecha ya pasó.
 */
export async function completeDoneEvents(
  db: Db,
  opts: { eventId?: string; organizationId?: string; now?: Date } = {},
): Promise<number> {
  const result = await db.checklistInstance.updateMany({
    where: {
      progressPct: { lt: 100 },
      AND: [VISIBLE_CHECKLIST_WHERE],
      event: {
        ...eventDoneWhere(opts.now),
        ...(opts.eventId ? { id: opts.eventId } : {}),
        ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
      },
    },
    data: { progressPct: 100 },
  });
  return result.count;
}

type DocRow = {
  id: string;
  dataJson: unknown;
  progressPct: number;
  status: string;
  deliveredAt: Date | null;
  authorizedAt: Date | null;
  deliveredSignature: unknown;
  authorizedSignature: unknown;
};

/**
 * Vuelve a calcular el avance de los formatos de un evento: al reabrirlo o al moverle la fecha, cada
 * uno regresa a lo suyo (mandado = 100 %, si no lo capturado), salvo que el evento siga terminado.
 */
export async function recalcEventChecklists(db: Db, eventId: string, now = new Date()): Promise<number> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { status: true, startsAt: true, endsAt: true },
  });
  if (!event) return 0;
  const docs: DocRow[] = await db.checklistInstance.findMany({
    where: { eventId, AND: [VISIBLE_CHECKLIST_WHERE] },
    select: {
      id: true,
      dataJson: true,
      progressPct: true,
      status: true,
      deliveredAt: true,
      authorizedAt: true,
      deliveredSignature: true,
      authorizedSignature: true,
    },
  });
  let changed = 0;
  for (const doc of docs) {
    const progressPct = formatProgress(doc.dataJson, doc, event, now);
    if (progressPct === doc.progressPct) continue;
    await db.checklistInstance.update({ where: { id: doc.id }, data: { progressPct } });
    changed += 1;
  }
  return changed;
}
