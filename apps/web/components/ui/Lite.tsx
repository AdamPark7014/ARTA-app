'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
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
        {/* `div` y no `p`: en Campaña y Convenios el `sub` lleva la lista de estados (`<ol>`), que no cabe en un párrafo. */}
        {sub ? <div className="sx-head__sub">{sub}</div> : null}
      </div>
      {children ? <div className="sx-actions">{children}</div> : null}
    </div>
  );
}

export type SegOption<K extends string> = {
  key: K;
  label: string;
  /** Conteo de la sección. `null` = todavía no se sabe (cargando o falló): no se pinta, nunca «0». */
  count?: number | null;
};

/**
 * Control segmentado: secciones de una lista (Por autorizar · Por pagar · …).
 * Se comporta como pestañas de verdad: solo la activa entra en el orden de Tab y
 * las flechas (← →, Inicio, Fin) mueven entre opciones y la eligen.
 */
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
  const ref = useRef<HTMLDivElement | null>(null);
  const current = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = current >= last ? 0 : current + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = current <= 0 ? last : current - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].key);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div className="seg" role="tablist" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          tabIndex={i === current ? 0 : -1}
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

/** Píldora de estado con punto de color. `tone`: draft | review | ok | paid | danger | info | quiet. */
export function Pill({ tone = 'draft', children }: { tone?: string; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

/**
 * Un solo relleno por fila (pulido 12-10-2026): cuando la fila ya trae su botón de
 * acción («Autorizar», «Crear»), el estado que pide acción pasa a contorno con punto.
 */
export function quietTone(tone: string) {
  return tone === 'review' || tone === 'fill' ? 'quiet' : tone;
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
/** Los vacíos se piden con un carácter (`icon="▤"`); aquí sale el ícono de línea del sistema. */
const EMPTY_ICONS: Record<string, string> = {
  '▤': 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6',
  '✓': 'M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  '◷': 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  $: 'M12 3v18M16.5 7.5C16 6 14.2 5 12 5 9.5 5 7.5 6.3 7.5 8.3c0 4.4 9 2.6 9 7.3 0 2-2 3.4-4.5 3.4-2.3 0-4.1-1-4.6-2.6',
  '✦': 'M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9zM19 3v3M17.5 4.5h3',
  '+': 'M12 5v14M5 12h14',
  '!': 'M12 8v5M12 16.5v.5M10.3 3.9L2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  '✎': 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4',
  '≡': 'M4 6h16M4 12h16M4 18h10',
  '⇄': 'M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7',
};

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
        {typeof icon === 'string' && EMPTY_ICONS[icon] ? (
          <svg viewBox="0 0 24 24" width="20" height="20" focusable="false">
            <path d={EMPTY_ICONS[icon]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          icon
        )}
      </span>
      <p className="empty-lite__title">{title}</p>
      {text ? <p>{text}</p> : null}
      {children ? <div className="empty-lite__actions">{children}</div> : null}
    </div>
  );
}

/**
 * Mosaico de cifra: clicable si trae `onClick`.
 * `value` null o undefined = sin dato (cargando o la carga falló): se pinta «—» en el
 * mismo tamaño con la nota «Sin datos», nunca 0 ni $0.
 *
 *   <Tile label="Por pagar" value={loaded ? moneyKpi(total) : null} />
 */
export function Tile({
  label,
  value,
  sub,
  onClick,
  tone,
  noDataSub = 'Sin datos',
}: {
  label: string;
  value: ReactNode | null | undefined;
  sub?: ReactNode;
  onClick?: () => void;
  tone?: 'warn' | 'ok' | 'accent';
  /** Nota bajo el «—» cuando no hay dato. */
  noDataSub?: ReactNode;
}) {
  const empty = value === null || value === undefined || value === false;
  const body = (
    <>
      <span className="tile__label">{label}</span>
      <span className={`tile__value ${tone && !empty ? `tile__value--${tone}` : ''} ${empty ? 'tile__value--nodata' : ''}`}>
        {empty ? (
          <>
            <span aria-hidden>—</span>
            {noDataSub ? null : <span className="sr-only">Sin dato</span>}
          </>
        ) : (
          value
        )}
      </span>
      {empty ? (noDataSub ? <span className="tile__sub">{noDataSub}</span> : null) : sub ? <span className="tile__sub">{sub}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`tile ${empty ? 'tile--nodata' : ''}`.trim()} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={`tile ${empty ? 'tile--nodata' : ''}`.trim()}>{body}</div>;
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
