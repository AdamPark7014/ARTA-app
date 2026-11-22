'use client';

/**
 * Barra de avance con nombre para el lector de pantalla: siempre role=progressbar,
 * aria-label y un valor legible («312 de 500 vendidos»). En tinta; el rojo solo si
 * algo está vencido (`tone="danger"`).
 *
 *   <Meter label="Boletos vendidos de Preferente" value={312} max={500} valueText="312 de 500 vendidos" />
 */
export function Meter({
  label,
  value,
  max = 100,
  valueText,
  tone,
  className = '',
}: {
  label: string;
  value: number;
  max?: number;
  valueText?: string;
  tone?: 'danger';
  className?: string;
}) {
  const safeMax = max > 0 ? max : 100;
  const pctValue = Math.max(0, Math.min(100, (Number(value) / safeMax) * 100 || 0));
  return (
    <span
      className={`meterx ${tone ? `meterx--${tone}` : ''} ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.max(0, Math.min(safeMax, Number(value) || 0))}
      aria-valuetext={valueText ?? `${Math.round(pctValue)} %`}
    >
      <i style={{ width: `${pctValue}%` }} />
    </span>
  );
}
