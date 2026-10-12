'use client';

type Props = {
  values: number[];
  labels?: string[];
  height?: number;
  max?: number;
  suffix?: string;
};

/** Compact bar series for KPI panels — no chart library. */
export function SparkBars({ values, labels, height = 72, max, suffix = '' }: Props) {
  const peak = max ?? Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <div className="spark-bars" style={{ height }} role="img" aria-label="Serie de barras">
      {values.map((v, i) => {
        const h = Math.round((Math.abs(v) / peak) * 100);
        return (
          <div key={labels?.[i] || i} className="spark-bars__col" title={`${labels?.[i] || ''}: ${v}${suffix}`}>
            <div className="spark-bars__bar" style={{ height: `${h}%` }} />
            {labels?.[i] ? <span className="spark-bars__label">{labels[i]}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

type DistProps = {
  segments: Array<{ label: string; value: number; tone?: 'ok' | 'warn' | 'danger' | 'muted' }>;
  /**
   * `mono`: tonos de tinta (plata en el Auditorio) con leyenda abajo, para
   * repartos sin significado de alerta (roles, acciones, estados). El color
   * semántico se queda para riesgo real (crítico / atención / sano).
   */
  variant?: 'tone' | 'mono';
  /** Nombre del reparto para lectores de pantalla. */
  label?: string;
};

/** Tonos de tinta de mayor a menor: el tramo más grande, el más oscuro. */
const MONO = [100, 64, 42, 26, 15, 9];

export function DistBar({ segments, variant = 'tone', label = 'Distribución' }: DistProps) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const shown = segments.filter((s) => s.value > 0);
  if (variant === 'mono') {
    const sorted = [...shown].sort((a, b) => b.value - a.value);
    const shade = (i: number) => `color-mix(in srgb, var(--text) ${MONO[Math.min(i, MONO.length - 1)]}%, transparent)`;
    return (
      <div className="dist">
        <div className="dist-bar dist-bar--mono" role="img" aria-label={`${label}: ${sorted.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
          {sorted.map((s, i) => (
            <div
              key={s.label}
              className="dist-bar__seg"
              style={{ width: `${(s.value / total) * 100}%`, background: shade(i) }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
        </div>
        <ul className="dist-legend" aria-hidden>
          {sorted.map((s, i) => (
            <li key={s.label}>
              <span className="dist-legend__swatch" style={{ background: shade(i) }} />
              {s.label} <span className="dist-legend__value">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="dist-bar" role="img" aria-label={label}>
      {shown.map((s) => (
        <div
          key={s.label}
          className={`dist-bar__seg dist-bar__seg--${s.tone || 'muted'}`}
          style={{ width: `${(s.value / total) * 100}%` }}
          title={`${s.label}: ${s.value}`}
        />
      ))}
    </div>
  );
}

/** Cifra de resumen en pesos redondos (ver `lib/format.ts`). */
export function money(n: number) {
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}
