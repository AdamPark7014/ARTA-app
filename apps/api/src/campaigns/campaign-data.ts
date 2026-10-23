/**
 * Forma de lo que la campaña guarda en `Campaign.dataJson` (correcciones de la
 * junta con Arta, 23-10-2026).
 *
 * - `convenios`: cada convenio lleva VARIAS zonas, cada una con su cantidad y
 *   su precio («convenios ampliar zonas y así, no solo de una zona»). Antes
 *   era una sola zona en el renglón (`zona`, `qty`, `price`); esas filas se
 *   leen como un convenio de una zona, sin tocar lo guardado.
 * - `finalNotes`: notas finales opcionales con fecha o rango («Válida del … al
 *   …», fecha límite de pago) que salen al pie de los PDFs de la campaña.
 *
 * Todo es JSON dentro de la campaña: no hace falta migración. Lo que llega del
 * panel se limpia aquí para que la base guarde siempre la forma nueva, aunque
 * lo mande una pestaña abierta con el código anterior.
 */

export type ConvenioZone = { zona: string; qty: number | null; price: number | null };
export type Convenio = { concept: string; description: string; zonas: ConvenioZone[] };
export type CampaignFinalNote = { from: string | null; to: string | null; text: string };

/** Tope de renglones para que un JSON malformado no infle la campaña. */
const MAX_CONVENIOS = 200;
const MAX_ZONES = 30;
const MAX_NOTES = 20;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** «2026-11-01» o nada. */
function day(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function zoneFrom(raw: Record<string, unknown>): ConvenioZone | null {
  const zone = { zona: text(raw.zona, 120), qty: num(raw.qty), price: num(raw.price) };
  return zone.zona || zone.qty != null || zone.price != null ? zone : null;
}

/** Zonas de un convenio: las nuevas (`zonas`) o la única del formato anterior. */
export function convenioZonesOf(raw: unknown): ConvenioZone[] {
  if (!isRecord(raw)) return [];
  if (Array.isArray(raw.zonas)) {
    return raw.zonas
      .filter(isRecord)
      .map(zoneFrom)
      .filter((z): z is ConvenioZone => z !== null)
      .slice(0, MAX_ZONES);
  }
  const legacy = zoneFrom(raw);
  return legacy ? [legacy] : [];
}

export function normalizeConvenios(input: unknown): Convenio[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isRecord)
    .map((raw) => ({
      concept: text(raw.concept, 200),
      description: text(raw.description, 2000),
      zonas: convenioZonesOf(raw),
    }))
    .filter((c) => c.concept)
    .slice(0, MAX_CONVENIOS);
}

export function normalizeFinalNotes(input: unknown): CampaignFinalNote[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isRecord)
    .map((raw) => {
      let from = day(raw.from);
      let to = day(raw.to);
      // Un rango al revés se voltea en vez de imprimir «del 15 al 1».
      if (from && to && to < from) [from, to] = [to, from];
      return { from, to, text: text(raw.text, 600) };
    })
    .filter((n) => n.text || n.from || n.to)
    .slice(0, MAX_NOTES);
}

/**
 * Limpia en el lugar las llaves de `dataJson` que conoce. Las demás pasan
 * igual: la campaña guarda más cosas (canales, presupuesto…).
 */
export function normalizeCampaignData(incoming: Record<string, unknown>): Record<string, unknown> {
  const out = { ...incoming };
  if ('convenios' in out) out.convenios = normalizeConvenios(out.convenios);
  if ('finalNotes' in out) out.finalNotes = normalizeFinalNotes(out.finalNotes);
  return out;
}
