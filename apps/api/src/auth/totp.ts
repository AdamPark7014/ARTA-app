import { verifySync } from 'otplib';

/**
 * ¿El código de la app autenticadora es bueno?
 *
 * - Acepta el periodo anterior y el siguiente (±30 s, lo estándar en 2FA). Con
 *   la tolerancia por omisión de otplib (0), un código tecleado en los últimos
 *   segundos de su ventana —o un reloj del teléfono unos segundos corrido—
 *   llegaba ya caducado y el «Confirmar» decía «Código 2FA incorrecto» aunque
 *   fuera el correcto.
 * - Quita todo lo que no sea dígito: el autollenado (Safari, 1Password) puede
 *   traer «123 456» o «123-456».
 * - Un código mal formado (cinco dígitos, letras) es inválido, no un 500: otplib
 *   lanza en vez de devolver `valid: false`.
 */
export function verifyTotpCode(code: string, secret: string): boolean {
  const token = String(code ?? '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return verifySync({ token, secret, epochTolerance: 30 }).valid;
  } catch {
    return false;
  }
}
