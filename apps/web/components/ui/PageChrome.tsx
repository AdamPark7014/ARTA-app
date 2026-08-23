import type { ReactNode } from 'react';
import Link from 'next/link';

type PageHeaderProps = {
  title?: string;
  description?: string;
  hint?: string;
  children?: ReactNode;
};

/** Encabezado estándar de módulo con acciones a la derecha. */
export function PageHeader({ title, description, hint, children }: PageHeaderProps) {
  return (
    <header className="page-intro">
      <div className="page-intro__copy">
        {title ? <h2 className="page-intro__title">{title}</h2> : null}
        {description ? <p className="muted page-intro__desc">{description}</p> : null}
        {hint ? <p className="muted page-intro__hint">{hint}</p> : null}
      </div>
      {children ? <div className="page-intro__actions row">{children}</div> : null}
    </header>
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
