import { checklistBucket } from './ChecklistPicker';
import type { Checklist, Tab } from './event-detail.types';

/**
 * «Lo siguiente» (maqueta aprobada 11-11-2026): una sola frase con lo más urgente del evento y su
 * botón, más atajos a lo que falta armar. Antes el resumen solo ponía cifras («Campaña: Sin armar»)
 * sin decir qué hacer. Mismos grupos que la pestaña Formatos (`checklistBucket`).
 */
export type NextAction = { label: string; tab: Tab; ver?: string; checklist?: Checklist };
export type NextSteps = {
  tone: 'warn' | 'ok' | 'info';
  headline: string;
  detail?: string;
  action?: NextAction;
  extras: Array<NextAction & { cta: string }>;
};

type EventLike = {
  startsAt?: string | null;
  checklists?: Checklist[];
  purchaseOrders?: Array<{ status: string }>;
  campaign?: { dataJson?: { concepts?: unknown[] } | null } | null;
  ticketingSetups?: unknown[];
  tasks?: Array<{ status: string; dueAt?: string | null; title: string; assignee?: { fullName: string } | null }>;
};

function daysTo(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const a = new Date(iso);
  if (Number.isNaN(a.getTime())) return null;
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function eventNextSteps(
  event: EventLike,
  opts: { done: boolean; visible: (tab: Tab) => boolean; now?: Date },
): NextSteps | null {
  if (opts.done) return null;
  const now = opts.now ?? new Date();
  const checklists = event.checklists || [];
  const todo = checklists.filter((c) => checklistBucket(c) === 'todo');
  const review = checklists.filter((c) => checklistBucket(c) === 'review');
  const days = daysTo(event.startsAt, now);
  const when =
    days == null ? undefined : days === 0 ? 'El show es hoy' : days === 1 ? 'El show es mañana' : days > 1 ? `Faltan ${days} días para el show` : undefined;

  let steps: NextSteps;
  if (!checklists.length) {
    steps = {
      tone: 'warn',
      headline: 'Este evento aún no tiene formatos',
      detail: when,
      action: { label: 'Agregar formatos', tab: 'checklists' },
      extras: [],
    };
  } else if (todo.length) {
    const worst = [...todo].sort((a, b) => (a.progressPct || 0) - (b.progressPct || 0))[0];
    const pct = Math.round(worst.progressPct || 0);
    steps = {
      tone: days != null && days <= 14 ? 'warn' : 'info',
      headline:
        todo.length === 1
          ? `Falta un formato: ${worst.title} (${pct} %)`
          : `Faltan ${todo.length} formatos. El más atrasado es ${worst.title} (${pct} %)`,
      detail: [when, review.length ? `${plural(review.length, 'formato espera', 'formatos esperan')} autorización` : '']
        .filter(Boolean)
        .join(' · '),
      action: { label: 'Abrir formato', tab: 'checklists', checklist: worst },
      extras: [],
    };
  } else if (review.length) {
    steps = {
      tone: 'info',
      headline: `${plural(review.length, 'formato espera', 'formatos esperan')} autorización`,
      detail: when,
      action: { label: 'Revisar', tab: 'checklists', ver: 'revision' },
      extras: [],
    };
  } else {
    steps = { tone: 'ok', headline: 'Formatos al día', detail: when, extras: [] };
  }

  if (!steps.action || !opts.visible(steps.action.tab)) steps.action = undefined;

  const extras: NextSteps['extras'] = [];
  if (!event.campaign?.dataJson?.concepts?.length) extras.push({ label: 'Armar la campaña', cta: 'Empezar', tab: 'campaign' });
  if (!event.ticketingSetups?.length) extras.push({ label: 'Crear la boletera', cta: 'Crear', tab: 'ticketing' });
  const poPending = (event.purchaseOrders || []).filter((p) => p.status === 'PENDING_AUTH' || p.status === 'DRAFT').length;
  if (poPending) extras.push({ label: plural(poPending, 'orden por autorizar', 'órdenes por autorizar'), cta: 'Revisar', tab: 'ocs' });
  const overdue = (event.tasks || []).filter((t) => t.status !== 'DONE' && t.dueAt && daysTo(t.dueAt, now)! < 0).length;
  if (overdue) extras.push({ label: plural(overdue, 'tarea vencida', 'tareas vencidas'), cta: 'Ver', tab: 'tasks' });
  steps.extras = extras.filter((x) => opts.visible(x.tab));
  return steps;
}
