/**
 * Diff campo por campo de los documentos del sistema.
 *
 * Se escribe a mano en vez de usar una librería genérica porque las formas son
 * conocidas y los identificadores son estables. Un differ genérico devolvería
 * `sections.2.items.7.done` y habría que traducirlo igual a
 * «Producción → Audio confirmado: No → Sí». Aquí sale directo, legible por una
 * persona, que es lo único que sirve para supervisar.
 *
 * Reglas de la casa:
 * - Se casa por identificador, NUNCA por posición: reordenar una sección no es
 *   un cambio.
 * - Lo calcula y lo guarda el SERVIDOR. La web solo lo pinta.
 * - Sin `import` de Nest ni de Prisma: esto es una función pura y tiene que
 *   poder moverse a `packages/` de un `git mv` cuando la UI lo necesite.
 */

import { formatItemDisplay, type FormatItem } from './format-schema';

export type ChangeKind = 'added' | 'removed' | 'changed';

export type FieldChange = {
  /** Dónde vive el campo: nombre de la sección, «Renglones», «Documento»… */
  scope: string;
  /** Identificador estable, para poder seguir un mismo campo en el tiempo. */
  key: string;
  /** Cómo se llama el campo para una persona. */
  label: string;
  kind: ChangeKind;
  before: string | null;
  after: string | null;
};

export type DocDiff = {
  changes: FieldChange[];
  summary: { added: number; removed: number; changed: number };
};

export const EMPTY_DIFF: DocDiff = {
  changes: [],
  summary: { added: 0, removed: 0, changed: 0 },
};

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Un valor como lo leería una persona. `null` = no había nada. */
function displayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  const text = String(value).trim();
  return text === '' ? null : text;
}

function build(changes: FieldChange[]): DocDiff {
  return {
    changes,
    summary: {
      added: changes.filter((c) => c.kind === 'added').length,
      removed: changes.filter((c) => c.kind === 'removed').length,
      changed: changes.filter((c) => c.kind === 'changed').length,
    },
  };
}

/** Registra el cambio solo si de verdad lo hubo. */
function pushIfChanged(
  changes: FieldChange[],
  entry: Omit<FieldChange, 'kind'> & { kind?: ChangeKind },
) {
  const { before, after } = entry;
  if (before === after) return;
  const kind: ChangeKind =
    before === null ? 'added' : after === null ? 'removed' : 'changed';
  changes.push({ ...entry, kind });
}

// ─── Checklists ──────────────────────────────────────────────────────────────

type ChecklistItem = {
  id?: string;
  label?: string;
  type?: string;
  done?: boolean;
  note?: string | null;
  value?: unknown;
  rows?: unknown;
  fileId?: string | null;
};

type ChecklistSection = { id?: string; title?: string; items?: ChecklistItem[] };
type ChecklistData = { sections?: ChecklistSection[] };

function itemDisplay(item: ChecklistItem): string | null {
  // Una casilla siempre tiene valor legible: marcada o sin marcar. Tablas,
  // SÍ/NO y adjuntos se leen con la misma regla que el resto del sistema.
  return formatItemDisplay(item as FormatItem);
}

type FlatItem = { sectionTitle: string; label: string; display: string | null };

function flattenChecklist(data: unknown): Map<string, FlatItem> {
  const out = new Map<string, FlatItem>();
  if (!data || typeof data !== 'object') return out;
  for (const section of (data as ChecklistData).sections ?? []) {
    const sectionId = String(section?.id ?? '');
    const sectionTitle = String(section?.title ?? sectionId ?? 'Sin sección');
    for (const item of section?.items ?? []) {
      if (!item) continue;
      const key = `${sectionId}:${String(item.id ?? '')}`;
      out.set(key, {
        sectionTitle,
        label: String(item.label ?? item.id ?? 'Campo sin nombre'),
        display: itemDisplay(item),
      });
    }
  }
  return out;
}

export function diffChecklistData(before: unknown, after: unknown): DocDiff {
  const prev = flattenChecklist(before);
  const next = flattenChecklist(after);
  const changes: FieldChange[] = [];

  for (const [key, item] of next) {
    const old = prev.get(key);
    if (!old) {
      // Campo nuevo: solo interesa si trae algo escrito o marcado.
      if (item.display !== null && item.display !== 'No') {
        changes.push({
          scope: item.sectionTitle,
          key,
          label: item.label,
          kind: 'added',
          before: null,
          after: item.display,
        });
      }
      continue;
    }
    pushIfChanged(changes, {
      scope: item.sectionTitle,
      key,
      label: item.label,
      before: old.display,
      after: item.display,
    });
  }

  for (const [key, item] of prev) {
    if (next.has(key)) continue;
    changes.push({
      scope: item.sectionTitle,
      key,
      label: item.label,
      kind: 'removed',
      before: item.display,
      after: null,
    });
  }

  return build(changes);
}

// ─── Corrida financiera ──────────────────────────────────────────────────────

type FinanceRow = { concept?: string; type?: string; amount?: number | string | null };
type FinanceData = { rows?: FinanceRow[] };

const MONEY = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

function money(amount: unknown): string {
  const n = Number(amount ?? 0);
  return MONEY.format(Number.isFinite(n) ? n : 0);
}

