'use client';

import { useEffect, useRef, useMemo } from 'react';
import { AttachmentField, TableField } from '@/components/events/ChecklistFieldControls';
import {
  NO_LABEL,
  YES_LABEL,
  isCheckItem,
  type Checklist,
  type ChecklistItem,
  type ChecklistSection,
  type EventFile,
} from '@/components/events/event-detail.types';

/**
 * El formato como documento: la hoja con la marca del cliente, igual que el
 * PDF que sale del sistema, pero **editable en sitio**. Es lo acordado: los
 * formatos que eran Word se ven y se llenan como un Word hasta que salen en
 * PDF; nada de formulario aparte ni de escribir encima de un PDF impreso.
 *
 * Misma estructura que `checklist-pdf.service.ts`: encabezado en rejilla,
 * secciones, casillas a dos columnas, línea por dato, SÍ/NO, recuadro de texto
 * largo, tablas con totales, adjuntos y firmas.
 */

type Props = {
  event: { name: string; artist?: string | null; venue?: string | null; city?: string | null; entity: string };
  checklist: Pick<
    Checklist,
    'title' | 'status' | 'revision' | 'lastEditedAt' | 'lastEditedBy' | 'deliveredSignature' | 'authorizedSignature'
  >;
  sections: ChecklistSection[];
  readOnly: boolean;
  files: EventFile[];
  onUpdateItem: (sectionId: string, itemId: string, patch: Partial<ChecklistItem>) => void;
  onUpload?: (file: File) => Promise<EventFile | void>;
  /** Abre el cajón de firmas al tocar una firma pendiente. */
  onOpenSignatures?: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  SEALED: 'Sellado',
};

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function isHeader(section: ChecklistSection): boolean {
  return section.layout === 'header' || section.id === 'encabezado';
}

function twoColumns(section: ChecklistSection): boolean {
  const checks = section.items.filter(isCheckItem);
  return checks.length === section.items.length && (section.layout === 'columns' || checks.length > 6);
}

