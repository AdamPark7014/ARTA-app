'use client';

/**
 * Tarjetas grandes para crear/subir archivos en cada sección del evento.
 * El cliente es visual: cada acción dice qué crea y dónde queda.
 */
export type SectionCreateAction = {
  id: string;
  title: string;
  description: string;
  /** Color de acento visual */
  tone?: 'excel' | 'pdf' | 'upload' | 'doc';
  disabled?: boolean;
  /** Click directo (p. ej. generar plantilla). */
  onClick?: () => void;
  /** Si hay accept, se muestra como input file. */
  accept?: string;
  onFile?: (file: File) => void;
};

type SectionFileCreateProps = {
  /** Dónde quedará el archivo (ej. «Campaña», «este checklist»). */
  staysIn: string;
  actions: SectionCreateAction[];
  busy?: boolean;
};

const TONE_CLASS: Record<NonNullable<SectionCreateAction['tone']>, string> = {
  excel: 'file-create-card--excel',
  pdf: 'file-create-card--pdf',
  upload: 'file-create-card--upload',
  doc: 'file-create-card--doc',
};

export function SectionFileCreate({ staysIn, actions, busy }: SectionFileCreateProps) {
  if (!actions.length) return null;

  return (
    <div className="file-create">
      <p className="file-create__hint muted kpi-sub">
        Entra Word (.docx) o Excel (.xlsx) como copia de trabajo. Se edita{' '}
        <strong>solo aquí dentro</strong>; lo que sale del sistema es el{' '}
        <strong>PDF</strong>. Queda en <strong>{staysIn}</strong> y también en Documentos por
        sección.
      </p>
      <div className="file-create__grid">
        {actions.map((a) => {
          const cls = `file-create-card ${a.tone ? TONE_CLASS[a.tone] : ''} ${
            a.disabled || busy ? 'is-disabled' : ''
          }`;
          const body = (
            <>
              <span className="file-create-card__badge">
                {a.tone === 'excel'
                  ? 'Excel'
                  : a.tone === 'pdf'
                    ? 'PDF'
                    : a.tone === 'doc'
                      ? 'Doc'
                      : 'Subir'}
              </span>
              <strong className="file-create-card__title">{a.title}</strong>
              <span className="file-create-card__desc">{a.description}</span>
            </>
          );

          if (a.accept && a.onFile) {
            return (
              <label key={a.id} className={cls}>
                {body}
                <input
                  type="file"
                  hidden
                  disabled={a.disabled || busy}
                  accept={a.accept}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) a.onFile?.(f);
                  }}
                />
              </label>
            );
          }

          return (
            <button
              key={a.id}
              type="button"
              className={cls}
              disabled={a.disabled || busy}
              onClick={a.onClick}
            >
              {body}
            </button>
          );
        })}
      </div>
    </div>
  );
}
