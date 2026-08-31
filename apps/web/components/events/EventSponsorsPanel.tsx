'use client';

import { useMemo, useState } from 'react';
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
  onUpdateSponsor: (
    sponsorId: string,
    patch: { name?: string; contact?: string; contribution?: string; amount?: number; notes?: string },
  ) => Promise<void>;
};

export function EventSponsorsPanel({
  closed,
  sponsors,
  sponsorForm,
  setSponsorForm,
  onCreateSponsor,
  onRemoveSponsor,
  onUpdateSponsor,
}: EventSponsorsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: '',
    contact: '',
    contribution: '',
    amount: '',
    notes: '',
  });

  const totalAmount = useMemo(
    () => (sponsors || []).reduce((s, sp) => s + Number(sp.amount || 0), 0),
    [sponsors],
  );

  function startEdit(s: Sponsor) {
    setEditingId(s.id);
    setEditDraft({
      name: s.name,
      contact: s.contact || '',
      contribution: s.contribution || '',
      amount: s.amount != null ? String(s.amount) : '',
      notes: s.notes || '',
    });
  }

  async function saveEdit(id: string) {
    await onUpdateSponsor(id, {
      name: editDraft.name,
      contact: editDraft.contact || undefined,
      contribution: editDraft.contribution || undefined,
      amount: editDraft.amount ? Number(editDraft.amount) : undefined,
      notes: editDraft.notes || undefined,
    });
    setEditingId(null);
  }

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
                  {sponsors.map((s) =>
                    editingId === s.id ? (
                      <tr key={s.id}>
                        <td colSpan={5}>
                          <div className="form">
                            <FormGrid>
                              <label>
                                Nombre
                                <input
                                  className="field"
                                  value={editDraft.name}
                                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                                />
                              </label>
                              <label>
                                Contacto
                                <input
                                  className="field"
                                  value={editDraft.contact}
                                  onChange={(e) => setEditDraft({ ...editDraft, contact: e.target.value })}
                                />
                              </label>
                            </FormGrid>
                            <FormGrid>
                              <label>
                                Aportación
                                <input
                                  className="field"
                                  value={editDraft.contribution}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, contribution: e.target.value })
                                  }
                                />
                              </label>
                              <label>
                                Monto
                                <input
                                  className="field"
                                  type="number"
                                  value={editDraft.amount}
                                  onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                                />
                              </label>
                            </FormGrid>
                            <div className="row row--tight">
                              <button className="btn btn-sm" type="button" onClick={() => saveEdit(s.id)}>
                                Guardar
                              </button>
                              <button
                                className="btn ghost btn-sm"
                                type="button"
                                onClick={() => setEditingId(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.name}</strong>
                        </td>
                        <td className="muted kpi-sub">{s.contact || '—'}</td>
                        <td>{s.contribution || '—'}</td>
                        <td>{s.amount != null ? `$${Number(s.amount).toLocaleString('es-MX')}` : '—'}</td>
                        <td>
                          {!closed ? (
                            <div className="row row--tight">
                              <button
                                className="btn ghost btn-sm"
                                type="button"
                                onClick={() => startEdit(s)}
                              >
                                Editar
                              </button>
                              <button
                                className="btn ghost btn-sm btn-danger"
                                type="button"
                                onClick={() => onRemoveSponsor(s.id)}
                              >
                                Quitar
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
