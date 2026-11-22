'use client';

import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';

/**
 * Subir archivos sin el control nativo («Choose File · No file chosen»), siempre en
 * español y alcanzable con teclado: un <button> real abre el <input type=file> oculto.
 *
 * 1) `UploadButton`: sube en cuanto se elige (comprobante, anexo, foto).
 *
 *   <UploadButton accept="application/pdf,image/*" onPick={async ([file]) => { await subir(file); }}>
 *     Subir comprobante
 *   </UploadButton>
 *
 *   Si `onPick` devuelve una promesa, el botón dice «Subiendo…», queda ocupado
 *   (aria-busy) y no se puede volver a tocar hasta que termine. Con `busy` lo controla
 *   la pantalla. `variant`: 'ghost' (por defecto, contorno) · 'primary' · 'quiet'.
 *
 * 2) `FilePick`: elegir archivos dentro de un formulario que se envía después
 *   (entregar tarea, solicitar anticipo). Zona «Arrastra o elige» y, debajo, la
 *   lista de lo elegido con nombre, peso y «Quitar».
 *
 *   const [files, setFiles] = useState<File[]>([]);
 *   <FilePick label="Evidencia" files={files} onChange={setFiles} multiple
 *             accept="image/*,application/pdf" hint="Fotos, PDF o Excel." />
 */

type UploadButtonProps = {
  onPick: (files: File[]) => void | Promise<unknown>;
  children?: ReactNode;
  accept?: string;
  multiple?: boolean;
  /** Ocupado por fuera (la pantalla ya está subiendo). */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  variant?: 'ghost' | 'primary' | 'quiet';
  size?: 'sm' | 'md';
  /** «environment» abre la cámara trasera en el teléfono. */
  capture?: 'user' | 'environment';
  className?: string;
  /** Nombre accesible cuando el texto visible no basta («Subir comprobante de la OC 12»). */
  'aria-label'?: string;
  title?: string;
};

function UploadIcon() {
  return (
    <svg className="upbtn__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UploadButton({
  onPick,
  children = 'Subir archivo',
  accept,
  multiple = false,
  busy,
  busyLabel = 'Subiendo…',
  disabled = false,
  variant = 'ghost',
  size = 'md',
  capture,
  className = '',
  'aria-label': ariaLabel,
  title,
}: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [working, setWorking] = useState(false);
  const isBusy = busy ?? working;

  async function picked(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    // Vaciar el input deja volver a elegir el mismo archivo después de un error.
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) return;
    const result = onPick(files);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setWorking(true);
      try {
        await result;
      } finally {
        setWorking(false);
      }
    }
  }

  const tone = variant === 'primary' ? 'btn' : variant === 'quiet' ? 'btn-quiet' : 'btn ghost';
  return (
    <span className={`upbtn ${className}`.trim()}>
      <button
        type="button"
        className={`${tone} ${size === 'sm' ? 'btn-sm' : ''} upbtn__btn`.replace(/\s+/g, ' ').trim()}
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isBusy}
        aria-busy={isBusy || undefined}
        aria-label={ariaLabel}
        title={title}
      >
        {isBusy ? <span className="upbtn__spin" aria-hidden /> : <UploadIcon />}
        <span>{isBusy ? busyLabel : children}</span>
      </button>
      <input
        ref={inputRef}
        className="upbtn__input"
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void picked(e.target.files)}
      />
    </span>
  );
}

/** «1.2 MB», «340 kB». */
export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

type FilePickProps = {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  capture?: 'user' | 'environment';
  disabled?: boolean;
  /** Mensaje de error del campo (una línea); se enlaza con aria-describedby. */
  error?: string | null;
};

export function FilePick({
  files,
  onChange,
  label,
  hint,
  accept,
  multiple = false,
  capture,
  disabled = false,
  error,
}: FilePickProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;

  function add(list: FileList | null) {
    const next = list ? Array.from(list) : [];
    if (inputRef.current) inputRef.current.value = '';
    if (!next.length) return;
    onChange(multiple ? [...files, ...next] : next.slice(0, 1));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (!disabled) add(e.dataTransfer.files);
  }

  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  const pickText = files.length && multiple ? 'Agregar otro' : files.length ? 'Cambiar archivo' : multiple ? 'Elegir archivos' : 'Elegir archivo';

  return (
    <div className={`fpick ${over ? 'is-over' : ''} ${error ? 'is-invalid' : ''}`.trim()}>
      {label ? (
        <span className="fpick__label" id={`${id}-label`}>
          {label}
        </span>
      ) : null}
      <div
        className="fpick__zone"
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <UploadIcon />
        <span className="fpick__text">Arrastra aquí o</span>
        <button
          type="button"
          className="btn ghost btn-sm fpick__btn"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-labelledby={label ? `${id}-label ${id}-btn` : undefined}
          id={`${id}-btn`}
          aria-invalid={error ? true : undefined}
        >
          {pickText}
        </button>
        <input
          ref={inputRef}
          className="upbtn__input"
          type="file"
          accept={accept}
          multiple={multiple}
          capture={capture}
          tabIndex={-1}
          aria-hidden
          onChange={(e) => add(e.target.files)}
        />
      </div>
      {hint ? (
        <p className="fpick__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="fpick__error" id={errId} role="alert">
          {error}
        </p>
      ) : null}
      {files.length ? (
        <ul className="fpick__list" aria-label="Archivos elegidos">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="fpick__item">
              <span className="fpick__name" title={f.name}>
                {f.name}
              </span>
              <span className="fpick__size">{fileSize(f.size)}</span>
              <button
                type="button"
                className="btn-quiet fpick__remove"
                aria-label={`Quitar ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                disabled={disabled}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
