'use client';

import { api } from '@/lib/api';
import {
  boleteraChoiceOf,
  boleteraCustomOf,
  KNOWN_BOLETERAS,
  resolveBoleteraName,
} from '@/lib/boletera';

type Props = {
  boletera: string;
  logoUrl?: string | null;
  onBoleteraChange: (boletera: string) => void;
  onLogoUrlChange: (logoUrl: string | null) => void;
  disabled?: boolean;
  eventId?: string;
};

export function BoleteraFields({
  boletera,
  logoUrl,
  onBoleteraChange,
  onLogoUrlChange,
  disabled,
  eventId,
}: Props) {
  const choice = boleteraChoiceOf(boletera);
  const custom = boleteraCustomOf(boletera);

  async function uploadLogo(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    if (eventId) fd.append('eventId', eventId);
    fd.append('kind', 'image');
    const uploaded = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
    onLogoUrlChange(uploaded.url);
  }

  return (
    <>
      <label>
        Boletera
        <select
          disabled={disabled}
          value={choice}
          onChange={(e) => {
            const next = e.target.value;
            if (next === 'Otra') {
              onBoleteraChange(custom || 'Otra');
            } else {
              onBoleteraChange(next);
            }
          }}
        >
          {KNOWN_BOLETERAS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          <option value="Otra">Otra</option>
        </select>
      </label>
      {choice === 'Otra' ? (
        <label>
          Nombre de la boletera
          <input
            disabled={disabled}
            required
            placeholder="Ej. Ticketmaster, Boletomóvil…"
            value={custom}
            onChange={(e) => onBoleteraChange(e.target.value || 'Otra')}
          />
        </label>
      ) : null}
      <label>
        Logo (checklists / PDF)
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f).catch(console.error);
              e.target.value = '';
            }}
          />
          {logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo boletera"
                style={{ height: 36, maxWidth: 120, objectFit: 'contain', background: '#fff', borderRadius: 4, padding: 2 }}
              />
              <button className="btn ghost" type="button" disabled={disabled} onClick={() => onLogoUrlChange(null)}>
                Quitar
              </button>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              Opcional · aparece en PDFs de checklist
            </span>
          )}
        </div>
      </label>
    </>
  );
}

export { resolveBoleteraName };
