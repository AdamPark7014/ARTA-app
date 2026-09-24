/**
 * Repara mojibake común de UTF-8 leído como latin1 (CAMPAÃ‘A → CAMPAÑA).
 *
 * No toca strings ASCII puras; si el re-decode falla devuelve el original.
 */
export function fixMojibake(name: string): string {
  try {
    // Reinterpreta cada code unit como byte latin1 y vuelve a decodificar en UTF-8.
    const bytes = Uint8Array.from(Array.from(name, (ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    // Heurística: solo si introduce letras acentuadas comunes o cambia la secuencia Ã.
    if (name.includes('Ã') || /[ÁÉÍÓÚÑáéíóúñ]/.test(decoded)) return decoded;
    return name;
  } catch {
    return name;
  }
}