export function FormatSheet({
  event,
  checklist,
  sections,
  readOnly,
  files,
  onUpdateItem,
  onUpload,
  onOpenSignatures,
}: Props) {
  const completion = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (const s of sections) {
      for (const item of s.items) {
        total += 1;
        const v = (item as any).done ? true : (item as any).value;
        if (Array.isArray((item as any).rows)) {
          const rows = (item as any).rows as any[];
          if (rows.some((r) => Object.values(r).some((c) => c !== null && c !== ''))) filled += 1;
        } else if (v !== null && v !== undefined && String(v).trim() !== '') {
          filled += 1;
        }
      }
    }
    const pct = total ? Math.round((filled / total) * 100) : 0;
    return { total, filled, pct };
  }, [sections]);
  const entityLabel = event.entity === 'EXPLANADA' ? 'AUDITORIO AREMA · EXPLANADA' : 'ARTA PRODUCCIONES';
  const sub = [event.name, event.artist, event.venue, event.city]
    .map((v) => (v ?? '').trim())
    .filter((v, i, all) => v && all.indexOf(v) === i)
    .join(' · ');
  const status = STATUS_LABEL[checklist.status || 'DRAFT'] || 'Borrador';

  const patch = (section: ChecklistSection, item: ChecklistItem) => (p: Partial<ChecklistItem>) =>
    onUpdateItem(section.id, item.id, p);

  return (
    <div className={`fsheet-wrap ${readOnly ? 'is-readonly' : ''}`}>
      <aside className="fsheet-outline" aria-label="Progreso y secciones">
        <div className="fsheet-outline__head">
          <strong>Avance</strong>
          <span className="fsheet-outline__pct">{completion.pct}%</span>
        </div>
        <ol className="fsheet-outline__list">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#sec-${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </aside>
      <article className={`fsheet ${event.entity === 'EXPLANADA' ? 'fsheet--explanada' : ''}`} aria-label={checklist.title}>
        <header className="fsheet__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="fsheet__logo" src="/brand/arta-logo-ink.png" alt="Arta Producciones" />
          <div className="fsheet__meta">
            <span className="fsheet__entity">{entityLabel}</span>
            <span>{status.toUpperCase()}</span>
            {checklist.revision ? <span>Rev. {checklist.revision}</span> : null}
            {checklist.lastEditedBy ? (
              <span>
                Última edición: {checklist.lastEditedBy.fullName}
                {checklist.lastEditedAt ? ` · ${fmtDateTime(checklist.lastEditedAt)}` : ''}
              </span>
            ) : null}
          </div>
        </header>

        <h1 className="fsheet__title">{checklist.title}</h1>
        <p className="fsheet__sub">{sub || ' '}</p>
        <div className="fsheet__rule" aria-hidden />

        {sections.map((section) =>
          isHeader(section) ? (
            <div key={section.id} className="fsheet__grid" role="group" aria-label={section.title}>
              {section.items.map((item) => (
                <label
                  key={item.id}
                  className="fsheet__cell"
                  style={{ gridColumn: `span ${Math.min(12, Math.max(2, item.cols ?? 6))}` }}
                >
                  <span className="fsheet__lbl">{item.label}</span>
                  <ValueInput item={item} readOnly={readOnly} onPatch={patch(section, item)} ariaLabel={item.label} compact />
                </label>
              ))}
            </div>
          ) : (
            <section key={section.id} className="fsheet__sec" aria-label={section.title} id={`sec-${section.id}`}>
              <h2 className="fsheet__sec-title">{section.title}</h2>
              {twoColumns(section) ? (
                <div className="fsheet__checks fsheet__checks--cols">
                  {section.items.map((item) => (
                    <CheckLine key={item.id} item={item} readOnly={readOnly} onPatch={patch(section, item)} />
                  ))}
                </div>
              ) : (
                section.items.map((item) => {
                  if (isCheckItem(item)) {
                    return <CheckLine key={item.id} item={item} readOnly={readOnly} onPatch={patch(section, item)} />;
                  }
                  if (item.type === 'table') {
                    const showLabel = section.items.length > 1 || section.title !== item.label;
                    return (
                      <div key={item.id} className="fsheet__block fsheet__block--table">
                        {showLabel ? <span className="fsheet__lbl">{item.label}:</span> : null}
                        <TableField item={item} readOnly={readOnly} onPatch={patch(section, item)} />
                      </div>
                    );
                  }
                  if (item.type === 'longtext') {
                    return (
                      <label key={item.id} className="fsheet__block">
                        <span className="fsheet__lbl">{item.label}:</span>
                        <textarea
                          className="fsheet__area"
                          rows={3}
                          disabled={readOnly}
                          value={item.value ?? ''}
                          placeholder={readOnly ? '' : item.placeholder || ''}
                          onChange={(e) => {
                            onUpdateItem(section.id, item.id, { value: e.target.value });
                            const el = e.target;
                            el.style.height = 'auto';
                            el.style.height = `${Math.min(el.scrollHeight, 420)}px`;
                          }}
                        />
                      </label>
                    );
                  }
                  if (item.type === 'yesno') {
                    const v = String(item.value ?? '').trim().toUpperCase();
                    const isYes = v === YES_LABEL || v === 'SI' || v === 'YES';
                    const isNo = v === NO_LABEL;
                    return (
                      <div key={item.id} className="fsheet__line" role="group" aria-label={item.label}>
                        <span className="fsheet__lbl">{item.label}:</span>
                        <span className="fsheet__yesno">
                          <label className="fsheet__check fsheet__check--inline">
                            <input
                              type="checkbox"
                              checked={isYes}
                              disabled={readOnly}
                              aria-label={`${item.label}: Sí`}
                              onChange={() => onUpdateItem(section.id, item.id, { value: isYes ? null : YES_LABEL })}
                            />
                            <span>SÍ</span>
                          </label>
                          <label className="fsheet__check fsheet__check--inline">
                            <input
                              type="checkbox"
                              checked={isNo}
                              disabled={readOnly}
                              aria-label={`${item.label}: No`}
                              onChange={() => onUpdateItem(section.id, item.id, { value: isNo ? null : NO_LABEL })}
                            />
                            <span>NO</span>
                          </label>
                        </span>
                      </div>
                    );
                  }
                  if (item.type === 'attachment') {
                    return (
                      <div key={item.id} className="fsheet__line fsheet__line--attach">
                        <span className="fsheet__lbl">{item.label}:</span>
                        <AttachmentField
                          item={item}
                          readOnly={readOnly}
                          files={files}
                          onPatch={patch(section, item)}
                          onUpload={readOnly ? undefined : onUpload}
                        />
                      </div>
                    );
                  }
                  return (
                    <label key={item.id} className="fsheet__line">
                      <span className="fsheet__lbl">{item.label}:</span>
                      <ValueInput item={item} readOnly={readOnly} onPatch={patch(section, item)} ariaLabel={item.label} />
                    </label>
                  );
                })
              )}
            </section>
          ),
        )}

        <section className="fsheet__sign" aria-label="Firmas">
          <h2 className="fsheet__sec-title fsheet__sec-title--ink">Firmas</h2>
          <div className="fsheet__sign-grid">
            <SignatureBox label="Entregado" sig={checklist.deliveredSignature} readOnly={readOnly} onOpen={onOpenSignatures} />
            <SignatureBox label="Autorizado" sig={checklist.authorizedSignature} readOnly={readOnly} onOpen={onOpenSignatures} />
          </div>
        </section>

        <footer className="fsheet__foot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="fsheet__band" src="/brand/arta-footer.png" alt="" />
          <span className="fsheet__foot-note">Formato del sistema ARTA · sale en PDF al guardar</span>
        </footer>
      </article>
    </div>
  );
}

