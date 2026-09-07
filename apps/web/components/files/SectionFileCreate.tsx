'use client';

/**
 * Tarjetas grandes para crear/subir archivos en cada sección del evento.
 * El cliente es visual: cada acción dice qué crea, qué pasa después y dónde queda.
 */
export type SectionCreateAction = {
  id: string;
  title: string;
  description: string;
  /** Microcopy «Qué pasa después» bajo la descripción. */
  after?: string;
  /** Color de acento visual */
  tone?: 'excel' | 'pdf' | 'upload' | 'doc';
  /** Primaria = acento fuerte; secundaria = más discreta. */
  emphasis?: 'primary' | 'secondary';
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
  /** Compacto cuando ya hay archivos en la sección. */
  compact?: boolean;
  /** Oculta el párrafo de modelo (p. ej. si el panel ya lo explica arriba). */
  hideHint?: boolean;
};

const TONE_CLASS: Record<NonNullable<SectionCreateAction['tone']>, string> = {
  excel: 'file-create-card--excel',
  pdf: 'file-create-card--pdf',
  upload: 'file-create-card--upload',
  doc: 'file-create-card--doc',
};

const TONE_LABEL: Record<NonNullable<SectionCreateAction['tone']>, string> = {
  excel: 'Excel',
  pdf: 'PDF',
  upload: 'Subir',
  doc: 'Word',
};

function ToneIcon({ tone }: { tone?: SectionCreateAction['tone'] }) {
  const t = tone || 'upload';
  if (t === 'excel') {
    return (
      <span className="file-create-card__icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (t === 'pdf') {
    return (
      <span className="file-create-card__icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path
            d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8.5 14h7M8.5 17h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (t === 'doc') {
    return (
      <span className="file-create-card__icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path
            d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M14 3v5h5M8.5 12h7M8.5 15.5h7M8.5 19h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="file-create-card__icon" aria-hidden>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M12 16V5M12 5l-3.5 3.5M12 5l3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function SectionFileCreate({
  staysIn,
  actions,
  busy,
  compact,
  hideHint,
}: SectionFileCreateProps) {
  if (!actions.length) return null;

  return (
    <div className={`file-create ${compact ? 'file-create--compact' : ''}`}>
      {!hideHint ? (
        <p className="file-create__hint muted kpi-sub">
          Word o Excel entran una vez → se editan aquí → <strong>salen en PDF</strong>. Queda en{' '}
          <strong>{staysIn}</strong> y en Documentos por sección.
        </p>
      ) : null}
      <div className="file-create__grid">
        {actions.map((a) => {
          const emphasis = a.emphasis || (a.tone === 'upload' ? 'secondary' : 'primary');
          const cls = [
            'file-create-card',
            a.tone ? TONE_CLASS[a.tone] : '',
            emphasis === 'primary' ? 'file-create-card--primary' : 'file-create-card--secondary',
            a.disabled || busy ? 'is-disabled' : '',
          ]
            .filter(Boolean)
            .join(' ');

          const body = (
            <>
              <span className="file-create-card__top">
                <ToneIcon tone={a.tone} />
                <span className="file-create-card__badge">
                  {a.tone ? TONE_LABEL[a.tone] : 'Acción'}
                </span>
              </span>
              <strong className="file-create-card__title">{a.title}</strong>
              <span className="file-create-card__desc">{a.description}</span>
              {a.after && !compact ? (
                <span className="file-create-card__after">
                  <span className="file-create-card__after-label">Qué pasa después</span>
                  {a.after}
                </span>
              ) : null}
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
