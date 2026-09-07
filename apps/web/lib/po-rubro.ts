/** Rubros conocidos de OC. «Otro» se especifica escribiendo el nombre. */

export const PO_RUBRO_KEYS = [
  'audio',
  'luces',
  'planta_luz',
  'hospedaje',
  'transporte',
  'catering',
  'artes',
  'otro',
] as const;

export type PoRubroKey = (typeof PO_RUBRO_KEYS)[number];

export const PO_RUBRO_LABELS: Record<PoRubroKey, string> = {
  audio: 'Audio',
  luces: 'Luces',
  planta_luz: 'Planta de luz',
  hospedaje: 'Hospedaje',
  transporte: 'Transporte',
  catering: 'Catering',
  artes: 'Artes',
  otro: 'Otro (especificar)',
};

const KNOWN = new Set<string>(PO_RUBRO_KEYS.filter((k) => k !== 'otro'));

export function isKnownPoRubro(v: string): boolean {
  return KNOWN.has(v);
}

/** Etiqueta legible: catálogo o el texto libre que guardaron. */
export function poRubroLabel(rubro?: string | null): string {
  if (!rubro) return 'Sin rubro';
  if (rubro === 'otro') return 'Otro';
  if ((PO_RUBRO_KEYS as readonly string[]).includes(rubro)) {
    return PO_RUBRO_LABELS[rubro as PoRubroKey];
  }
  return rubro;
}

/** Cómo rellenar el select + campo libre a partir del valor guardado. */
export function parsePoRubro(rubro?: string | null): { key: PoRubroKey; other: string } {
  if (!rubro) return { key: 'audio', other: '' };
  if (isKnownPoRubro(rubro)) return { key: rubro as PoRubroKey, other: '' };
  return { key: 'otro', other: rubro === 'otro' ? '' : rubro };
}

/**
 * Valor que se manda al API. Si eligieron «Otro», tiene que venir el texto;
 * si no, se guarda la clave del catálogo.
 */
export function resolvePoRubro(key: string, other: string): string | null {
  if (key !== 'otro') return key;
  const t = other.trim();
  if (!t || t.toLowerCase() === 'otro') return null;
  return t;
}
