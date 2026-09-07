/** Constantes y helpers de patrocinio / convenio comercial. */

export const SPONSOR_TIERS = ['Oro', 'Plata', 'Bronce', 'Media', 'Hospitality', 'Otro'] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];

export const SPONSOR_STATUSES = [
  'PROPOSED',
  'NEGOTIATING',
  'SIGNED',
  'ACTIVE',
  'CLOSED',
  'CANCELLED',
] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

export const SPONSOR_STATUS_LABELS: Record<SponsorStatus, string> = {
  PROPOSED: 'Propuesta',
  NEGOTIATING: 'En negociación',
  SIGNED: 'Firmado',
  ACTIVE: 'Vigente',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
};

export const SPONSOR_CONTRIBUTION_TYPES = [
  'Efectivo',
  'Especie',
  'Media / pauta',
  'Producto',
  'Mixto',
  'Otro',
] as const;

export function sponsorStatusLabel(status?: string | null): string {
  if (status && status in SPONSOR_STATUS_LABELS) {
    return SPONSOR_STATUS_LABELS[status as SponsorStatus];
  }
  return status || 'Propuesta';
}

export function sponsorStatusTone(status?: string | null): string {
  if (status === 'SIGNED' || status === 'ACTIVE') return 'ok';
  if (status === 'NEGOTIATING' || status === 'PROPOSED') return 'warn';
  if (status === 'CANCELLED') return 'danger';
  return 'muted-tone';
}

export function emptySponsorForm() {
  return {
    name: '',
    tier: 'Plata',
    status: 'PROPOSED',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contact: '',
    contribution: 'Efectivo',
    amount: '',
    benefits: '',
    deliverables: '',
    paymentTerms: '',
    validFrom: '',
    validUntil: '',
    notes: '',
  };
}

export type SponsorFormState = ReturnType<typeof emptySponsorForm>;
