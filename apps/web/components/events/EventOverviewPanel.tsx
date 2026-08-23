'use client';

import { EmptyState } from '@/components/ui/EmptyState';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { asFinance, type Checklist, type EventDetail } from '@/components/events/event-detail.types';

type MetaForm = {
  name: string;
  artist: string;
  promoter: string;
  venue: string;
  city: string;
};

type PinForm = { label: string; pin: string; scopes: string[]; expiresAt: string };

type VendorPin = { id: string; label: string; scopes: string[]; active: boolean; expiresAt?: string | null };

type EventOverviewPanelProps = {
  event: EventDetail;
  closed: boolean;
  editingMeta: boolean;
  metaForm: MetaForm;
  setMetaForm: (form: MetaForm) => void;
  saveEventMeta: () => Promise<void>;
  eventNotes: string;
  setEventNotes: (notes: string) => void;
  saveEventNotes: () => Promise<void>;
  canVendorPin: boolean;
  vendorPins: VendorPin[];
  pinForm: PinForm;
  setPinForm: (form: PinForm) => void;
  createVendorPin: () => Promise<void>;
  revealedPin: { path: string; pin: string } | null;
  deactivatePin: (pinId: string) => Promise<void>;
  onOpenChecklist: (c: Checklist) => Promise<void>;
  onGoChecklists?: () => void;
};

