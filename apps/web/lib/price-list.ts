/**
 * Lista de precios de Arta (junta 11-09-2026, págs. 4 y 5 del PDF).
 *
 * `interno` es lo que le cuesta a Arta; `externo` lo que se cotiza al cliente.
 * La usan tres pantallas: las partidas de una OC (se autocompleta el precio
 * interno), los conceptos de campaña (interno y externo a la vez, porque salen
 * dos PDFs) y el catálogo de convenios.
 *
 * Sin `xlsx` ni nada pesado: la importa la pantalla del evento.
 */

export type PriceItem = {
  concept: string;
  interno: number | null;
  externo: number | null;
  /** Aclaración de la unidad cuando no es «pieza» (p. ej. «por pendón»). */
  unit?: string;
};

export const PRICE_LIST: PriceItem[] = [
  { concept: 'IMPRESIÓN PENDÓN CHOLULA', interno: 105, externo: 125 },
  { concept: 'COLOCACIÓN PENDÓN CHOLULA', interno: 38, externo: 45 },
  { concept: 'PERMISO PENDÓN CHOLULA', interno: 4558, externo: 5000 },
  { concept: 'GARANTÍA DE PENDÓN CHOLULA', interno: 4558, externo: 5000 },
  { concept: 'IMPRESIÓN PENDÓN PUEBLA', interno: 145, externo: 155 },
  { concept: 'COLOCACIÓN PENDÓN PUEBLA', interno: 50, externo: 60 },
  { concept: 'PERMISO PENDÓN PUEBLA', interno: 390, externo: 390, unit: 'por pendón' },
  { concept: 'RENTA PUENTE', interno: 12000, externo: 16200 },
  { concept: 'IMPRESIÓN PUENTE 12.20 X 3.20', interno: 1756.8, externo: 4500 },
  { concept: 'RENTA ESPECTACULAR GRUPO MÁS 12.90 X 7.20', interno: 15000, externo: 18000 },
  { concept: 'IMPRESIÓN ESPECTACULAR GRUPO MÁS 12.90 X 7.20', interno: 4180, externo: 5500 },
  { concept: 'IMPRESIÓN MEGA VALLA 4.40 X 9.10', interno: 1801.8, externo: 5000 },
  { concept: 'IMPRESIÓN ESPECTACULAR ALE DUMAS 12.90 X 7.20', interno: 4180, externo: 5500 },
  { concept: 'COLOCACIÓN ESPECTACULAR ALE DUMAS', interno: 2000, externo: 3000 },
  { concept: 'ESPECTACULAR BLVD NIÑO POBLANO (RADISSON)', interno: null, externo: null },
  { concept: 'IMPRESIÓN MEDALLONES', interno: 0, externo: 330 },
  { concept: 'RENTA MEDALLONES', interno: 2300, externo: 2500 },
  { concept: 'IMPRESIÓN MUPPI', interno: 560, externo: 650 },
  { concept: 'IMPRESIÓN VALLAS METÁLICAS', interno: 800, externo: 1000 },
  { concept: 'BARDAS', interno: 300, externo: 400 },
  { concept: 'IMPRESIÓN POSTERS', interno: 15, externo: 20 },
  { concept: 'RENTA VALLA MÓVIL', interno: 13800, externo: 20000 },
  { concept: 'IMPRESIÓN PLUMAS CHEDRAUI', interno: 200, externo: 280 },
  { concept: 'RENTA PLUMAS CHEDRAUI', interno: 1200, externo: 2100 },
  { concept: 'CONVENIO GRUPO TRIBUNA', interno: 15000, externo: 22000 },
  { concept: 'PRODUCCIÓN SPOT TRIBUNA', interno: 1500, externo: 2000 },
  { concept: 'IMPRESIONES CENTRO COMERCIAL ANGELÓPOLIS', interno: 8622, externo: 10000 },
  { concept: 'RENTA PANTALLA ATLIXCAYOTL', interno: 12000, externo: 15000 },
  // En la lista: 3,600 (3.60 c/u) y 4,200 (4.20 c/u) — el millar.
  { concept: 'PAPELETA 8 CARTAS', interno: 3.6, externo: 4.2, unit: 'c/u' },
  { concept: 'COLOCACIÓN PAPELETA 8 CARTAS', interno: 3500, externo: 4000 },
];

/** Mayúsculas, sin acentos ni espacios dobles: «Impresión muppi» = «IMPRESION MUPPI». */
export function normalizeConcept(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const BY_KEY = new Map(PRICE_LIST.map((p) => [normalizeConcept(p.concept), p]));

/** El concepto de la lista que corresponde a lo escrito, si lo hay. */
export function findPrice(concept: string): PriceItem | undefined {
  if (!concept.trim()) return undefined;
  return BY_KEY.get(normalizeConcept(concept));
}

/** Pesos sin centavos cuando no hacen falta: $4,558 · $1,756.80. */
export function mxn(value: number | null | undefined): string {
  const n = Number(value || 0);
  return n.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Número de un `<input type="number">` que puede estar vacío.
 *
 * El «0» que pidieron quitar salía de aquí: los campos nacían en 0 y el número
 * se quedaba pintado. Vacío es `null`, y así se muestra el campo vacío.
 */
export function numOrNull(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
