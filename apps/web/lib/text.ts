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


/**
 * Conteo con su sustantivo en singular o plural: «1 mensaje», «3 mensajes».
 *
 *   plural(n, 'mensaje')                    → «1 mensaje» · «2 mensajes»
 *   plural(n, 'mensaje nuevo', 'mensajes nuevos')
 *   plural(n, 'evento', undefined, false)   → «evento» · «eventos» (sin número)
 */
export function plural(n: number, one: string, many?: string, withNumber = true): string {
  const word = n === 1 ? one : many ?? (/[aeiouáéó]$/i.test(one) ? `${one}s` : /z$/i.test(one) ? `${one.slice(0, -1)}ces` : `${one}es`);
  return withNumber ? `${n.toLocaleString('es-MX')} ${word}` : word;
}

/** Une datos de una fila con un solo separador y sin huecos: `meta(['Hoy', null, 'Auditorio'])` → «Hoy · Auditorio». */
export function meta(parts: Array<string | null | undefined | false>, sep = ' · '): string {
  return parts.filter((p): p is string => !!p && !!p.trim()).join(sep);
}
