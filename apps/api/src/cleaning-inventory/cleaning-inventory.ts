/**
 * Inventario de limpieza semanal del Auditorio — lógica pura (sin Nest ni
 * Prisma), compartida por el controlador, el PDF y las pruebas.
 *
 * Junta con el cliente (23-10-2026): «inventario de limpieza semanal». No es
 * un formato de evento: el Auditorio cuenta sus insumos cada semana aunque no
 * haya show. Cada semana (lunes) es una fila de `CleaningInventory`; sus
 * renglones viven en `itemsJson`.
 *
 * Cuentas de cada renglón:
 *   existencia final = inicial + entradas − consumo   (si nadie escribió el conteo físico)
 *   faltantes        = mínimo − existencia final       (si hay mínimo y nadie escribió otra cifra)
 * Lo que la persona escribe manda: el conteo físico puede no cuadrar con la cuenta.
 *
 * Al abrir una semana nueva se copian insumo, unidad y mínimo de la semana
 * anterior, y su existencia final pasa a ser la existencia inicial.
 */
import {
  HEADER_SECTION_ID,
  type FormatColumn,
  type FormatData,
  type FormatRow,
} from '../common/format-schema';
import { signaturesSection } from '../checklists/format-catalog';

export type InventoryItem = {
  id: string;
  insumo: string;
  unidad?: string | null;
  inicial?: number | null;
  entradas?: number | null;
  consumo?: number | null;
  /** Conteo físico al cierre; vacío = la cuenta. */
  final?: number | null;
  /** Existencia mínima que debe haber. */
  minimo?: number | null;
  /** Cuánto hace falta pedir; vacío = mínimo − final. */
  faltantes?: number | null;
  observaciones?: string | null;
};

/** Un renglón con las cuentas ya hechas (lo que se imprime y se enseña). */
export type ResolvedInventoryItem = InventoryItem & {
  finalCalc: number | null;
  faltantesCalc: number | null;
};

/** Insumos con que nace la primera semana (se editan, quitan o agregan en la hoja). */
export const DEFAULT_INVENTORY_ITEMS: Array<Pick<InventoryItem, 'insumo' | 'unidad'>> = [
  { insumo: 'Papel higiénico (rollo jumbo)', unidad: 'rollos' },
  { insumo: 'Toalla de papel para manos', unidad: 'rollos' },
  { insumo: 'Jabón líquido para manos', unidad: 'litros' },
  { insumo: 'Gel antibacterial', unidad: 'litros' },
  { insumo: 'Cloro', unidad: 'litros' },
  { insumo: 'Limpiador multiusos / desinfectante', unidad: 'litros' },
  { insumo: 'Aromatizante', unidad: 'litros' },
  { insumo: 'Limpiavidrios', unidad: 'litros' },
  { insumo: 'Detergente en polvo', unidad: 'kg' },
  { insumo: 'Bolsas de basura grandes', unidad: 'piezas' },
  { insumo: 'Bolsas de basura chicas', unidad: 'piezas' },
  { insumo: 'Jergas / franelas', unidad: 'piezas' },
  { insumo: 'Fibras y esponjas', unidad: 'piezas' },
  { insumo: 'Guantes de látex', unidad: 'pares' },
  { insumo: 'Mechudos / trapeadores', unidad: 'piezas' },
  { insumo: 'Escobas', unidad: 'piezas' },
];

export const MAX_INVENTORY_ITEMS = 200;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` de un `Date` en UTC (las fechas de semana no llevan hora). */
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `true` si es una fecha real en formato `YYYY-MM-DD`. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && ymd(d) === value;
}

/** El lunes de la semana de una fecha `YYYY-MM-DD`. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // lunes = 0 … domingo = 6
  d.setUTCDate(d.getUTCDate() - shift);
  return ymd(d);
}

/** Suma días a una fecha `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

/** Hoy en Puebla (hora de México), `YYYY-MM-DD`. */
export function todayInMexico(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «Semana del 26 oct al 1 nov 2026». */
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const [y1, m1, d1] = weekStart.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  const from = y1 === y2 ? `${d1} ${MONTHS[m1 - 1]}` : `${d1} ${MONTHS[m1 - 1]} ${y1}`;
  return `Semana del ${from} al ${d2} ${MONTHS[m2 - 1]} ${y2}`;
}

