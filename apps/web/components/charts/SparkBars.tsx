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
};

export function DistBar({ segments }: DistProps) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="dist-bar" role="img" aria-label="Distribución">
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
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

export function money(n: number) {
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}
