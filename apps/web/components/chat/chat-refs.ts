/**
 * Referencias del chat: arrobar una tarea, un evento, una OC, un formato, un documento
 * o un anticipo (docs/CHAT-V2-CONTRATO.md § Referencias). El cuerpo lleva `@Etiqueta` en
 * texto plano; `refs` dice qué cosa es y la tarjeta trae su estado al momento de leer.
 */
export type RefKind = 'task' | 'event' | 'po' | 'format' | 'doc' | 'advance';
export type RefAction = 'deliver' | 'complete' | 'approve';
export type RefTone = 'action' | 'late' | 'info' | 'done';

export type ChatRef = {
  kind: RefKind;
  id: string;
  /** Como quedó escrito en el mensaje: encuentra el chip en el cuerpo. */
  label: string;
  /** El nombre de hoy, para la tarjeta. */
  title?: string;
  /** `false` en lo que llega por socket: hay que pedir la tarjeta con mis permisos. */
  resolved?: boolean;
  canOpen?: boolean;
  missing?: boolean;
  href?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  tone?: RefTone | null;
  subtitle?: string | null;
  dueAt?: string | null;
  progress?: number | null;
  people?: Array<{ id: string; fullName: string }>;
  amount?: string | null;
  actions?: RefAction[];
};

/** Orden del selector y del panel «Ligados». */
export const REF_GROUPS: Array<{ kind: RefKind; title: string }> = [
  { kind: 'task', title: 'Tareas' },
  { kind: 'event', title: 'Eventos' },
  { kind: 'po', title: 'Órdenes de compra' },
  { kind: 'format', title: 'Formatos' },
  { kind: 'doc', title: 'Documentos' },
  { kind: 'advance', title: 'Anticipos' },
];

export const REF_ICON: Record<RefKind, string> = {
  task: 'M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  event: 'M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  po: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6',
  format: 'M9 4h6v3H9V4ZM7 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1M8 13h8M8 17h5',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5M9 13h6M9 17h6',
  advance: 'M3 7h18v10H3V7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 10v.01M18 14v.01',
};

export function refKey(r: { kind: string; id: string }) {
  return `${r.kind}:${r.id}`;
}

/** Lo elegido en el selector que sigue escrito en el texto al enviar. */
export function refsInText(text: string, picked: Iterable<ChatRef>): ChatRef[] {
  const out: ChatRef[] = [];
  for (const r of picked) if (text.includes(`@${r.label}`)) out.push(r);
  return out;
}

/** Parte un texto donde aparece `@Etiqueta`: lo largo primero, para que «Luces 2» no pierda ante «Luces». */
export function splitByRefs(text: string, refs: ChatRef[]): Array<string | ChatRef> {
  const known = refs.filter((r) => r.label).sort((a, b) => b.label.length - a.label.length);
  if (!known.length || !text.includes('@')) return [text];
  const out: Array<string | ChatRef> = [];
  let rest = text;
  while (rest) {
    let bestAt = -1;
    let best: ChatRef | null = null;
    for (const r of known) {
      const at = rest.indexOf(`@${r.label}`);
      if (at >= 0 && (bestAt < 0 || at < bestAt)) {
        bestAt = at;
        best = r;
      }
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (bestAt > 0) out.push(rest.slice(0, bestAt));
    out.push(best);
    rest = rest.slice(bestAt + best.label.length + 1);
  }
  return out;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const WHEN_AT_END =
  /(?:^|\s)(?:(?:para|el|al)\s+)?(pasado\s+ma[nñ]ana|ma[nñ]ana|hoy|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*$/i;

function dateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fold(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** «mañana», «viernes» (el siguiente), «7/11» → fecha `YYYY-MM-DD`. */
export function parseWhen(word: string, now = new Date()): string | null {
  const w = fold(word).replace(/\s+/g, ' ').trim();
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (w === 'hoy') return dateKey(at);
  if (w === 'manana') {
    at.setDate(at.getDate() + 1);
    return dateKey(at);
  }
  if (w === 'pasado manana') {
    at.setDate(at.getDate() + 2);
    return dateKey(at);
  }
  const weekday = WEEKDAYS.indexOf(w);
  if (weekday >= 0) {
    at.setDate(at.getDate() + ((weekday - at.getDay() + 7) % 7 || 7));
    return dateKey(at);
  }
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(w);
  if (!m) return null;
  const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
  const date = new Date(year, Number(m[2]) - 1, Number(m[1]));
  if (date.getMonth() !== Number(m[2]) - 1) return null;
  // Sin año y ya pasó: es la del año que viene.
  if (!m[3] && date < at) date.setFullYear(year + 1);
  return dateKey(date);
}

export type TaskCommand = {
  title: string;
  assignees: Array<{ id: string; fullName: string }>;
  dueAt: string | null;
};

export function isTaskCommand(text: string) {
  return /^\/tarea(\s|$)/i.test(text);
}

/** `/tarea Cotizar luces @Ana Ruiz mañana`. La fecha solo cuenta al final, para no comerse un título. */
export function parseTaskCommand(
  text: string,
  people: Array<{ id: string; fullName: string }>,
  now = new Date(),
): TaskCommand | null {
  if (!isTaskCommand(text)) return null;
  let rest = text.replace(/^\/tarea/i, ' ');
  const assignees: TaskCommand['assignees'] = [];
  for (const p of [...people].sort((a, b) => b.fullName.length - a.fullName.length)) {
    const mark = `@${p.fullName.trim()}`;
    const at = rest.toLowerCase().indexOf(mark.toLowerCase());
    if (at < 0) continue;
    assignees.push(p);
    rest = `${rest.slice(0, at)} ${rest.slice(at + mark.length)}`;
  }
  let dueAt: string | null = null;
  rest = rest.replace(/\s+/g, ' ').trim();
  const when = WHEN_AT_END.exec(rest);
  if (when) {
    dueAt = parseWhen(when[1], now);
    if (dueAt) rest = rest.slice(0, when.index).trim();
  }
  if (!rest) return null;
  return { title: rest.slice(0, 200), assignees, dueAt };
}
