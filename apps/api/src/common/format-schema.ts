/**
 * Forma de un formato (checklist) de Arta — contrato ÚNICO.
 *
 * Los formatos del cliente (carpeta «FORMATOS ARTA» en Drive, 23-09-2026) no
 * son solo casillas: llevan encabezado del show, campos de texto, SÍ / NO,
 * horas, tablas (rooming, minuto a minuto, avenidas de pendones) y «botones»
 * que en Word eran un adjunto. Aquí se modela todo eso para que se capture
 * dentro del sistema y salga en PDF; nada se edita fuera.
 *
 * Sin `import` de Nest ni de Prisma: función pura, compartida por el avance,
 * el diff, el PDF, el seed y los scripts.
 */

export type FormatFieldType =
  | 'check'
  | 'text'
  | 'longtext'
  | 'number'
  | 'date'
  | 'time'
  | 'yesno'
  | 'select'
  | 'table'
  | 'attachment'
  | 'signature';

export type FormatColumnType = 'text' | 'number' | 'money' | 'time' | 'date';

export type FormatColumn = {
  id: string;
  label: string;
  type?: FormatColumnType;
  /** Peso relativo del ancho en el PDF (por defecto 1). */
  width?: number;
  /** Suma la columna en el pie de la tabla. */
  total?: boolean;
};

export type FormatRow = Record<string, string | number | null>;

/** De dónde se rellena un campo al crear el formato desde el evento. */
export type FormatBind =
  | 'event.name'
  | 'event.artist'
  | 'event.promoter'
  | 'event.date'
  | 'event.time'
  | 'event.city'
  | 'event.venue';

export type FormatItem = {
  id: string;
  label: string;
  type?: FormatFieldType;
  /** Casilla. */
  done?: boolean;
  /** Nota corta junto a una casilla (proveedor, quién, cuándo…). */
  note?: string | null;
  /** Texto, número, fecha, hora, SÍ/NO, opción, adjunto (nombre o link). */
  value?: string | number | null;
  options?: string[];
  /** Tabla. */
  columns?: FormatColumn[];
  rows?: FormatRow[];
  /** Renglones vacíos que se imprimen aunque no haya datos. */
  minRows?: number;
  totalLabel?: string;
  /** Adjunto del formato (EventFile.id) — el nombre queda en `value`. */
  fileId?: string | null;
  /** No cuenta para el avance si está vacío. */
  optional?: boolean;
  /** Se rellena desde el evento al crear el formato (si está vacío). */
  bind?: FormatBind;
  /** Ancho en el encabezado (de 12 columnas). */
  cols?: number;
  placeholder?: string;
};

export type FormatSectionLayout = 'list' | 'columns' | 'header';

export type FormatSection = {
  id: string;
  title: string;
  items: FormatItem[];
  /** `header`: campos del show en rejilla · `columns`: casillas a dos columnas. */
  layout?: FormatSectionLayout;
};

export type FormatData = {
  sections: FormatSection[];
  /** Versión del catálogo estándar con la que nació la plantilla. */
  formatVersion?: number;
};

export const YES = 'SÍ';
export const NO = 'NO';

/** Sección del encabezado (datos del show) en todos los formatos estándar. */
export const HEADER_SECTION_ID = 'encabezado';

/** Sección de firmas que añade el seed: no se captura ni puntúa. */
export const SIGNATURES_SECTION_ID = 'firmas';

export function isCheckType(type?: string | null): boolean {
  return type === 'check' || !type;
}

/** Tipos que guardan su respuesta en `value`. */
export function isValueType(type?: string | null): boolean {
  return (
    type === 'text' ||
    type === 'longtext' ||
    type === 'number' ||
    type === 'date' ||
    type === 'time' ||
    type === 'yesno' ||
    type === 'select' ||
    type === 'attachment'
  );
}

const hasText = (value: unknown) =>
  value !== null && value !== undefined && String(value).trim() !== '';

/** Renglón con algo escrito en cualquier columna. */
export function rowHasContent(row: FormatRow | null | undefined): boolean {
  if (!row || typeof row !== 'object') return false;
  return Object.values(row).some(hasText);
}

/** Renglones de una tabla con contenido (los vacíos de captura no cuentan). */
export function tableRows(item: Pick<FormatItem, 'rows'>): FormatRow[] {
  return (Array.isArray(item.rows) ? item.rows : []).filter(rowHasContent);
}

