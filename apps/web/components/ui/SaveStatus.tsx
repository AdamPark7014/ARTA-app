'use client';

import { autosaveLabel, type AutosaveStatus } from '@/lib/use-autosave';

type Props = {
  status: AutosaveStatus;
  savedAt: Date | null;
  error?: string;
};

/** Píldora de estado del autoguardado — siempre visible junto a «Guardar». */
export function SaveStatus({ status, savedAt, error }: Props) {
  const tone =
    status === 'error' ? 'is-error' : status === 'saving' ? 'is-saving' : status === 'dirty' ? 'is-dirty' : 'is-clean';
  return (
    <span className={`save-status ${tone}`} role="status" aria-live="polite">
      <span className="save-status__dot" aria-hidden />
      {status === 'error' && error ? error : autosaveLabel(status, savedAt)}
    </span>
  );
}
