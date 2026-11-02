/**
 * Reglas de la ubicación del equipo (docs/UBICACION.md): de 10:00 a 18:00, hora de Puebla, un punto
 * cada media hora. El servidor las aplica a cualquier versión de la app: fuera del horario no se
 * guarda nada, aunque el teléfono lo mande.
 *
 * Sin Prisma ni Nest: se prueba en `horario.spec.ts`.
 */

export const UBICACION_TZ = 'America/Mexico_City';
export const HORA_INICIO = 10;
export const HORA_FIN = 18;

/** Lo que la app intenta. */
export const CADENCIA_MINUTOS = 30;

/** Menos que la cadencia: la alarma de Android es inexacta y no se debe tirar un punto bueno. */
export const ESPACIADO_MINIMO_MS = 20 * 60_000;

/** Un punto que esperó en la cola sin conexión todavía entra; más viejo ya no dice nada. */
export const ANTIGUEDAD_MAXIMA_MS = 24 * 60 * 60_000;

/** El reloj del teléfono puede ir unos minutos adelantado. */
const TOLERANCIA_FUTURO_MS = 2 * 60_000;

/** Sin punto en este tiempo y dentro del horario, el servidor le pide uno al teléfono. */
export const LATIDO_SIN_PUNTO_MS = 35 * 60_000;

/** iOS solo mide con la app abierta: el recordatorio es visible y a lo más uno por hora. */
export const RECORDATORIO_IOS_MS = 60 * 60_000;

/** Lo que se conserva. Es dato personal: no se guarda más de lo que sirve para revisar. */
export const RETENCION_MS = 90 * 24 * 60 * 60_000;

/** «Al día» en la vista del equipo. */
export const AL_DIA_MS = 45 * 60_000;

const partes = new Intl.DateTimeFormat('en-CA', {
  timeZone: UBICACION_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function enPuebla(fecha: Date) {
  const p = Object.fromEntries(partes.formatToParts(fecha).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute) };
}

/** De 10:00:00 a 17:59:59. */
export function enHorario(fecha: Date): boolean {
  const { hora } = enPuebla(fecha);
  return hora >= HORA_INICIO && hora < HORA_FIN;
}

export function diaDe(fecha: Date): string {
  return enPuebla(fecha).dia;
}

/** Inicio y fin del día en Puebla. México ya no cambia de horario: siempre UTC-6. */
export function limitesDelDia(dia: string): { desde: Date; hasta: Date } {
  const desde = new Date(`${dia}T00:00:00.000-06:00`);
  return { desde, hasta: new Date(desde.getTime() + 24 * 60 * 60_000) };
}

export function esDiaValido(dia: unknown): dia is string {
  return typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(limitesDelDia(dia).desde.getTime());
}

export type PuntoEntrante = { lat: number; lng: number; accuracyM?: number | null; capturedAt: string };
export type PuntoValido = { lat: number; lng: number; accuracyM: number | null; capturedAt: Date };

/**
 * Lo que sí se guarda de lo que mandó el teléfono: dentro del horario, con hora creíble y a más de
 * 20 minutos de otro punto de la persona. La hora es la del teléfono al medir, para que un punto
 * que esperó sin conexión quede en su lugar.
 */
export function puntosAGuardar(entrantes: PuntoEntrante[], yaGuardados: Date[], ahora: Date): PuntoValido[] {
  const tomados = yaGuardados.map((d) => d.getTime());
  const ordenados = entrantes
    .map((p) => ({ ...p, fecha: new Date(p.capturedAt) }))
    .filter((p) => !Number.isNaN(p.fecha.getTime()))
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const salida: PuntoValido[] = [];
  for (const p of ordenados) {
    const t = p.fecha.getTime();
    if (t > ahora.getTime() + TOLERANCIA_FUTURO_MS) continue;
    if (ahora.getTime() - t > ANTIGUEDAD_MAXIMA_MS) continue;
    if (!enHorario(p.fecha)) continue;
    if (tomados.some((otro) => Math.abs(otro - t) < ESPACIADO_MINIMO_MS)) continue;
    tomados.push(t);
    salida.push({ lat: p.lat, lng: p.lng, accuracyM: p.accuracyM ?? null, capturedAt: p.fecha });
  }
  return salida;
}

export type EstadoPersona = 'al_dia' | 'sin_permiso' | 'apagada' | 'sin_aceptar' | 'atrasada' | 'sin_datos' | 'fuera_de_horario';

/** Qué le decimos a dirección de cada persona. El permiso negado pesa más que un punto viejo. */
export function estadoDePersona(input: {
  consentAt: Date | null;
  state: string | null;
  ultimoPunto: Date | null;
  dia: string;
  ahora: Date;
}): EstadoPersona {
  const hoy = input.dia === diaDe(input.ahora);
  if (!input.consentAt) return 'sin_aceptar';
  if (input.state === 'sin_permiso') return 'sin_permiso';
  if (input.state === 'apagada') return 'apagada';
  if (!input.ultimoPunto) return hoy && !enHorario(input.ahora) ? 'fuera_de_horario' : 'sin_datos';
  if (!hoy || !enHorario(input.ahora)) return 'al_dia';
  return input.ahora.getTime() - input.ultimoPunto.getTime() <= AL_DIA_MS ? 'al_dia' : 'atrasada';
}
