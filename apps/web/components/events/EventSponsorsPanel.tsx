'use client';

import type { Sponsor } from '@/components/events/event-detail.types';

type SponsorForm = { name: string; contact: string; contribution: string; amount: string; notes: string };

type EventSponsorsPanelProps = {
  closed: boolean;
  sponsors: Sponsor[];
  sponsorForm: SponsorForm;
  setSponsorForm: (form: SponsorForm) => void;
  onCreateSponsor: () => Promise<void>;
  onRemoveSponsor: (sponsorId: string) => Promise<void>;
};

export function EventSponsorsPanel({
  closed,
  sponsors,
  sponsorForm,
  setSponsorForm,
  onCreateSponsor,
  onRemoveSponsor,
}: EventSponsorsPanelProps) {
  return (
    <div className="stack">
      {!closed ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Nuevo patrocinador</h2>
          </div>
          <div className="panel-body">
            <div className="form" style={{ maxWidth: 720 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  Nombre
                  <input
                    value={sponsorForm.name}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })}
                  />
                </label>
                <label>
                  Contacto
                  <input
                    value={sponsorForm.contact}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, contact: e.target.value })}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  Aportación
                  <input
                    value={sponsorForm.contribution}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, contribution: e.target.value })}
                    placeholder="especie / cash / media"
                  />
                </label>
                <label>
                  Monto
                  <input
                    type="number"
                    value={sponsorForm.amount}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, amount: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Notas
                <input
                  value={sponsorForm.notes}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, notes: e.target.value })}
                />
              </label>
              <button className="btn" type="button" onClick={onCreateSponsor}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="panel">
        <div className="panel-head">
          <h2>Patrocinadores</h2>
        </div>
        <div className="panel-body">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Contacto</th>
                <th>Aportación</th>
                <th>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(sponsors || []).map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.contact || '—'}</td>
                  <td>{s.contribution || '—'}</td>
                  <td>{s.amount != null ? `$${Number(s.amount).toLocaleString('es-MX')}` : '—'}</td>
                  <td>
                    {!closed ? (
                      <button className="btn ghost" type="button" onClick={() => onRemoveSponsor(s.id)}>
                        Quitar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!sponsors?.length ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Sin patrocinadores.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
