'use client';

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { Field } from '@/lib/site-blocks';
import { uploadSiteMedia } from '@/lib/studio-upload';

export type FormValues = Record<string, unknown>;

type FieldsFormProps = {
  fields: Field[];
  values: FormValues;
  onChange: (next: FormValues) => void;
  /** Avisos de carga: el error ya viene escrito para quien edita. */
  onError: (message: string) => void;
  /** Direcciones que se ofrecen en los campos de enlace (secciones del sitio). */
  linkOptions?: Array<{ value: string; label: string }>;
  /** La foto subida ya tiene video/imagen: lo guarda quien usa el formulario. */
  onMediaType?: (key: string, type: 'image' | 'video') => void;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function isVideoUrl(url: string) {
  return /\.(mp4|m4v|mov|webm)(\?|$)/i.test(url);
}

function MediaField({
  field,
  value,
  onValue,
  onError,
  onMediaType,
}: {
  field: Extract<Field, { type: 'media' }>;
  value: string;
  onValue: (url: string) => void;
  onError: (message: string) => void;
  onMediaType?: (key: string, type: 'image' | 'video') => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState(false);
  const inputId = useId();

  async function send(file?: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await uploadSiteMedia(file, { allowVideo: field.video });
      onValue(uploaded.url);
      onMediaType?.(field.key, uploaded.type);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo subir el archivo');
    } finally {
      setBusy(false);
    }
  }

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    void send(e.target.files?.[0]);
    e.target.value = '';
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    void send(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="st-field st-field--wide">
      <span className="st-field__label">{field.label}</span>
      <div
        className={`st-media ${value ? 'has-file' : ''} ${over ? 'is-over' : ''}`.trim()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {value ? (
          isVideoUrl(value) ? (
            <video src={value} muted playsInline controls preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- vista de lo recién subido
            <img src={value} alt="" />
          )
        ) : (
          <div className="st-media__empty">
            <strong>{busy ? 'Subiendo…' : 'Arrastra el archivo aquí'}</strong>
            <span>{field.ratio || 'JPG o PNG'}</span>
          </div>
        )}
        <div className="st-media__actions">
          <label className="btn ghost btn-sm" htmlFor={inputId}>
            {busy ? 'Subiendo…' : value ? 'Cambiar' : field.video ? 'Subir foto o video' : 'Subir foto'}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className="st-media__input"
            type="file"
            accept={field.video ? 'image/*,video/mp4,video/quicktime,video/webm' : 'image/*'}
            onChange={onPick}
          />
          {value ? (
            <button className="btn ghost btn-sm" type="button" onClick={() => onValue('')}>
              Quitar
            </button>
          ) : (
            <button className="btn-quiet st-media__paste" type="button" onClick={() => setPaste((v) => !v)}>
              Pegar enlace
            </button>
          )}
        </div>
      </div>
      {paste && !value ? (
        <input
          className="st-media__url"
          aria-label={`Enlace de ${field.label}`}
          placeholder="https://…"
          onBlur={(e) => {
            const url = e.target.value.trim();
            if (url) onValue(url);
          }}
        />
      ) : null}
      {field.hint ? <small>{field.hint}</small> : null}
    </div>
  );
}

function ListField({
  field,
  value,
  onValue,
  onError,
  linkOptions,
}: {
  field: Extract<Field, { type: 'list' }>;
  value: unknown;
  onValue: (next: FormValues[]) => void;
  onError: (message: string) => void;
  linkOptions?: FieldsFormProps['linkOptions'];
}) {
  const rows = Array.isArray(value) ? (value as FormValues[]) : [];
  const move = (i: number, delta: number) => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + delta, 0, row);
    onValue(next);
  };
  return (
    <fieldset className="st-list st-field--wide">
      <legend>{field.label}</legend>
      {rows.map((row, i) => (
        <div className="st-list__row" key={i}>
          <div className="st-list__head">
            <span>
              {field.itemLabel} {i + 1}
            </span>
            <div className="st-order">
              <button type="button" disabled={i === 0} aria-label={`Subir ${field.itemLabel} ${i + 1}`} onClick={() => move(i, -1)}>
                Subir
              </button>
              <button
                type="button"
                disabled={i === rows.length - 1}
                aria-label={`Bajar ${field.itemLabel} ${i + 1}`}
                onClick={() => move(i, 1)}
              >
                Bajar
              </button>
              <button
                type="button"
                aria-label={`Quitar ${field.itemLabel} ${i + 1}`}
                onClick={() => onValue(rows.filter((_, j) => j !== i))}
              >
                Quitar
              </button>
            </div>
          </div>
          <FieldsForm
            fields={field.fields}
            values={row}
            onChange={(next) => onValue(rows.map((r, j) => (j === i ? next : r)))}
            onError={onError}
            linkOptions={linkOptions}
          />
        </div>
      ))}
      <button className="btn ghost btn-sm" type="button" onClick={() => onValue([...rows, {}])}>
        + {field.addLabel}
      </button>
    </fieldset>
  );
}

