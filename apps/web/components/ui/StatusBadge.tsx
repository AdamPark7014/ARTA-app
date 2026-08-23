const EVENT_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Borrador', tone: 'muted' },
  ACTIVE: { label: 'Activo', tone: 'ok' },
  CLOSED: { label: 'Cerrado', tone: 'warn' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
};

const RISK: Record<string, { label: string; tone: string }> = {
  critical: { label: 'Crítico', tone: 'danger' },
  watch: { label: 'Atención', tone: 'warn' },
  healthy: { label: 'Saludable', tone: 'ok' },
  high: { label: 'Alto', tone: 'danger' },
  medium: { label: 'Medio', tone: 'warn' },
  low: { label: 'Bajo', tone: 'ok' },
};

const PO_STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  AUTHORIZED: 'Autorizada',
  PAID: 'Pagada',
  REJECTED: 'Rechazada',
};

type Props = {
  value: string;
  kind?: 'event' | 'risk' | 'po' | 'raw';
  className?: string;
};

export function StatusBadge({ value, kind = 'raw', className = '' }: Props) {
  let label = value;
  let tone = 'muted-tone';

  if (kind === 'event' && EVENT_STATUS[value]) {
    label = EVENT_STATUS[value].label;
    tone = EVENT_STATUS[value].tone;
  } else if (kind === 'risk' && RISK[value]) {
    label = RISK[value].label;
    return (
      <span className={`badge badge--risk-${value} ${className}`.trim()}>{label}</span>
    );
  } else if (kind === 'po' && PO_STATUS[value]) {
    label = PO_STATUS[value];
    tone = value === 'PAID' ? 'ok' : value === 'REJECTED' ? 'danger' : 'warn';
  } else if (RISK[value]) {
    label = RISK[value].label;
    tone = RISK[value].tone;
  }

  return <span className={`badge ${tone} ${className}`.trim()}>{label}</span>;
}

export function pipelineStatusLabel(status: string) {
  return EVENT_STATUS[status]?.label || status;
}
