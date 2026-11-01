/**
 * Lo que el navegador no deja adivinar por CSS. `navigator` solo existe en el
 * cliente: llamar dentro de un efecto o de un manejador, nunca al renderizar.
 */

/** iPhone o iPad, también el iPad que se anuncia como Mac. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/**
 * Teléfono o tableta. Ahí un PDF dentro de un iframe no sirve: Safari de iPhone
 * y iPad pinta solo la primera página y Chrome de Android no lo pinta.
 */
export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIos() || /Android/i.test(navigator.userAgent || '');
}

/** Se usa con el dedo: no hay clic derecho ni teclas como F2 o Supr. */
export function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}