/* ── Piezas ─────────────────────────────────────────────────────────────── */

function ValueInput({
  item,
  readOnly,
  onPatch,
  ariaLabel,
  compact = false,
}: {
  item: ChecklistItem;
  readOnly: boolean;
  onPatch: (p: Partial<ChecklistItem>) => void;
  ariaLabel: string;
  /** En el encabezado: una línea fija. */
  compact?: boolean;
}) {
  const value = item.value === null || item.value === undefined ? '' : String(item.value);
  if (item.type === 'select') {
    return (
      <select
        className="fsheet__in"
        disabled={readOnly}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onPatch({ value: e.target.value || null })}
      >
        <option value="">—</option>
        {(item.options || []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  const type = item.type === 'number' || item.type === 'date' || item.type === 'time' ? item.type : 'text';
  if (type === 'text' && !compact) {
    // Un dato de texto crece con lo que se escribe: nada se corta ni se esconde.
    return (
      <GrowingText
        className="fsheet__in fsheet__in--text"
        value={value}
        disabled={readOnly}
        placeholder={readOnly ? '' : item.placeholder || ''}
        ariaLabel={ariaLabel}
        onChange={(v) => onPatch({ value: v })}
      />
    );
  }
  return (
    <input
      className={`fsheet__in fsheet__in--${type}`}
      type={type}
      disabled={readOnly}
      value={value}
      placeholder={readOnly ? '' : item.placeholder || ''}
      aria-label={ariaLabel}
      onChange={(e) =>
        onPatch({
          value: type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value,
        })
      }
    />
  );
}

/** Textarea de una línea que crece sola con el contenido (y encoge al borrar). */
export function GrowingText({
  className,
  value,
  disabled,
  placeholder,
  ariaLabel,
  onChange,
  minRows = 1,
}: {
  className?: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 480)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      rows={minRows}
      disabled={disabled}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Enter no parte la línea en un dato corto; Shift+Enter sí.
        if (e.key === 'Enter' && !e.shiftKey && minRows === 1) e.preventDefault();
      }}
    />
  );
}

function CheckLine({
  item,
  readOnly,
  onPatch,
}: {
  item: ChecklistItem;
  readOnly: boolean;
  onPatch: (p: Partial<ChecklistItem>) => void;
}) {
  const note = String(item.note ?? '');
  return (
    <div className={`fsheet__check-row ${item.done ? 'is-done' : ''}`}>
      <label className="fsheet__check">
        <input type="checkbox" checked={!!item.done} disabled={readOnly} onChange={(e) => onPatch({ done: e.target.checked })} />
        <span>{item.label}</span>
      </label>
      {!readOnly || note ? (
        <input
          className="fsheet__note"
          type="text"
          disabled={readOnly}
          value={note}
          placeholder={readOnly ? '' : 'nota'}
          aria-label={`Nota de ${item.label}`}
          onChange={(e) => onPatch({ note: e.target.value })}
        />
      ) : null}
    </div>
  );
}

function SignatureBox({
  label,
  sig,
  readOnly,
  onOpen,
}: {
  label: string;
  sig?: { signerName?: string; imageDataUrl?: string; signedAt?: string } | null;
  readOnly: boolean;
  onOpen?: () => void;
}) {
  const signed = !!sig?.imageDataUrl;
  return (
    <div className="fsheet__sig">
      <span className="fsheet__lbl">{label}</span>
      {signed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="fsheet__sig-img" src={sig!.imageDataUrl} alt={`Firma: ${label}`} />
      ) : (
        <button
          type="button"
          className="fsheet__sig-empty"
          disabled={readOnly || !onOpen}
          onClick={onOpen}
          aria-label={`${label}: pendiente de firma`}
        >
          {readOnly ? 'Pendiente de firma' : 'Pendiente de firma · toca para firmar'}
        </button>
      )}
      <span className="fsheet__sig-name">{sig?.signerName || 'Nombre y firma'}</span>
      {sig?.signedAt ? <span className="fsheet__sig-date">{fmtDateTime(sig.signedAt)}</span> : null}
    </div>
  );
}