/** Suma de una columna numérica; `null` si nada es número. */
export function columnTotal(item: Pick<FormatItem, 'rows'>, columnId: string): number | null {
  let sum = 0;
  let any = false;
  for (const row of tableRows(item)) {
    const n = Number(row[columnId]);
    if (row[columnId] !== null && row[columnId] !== '' && Number.isFinite(n)) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Un ítem está resuelto cuando tiene respuesta, según su tipo. */
export function isFormatItemComplete(item: FormatItem): boolean {
  if (isCheckType(item.type)) return !!item.done;
  if (item.type === 'table') return tableRows(item).length > 0;
  if (item.type === 'attachment') return hasText(item.value) || hasText(item.fileId);
  if (item.type === 'signature') return true;
  return hasText(item.value);
}

const MONEY = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Valor de una celda como lo lee una persona (dinero con centavos). */
export function cellDisplay(column: FormatColumn | undefined, value: unknown): string {
  if (!hasText(value)) return '';
  if (column?.type === 'money') {
    const n = Number(value);
    return Number.isFinite(n) ? MONEY.format(n) : String(value);
  }
  return String(value).trim();
}

/**
 * Cómo se lee un ítem para el historial de cambios.
 * `null` = nada capturado.
 */
export function formatItemDisplay(item: FormatItem): string | null {
  if (isCheckType(item.type)) {
    const note = hasText(item.note) ? ` (${String(item.note).trim()})` : '';
    return item.done ? `Sí${note}` : `No${note}`;
  }
  if (item.type === 'table') {
    const rows = tableRows(item);
    if (!rows.length) return null;
    const cols = item.columns ?? [];
    return rows
      .map((row) =>
        cols
          .map((c) => cellDisplay(c, row[c.id]))
          .filter(Boolean)
          .join(' · '),
      )
      .join(' | ');
  }
  if (item.type === 'attachment') {
    if (hasText(item.value)) return String(item.value).trim();
    return hasText(item.fileId) ? 'Adjunto' : null;
  }
  return hasText(item.value) ? String(item.value).trim() : null;
}

/** El evento tal como lo necesita el enlace de encabezado. */
export type FormatEventSource = {
  name?: string | null;
  artist?: string | null;
  promoter?: string | null;
  venue?: string | null;
  city?: string | null;
  startsAt?: Date | string | null;
  schedule?: string | null;
};

function toDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-15` en hora de México, que es la del show. */
export function eventDateValue(startsAt?: Date | string | null): string {
  const d = toDate(startsAt);
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Hora del show: el horario capturado o la hora de inicio.
 *
 * Con varias funciones el evento guarda «Función 1 — 16:00 · Función 2 —
 * 20:00» (correcciones 30-09-2026); en el renglón HORA de un formato eso se
 * lee «16:00 y 20:00».
 */
export function eventTimeValue(event: FormatEventSource): string {
  const schedule = (event.schedule ?? '').trim();
  if (/funci[oó]n/i.test(schedule)) {
    const times = schedule.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
    if (times.length > 1) return `${times.slice(0, -1).join(', ')} y ${times[times.length - 1]}`;
    if (times.length === 1) return times[0];
  }
  if (schedule) return schedule;
  const d = toDate(event.startsAt);
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hh = get('hour');
  const mm = get('minute');
  return hh && mm ? `${pad(Number(hh) % 24)}:${mm}` : '';
}

export function boundValue(bind: FormatBind, event: FormatEventSource): string {
  switch (bind) {
    case 'event.name':
      return (event.name ?? '').trim();
    case 'event.artist':
      return (event.artist ?? '').trim();
    case 'event.promoter':
      return (event.promoter ?? '').trim();
    case 'event.city':
      return (event.city ?? '').trim();
    case 'event.venue':
      return (event.venue ?? '').trim();
    case 'event.date':
      return eventDateValue(event.startsAt);
    case 'event.time':
      return eventTimeValue(event);
    default:
      return '';
  }
}

/**
 * Rellena desde el evento los campos con `bind` que estén vacíos. Devuelve
 * una copia: nunca toca lo que la persona ya escribió, salvo `overwrite`.
 */
export function bindFormatToEvent(
  data: FormatData,
  event: FormatEventSource,
  options?: { overwrite?: boolean },
): FormatData {
  return {
    ...data,
    sections: (data.sections ?? []).map((section) => ({
      ...section,
      items: (section.items ?? []).map((item) => {
        if (!item.bind) return item;
        if (!options?.overwrite && hasText(item.value)) return item;
        const value = boundValue(item.bind, event);
        return value ? { ...item, value } : item;
      }),
    })),
  };
}

/**
 * Datos de un formato como vienen de la base → forma conocida. Tolera lo que
 * dejó el esquema viejo (sin `rows`, sin `columns`, valores raros) sin reventar.
 */
export function normalizeFormatData(raw: unknown): FormatData {
  if (!raw || typeof raw !== 'object') return { sections: [] };
  const root = raw as Partial<FormatData>;
  const sections = Array.isArray(root.sections) ? root.sections : [];
  return {
    ...root,
    sections: sections
      .filter((s): s is FormatSection => !!s && typeof s === 'object')
      .map((s) => ({
        ...s,
        id: String(s.id ?? ''),
        title: String(s.title ?? ''),
        items: (Array.isArray(s.items) ? s.items : [])
          .filter((i): i is FormatItem => !!i && typeof i === 'object')
          .map((i) => normalizeItem(i)),
      })),
  };
}

function normalizeItem(item: FormatItem): FormatItem {
  const out: FormatItem = { ...item, id: String(item.id ?? ''), label: String(item.label ?? '') };
  if (out.type === 'table') {
    out.columns = Array.isArray(out.columns)
      ? out.columns.filter((c) => !!c && typeof c === 'object' && c.id).map((c) => ({ ...c, id: String(c.id), label: String(c.label ?? c.id) }))
      : [];
    out.rows = Array.isArray(out.rows)
      ? out.rows.filter((r): r is FormatRow => !!r && typeof r === 'object').map((r) => ({ ...r }))
      : [];
  }
  if (out.type === 'yesno' && typeof out.value === 'string') {
    const v = out.value.trim().toUpperCase();
    out.value = v === 'SI' || v === 'SÍ' || v === 'YES' || v === 'TRUE' ? YES : v === 'NO' || v === 'FALSE' ? NO : out.value;
  }
  return out;
}

/** Ítems de captura (fuera firmas), en orden, con su sección. */
export function walkFormat(data: FormatData): Array<{ section: FormatSection; item: FormatItem }> {
  const out: Array<{ section: FormatSection; item: FormatItem }> = [];
  for (const section of data.sections ?? []) {
    if (section.id === SIGNATURES_SECTION_ID) continue;
    for (const item of section.items ?? []) {
      if (item.type === 'signature') continue;
      out.push({ section, item });
    }
  }
  return out;
}

/**
 * Lleva las respuestas de un formato viejo a la forma nueva de su plantilla.
 * Se casa por `sección:ítem` y, si no existe, por `ítem` a secas (las
 * secciones se reagruparon al estandarizar). Solo pasan los valores: la
 * forma, las etiquetas y los tipos son los de la plantilla nueva.
 */
export function carryFormatValues(target: FormatData, previous: unknown): FormatData {
  const prev = normalizeFormatData(previous);
  const byFull = new Map<string, FormatItem>();
  const byId = new Map<string, FormatItem>();
  for (const { section, item } of walkFormat(prev)) {
    byFull.set(`${section.id}:${item.id}`, item);
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return {
    ...target,
    sections: target.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        const old = byFull.get(`${section.id}:${item.id}`) ?? byId.get(item.id);
        if (!old) return item;
        const next: FormatItem = { ...item };
        if (isCheckType(item.type)) {
          if (isCheckType(old.type)) {
            next.done = !!old.done;
            if (hasText(old.note)) next.note = old.note;
          } else if (hasText(old.value)) {
            next.note = String(old.value);
          }
          return next;
        }
        if (item.type === 'table') {
          if (old.type === 'table' && Array.isArray(old.rows)) next.rows = old.rows.map((r) => ({ ...r }));
          return next;
        }
        if (item.type === 'attachment') {
          if (hasText(old.value)) next.value = old.value;
          if (hasText(old.fileId)) next.fileId = old.fileId;
          return next;
        }
        if (item.type === 'yesno') {
          if (isCheckType(old.type)) next.value = old.done ? YES : item.value ?? null;
          else if (hasText(old.value)) next.value = normalizeItem({ ...item, value: old.value }).value;
          return next;
        }
        if (hasText(old.value)) next.value = old.value;
        else if (isCheckType(old.type) && old.done && item.type === 'text') next.value = 'Sí';
        return next;
      }),
    })),
  };
}
