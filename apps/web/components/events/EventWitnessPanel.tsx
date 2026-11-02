'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { askConfirm } from '@/components/ui/AskDialog';
import { EmptyLite, Pill, SectionHead, Seg, Tile } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import { openPendingTab } from '@/lib/open-tab';

/** Medios del API (`TESTIGO_MEDIA`), en el orden en que se piensan. */
export const WITNESS_MEDIA = [
  ['ESPECTACULAR', 'Espectaculares'],
  ['PENDON', 'Pendones'],
  ['PRENSA', 'Prensa'],
  ['RADIO', 'Radio'],
  ['TV', 'Televisión'],
  ['REDES', 'Redes sociales'],
  ['WEB', 'Web'],
  ['OTRO', 'Otros'],
] as const;

const MEDIUM_LABEL: Record<string, string> = Object.fromEntries(WITNESS_MEDIA);

export type Witness = {
  id: string;
  medium: string;
  title: string;
  note?: string | null;
  link?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  publishedAt?: string | null;
  isPublic?: boolean;
  createdAt: string;
  createdBy?: { id: string; fullName: string } | null;
};

const emptyForm = { title: '', medium: 'ESPECTACULAR', note: '', link: '', publishedAt: '', isPublic: false };

function dayLabel(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Props = {
  eventId: string;
  closed: boolean;
  canEdit: boolean;
  flash: (text: string, variant?: 'success' | 'error' | 'info' | 'warn') => void;
};

/**
 * Testigos de publicidad: la prueba de que cada anuncio salió. Los practicantes los van subiendo y al
 * final se arma un solo archivo por evento. Lo marcado «en el sitio» es lo que puede usar Studio.
 */
export function EventWitnessPanel({ eventId, closed, canEdit, flash }: Props) {
  const [rows, setRows] = useState<Witness[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = canEdit && !closed;

  const load = useCallback(async () => {
    try {
      setRows(await api<Witness[]>(`/testigos/event/${eventId}`));
    } catch (e) {
      setRows([]);
      flash(e instanceof Error ? e.message : 'No se pudieron cargar los testigos', 'error');
    }
    // `flash` cambia en cada render de la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) map.set(r.medium, (map.get(r.medium) ?? 0) + 1);
    return map;
  }, [rows]);

  const options = useMemo(
    () => [
      { key: 'all', label: 'Todos', count: rows?.length ?? 0 },
      ...WITNESS_MEDIA.filter(([k]) => counts.has(k)).map(([key, label]) => ({
        key: key as string,
        label,
        count: counts.get(key) ?? 0,
      })),
    ],
    [rows, counts],
  );

  const visible = (rows ?? []).filter((r) => filter === 'all' || r.medium === filter);
  const onSite = (rows ?? []).filter((r) => r.isPublic).length;
  const problem = !file && !form.link.trim() ? 'Sube una foto o archivo, o pega una liga' : '';

  async function create(e: FormEvent) {
    e.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      if (form.title.trim()) fd.append('title', form.title.trim());
      fd.append('medium', form.medium);
      if (form.note.trim()) fd.append('note', form.note.trim());
      if (form.link.trim()) fd.append('link', form.link.trim());
      if (form.publishedAt) fd.append('publishedAt', new Date(`${form.publishedAt}T12:00:00`).toISOString());
      if (form.isPublic) fd.append('isPublic', 'true');
      await api(`/testigos/event/${eventId}`, { method: 'POST', body: fd });
      setForm({ ...emptyForm, medium: form.medium });
      setFile(null);
      setAdding(false);
      flash('Testigo agregado');
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se pudo agregar', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic(row: Witness) {
    try {
      await api(`/testigos/${row.id}`, { method: 'PATCH', body: JSON.stringify({ isPublic: !row.isPublic }) });
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se pudo cambiar', 'error');
    }
  }

  async function remove(row: Witness) {
    if (!(await askConfirm({ title: `¿Quitar «${row.title}»?`, danger: true }))) return;
    try {
      await api(`/testigos/${row.id}`, { method: 'DELETE' });
      flash('Testigo quitado');
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se pudo quitar', 'error');
    }
  }

  async function makeFile() {
    setBusy(true);
    // Safari solo abre pestañas dentro del clic: se abre antes del primer `await`.
    const tab = openPendingTab('Armando el archivo de testigos…');
    try {
      const done = await api<{ url: string }>(`/testigos/event/${eventId}/pdf`, { method: 'POST', body: '{}' });
      tab.go(done.url);
      flash('Archivo de testigos listo');
    } catch (err) {
      tab.close();
      flash(err instanceof Error ? err.message : 'No se pudo armar el archivo', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sx-stack">
      <SectionHead title="Testigos de publicidad" sub="La evidencia de cada anuncio del evento; al final se arma un solo archivo.">
        {rows?.length ? (
          <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={() => void makeFile()}>
            Armar archivo PDF
          </button>
        ) : null}
        {editable ? (
          <button className={`btn btn-sm ${adding ? 'ghost' : ''}`} type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cerrar' : 'Agregar testigo'}
          </button>
        ) : null}
      </SectionHead>

      {adding && editable ? (
        <section className="surface">
          <form className="fx witness-form" onSubmit={create}>
            <label className="fx-field">
              <span>Medio</span>
              <select value={form.medium} onChange={(e) => setForm({ ...form, medium: e.target.value })}>
                {WITNESS_MEDIA.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fx-field">
              <span>Título</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Espectacular Vía Atlixcáyotl"
                maxLength={200}
              />
            </label>
            <label className="fx-field">
              <span>Fecha en que salió</span>
              <input
                type="date"
                value={form.publishedAt}
                onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
              />
            </label>
            <div className="fx-field">
              <span>Foto o archivo</span>
              <div className="witness-form__file">
                <label className="btn ghost btn-sm module-upload">
                  {file ? 'Cambiar' : 'Elegir archivo'}
                  <input
                    type="file"
                    hidden
                    accept="image/*,video/*,.pdf"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>
                {file ? <span className="t-small muted">{file.name}</span> : null}
              </div>
            </div>
            <label className="fx-field">
              <span>Liga (redes, nota, video)</span>
              <input
                type="url"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder="https://…"
                maxLength={500}
              />
            </label>
            <label className="fx-field witness-form__wide">
              <span>Nota</span>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Proveedor, ubicación o lo que ayude a ubicarlo"
                maxLength={1000}
              />
            </label>
            <label className="witness-form__check witness-form__wide">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
              />
              <span>Disponible para el sitio web</span>
            </label>
            <div className="sx-actions witness-form__wide">
              <button className="btn btn-sm" type="submit" disabled={busy || !!problem}>
                {busy ? 'Subiendo…' : 'Agregar'}
              </button>
              {problem ? <span className="t-small muted">{problem}</span> : null}
            </div>
          </form>
        </section>
      ) : null}

      {rows === null ? (
        <p className="muted kpi-sub" role="status">
          Cargando testigos…
        </p>
      ) : !rows.length ? (
        <div className="surface">
          <EmptyLite
            icon="+"
            title="Sin testigos todavía"
            text={editable ? 'Sube la primera foto o pega la liga de la publicación.' : 'Cuando se suban, aparecerán aquí.'}
          />
        </div>
      ) : (
        <>
          <div className="tiles">
            <Tile label="Testigos" value={rows.length} sub={`${counts.size} ${counts.size === 1 ? 'medio' : 'medios'}`} />
            <Tile label="Para el sitio" value={onSite} sub={onSite ? 'Disponibles en Studio' : 'Ninguno marcado'} />
          </div>
          {options.length > 2 ? <Seg options={options} value={filter} onChange={setFilter} label="Filtrar por medio" /> : null}
          <div className="witness-grid">
            {visible.map((row) => (
              <article key={row.id} className="witness-card">
                {row.fileUrl && row.mimeType?.startsWith('image/') ? (
                  <a className="witness-card__media" href={row.fileUrl} target="_blank" rel="noreferrer">
                    {/* Fotos subidas por el equipo: tamaño libre y sin optimizador. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.fileUrl} alt={row.title} loading="lazy" />
                  </a>
                ) : (
                  <div className="witness-card__media witness-card__media--empty" aria-hidden>
                    {MEDIUM_LABEL[row.medium] ?? row.medium}
                  </div>
                )}
                <div className="witness-card__body">
                  <div className="witness-card__meta">
                    <Pill tone="draft">{MEDIUM_LABEL[row.medium] ?? row.medium}</Pill>
                    {row.isPublic ? <Pill tone="ok">En el sitio</Pill> : null}
                  </div>
                  <h4 className="witness-card__title">{row.title}</h4>
                  {row.note ? <p className="t-small muted">{row.note}</p> : null}
                  <p className="t-small muted">
                    {[dayLabel(row.publishedAt), row.createdBy?.fullName].filter(Boolean).join(' · ')}
                  </p>
                  <div className="witness-card__actions">
                    {row.fileUrl && !row.mimeType?.startsWith('image/') ? (
                      <a className="btn-quiet" href={row.fileUrl} target="_blank" rel="noreferrer">
                        {row.fileName || 'Abrir archivo'}
                      </a>
                    ) : null}
                    {row.link ? (
                      <a className="btn-quiet" href={row.link} target="_blank" rel="noreferrer">
                        Abrir liga
                      </a>
                    ) : null}
                    {editable ? (
                      <>
                        <button className="btn-quiet" type="button" onClick={() => void togglePublic(row)}>
                          {row.isPublic ? 'Quitar del sitio' : 'Para el sitio'}
                        </button>
                        <button className="btn-quiet" type="button" onClick={() => void remove(row)}>
                          Quitar
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
