export const KNOWN_BOLETERAS = ['Arema', 'eTicket'] as const;

export type KnownBoletera = (typeof KNOWN_BOLETERAS)[number];

export function boleteraChoiceOf(boletera: string): KnownBoletera | 'Otra' {
  return (KNOWN_BOLETERAS as readonly string[]).includes(boletera) ? (boletera as KnownBoletera) : 'Otra';
}

export function boleteraCustomOf(boletera: string): string {
  return boleteraChoiceOf(boletera) === 'Otra' && boletera !== 'Otra' ? boletera : '';
}

/** Resolve stored boletera name from select + optional custom label. */
export function resolveBoleteraName(choice: string, customName: string): string | null {
  if (choice !== 'Otra') return choice;
  const name = customName.trim();
  if (!name || name.toLowerCase() === 'otra') return null;
  return name;
}
