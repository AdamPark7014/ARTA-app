'use client';

import { useEffect, useState } from 'react';
import type { Field } from '@/lib/site-blocks';
import { FieldsForm, type FormValues } from './FieldsForm';

type SectionEditorProps = {
  fields: Field[];
  /** Lo guardado: el borrador si hay, si no lo publicado o el texto de arranque. */
  initial: FormValues;
  hasDraft: boolean;
  canPublish: boolean;
  busy: boolean;
  linkOptions: Array<{ value: string; label: string }>;
  /** Mientras se escribe: la vista previa lo pinta sin guardar. */
  onLive: (values: FormValues) => void;
  /** `true` si se guardó; si falló, lo escrito se queda en el formulario. */
  onSave: (values: FormValues, publish: boolean) => Promise<boolean>;
  onDiscard: () => Promise<void>;
  onReview: () => Promise<void>;
  onError: (message: string) => void;
};

/** Textos de una sección. Quien lo usa le pone `key` por sección: cambiar de sección empieza de cero. */
export function SectionEditor({
  fields,
  initial,
  hasDraft,
  canPublish,
  busy,
  linkOptions,
  onLive,
  onSave,
  onDiscard,
  onReview,
  onError,
}: SectionEditorProps) {
  const [values, setValues] = useState<FormValues>(initial);
  const [dirty, setDirty] = useState(false);

  // Lo guardado cambió (se publicó, se descartó el borrador…): el formulario vuelve a leerlo.
  const savedJson = JSON.stringify(initial);
  useEffect(() => {
    setValues(JSON.parse(savedJson) as FormValues);
    setDirty(false);
  }, [savedJson]);

  function change(next: FormValues) {
    setValues(next);
    setDirty(true);
    onLive(next);
  }

  async function save(publish: boolean) {
    if (await onSave(values, publish)) setDirty(false);
  }

  return (
    <div className="st-section">
      {hasDraft && !dirty ? (
        <p className="st-banner">
          <strong>Hay un borrador sin publicar.</strong>{' '}
          {canPublish ? 'Revísalo en la vista previa y publícalo, o descártalo.' : 'Dirección lo revisa y lo publica.'}
        </p>
      ) : null}
      <FieldsForm fields={fields} values={values} onChange={change} onError={onError} linkOptions={linkOptions} />
      <div className="st-sheet__actions">
        {canPublish ? (
          <>
            <button className="btn" type="button" disabled={busy || (!dirty && !hasDraft)} onClick={() => void save(true)}>
              Publicar
            </button>
            <button className="btn ghost" type="button" disabled={busy || !dirty} onClick={() => void save(false)}>
              Guardar borrador
            </button>
            {hasDraft ? (
              <button className="btn ghost btn-danger" type="button" disabled={busy} onClick={() => void onDiscard()}>
                Descartar borrador
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button className="btn" type="button" disabled={busy || !dirty} onClick={() => void save(false)}>
              Guardar borrador
            </button>
            {hasDraft && !dirty ? (
              <button className="btn ghost" type="button" disabled={busy} onClick={() => void onReview()}>
                Enviar a revisión
              </button>
            ) : null}
          </>
        )}
        {dirty ? <span className="st-note">Sin guardar: la vista previa ya lo enseña.</span> : null}
      </div>
    </div>
  );
}
