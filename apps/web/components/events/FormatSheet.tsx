'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { AttachmentField, TableField } from '@/components/events/ChecklistFieldControls';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { checklistProgress } from '@/components/events/checklist-progress';
import {
  NO_LABEL,
  YES_LABEL,
  isCheckItem,
  isParagraphItem,
  type Checklist,
  type ChecklistItem,
  type ChecklistSection,
  type EventFile,
  type SigPayload,
} from '@/components/events/event-detail.types';

/**
 * El formato como documento: la hoja con la marca del cliente, igual que el
 * PDF que sale del sistema, pero **editable en sitio**. Es lo acordado: los
 * formatos que eran Word se ven y se llenan como un Word hasta que salen en
 * PDF; nada de formulario aparte ni de escribir encima de un PDF impreso.
 *
 * Misma estructura que `checklist-pdf.service.ts`: encabezado en rejilla,
 * secciones, casillas a dos columnas, línea por dato, SÍ/NO, recuadro de texto
 * largo, tablas con totales, adjuntos y, al final, los renglones de firma.
 */

export type SignKind = 'ENTREGADO' | 'AUTORIZADO';
export type SignHandler = (kind: SignKind, payload: { imageDataUrl: string; signerName: string }) => Promise<void>;
export type SignPermissions = { delivered: boolean; authorized: boolean };

type Props = {
  event: { name: string; artist?: string | null; venue?: string | null; city?: string | null; entity: string };
  checklist: Pick<
    Checklist,
    | 'title'
    | 'status'
    | 'revision'
    | 'progressPct'
    | 'lastEditedAt'
    | 'lastEditedBy'
    | 'deliveredAt'
    | 'authorizedAt'
    | 'deliveredSignature'
    | 'authorizedSignature'
  >;
  sections: ChecklistSection[];
  readOnly: boolean;
  files: EventFile[];
  onUpdateItem: (sectionId: string, itemId: string, patch: Partial<ChecklistItem>) => void;
  onUpload?: (file: File) => Promise<EventFile | void>;
  /** Avance del formato completo (las secciones pueden venir filtradas por la búsqueda). */
  progress?: { pct: number; done: number; total: number; sent: boolean };
  /** Firmar en el renglón de firmas del final del documento. */
  onSign?: SignHandler;
  /** Nombre que se propone al firmar (quien tiene la sesión abierta). */
  signerName?: string;
  /** Qué renglón puede firmar quien mira (Autorizado: gerencia de la entidad o dirección). */
  canSign?: SignPermissions;
  /** Nombre de cada firma en este formato (por defecto Entregado / Autorizado). */
  signatureLabels?: { delivered: string; authorized: string };
};