/** La ayuda va fuera de la etiqueta: si no, un lector de pantalla la lee como parte del nombre del campo. */
function TextField({
  field,
  value,
  onValue,
  listId,
}: {
  field: Extract<Field, { type: 'text' | 'textarea' | 'link' | 'date' | 'time' | 'select' }>;
  value: string;
  onValue: (value: string) => void;
  listId?: string;
}) {
  const id = useId();
  const hintId = field.hint ? `${id}-ayuda` : undefined;
  const half = 'half' in field && field.half;
  return (
    <div className={`st-field ${half ? '' : 'st-field--wide'}`.trim()}>
      <label className="st-field__label" htmlFor={id}>
        {field.label}
      </label>
      {field.type === 'textarea' ? (
        <textarea
          id={id}
          aria-describedby={hintId}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onValue(e.target.value)}
        />
      ) : field.type === 'select' ? (
        <select id={id} aria-describedby={hintId} value={value || field.options[0]?.value} onChange={(e) => onValue(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          aria-describedby={hintId}
          type={field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'}
          placeholder={field.placeholder ?? (field.type === 'link' ? 'https://… o elige una página' : undefined)}
          list={listId}
          value={value}
          onChange={(e) => onValue(e.target.value)}
        />
      )}
      {field.hint ? <small id={hintId}>{field.hint}</small> : null}
    </div>
  );
}

/** Formulario hecho de datos: los campos de cada sección y contenido viven en `lib/site-blocks.ts`. */
export function FieldsForm({ fields, values, onChange, onError, linkOptions, onMediaType }: FieldsFormProps) {
  const listId = useId();
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });
  const basic = fields.filter((f) => !('advanced' in f && f.advanced));
  const advanced = fields.filter((f) => 'advanced' in f && f.advanced);

  const render = (field: Field) => {
    if (field.type === 'media') {
      return (
        <MediaField
          key={field.key}
          field={field}
          value={text(values[field.key])}
          onValue={(url) => set(field.key, url)}
          onError={onError}
          onMediaType={onMediaType}
        />
      );
    }
    if (field.type === 'list') {
      return (
        <ListField
          key={field.key}
          field={field}
          value={values[field.key]}
          onValue={(next) => set(field.key, next)}
          onError={onError}
          linkOptions={linkOptions}
        />
      );
    }
    return <TextField key={field.key} field={field} value={text(values[field.key])} onValue={(v) => set(field.key, v)} listId={field.type === 'link' && linkOptions?.length ? listId : undefined} />;
  };

  return (
    <div className="st-form">
      {basic.map(render)}
      {advanced.length ? (
        <details className="st-advanced st-field--wide">
          <summary>Opciones avanzadas</summary>
          <div className="st-form">{advanced.map(render)}</div>
        </details>
      ) : null}
      {linkOptions?.length ? (
        <datalist id={listId}>
          {linkOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
