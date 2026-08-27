'use client';

import { useMemo } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormGrid } from '@/components/ui/PageChrome';
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
  const totalAmount = useMemo(
    () => (sponsors || []).reduce((s, sp) => s + Number(sp.amount || 0), 0),
    [sponsors],
  );

  return (
    <div className="stack">
      <div className="grid-cards kpi-grid-dense">
        <div className="kpi">
          <div className="label">Patrocinadores</div>
          <div className="value">{sponsors?.length || 0}</div>
        </div>
        <div className="kpi">
          <div className="label">Aportación total</div>
          <div className="value value--money">${totalAmount.toLocaleString('es-MX')}</div>
        </div>
      </div>

      {!closed ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Agregar patrocinador</h2>
              <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
                Registra nombre, contacto y monto o aportación en especie.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form panel--narrow">
              <FormGrid>
                <label>
                  Nombre
                  <input
                    className="field"
                    value={sponsorForm.name}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })}
                    placeholder="Marca o empresa"
                  />
                </label>
                <label>
                  Contacto
                  <input
                    className="field"
                    value={sponsorForm.contact}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, contact: e.target.value })}
                    placeholder="Correo o teléfono"
                  />
                </label>
              </FormGrid>
              <FormGrid>
                <label>
                  Aportación
                  <input
                    className="field"
                    value={sponsorForm.contribution}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, contribution: e.target.value })}
                    placeholder="Especie / efectivo / media"
                  />
                </label>
                <label>
                  Monto (MXN)
                  <input
                    className="field"
                    type="number"
                    value={sponsorForm.amount}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, amount: e.target.value })}
                  />
                </label>
              </FormGrid>
              <label>
                Notas
                <input
                  className="field"
                  value={sponsorForm.notes}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, notes: e.target.value })}
                  placeholder="Compromisos, entregables…"
                />
              </label>
              <button className="btn btn-sm" type="button" onClick={onCreateSponsor}>
                Agregar patrocinador
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Listado · {sponsors?.length || 0}</h2>
        </div>
        <div className="panel-body">
          {!sponsors?.length ? (
            <EmptyState
              title="Sin patrocinadores"
              description="Agrega marcas aliadas con su aportación para tener el panorama comercial del show."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Contacto</th>
                    <th>Aportación</th>
                    <th>Monto</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sponsors.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                      </td>
                      <td className="muted kpi-sub">{s.contact || '—'}</td>
                      <td>{s.contribution || '—'}</td>
                      <td>{s.amount != null ? `$${Number(s.amount).toLocaleString('es-MX')}` : '—'}</td>
                      <td>
                        {!closed ? (
                          <button
                            className="btn ghost btn-sm btn-danger"
                            type="button"
                            onClick={() => onRemoveSponsor(s.id)}
                          >
                            Quitar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
