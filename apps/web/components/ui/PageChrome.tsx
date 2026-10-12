import type { ReactNode } from 'react';
import Link from 'next/link';

type PageHeaderProps = {
  /** Etiqueta pequeña arriba del título (fecha, entidad, sección). */
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** Un renglón: qué es la pantalla. La ayuda larga va en la propia pantalla, no aquí. */
  description?: ReactNode;
  /** Ayuda larga: oculta en todo el panel (`.page-intro__hint`), se conserva por compatibilidad. */
  hint?: string;
  /** Acciones a la derecha: buscador, botón secundario y, como mucho, un primario. */
  children?: ReactNode;
  /** Renglón opcional debajo: pestañas o filtros de la pantalla. */
  below?: ReactNode;
  className?: string;
};

/**
 * Encabezado único de pantalla (pulido 12-10-2026): etiqueta opcional, título,
 * descripción de un renglón, acciones a la derecha y, si hace falta, un renglón
 * de pestañas o filtros. Mismo espaciado en todo el panel (`styles/_acabado.scss`).
 */
export function PageHeader({ eyebrow, title, description, hint, children, below, className = '' }: PageHeaderProps) {
  return (
    <header className={`ph ${className}`.trim()}>
      <div className="ph__row">
        <div className="ph__copy">
          {eyebrow ? <p className="ph__eyebrow">{eyebrow}</p> : null}
          {title ? <h2 className="ph__title">{title}</h2> : null}
          {description ? <div className="ph__desc">{description}</div> : null}
          {hint ? <p className="muted page-intro__hint">{hint}</p> : null}
        </div>
        {children ? <div className="ph__actions">{children}</div> : null}
      </div>
      {below ? <div className="ph__below">{below}</div> : null}
    </header>
  );
}

type SettingsSectionProps = {
  title: string;
  description?: ReactNode;
  /** Estado o acción breve bajo la descripción (p. ej. «Activa», «Cerrar todas»). */
  aside?: ReactNode;
  children: ReactNode;
};

/**
 * Sección de una pantalla de ajustes: a la izquierda qué es y por qué; a la
 * derecha, el control en su tarjeta. En el teléfono se apilan.
 */
export function SettingsSection({ title, description, aside, children }: SettingsSectionProps) {
  return (
    <section className="set-sec">
      <div className="set-sec__label">
        <h2 className="set-sec__title">{title}</h2>
        {description ? <p className="set-sec__desc">{description}</p> : null}
        {aside ? <div className="set-sec__aside">{aside}</div> : null}
      </div>
      <div className="set-sec__body">{children}</div>
    </section>
  );
}

type FilterBarProps = {
  children: ReactNode;
  meta?: ReactNode;
};

/** Barra de filtros / búsqueda sobre tablas. */
export function FilterBar({ children, meta }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-bar__controls row">{children}</div>
      {meta ? <div className="filter-bar__meta muted">{meta}</div> : null}
    </div>
  );
}

type FlashProps = {
  variant?: 'info' | 'success' | 'error' | 'warn';
  children: ReactNode;
  onDismiss?: () => void;
};

/** Mensaje de estado (guardado, error, aviso). */
export function FlashMessage({ variant = 'info', children, onDismiss }: FlashProps) {
  return (
    <div className={`flash flash--${variant}`} role="status">
      <span className="flash__body">{children}</span>
      {onDismiss ? (
        <button type="button" className="flash__dismiss" onClick={onDismiss} aria-label="Cerrar">
          ×
        </button>
      ) : null}
    </div>
  );
}

type FormGridProps = {
  cols?: 1 | 2 | 3;
  children: ReactNode;
};

/** Grid responsivo para formularios. */
export function FormGrid({ cols = 2, children }: FormGridProps) {
  return <div className={`form-grid form-grid--${cols}`}>{children}</div>;
}

type FieldSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  maxWidth?: number;
};

export function FieldSearch({
  value,
  onChange,
  placeholder = 'Buscar…',
  label,
  maxWidth = 300,
}: FieldSearchProps) {
  return (
    <input
      className="field field--search"
      style={{ maxWidth }}
      placeholder={placeholder}
      aria-label={label || placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

type FieldSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
};

export function FieldSelect({ value, onChange, options, label }: FieldSelectProps) {
  return (
    <select
      className="field field--select"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

type FieldCheckProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
};

export function FieldCheck({ checked, onChange, label }: FieldCheckProps) {
  return (
    <label className="field-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

type ActionLinkProps = {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
};

export function ActionLink({ href, children, variant = 'primary' }: ActionLinkProps) {
  return (
    <Link className={variant === 'ghost' ? 'btn ghost' : 'btn'} href={href}>
      {children}
    </Link>
  );
}