/** Número o vacío: lo que llega de un campo numérico (texto, coma decimal, null). */
export function toQty(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const t = String(value).trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const text = (value: unknown, max: number): string | null => {
  if (value === null || value === undefined) return null;
  const t = String(value).replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
};

/** Id estable de renglón (no criptográfico: solo distingue renglones de una semana). */
export function newItemId(): string {
  return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Renglones como vienen del panel → forma conocida. Descarta lo que no es un
 * objeto, recorta textos y convierte cantidades; un renglón sin insumo ni
 * números no se guarda.
 */
export function sanitizeItems(raw: unknown): InventoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryItem[] = [];
  const ids = new Set<string>();
  for (const r of raw.slice(0, MAX_INVENTORY_ITEMS)) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    const item: InventoryItem = {
      id: text(row.id, 40) ?? newItemId(),
      insumo: text(row.insumo, 120) ?? '',
      unidad: text(row.unidad, 30),
      inicial: toQty(row.inicial),
      entradas: toQty(row.entradas),
      consumo: toQty(row.consumo),
      final: toQty(row.final),
      minimo: toQty(row.minimo),
      faltantes: toQty(row.faltantes),
      observaciones: text(row.observaciones, 300),
    };
    const hasNumbers = [item.inicial, item.entradas, item.consumo, item.final, item.minimo, item.faltantes].some(
      (n) => n !== null,
    );
    if (!item.insumo && !hasNumbers && !item.observaciones) continue;
    if (ids.has(item.id)) item.id = newItemId();
    ids.add(item.id);
    out.push(item);
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Las cuentas del renglón: lo escrito manda, si no, la fórmula. */
export function resolveItem(item: InventoryItem): ResolvedInventoryItem {
  const inicial = toQty(item.inicial);
  const entradas = toQty(item.entradas);
  const consumo = toQty(item.consumo);
  const any = inicial !== null || entradas !== null || consumo !== null;
  const computed = any ? round((inicial ?? 0) + (entradas ?? 0) - (consumo ?? 0)) : null;
  const finalCalc = toQty(item.final) ?? computed;
  const minimo = toQty(item.minimo);
  const faltaCalc = minimo !== null && finalCalc !== null ? round(Math.max(0, minimo - finalCalc)) : null;
  const faltantesCalc = toQty(item.faltantes) ?? faltaCalc;
  return { ...item, finalCalc, faltantesCalc };
}

/** Renglones de una semana nueva a partir de la anterior (o la lista inicial). */
export function carryOverItems(previous: InventoryItem[] | null | undefined): InventoryItem[] {
  if (!previous?.length) {
    return DEFAULT_INVENTORY_ITEMS.map((d) => ({
      id: newItemId(),
      insumo: d.insumo,
      unidad: d.unidad ?? null,
      inicial: null,
      entradas: null,
      consumo: null,
      final: null,
      minimo: null,
      faltantes: null,
      observaciones: null,
    }));
  }
  return previous
    .filter((p) => p.insumo)
    .map((p) => ({
      id: newItemId(),
      insumo: p.insumo,
      unidad: p.unidad ?? null,
      inicial: resolveItem(p).finalCalc,
      entradas: null,
      consumo: null,
      final: null,
      minimo: toQty(p.minimo),
      faltantes: null,
      observaciones: null,
    }));
}

/** Cuántos insumos tienen faltantes (lo que se enseña en el historial). */
export function inventoryStats(items: InventoryItem[]): { items: number; faltantes: number; capturados: number } {
  const resolved = items.map(resolveItem);
  return {
    items: resolved.filter((i) => i.insumo).length,
    faltantes: resolved.filter((i) => (i.faltantesCalc ?? 0) > 0).length,
    capturados: resolved.filter((i) => toQty(i.consumo) !== null || toQty(i.final) !== null).length,
  };
}

const INVENTORY_COLUMNS: FormatColumn[] = [
  { id: 'insumo', label: 'Insumo', width: 2.6 },
  { id: 'unidad', label: 'Unidad', width: 1 },
  { id: 'inicial', label: 'Existencia inicial', type: 'number', width: 1.05 },
  { id: 'entradas', label: 'Entradas', type: 'number', width: 0.95 },
  { id: 'consumo', label: 'Consumo', type: 'number', width: 0.95 },
  { id: 'final', label: 'Existencia final', type: 'number', width: 1.05 },
  { id: 'minimo', label: 'Mínimo', type: 'number', width: 0.85 },
  { id: 'faltantes', label: 'Faltantes', type: 'number', width: 0.95 },
  { id: 'observaciones', label: 'Observaciones', width: 2 },
];

/**
 * La semana como formato del sistema: así el PDF sale con el mismo motor y la
 * misma marca que los formatos del Auditorio (logo, encabezado en rejilla,
 * tabla, firmas al final y folio).
 */
export function inventoryToFormat(inv: {
  weekStart: string;
  responsible?: string | null;
  notes?: string | null;
  items: InventoryItem[];
}): FormatData {
  const rows: FormatRow[] = inv.items.map((raw) => {
    const r = resolveItem(raw);
    return {
      insumo: r.insumo || null,
      unidad: r.unidad ?? null,
      inicial: r.inicial ?? null,
      entradas: r.entradas ?? null,
      consumo: r.consumo ?? null,
      final: r.finalCalc,
      minimo: r.minimo ?? null,
      faltantes: r.faltantesCalc,
      observaciones: r.observaciones ?? null,
    };
  });
  const stats = inventoryStats(inv.items);
  return {
    sections: [
      {
        id: HEADER_SECTION_ID,
        title: 'Semana',
        layout: 'header',
        items: [
          { id: 'semana', label: 'Semana', type: 'text', value: weekLabel(inv.weekStart), cols: 6 },
          { id: 'del', label: 'Del (lunes)', type: 'date', value: inv.weekStart, cols: 3 },
          { id: 'al', label: 'Al (domingo)', type: 'date', value: addDays(inv.weekStart, 6), cols: 3 },
          { id: 'responsable', label: 'Responsable del conteo', type: 'text', value: inv.responsible ?? '', cols: 6 },
          {
            id: 'resumen',
            label: 'Insumos con faltantes',
            type: 'text',
            value: `${stats.faltantes} de ${stats.items}`,
            cols: 6,
          },
        ],
      },
      {
        id: 'insumos',
        title: 'Insumos de limpieza',
        items: [
          {
            id: 'insumos',
            label: 'Insumos de limpieza',
            type: 'table',
            columns: INVENTORY_COLUMNS,
            rows,
            minRows: Math.max(8, rows.length),
          },
        ],
      },
      {
        id: 'observaciones',
        title: 'Observaciones',
        items: [{ id: 'observaciones', label: 'Observaciones', type: 'longtext', value: inv.notes ?? '' }],
      },
      signaturesSection({ delivered: 'Responsable de limpieza', authorized: 'Auditorio Explanada Puebla' }),
    ],
  };
}