export function EventOverviewPanel({
  event,
  closed,
  editingMeta,
  metaForm,
  setMetaForm,
  saveEventMeta,
  eventNotes,
  setEventNotes,
  saveEventNotes,
  canVendorPin,
  vendorPins,
  pinForm,
  setPinForm,
  createVendorPin,
  revealedPin,
  deactivatePin,
  onOpenChecklist,
  onGoChecklists,
}: EventOverviewPanelProps) {
  const checklists = event.checklists || [];

  return (
    <div className="stack">
      {editingMeta && !closed ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Editar datos del evento</h2>
            <button className="btn" type="button" onClick={saveEventMeta}>
              Guardar
            </button>
          </div>
          <div className="panel-body">
            <div className="form panel--narrow">
              <label>
                Nombre
                <input
                  value={metaForm.name}
                  onChange={(e) => setMetaForm({ ...metaForm, name: e.target.value })}
                />
              </label>
              <FormGrid>
                <label>
                  Artista
                  <input
                    value={metaForm.artist}
                    onChange={(e) => setMetaForm({ ...metaForm, artist: e.target.value })}
                  />
                </label>
                <label>
                  Promotor
                  <input
                    value={metaForm.promoter}
                    onChange={(e) => setMetaForm({ ...metaForm, promoter: e.target.value })}
                  />
                </label>
              </FormGrid>
              <FormGrid>
                <label>
                  Venue
                  <input
                    value={metaForm.venue}
                    onChange={(e) => setMetaForm({ ...metaForm, venue: e.target.value })}
                  />
                </label>
                <label>
                  Ciudad
                  <input
                    value={metaForm.city}
                    onChange={(e) => setMetaForm({ ...metaForm, city: e.target.value })}
                  />
                </label>
              </FormGrid>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid-cards kpi-grid-dense">
        <div className="kpi">
          <div className="label">Avance ops</div>
          <div className="value">
            {event.checklists?.length
              ? Math.round(
                  event.checklists.reduce((s, c) => s + (c.progressPct || 0), 0) /
                    event.checklists.length,
                )
              : 0}
            %
          </div>
        </div>
        <div className="kpi">
          <div className="label">Checklists</div>
          <div className="value">{event.checklists?.length || 0}</div>
          <div className="kpi-sub muted">
            {(event.checklists || []).filter((c) => c.authorizedAt).length} autorizados ·{' '}
            {(event.checklists || []).filter((c) => c.deliveredAt && !c.authorizedAt).length} pend.
            auth
          </div>
        </div>
        <div className="kpi">
          <div className="label">OC</div>
          <div className="value">{event.purchaseOrders?.length || 0}</div>
          <div className="kpi-sub muted">
            {(event.purchaseOrders || []).filter((p) => p.status === 'PENDING_AUTH').length} pend ·{' '}
            {(event.purchaseOrders || []).filter((p) => p.status === 'PAID').length} pagadas
          </div>
        </div>
        <div className="kpi">
          <div className="label">Corrida neta</div>
          <div className="value" style={{ fontSize: '1.2rem' }}>
            {(() => {
              const run = event.financeRuns?.[0];
              const d = asFinance(run?.dataJson);
              const net = Number(d.totalIncome || 0) - Number(d.totalExpense || 0);
              return `$${Math.round(net).toLocaleString('es-MX')}`;
            })()}
          </div>
          <div className="kpi-sub muted">
            {event.financeRuns?.[0]?.locked ? (
              <StatusBadge value="LOCKED" kind="raw" className="warn" />
            ) : (
              'Abierta'
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Salud por disciplina</h2>
        </div>
        <div className="panel-body">
          {!checklists.length ? (
            <EmptyState
              title="Sin checklists en este evento"
              description="Las plantillas de disciplina se instancian al crear el evento. Ve a la pestaña Checklists para operar firmas y avance."
              steps={[
                'Abre la pestaña Checklists',
                'Completa ítems críticos primero',
                'Entrega y autoriza cuando toque',
              ]}
            >
              {onGoChecklists ? (
                <button className="btn" type="button" onClick={onGoChecklists}>
                  Ir a checklists
                </button>
              ) : null}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Checklist</th>
                    <th>Avance</th>
                    <th>Firmas</th>
                    <th>Última edición</th>
                  </tr>
                </thead>
                <tbody>
                  {checklists
                    .slice()
                    .sort((a, b) => a.progressPct - b.progressPct)
                    .map((c) => (
                      <tr key={c.id}>
                        <td>
                          <button
                            className="btn ghost"
                            type="button"
                            style={{ padding: 0 }}
                            onClick={() => onOpenChecklist(c)}
                          >
                            {c.title}
                          </button>
                        </td>
                        <td>
                          <div className="progress" style={{ minWidth: 72 }}>
                            <span style={{ width: `${c.progressPct}%` }} />
                          </div>
                          <span className="muted kpi-sub">{c.progressPct}%</span>
                        </td>
                        <td>
                          {c.authorizedAt ? (
                            <StatusBadge value="Autorizado" kind="raw" className="ok" />
                          ) : c.deliveredAt ? (
                            <StatusBadge value="Entregado" kind="raw" className="warn" />
                          ) : (
                            <StatusBadge value="Sin firma" kind="raw" />
                          )}
                        </td>
                        <td className="muted kpi-sub">
                          {c.lastEditedBy?.fullName || '—'}
                          {c.lastEditedAt
                            ? ` · ${new Date(c.lastEditedAt).toLocaleDateString('es-MX')}`
                            : ''}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Notas del evento</h2>
          {!closed ? (
            <button className="btn ghost" type="button" onClick={saveEventNotes}>
              Guardar notas
            </button>
          ) : null}
        </div>
        <div className="panel-body">
          <textarea
            rows={3}
            disabled={closed}
            value={eventNotes}
            onChange={(e) => setEventNotes(e.target.value)}
            placeholder="Notas operativas, acuerdos, pendientes…"
            className="field"
          />
        </div>
      </div>

      {canVendorPin ? (
        <div className="panel">
          <div className="panel-head">
            <h2>PIN vendor / portal externo</h2>
          </div>
          <div className="panel-body stack">
            {!closed ? (
              <div className="form panel--narrow">
                <FormGrid>
                  <label>
                    Etiqueta
                    <input
                      value={pinForm.label}
                      onChange={(e) => setPinForm({ ...pinForm, label: e.target.value })}
                    />
                  </label>
                  <label>
                    PIN
                    <input
                      value={pinForm.pin}
                      onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value })}
                      placeholder="mín. 4"
                    />
                  </label>
                </FormGrid>
                <label>
                  Expira (opcional)
                  <input
                    type="date"
                    value={pinForm.expiresAt}
                    onChange={(e) => setPinForm({ ...pinForm, expiresAt: e.target.value })}
                  />
                </label>
                <div>
                  <div className="muted kpi-sub" style={{ marginBottom: 6 }}>
                    Scopes
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                    {(['files', 'checklists', 'hospitality'] as const).map((s) => (
                      <label key={s} className="field-check">
                        <input
                          type="checkbox"
                          checked={pinForm.scopes.includes(s)}
                          onChange={() => {
                            const next = pinForm.scopes.includes(s)
                              ? pinForm.scopes.filter((x) => x !== s)
                              : [...pinForm.scopes, s];
                            setPinForm({ ...pinForm, scopes: next.length ? next : ['files'] });
                          }}
                        />
                        <span>{s}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button className="btn" type="button" onClick={createVendorPin}>
                  Generar link + PIN
                </button>
              </div>
            ) : null}
            {revealedPin ? (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <StatusBadge
                  value={`PIN: ${revealedPin.pin} (cópialo ahora)`}
                  kind="raw"
                  className="ok"
                />
                <a className="btn ghost" href={revealedPin.path} target="_blank" rel="noreferrer">
                  Abrir portal
                </a>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    const url =
                      typeof window !== 'undefined'
                        ? `${window.location.origin}${revealedPin.path}`
                        : revealedPin.path;
                    navigator.clipboard?.writeText(`${url}\nPIN: ${revealedPin.pin}`).catch(() => undefined);
                  }}
                >
                  Copiar link + PIN
                </button>
              </div>
            ) : null}
            {!vendorPins.length ? (
              <EmptyState
                title="Sin PINs de vendor"
                description="Genera un link + PIN para que un proveedor externo vea solo los scopes que autorices."
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Link</th>
                    <th>Scopes</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {vendorPins.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td>
                        <a href={`/v/${p.id}`} target="_blank" rel="noreferrer">
                          /v/{p.id}
                        </a>
                      </td>
                      <td className="muted">{p.scopes.join(', ')}</td>
                      <td>
                        <StatusBadge
                          value={p.active ? 'Activo' : 'Off'}
                          kind="raw"
                          className={p.active ? 'ok' : 'warn'}
                        />
                      </td>
                      <td>
                        {p.active ? (
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => deactivatePin(p.id)}
                          >
                            Desactivar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {checklists.length ? (
        <div className="grid-cards">
          {checklists.map((c) => (
            <button
              key={c.id}
              type="button"
              className="kpi"
              style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
              onClick={() => onOpenChecklist(c)}
            >
              <div className="label">{c.template?.key || 'CHECK'}</div>
              <div style={{ fontWeight: 600, margin: '0.4rem 0' }}>{c.title}</div>
              <div className="progress">
                <span style={{ width: `${c.progressPct}%` }} />
              </div>
              <div className="muted kpi-sub" style={{ marginTop: 8 }}>
                {c.progressPct}%
                {c.pdfUrl ? ' · PDF listo' : ''}
                {c.authorizedAt ? ' · Autorizado' : ''}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
