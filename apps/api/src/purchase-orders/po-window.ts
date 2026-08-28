/**
 * Ventana de solicitud de órdenes de compra.
 *
 * Junta 2026-08-28: «se propone que el sistema permita configurar los días y
 * horarios disponibles para solicitar órdenes de compra. Actualmente el periodo
 * disponible es de lunes y jueves de 10:00 a 14:00 horas».
 *
 * La configuración vive en `Organization.settingsJson.poWindow` — sin tabla
 * nueva y por tenant. Los defaults reproducen la política que Arta ya opera.
 */

export type PoWindowConfig = {
  enabled: boolean;
  /** 0 = domingo … 6 = sábado */
  days: number[];
  /** "HH:MM" en la zona horaria de la organización */
  start: string;
  end: string;
  timeZone: string;
  /** Nota que se muestra al equipo cuando la ventana está cerrada */
  note?: string;
};

export const DEFAULT_PO_WINDOW: PoWindowConfig = {
  enabled: true,
  days: [1, 4], // lunes y jueves
  start: '10:00',
  end: '14:00',
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

/** Lee y sanea lo que haya en settingsJson; nunca lanza. */
export function readPoWindow(settingsJson: unknown): PoWindowConfig {
  const raw = (settingsJson as { poWindow?: Partial<PoWindowConfig> } | null)?.poWindow;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PO_WINDOW };

  const days = Array.isArray(raw.days)
    ? Array.from(
        new Set(
          raw.days
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        ),
      ).sort((a, b) => a - b)
    : [...DEFAULT_PO_WINDOW.days];

  const start = formatHhMm(parseHhMm(raw.start, parseHhMm(DEFAULT_PO_WINDOW.start, 600)));
  const endRaw = parseHhMm(raw.end, parseHhMm(DEFAULT_PO_WINDOW.end, 840));
  // Una ventana que cierra antes de abrir no bloquea a nadie por accidente.
  const end = formatHhMm(Math.max(endRaw, parseHhMm(start, 600)));

  return {
    enabled: raw.enabled !== false,
    days: days.length ? days : [...DEFAULT_PO_WINDOW.days],
    start,
    end,
    timeZone:
      typeof raw.timeZone === 'string' && raw.timeZone.trim()
        ? raw.timeZone.trim()
        : DEFAULT_PO_WINDOW.timeZone,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 300) : '',
  };
}

/** Valida lo que manda el panel antes de guardarlo. */
export function sanitizePoWindow(input: Partial<PoWindowConfig>): PoWindowConfig {
  return readPoWindow({ poWindow: input });
}

type LocalParts = { weekday: number; minutes: number; dayLabel: string };

/** Día de la semana y minutos del día *en la zona de la organización*. */
export function localParts(now: Date, timeZone: string): LocalParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    // Zona inválida guardada a mano: cae a UTC en vez de tumbar la petición.
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      hour12: false,
    }).formatToParts(now);
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
  open: boolean;
  /** Texto humano: "lunes y jueves de 10:00 a 14:00" */
  scheduleLabel: string;
  /** Cuándo vuelve a abrir, en palabras: "el jueves a las 10:00" */
  nextOpenLabel: string | null;
  /** Minuto local actual — útil para depurar husos */
  nowMinutes: number;
};

export function describeSchedule(config: PoWindowConfig): string {
  if (!config.enabled) return 'sin restricción de horario';
  if (!config.days.length) return 'sin días habilitados';
  const names = config.days.map((d) => DAY_NAMES[d]);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return `${list} de ${config.start} a ${config.end}`;
}

export function evaluatePoWindow(config: PoWindowConfig, now: Date = new Date()): PoWindowState {
  const scheduleLabel = describeSchedule(config);
  if (!config.enabled) {
    return { config, open: true, scheduleLabel, nextOpenLabel: null, nowMinutes: 0 };
  }

  const { weekday, minutes } = localParts(now, config.timeZone);
  const start = parseHhMm(config.start, 600);
  const end = parseHhMm(config.end, 840);
  const openToday = config.days.includes(weekday);
  const open = openToday && minutes >= start && minutes < end;

  let nextOpenLabel: string | null = null;
  if (!open && config.days.length) {
    if (openToday && minutes < start) {
      nextOpenLabel = `hoy a las ${config.start}`;
    } else {
      for (let delta = 1; delta <= 7; delta += 1) {
        const day = (weekday + delta) % 7;
        if (config.days.includes(day)) {
          nextOpenLabel =
            delta === 1
              ? `mañana (${DAY_NAMES[day]}) a las ${config.start}`
              : `el ${DAY_NAMES[day]} a las ${config.start}`;
          break;
        }
      }
    }
  }

  return { config, open, scheduleLabel, nextOpenLabel, nowMinutes: minutes };
}
