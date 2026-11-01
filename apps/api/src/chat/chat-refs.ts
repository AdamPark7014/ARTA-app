/**
 * Referencias del chat: arrobar una tarea, un evento, una OC, un formato, un
 * documento o un anticipo (docs/CHAT-V2-CONTRATO.md § Referencias).
 *
 * El cuerpo del mensaje lleva texto plano («@Cotizar luces»), así las apps viejas lo
 * leen bien. Lo que se liga viaja aparte en `refs` y se guarda en `ChatMessageRef`.
 * El estado de la tarjeta se calcula al leer, nunca se copia: la etiqueta guardada es
 * lo único que ve quien no puede abrir esa cosa.
 */
export const REF_KINDS = ['task', 'event', 'po', 'format', 'doc', 'advance'] as const;
export type RefKind = (typeof REF_KINDS)[number];

export const MAX_REFS_PER_MESSAGE = 8;
export const REF_LABEL_MAX = 80;

export type RefInput = { kind: string; id: string };
export type RefTarget = { kind: RefKind; id: string };

/** Lo que esta persona puede hacer desde la tarjeta, sin abrir la pantalla. */
export type RefAction = 'deliver' | 'complete' | 'approve';

/** Relleno = te toca actuar; contorno = solo informa (docs/diseno/SISTEMA-VISUAL.md). */
export type RefTone = 'action' | 'late' | 'info' | 'done';

export type ChatRefDto = {
  kind: RefKind;
  id: string;
  /** Tal como quedó escrito en el mensaje: encuentra el chip en el cuerpo. */
  label: string;
  /** El nombre de hoy, para la tarjeta (una tarea se puede renombrar). */
  title: string;
  /** `false` en lo que sale por socket: el cliente pide la tarjeta con sus propios permisos. */
  resolved: boolean;
  canOpen: boolean;
  /** La cosa ya no existe. */
  missing: boolean;
  href: string | null;
  status: string | null;
  statusLabel: string | null;
  tone: RefTone | null;
  subtitle: string | null;
  dueAt: string | null;
  /** 0-100: avance del evento o del formato. */
  progress: number | null;
  people: Array<{ id: string; fullName: string }>;
  amount: string | null;
  actions: RefAction[];
};

export function refKey(ref: { kind: string; id: string }): string {
  return `${ref.kind}:${ref.id}`;
}

export function isRefKind(kind: unknown): kind is RefKind {
  return typeof kind === 'string' && (REF_KINDS as readonly string[]).includes(kind);
}

/** Lo que manda el cliente: tipos válidos, sin repetidos, con tope. Lo demás se ignora. */
export function cleanRefInput(raw: unknown, max = MAX_REFS_PER_MESSAGE): RefTarget[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RefTarget[] = [];
  for (const item of raw) {
    const kind = (item as RefInput | null)?.kind;
    const id = (item as RefInput | null)?.id;
    if (!isRefKind(kind) || typeof id !== 'string' || !id.trim() || id.length > 64) continue;
    const ref = { kind, id: id.trim() };
    if (seen.has(refKey(ref))) continue;
    seen.add(refKey(ref));
    out.push(ref);
    if (out.length >= max) break;
  }
  return out;
}

export function refLabel(text: string | null | undefined, fallback: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return clean.length > REF_LABEL_MAX ? `${clean.slice(0, REF_LABEL_MAX - 1).trimEnd()}…` : clean;
}

/** Tarjeta sin resolver: lo que viaja por socket y lo que ve quien no tiene acceso. */
export function refStub(row: { kind: string; targetId: string; label: string }): ChatRefDto {
  return {
    kind: row.kind as RefKind,
    id: row.targetId,
    label: row.label,
    title: row.label,
    resolved: false,
    canOpen: false,
    missing: false,
    href: null,
    status: null,
    statusLabel: null,
    tone: null,
    subtitle: null,
    dueAt: null,
    progress: null,
    people: [],
    amount: null,
    actions: [],
  };
}

/** Minúsculas y sin acentos: «produccion» encuentra «Producción». */
export function normalizeSearch(text: string | null | undefined): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Todas las palabras de la búsqueda aparecen en alguno de los campos. */
export function matchesQuery(query: string, ...fields: Array<string | null | undefined>): boolean {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = fields.map(normalizeSearch).join(' ');
  return tokens.every((t) => hay.includes(t));
}

/** Tras editar sin mandar `refs` (apps viejas): se queda lo que sigue escrito en el cuerpo. */
export function refsStillInBody<T extends { label: string }>(body: string, refs: T[]): T[] {
  return refs.filter((r) => body.includes(`@${r.label}`));
}