function rowKey(row: FinanceRow, index: number): string {
  const concept = String(row?.concept ?? '').trim().toLowerCase();
  // Sin concepto no hay identidad estable; se cae a la posición.
  return concept ? `${row?.type ?? 'sin-tipo'}:${concept}` : `#${index}`;
}

function flattenFinance(data: unknown): Map<string, { label: string; scope: string; display: string }> {
  const out = new Map<string, { label: string; scope: string; display: string }>();
  if (!data || typeof data !== 'object') return out;
  const rows = (data as FinanceData).rows;
  if (!Array.isArray(rows)) return out;
  rows.forEach((row, index) => {
    if (!row) return;
    out.set(rowKey(row, index), {
      scope: row.type === 'income' ? 'Ingresos' : row.type === 'expense' ? 'Egresos' : 'Sin clasificar',
      label: String(row.concept ?? `Renglón ${index + 1}`),
      display: money(row.amount),
    });
  });
  return out;
}

export function diffFinanceRows(before: unknown, after: unknown): DocDiff {
  const prev = flattenFinance(before);
  const next = flattenFinance(after);
  const changes: FieldChange[] = [];

  for (const [key, row] of next) {
    const old = prev.get(key);
    if (!old) {
      changes.push({
        scope: row.scope,
        key,
        label: row.label,
        kind: 'added',
        before: null,
        after: row.display,
      });
      continue;
    }
    pushIfChanged(changes, {
      scope: row.scope,
      key,
      label: row.label,
      before: old.display,
      after: row.display,
    });
  }

  for (const [key, row] of prev) {
    if (next.has(key)) continue;
    changes.push({
      scope: row.scope,
      key,
      label: row.label,
      kind: 'removed',
      before: row.display,
      after: null,
    });
  }

  return build(changes);
}

// ─── Documento por bloques ───────────────────────────────────────────────────

type DocBlock = { id?: string; type?: string; text?: string };

function flattenBlocks(blocks: unknown): Map<string, { label: string; display: string | null }> {
  const out = new Map<string, { label: string; display: string | null }>();
  if (!Array.isArray(blocks)) return out;
  (blocks as DocBlock[]).forEach((block, index) => {
    if (!block) return;
    const key = block.id ? `id:${block.id}` : `#${index}`;
    out.set(key, {
      label: `Bloque ${index + 1}${block.type ? ` (${block.type})` : ''}`,
      display: displayValue(block.text),
    });
  });
  return out;
}

export function diffDocBlocks(before: unknown, after: unknown): DocDiff {
  const prev = flattenBlocks(before);
  const next = flattenBlocks(after);
  const changes: FieldChange[] = [];

  for (const [key, block] of next) {
    const old = prev.get(key);
    if (!old) {
      changes.push({
        scope: 'Documento',
        key,
        label: block.label,
        kind: 'added',
        before: null,
        after: block.display,
      });
      continue;
    }
    pushIfChanged(changes, { scope: 'Documento', key, label: block.label, before: old.display, after: block.display });
  }

  for (const [key, block] of prev) {
    if (next.has(key)) continue;
    changes.push({
      scope: 'Documento',
      key,
      label: block.label,
      kind: 'removed',
      before: block.display,
      after: null,
    });
  }

  return build(changes);
}

// ─── Archivos binarios ───────────────────────────────────────────────────────

export type BinaryMeta = { fileName?: string | null; hash?: string | null; sizeBytes?: number | null };

function humanSize(bytes?: number | null): string | null {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** De un binario solo se pueden comparar sus señas: nombre, huella y tamaño. */
export function diffBinary(before: BinaryMeta | null, after: BinaryMeta): DocDiff {
  const changes: FieldChange[] = [];
  if (!before) {
    changes.push({
      scope: 'Archivo',
      key: 'file',
      label: 'Archivo subido',
      kind: 'added',
      before: null,
      after: displayValue(after.fileName),
    });
    return build(changes);
  }

  pushIfChanged(changes, {
    scope: 'Archivo',
    key: 'fileName',
    label: 'Nombre',
    before: displayValue(before.fileName),
    after: displayValue(after.fileName),
  });
  pushIfChanged(changes, {
    scope: 'Archivo',
    key: 'sizeBytes',
    label: 'Tamaño',
    before: humanSize(before.sizeBytes),
    after: humanSize(after.sizeBytes),
  });
  pushIfChanged(changes, {
    scope: 'Archivo',
    key: 'hash',
    label: 'Contenido (huella)',
    before: before.hash ? before.hash.slice(0, 12) : null,
    after: after.hash ? after.hash.slice(0, 12) : null,
  });

  return build(changes);
}

// ─── Resumen legible ─────────────────────────────────────────────────────────

/** «3 campos cambiados · 1 añadido» — para la lista de revisiones. */
export function describeDiff(diff: DocDiff | null | undefined): string {
  if (!diff || !diff.changes.length) return 'Sin cambios';
  const { added, removed, changed } = diff.summary;
  const parts: string[] = [];
  if (changed) parts.push(`${changed} cambiado${changed === 1 ? '' : 's'}`);
  if (added) parts.push(`${added} añadido${added === 1 ? '' : 's'}`);
  if (removed) parts.push(`${removed} quitado${removed === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