const ALL_CAN_SIGN: SignPermissions = { delivered: true, authorized: true };

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
  progress,
  onSign,
  signerName = '',
  canSign = ALL_CAN_SIGN,
  signatureLabels,
}: Props) {
  // Misma cuenta que el servidor: mandado = 100 %; si no, lo capturado.
  const fallback = useMemo(() => checklistProgress(checklist, sections), [checklist, sections]);
  const completion = progress ?? fallback;
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
        <p className="fsheet-outline__sub">
          {completion.sent ? 'Mandado · ' : ''}
          {completion.done}/{completion.total} campos
        </p>
        <ol className="fsheet-outline__list">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#sec-${s.id}`}>{s.title}</a>
            </li>
          ))}
          <li>
            <a href="#fmt-firmas">Firmas</a>
          </li>
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
                  if (isParagraphItem(item)) {
                    // Texto fijo del documento; varios seguidos son las viñetas del Word.
                    const bullet = section.items.filter(isParagraphItem).length > 1;
                    return (
                      <p key={item.id} className={`fsheet__para ${bullet ? 'fsheet__para--bullet' : ''}`}>
                        {item.label}
                      </p>
                    );
                  }
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
                  if (item.type === 'attachment' && item.multiple) {
                    // Galería (fotos y videos del recorrido): bloque a lo ancho, como en el PDF.
                    return (
                      <div key={item.id} className="fsheet__block fsheet__block--gallery">
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

        <FormatSignatures
          className="fsheet__sign"
          labels={signatureLabels}
          delivered={checklist.deliveredSignature}
          authorized={checklist.authorizedSignature}
          readOnly={readOnly}
          signerName={signerName}
          canSign={canSign}
          onSign={onSign}
        />

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

/**
 * Renglones de firma al final del documento, como en un Word impreso: el
 * trazo encima de la línea y debajo el nombre, a quién corresponde y la fecha.
 * Se firma ahí mismo, dentro de la hoja (junta del 23-10-2026: «que las firmas
 * vengan abajo inmersas dentro del documento, no hasta arriba»). El PDF
 * (`checklist-pdf.service.ts`) imprime lo mismo.
 */
export function FormatSignatures({
  className = '',
  labels,
  delivered,
  authorized,
  readOnly,
  signerName = '',
  canSign = ALL_CAN_SIGN,
  onSign,
}: {
  className?: string;
  labels?: { delivered: string; authorized: string };
  delivered?: SigPayload | null;
  authorized?: SigPayload | null;
  readOnly: boolean;
  signerName?: string;
  canSign?: SignPermissions;
  onSign?: SignHandler;
}) {
  return (
    <section className={`fsign ${className}`} id="fmt-firmas" aria-label="Firmas">
      <div className="fsign__grid">
        <SignatureLine
          kind="ENTREGADO"
          label={labels?.delivered || 'Entregado'}
          sig={delivered}
          editable={!readOnly && !!onSign && canSign.delivered}
          signerName={signerName}
          onSign={onSign}
        />
        <SignatureLine
          kind="AUTORIZADO"
          label={labels?.authorized || 'Autorizado'}
          sig={authorized}
          editable={!readOnly && !!onSign && canSign.authorized}
          hint={!readOnly && !canSign.authorized ? 'Firma gerencia o dirección' : undefined}
          signerName={signerName}
          onSign={onSign}
        />
      </div>
    </section>
  );
}

function SignatureLine({
  kind,
  label,
  sig,
  editable,
  hint,
  signerName,
  onSign,
}: {
  kind: SignKind;
  label: string;
  sig?: SigPayload | null;
  editable: boolean;
  /** Por qué no se puede firmar aquí (en vez de «Pendiente de firma»). */
  hint?: string;
  signerName: string;
  onSign?: SignHandler;
}) {
  const signed = !!sig?.imageDataUrl;
  const [signing, setSigning] = useState(false);
  // Cuando la firma vuelve del servidor el lienzo se cierra solo; si falló, sigue abierto.
  useEffect(() => {
    if (signed) setSigning(false);
  }, [signed]);

  if (signing && onSign && !signed) {
    return (
      <div className="fsign__col fsign__col--pad">
        <SignaturePad
          label={label}
          signerName={signerName}
          onSign={(payload) => onSign(kind, payload)}
          onCancel={() => setSigning(false)}
        />
      </div>
    );
  }

  const date = fmtDateTime(sig?.signedAt);
  return (
    <div className={`fsign__col ${signed ? 'is-signed' : ''}`}>
      <div className="fsign__area">
        {signed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="fsign__img" src={sig!.imageDataUrl} alt={`Firma: ${label}`} />
        ) : editable ? (
          <button type="button" className="fsign__cta" onClick={() => setSigning(true)} aria-label={`Firmar: ${label}`}>
            Firmar aquí
          </button>
        ) : (
          <span className="fsign__pending">{hint || 'Pendiente de firma'}</span>
        )}
      </div>
      <span className={`fsign__name ${sig?.signerName ? '' : 'is-blank'}`}>{sig?.signerName || 'Nombre y firma'}</span>
      <span className="fsign__role">{label}</span>
      <span className="fsign__date">{date ? `Fecha: ${date}` : 'Fecha:'}</span>
    </div>
  );
}
