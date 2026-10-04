'use client';

import type { EventDetail } from './event-detail.types';

/**
 * Datos del evento — el mismo formulario al crear y al editar.
 *
 * Junta 11-09-2026: «Artista» y «Nombre del evento» se fusionan en un solo
 * campo, «Fecha de inicio» pasa a «Fecha del evento», se agregan descripción,
 * horario y funciones, y la campaña ya no se decide aquí.
 *
 * Correcciones 30-09-2026: sin «Horario · cierra» (el cierre no se conoce y
 * varía) y un horario por función — con 2 funciones salen «Función 1» y
 * «Función 2», cada una con su hora.
 */
export type EventFormValue = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** Último día cuando hay varias funciones en días distintos. */
  endDate: string;
  /** HH:MM de cada función, en orden (Función 1, Función 2…). */
  times: string[];
  functions: string;
  venue: string;
  city: string;
  promoter: string;
  description: string;
};

export function emptyEventForm(): EventFormValue {
  return {
    name: '',
    date: '',
    endDate: '',
    times: [''],
    functions: '1',
    venue: '',
    city: 'Puebla',
    promoter: '',
    description: '',
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

function localDay(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Hasta cuántas funciones se piden horario una por una. */
export const MAX_FUNCTION_TIMES = 12;

/** Cuántos horarios pide el formulario según «Funciones» (mínimo 1). */
export function functionCount(functions: string): number {
  const n = Math.round(Number(functions));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_FUNCTION_TIMES) : 1;
}

/**
 * Horarios guardados → uno por función.
 *
 * «Función 1 — 16:00 · Función 2 — 20:00» da ['16:00', '20:00']. Los eventos
 * de antes guardaban «14:00 a 23:00» (abre a cierra): ahí solo cuenta la hora
 * de apertura, el cierre se dejó de capturar.
 */
export function parseSchedule(schedule?: string | null): string[] {
  const text = schedule || '';
  const times = (text.match(/\b\d{1,2}:\d{2}\b/g) || []).map((t) => t.padStart(5, '0'));
  if (/funci[oó]n/i.test(text)) return times;
  return times.length ? [times[0]] : [];
}

/** Lo que se guarda en `Event.schedule` y se lee en boletera, campaña y formatos. */
export function scheduleText(times: string[], functions: string): string {
  const count = functionCount(functions);
  const list = times.slice(0, count).map((t) => t.trim());
  if (count <= 1) return list[0] || '';
  return list
    .map((t, i) => (t ? `Función ${i + 1} — ${t}` : ''))
    .filter(Boolean)
    .join(' · ');
}

export function eventFormFromDetail(e: EventDetail): EventFormValue {
  const startTime = localTime(e.startsAt);
  const date = localDay(e.startsAt);
  const endDay = localDay(e.endsAt);
  const saved = parseSchedule(e.schedule);
  return {
    // Eventos viejos: si el artista no estaba ya dentro del nombre, se une.
    name:
      e.artist && !e.name.toLowerCase().includes(e.artist.toLowerCase())
        ? `${e.artist} · ${e.name}`
        : e.name,
    date,
    endDate: endDay && endDay !== date ? endDay : '',
    times: saved.length ? saved : [startTime !== '00:00' ? startTime : ''],
    functions: e.functions ? String(e.functions) : '1',
    venue: e.venue || '',
    city: e.city || '',
    promoter: e.promoter || '',
    description: e.description || '',
  };
}

function toIso(day: string, time: string): string | undefined {
  if (!day) return undefined;
  const d = new Date(`${day}T${time || '00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Lo que espera el API (`POST /events` y `PATCH /events/:id`). */
export function eventPayload(v: EventFormValue) {
  const functions = Number(v.functions);
  const firstTime = v.times.find((t) => t.trim()) || '';
  return {
    name: v.name.trim(),
    // El nombre ya lleva al artista: el campo aparte se vacía para no duplicar.
    artist: '',
    startsAt: toIso(v.date, firstTime),
    endsAt: v.endDate ? toIso(v.endDate, '23:59') ?? null : null,
    schedule: scheduleText(v.times, v.functions),
    functions: Number.isFinite(functions) && functions >= 1 ? Math.round(functions) : null,
    venue: v.venue.trim(),
    city: v.city.trim(),
    promoter: v.promoter.trim(),
    description: v.description.trim(),
  };
}

/** Por qué todavía no se puede guardar, o `null`. */
export function eventFormProblem(v: EventFormValue): string | null {
  if (!v.name.trim()) return 'Escribe el nombre del evento.';
  if (!v.date) return 'Elige la fecha del evento.';
  if (v.endDate && v.endDate < v.date) return 'El último día no puede ser antes de la fecha del evento.';
  return null;
}

export function EventFields({
  value,
  onChange,
  autoFocus,
}: {
  value: EventFormValue;
  onChange: (next: EventFormValue) => void;
  autoFocus?: boolean;
}) {
  const set = (patch: Partial<EventFormValue>) => onChange({ ...value, ...patch });
  const multiDay = Number(value.functions) > 1 || !!value.endDate;
  const count = functionCount(value.functions);
  const setTime = (index: number, time: string) => {
    const times = Array.from({ length: Math.max(count, value.times.length) }, (_, i) => value.times[i] || '');
    times[index] = time;
    set({ times });
  };

  return (
    <div className="fx">
      <label className="fx-span">
        Evento
        <input
          className="fx-input-lg"
          required
          autoFocus={autoFocus}
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Artista o nombre del show"
        />
      </label>

      <div className="fx-grid">
        <label>
          Fecha del evento
          <input type="date" required value={value.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label>
          Funciones
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={value.functions}
            onChange={(e) => set({ functions: e.target.value })}
          />
        </label>
        {multiDay ? (
          <label>
            Último día <span className="fx-hint">(si son varios días)</span>
            <input
              type="date"
              min={value.date || undefined}
              value={value.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
            />
          </label>
        ) : null}
      </div>

      <div className="fx-grid">
        {Array.from({ length: count }, (_, i) => (
          <label key={i}>
            {count > 1 ? `Función ${i + 1} · horario` : 'Horario'}
            <input
              type="time"
              value={value.times[i] || ''}
              aria-label={count > 1 ? `Horario de la función ${i + 1}` : 'Horario'}
              onChange={(e) => setTime(i, e.target.value)}
            />
          </label>
        ))}
        {Number(value.functions) > MAX_FUNCTION_TIMES ? (
          <p className="fx-hint fx-span">
            Se piden los horarios de las primeras {MAX_FUNCTION_TIMES} funciones; el resto va en la descripción.
          </p>
        ) : null}
      </div>

      <div className="fx-grid">
        <label>
          Venue
          <input value={value.venue} onChange={(e) => set({ venue: e.target.value })} placeholder="Recinto" />
        </label>
        <label>
          Ciudad
          <input value={value.city} onChange={(e) => set({ city: e.target.value })} />
        </label>
        <label>
          Promotor
          <input value={value.promoter} onChange={(e) => set({ promoter: e.target.value })} />
        </label>
      </div>

      <label className="fx-span">
        Descripción
        <textarea
          rows={4}
          value={value.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Lo que se cuenta del show: aparece en la boletera y en la campaña."
        />
      </label>
    </div>
  );
}
