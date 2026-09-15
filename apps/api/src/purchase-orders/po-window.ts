/**
 * Días de cobro de las órdenes de compra.
 *
 * Junta 2026-08-28 pidió una ventana configurable para *solicitar* OC (lunes y
 * jueves de 10:00 a 14:00). La revisión del 11-09-2026 la cambió de raíz: «La
 * orden de compra se puede crear el día que sea. SOLO SE DEJARÁ LOS DÍAS DE
 * COBRO», y el machote del cliente dice «LOS PAGOS DE CAMPAÑAS ÚNICAMENTE SE
 * REALIZARÁN LUNES, MIÉRCOLES Y VIERNES».
 *
 * Así que la configuración ya no restringe la captura, solo el registro del
 * pago, y se evalúa por día (en la zona de la organización). `start`, `end` y
 * `timeZone` se siguen leyendo para no romper lo guardado; las horas ya no
 * limitan nada.
 *
 * Vive en `Organization.settingsJson.poWindow` — sin tabla nueva y por tenant.
 */

/** Marca de la configuración con semántica de «días de cobro». */
export const PAY_DAYS_KIND = 'payDays';

export type PoWindowConfig = {
  /** Lo guardado sin esta marca era la ventana de captura, no de cobro. */
  kind?: typeof PAY_DAYS_KIND;
  enabled: boolean;
  /** 0 = domingo … 6 = sábado */
  days: number[];
  /** Legado: ya no restringen. Se conservan para no perder lo guardado. */
  start: string;
  end: string;
  /** Zona en la que se decide qué día es hoy. */
  timeZone: string;
  /** Nota para el equipo */
  note?: string;
};

export const DEFAULT_PO_WINDOW: PoWindowConfig = {
  kind: PAY_DAYS_KIND,
  enabled: true,
  days: [1, 3, 5], // lunes, miércoles y viernes
  start: '00:00',
  end: '24:00',
  timeZone: 'America/Mexico_City',
  note: '',
};

export const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), 24 * 60);
}

/** "10:00" → 600. Acepta "9:5" y normaliza. */
export function parseHhMm(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const m = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return fallback;
  return clampMinutes(h * 60 + min);
}

export function formatHhMm(minutes: number): string {
  const m = clampMinutes(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function cleanTimeZone(raw: unknown): string {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_PO_WINDOW.timeZone;
}

/** Sanea una configuración de días de cobro; nunca lanza. */
function normalize(raw: Partial<PoWindowConfig>): PoWindowConfig {
  const days = Array.isArray(raw.days)
    ? Array.from(
        new Set(
          raw.days
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        ),
      ).sort((a, b) => a - b)
    : [...DEFAULT_PO_WINDOW.days];

  const start = formatHhMm(parseHhMm(raw.start, 0));
  const end = formatHhMm(Math.max(parseHhMm(raw.end, 24 * 60), parseHhMm(start, 0)));

  return {
    kind: PAY_DAYS_KIND,
    enabled: raw.enabled !== false,
    // Sin días válidos se vuelve al default en vez de bloquear todos los pagos.
    days: days.length ? days : [...DEFAULT_PO_WINDOW.days],
    start,
    end,
    timeZone: cleanTimeZone(raw.timeZone),
    note: typeof raw.note === 'string' ? raw.note.slice(0, 300) : '',
  };
}

/**
 * Lee lo que haya en settingsJson.
 *
 * Una configuración guardada sin `kind` es la ventana de *captura* de la junta
 * del 28-08 (lunes y jueves): otra política. Se descarta — conservando solo la
 * zona horaria — para que no se convierta callada en días de cobro.
 */
export function readPoWindow(settingsJson: unknown): PoWindowConfig {
  const raw = (settingsJson as { poWindow?: Partial<PoWindowConfig> } | null)?.poWindow;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PO_WINDOW, days: [...DEFAULT_PO_WINDOW.days] };
  if (raw.kind !== PAY_DAYS_KIND) {
    return { ...DEFAULT_PO_WINDOW, days: [...DEFAULT_PO_WINDOW.days], timeZone: cleanTimeZone(raw.timeZone) };
  }
  return normalize(raw);
}

/** Valida lo que manda la pantalla de configuración antes de guardarlo. */
export function sanitizePoWindow(input: Partial<PoWindowConfig>): PoWindowConfig {
  return normalize(input || {});
}

type LocalParts = { weekday: number; minutes: number; dayLabel: string };

/** Día de la semana y minutos del día *en la zona de la organización*. */
export function localParts(now: Date, timeZone: string): LocalParts {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hour12: false,
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).formatToParts(now);
  } catch {
    // Zona inválida guardada a mano: cae a UTC en vez de tumbar la petición.
    parts = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[get('weekday')] ?? now.getUTCDay();
  // "24" a medianoche en hourCycle h23/h24 según runtime — normaliza a 0.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return {
    weekday,
    minutes: hour * 60 + minute,
    dayLabel: `${get('day')}/${get('month')}`,
  };
}

export type PoWindowState = {
  config: PoWindowConfig;
  /** Hoy es día de cobro (o la regla está apagada). */
  open: boolean;
  /** "lunes, miércoles y viernes" */
  scheduleLabel: string;
  /** Próximo día de cobro: "mañana (miércoles)" · "el lunes" */
  nextOpenLabel: string | null;
  /** Minuto local actual — útil para depurar husos */
  nowMinutes: number;
};

/** Los días en palabras: "lunes, miércoles y viernes". */
export function describeSchedule(config: PoWindowConfig): string {
  if (!config.enabled) return 'cualquier día';
  if (!config.days.length) return 'sin días de cobro';
  const names = config.days.map((d) => DAY_NAMES[d]);
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

export function evaluatePoWindow(config: PoWindowConfig, now: Date = new Date()): PoWindowState {
  const scheduleLabel = describeSchedule(config);
  const { weekday, minutes } = localParts(now, config.timeZone);
  if (!config.enabled) {
    return { config, open: true, scheduleLabel, nextOpenLabel: null, nowMinutes: minutes };
  }

  const open = config.days.includes(weekday);
  let nextOpenLabel: string | null = null;
  if (!open) {
    for (let delta = 1; delta <= 7; delta += 1) {
      const day = (weekday + delta) % 7;
      if (config.days.includes(day)) {
        nextOpenLabel = delta === 1 ? `mañana (${DAY_NAMES[day]})` : `el ${DAY_NAMES[day]}`;
        break;
      }
    }
  }

  return { config, open, scheduleLabel, nextOpenLabel, nowMinutes: minutes };
}
