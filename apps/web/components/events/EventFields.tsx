'use client';

import type { EventDetail } from './event-detail.types';

/**
 * Datos del evento — el mismo formulario al crear y al editar.
 *
 * Junta 11-09-2026: «Artista» y «Nombre del evento» se fusionan en un solo
 * campo, «Fecha de inicio» pasa a «Fecha del evento», se agregan descripción,
 * horario y funciones, y la campaña ya no se decide aquí.
 */
export type EventFormValue = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** Último día cuando hay varias funciones en días distintos. */
  endDate: string;
  /** HH:MM */
  timeFrom: string;
  timeTo: string;
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
    timeFrom: '',
    timeTo: '',
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

/** «14:00 a 23:00» → ['14:00', '23:00']. */
export function parseSchedule(schedule?: string | null): [string, string] {
  const times = (schedule || '').match(/\b\d{1,2}:\d{2}\b/g) || [];
  const norm = (t?: string) => (t ? t.padStart(5, '0') : '');
  return [norm(times[0]), norm(times[1])];
}

export function eventFormFromDetail(e: EventDetail): EventFormValue {
  const [fromSchedule, toSchedule] = parseSchedule(e.schedule);
  const startTime = localTime(e.startsAt);
  const date = localDay(e.startsAt);
  const endDay = localDay(e.endsAt);
  return {
    // Eventos viejos: si el artista no estaba ya dentro del nombre, se une.
    name:
      e.artist && !e.name.toLowerCase().includes(e.artist.toLowerCase())
        ? `${e.artist} · ${e.name}`
        : e.name,
    date,
    endDate: endDay && endDay !== date ? endDay : '',
    timeFrom: fromSchedule || (startTime !== '00:00' ? startTime : ''),
    timeTo: toSchedule,
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
  const schedule =
    v.timeFrom && v.timeTo ? `${v.timeFrom} a ${v.timeTo}` : v.timeFrom ? `Desde las ${v.timeFrom}` : '';
  return {
    name: v.name.trim(),
    // El nombre ya lleva al artista: el campo aparte se vacía para no duplicar.
    artist: '',
    startsAt: toIso(v.date, v.timeFrom),
    endsAt: v.endDate ? toIso(v.endDate, v.timeTo || '23:59') ?? null : null,
    schedule,
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
          Horario · abre
          <input type="time" value={value.timeFrom} onChange={(e) => set({ timeFrom: e.target.value })} />
        </label>
        <label>
          Horario · cierra
          <input type="time" value={value.timeTo} onChange={(e) => set({ timeTo: e.target.value })} />
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
