'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Props = {
  eventId: string;
  url?: string | null;
  canEdit: boolean;
  onChanged: () => void | Promise<void>;
  flash: (text: string, variant?: 'success' | 'error' | 'warn') => void;
};

/**
 * La boletera externa del evento, embebida en Resumen para consultar disponibilidad sin salir del
 * panel. Algunas boleteras no se dejan embeber y el navegador no avisa cuándo: por eso la liga para
 * abrirla aparte siempre está a la vista.
 */
export function BoleteraEmbed({ eventId, url, canEdit, onChanged, flash }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(url || '');
  }, [url]);

  if (!url && !canEdit) return null;

  const problem = value.trim() && !/^https:\/\/\S+$/i.test(value.trim()) ? 'Pega la liga completa, con https://' : '';

  async function save(next: string) {
    setSaving(true);
    try {
      await api(`/events/${eventId}`, { method: 'PATCH', body: JSON.stringify({ boleteraUrl: next || null }) });
      setEditing(false);
      flash(next ? 'Liga de la boletera guardada' : 'Liga de la boletera quitada');
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo guardar la liga', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface ev-boletera">
      <div className="surface__head">
        <h3 className="surface__title">Boletera en línea</h3>
        <div className="sx-actions">
          {url && !editing ? (
            <a className="btn-quiet" href={url} target="_blank" rel="noreferrer">
              Abrir aparte
            </a>
          ) : null}
          {canEdit && !editing ? (
            <button className="btn-quiet" type="button" onClick={() => setEditing(true)}>
              {url ? 'Cambiar liga' : 'Agregar liga'}
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <div className="surface__body">
          <form
            className="fx ev-boletera__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!problem && !saving) void save(value.trim());
            }}
          >
            <label className="fx-field">
              <span>Liga de la boletera</span>
              <input
                type="url"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="https://…"
                maxLength={500}
              />
            </label>
            {problem ? (
              <p className="fx-problem" role="alert">
                {problem}
              </p>
            ) : null}
            <div className="sx-actions">
              <button className="btn btn-sm" type="submit" disabled={saving || !!problem}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                className="btn-quiet"
                type="button"
                onClick={() => {
                  setValue(url || '');
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
              {url ? (
                <button className="btn-quiet" type="button" disabled={saving} onClick={() => void save('')}>
                  Quitar liga
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : url ? (
        <iframe
          className="ev-boletera__frame"
          src={url}
          title="Boletera del evento"
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        <div className="surface__body">
          <p className="muted kpi-sub">Agrega la liga de la venta en línea para consultarla desde aquí.</p>
        </div>
      )}
    </section>
  );
}
