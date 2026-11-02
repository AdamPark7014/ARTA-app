'use client';

import { useEffect, useState } from 'react';
import { askConfirm } from '@/components/ui/AskDialog';
import type { CollectionConfig, StudioRow } from './collections';
import { FieldsForm, type FormValues } from './FieldsForm';

type CollectionEditorProps = {
  config: CollectionConfig;
  rows: StudioRow[];
  canPublish: boolean;
  busy: boolean;
  linkOptions: Array<{ value: string; label: string }>;
  /** Guarda (crea si `id` es null). `publish`: dejarlo en el sitio; undefined = no cambia su estado. */
  onSave: (values: FormValues, id: string | null, publish: boolean | undefined) => Promise<boolean>;
  onSetLive: (row: StudioRow, live: boolean) => Promise<void>;
  onRemove: (row: StudioRow) => Promise<void>;
  onMove: (ids: string[]) => Promise<void>;
  onReview: (row: StudioRow) => Promise<void>;
  onError: (message: string) => void;
};

export function CollectionEditor({
  config,
  rows,
  canPublish,
  busy,
  linkOptions,
  onSave,
  onSetLive,
  onRemove,
  onMove,
  onReview,
  onError,
}: CollectionEditorProps) {
  /** null = cerrado; `new` = agregando; si no, el id de lo que se edita. */
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [formError, setFormError] = useState('');

  // Al cambiar de sección, el formulario abierto se cierra.
  useEffect(() => {
    setEditing(null);
    setFormError('');
  }, [config.key]);

  const editingRow = editing && editing !== 'new' ? rows.find((r) => r.id === editing) : null;
  const editingLive = editingRow ? config.view(editingRow).live : false;

  function openNew() {
    setValues(config.blank());
    setEditing('new');
    setFormError('');
  }

  function openRow(row: StudioRow) {
    setValues(config.fromRow(row));
    setEditing(row.id);
    setFormError('');
  }

  async function submit(publish: boolean | undefined) {
    const lacking = publish || editingLive ? config.missing(values) : config.required(values);
    if (lacking.length) {
      setFormError(`Falta ${lacking.join(', ')}.`);
      return;
    }
    setFormError('');
    const ok = await onSave(values, editing === 'new' ? null : editing, publish);
    if (ok) setEditing(null);
  }

  function move(index: number, delta: number) {
    const ids = rows.map((r) => r.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    void onMove(ids);
  }

  return (
    <div className="st-collection">
      {editing ? (
        <div className="st-sheet">
          <div className="st-sheet__head">
            <h3>{editing === 'new' ? config.addLabel : 'Editar'}</h3>
            <button className="btn ghost btn-sm" type="button" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
          <FieldsForm
            fields={config.fields}
            values={values}
            onChange={setValues}
            onError={onError}
            linkOptions={linkOptions}
            onMediaType={(_key, type) => setValues((v) => ({ ...v, mediaType: type }))}
          />
          {formError ? (
            <p className="st-form__error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="st-sheet__actions">
            {editingLive ? (
              <button className="btn" type="button" disabled={busy} onClick={() => void submit(undefined)}>
                Guardar cambios
              </button>
            ) : canPublish ? (
              <>
                <button className="btn" type="button" disabled={busy} onClick={() => void submit(true)}>
                  Publicar
                </button>
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void submit(false)}>
                  Guardar borrador
                </button>
              </>
            ) : (
              <button className="btn" type="button" disabled={busy} onClick={() => void submit(false)}>
                Guardar borrador
              </button>
            )}
          </div>
          <p className="st-note">
            {editingLive
              ? 'Ya está en el sitio: al guardar, el cambio se ve de inmediato.'
              : canPublish
                ? 'Un borrador solo se ve en la vista previa, marcado como borrador.'
                : 'Lo guardas como borrador y lo ves en la vista previa. Cuando esté listo, mándalo a revisión.'}
          </p>
        </div>
      ) : (
        <button className="btn st-add" type="button" onClick={openNew}>
          + {config.addLabel}
        </button>
      )}

      {rows.length ? (
        <ul className="st-rows">
          {rows.map((row, index) => {
            const view = config.view(row);
            // Lo publicado solo lo cambia quien publica.
            const locked = !canPublish && view.live;
            const state = view.live ? 'Publicado' : view.inReview ? 'En revisión' : 'Borrador';
            return (
              <li className={`st-row ${view.live ? '' : 'is-draft'} ${editing === row.id ? 'is-editing' : ''}`.trim()} key={row.id}>
                <div className="st-row__thumb">
                  {view.thumb ? (
                    view.video ? (
                      <video src={view.thumb} muted playsInline preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura de lo subido
                      <img src={view.thumb} alt="" loading="lazy" />
                    )
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </div>
                <div className="st-row__main">
                  <strong>{view.title}</strong>
                  {view.meta ? <span className="st-row__meta">{view.meta}</span> : null}
                  <span className={`badge ${view.live ? 'ok' : 'warn'} st-row__state`}>{state}</span>
                </div>
                <div className="st-row__actions">
                  {config.ordered ? (
                    <div className="st-order">
                      <button
                        type="button"
                        disabled={busy || index === 0}
                        aria-label={`Subir ${view.title}`}
                        onClick={() => move(index, -1)}
                      >
                        Subir
                      </button>
                      <button
                        type="button"
                        disabled={busy || index === rows.length - 1}
                        aria-label={`Bajar ${view.title}`}
                        onClick={() => move(index, 1)}
                      >
                        Bajar
                      </button>
                    </div>
                  ) : null}
                  <div className="st-row__buttons">
                    {locked ? (
                      <span className="st-note">Lo cambia dirección</span>
                    ) : (
                      <button className="btn ghost btn-sm" type="button" aria-label={`Editar ${view.title}`} onClick={() => openRow(row)}>
                        Editar
                      </button>
                    )}
                    {canPublish ? (
                      <button
                        className="btn ghost btn-sm"
                        type="button"
                        disabled={busy}
                        aria-label={`${view.live ? 'Despublicar' : 'Publicar'} ${view.title}`}
                        onClick={async () => {
                          if (!view.live) {
                            const lacking = config.missing(config.fromRow(row));
                            if (lacking.length) {
                              openRow(row);
                              setFormError(`Para publicar falta ${lacking.join(', ')}.`);
                              return;
                            }
                          }
                          await onSetLive(row, !view.live);
                        }}
                      >
                        {view.live ? 'Despublicar' : 'Publicar'}
                      </button>
                    ) : !view.live && !view.inReview ? (
                      <button
                        className="btn ghost btn-sm"
                        type="button"
                        disabled={busy}
                        aria-label={`Enviar a revisión ${view.title}`}
                        onClick={() => void onReview(row)}
                      >
                        Enviar a revisión
                      </button>
                    ) : null}
                    {view.href ? (
                      <a className="btn ghost btn-sm" href={view.href} target="_blank" rel="noopener noreferrer">
                        Ver
                      </a>
                    ) : null}
                    {locked ? null : (
                      <button
                        className="btn ghost btn-sm btn-danger"
                        type="button"
                        disabled={busy}
                        aria-label={`Quitar ${view.title}`}
                        onClick={async () => {
                          const yes = await askConfirm({
                            title: `¿Quitar ${config.noun}?`,
                            body: 'Se borra para siempre, también del sitio si estaba publicado.',
                            confirmLabel: 'Quitar',
                            danger: true,
                          });
                          if (yes) await onRemove(row);
                        }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : editing ? null : (
        <p className="st-empty">{config.emptyText}</p>
      )}
    </div>
  );
}
