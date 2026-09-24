'use client';

import type { ReactNode } from 'react';
import { fixMojibake } from '@/lib/text';
import { REVIEW_LABELS, REVIEW_STEPS, REVIEW_TONES, type ReviewStep } from '@/lib/review-flow';

/**
 * Piezas mínimas del lenguaje visual de la junta 11-09-2026: poco texto,
 * jerarquía clara y un solo acento. Los estilos viven en `styles/_refine.scss`.
 */

/** Encabezado de una sección dentro de una pestaña del evento. */
export function SectionHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="sx-head">
      <div className="sx-head__copy">
        <h2 className="sx-head__title">{title}</h2>
        {sub ? <p className="sx-head__sub">{sub}</p> : null}
      </div>
      {children ? <div className="sx-actions">{children}</div> : null}
    </div>
  );
}

export type SegOption<K extends string> = { key: K; label: string; count?: number };

/** Control segmentado: secciones de una lista (Por autorizar · Por pagar · …). */
export function Seg<K extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: K;
  options: Array<SegOption<K>>;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          className={`seg__btn ${value === o.key ? 'is-on' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {typeof o.count === 'number' ? <span className="seg__count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Píldora de estado con punto de color. `tone`: draft | review | ok | paid | danger | info. */
export function Pill({ tone = 'draft', children }: { tone?: string; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function ReviewPill({ step }: { step: ReviewStep }) {
  return <Pill tone={REVIEW_TONES[step]}>{REVIEW_LABELS[step]}</Pill>;
}

/** Recorrido Borrador → En revisión → Autorizada → Pagada, en una línea. */
export function ReviewFlow({ step }: { step: ReviewStep }) {
  const now = REVIEW_STEPS.indexOf(step);
  return (
    <ol className="flow-lite" aria-label="Estado">
      {REVIEW_STEPS.map((s, i) => (
        <li
          key={s}
          className={`flow-lite__step ${i < now ? 'is-done' : ''} ${i === now ? 'is-now' : ''}`}
          aria-current={i === now ? 'step' : undefined}
        >
          {i > 0 ? <span className="flow-lite__sep" aria-hidden /> : null}
          <span className="flow-lite__dot" aria-hidden />
          {REVIEW_LABELS[s]}
        </li>
      ))}
    </ol>
  );
}

/** Estado vacío corto: un símbolo, una frase y, si aplica, la acción. */
export function EmptyLite({
  icon = '+',
  title,
  text,
  children,
}: {
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty-lite">
      <span className="empty-lite__icon" aria-hidden>
        {icon}
      </span>
      <p className="empty-lite__title">{title}</p>
      {text ? <p>{text}</p> : null}
      {children ? <div className="empty-lite__actions">{children}</div> : null}
    </div>
  );
}

/** Mosaico de cifra: clicable si trae `onClick`. */
export function Tile({
  label,
  value,
  sub,
  onClick,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
  tone?: 'warn' | 'ok' | 'accent';
}) {
  const body = (
    <>
      <span className="tile__label">{label}</span>
      <span className={`tile__value ${tone ? `tile__value--${tone}` : ''}`}>{value}</span>
      {sub ? <span className="tile__sub">{sub}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="tile" onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className="tile">{body}</div>;
}

/** Fila de archivo: tipo, nombre, metadato y acciones. */
export function FileRow({
  kind,
  name,
  meta,
  children,
}: {
  kind: 'xlsx' | 'pdf' | 'file';
  name: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  const display = fixMojibake(name);
  return (
    <div className="file-row">
      <span className={`file-row__icon file-row__icon--${kind}`} aria-hidden>
        {kind === 'xlsx' ? 'XLS' : kind === 'pdf' ? 'PDF' : 'DOC'}
      </span>
      <div className="file-row__main">
        <div className="file-row__name" title={display}>
          {display}
        </div>
        {meta ? <div className="file-row__meta">{meta}</div> : null}
      </div>
      {children ? <div className="file-row__actions">{children}</div> : null}
    </div>
  );
}
