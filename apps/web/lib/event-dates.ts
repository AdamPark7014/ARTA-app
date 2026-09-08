/**
 * Fechas del show, sin que la zona horaria las mueva.
 *
 * El formulario manda lo que escupe un `<input type="datetime-local">`:
 * `2026-09-19T20:00`, una fecha **sin zona**. El API hacía `new Date(valor)`,
 * y Node interpreta eso en la zona del proceso. En una laptop de Puebla sale
 * bien; en el contenedor —que corre en UTC porque nadie fijó `TZ`— ese mismo
 * show de las 20:00 se guardaba como 20:00Z, o sea las 14:00 de Puebla. Seis
 * horas de corrimiento, y en shows de noche **el día cambiaba**: el panel
 * anunciaba el evento un día después del real.
 *
 * Se arregla del lado del navegador, que es el único que sabe con certeza en
 * qué zona está la persona: se manda un instante absoluto y ya no hay nada
 * que interpretar.
 */

/** `<input type="datetime-local">` → instante absoluto (ISO con zona). */
export function fromLocalInputValue(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Instante absoluto → el formato que el `<input>` sabe pintar, en hora local. */
export function toLocalInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** «sáb, 19 sep 2026, 8:00 p.m.» — para leer, no para editar. */
export function formatEventDate(iso?: string | null): string {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toLocaleString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
