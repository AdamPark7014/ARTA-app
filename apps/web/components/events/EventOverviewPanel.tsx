'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ChecklistPicker } from '@/components/events/ChecklistPicker';
import { asFinance, type Checklist, type EventDetail, type Tab } from '@/components/events/event-detail.types';

type MetaForm = {
  name: string;
  artist: string;
  promoter: string;
  venue: string;
  city: string;
};

type PinForm = { label: string; pin: string; scopes: string[]; expiresAt: string };

type VendorPin = { id: string; label: string; scopes: string[]; active: boolean; expiresAt?: string | null };

const SCOPE_LABELS: Record<string, string> = {
  files: 'Archivos',
  checklists: 'Checklists',
  hospitality: 'Hospitality',
};

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
  deactivatePin: (pinId: string) => void;
  onOpenChecklist: (c: Checklist) => Promise<void>;
  onGoModule?: (tab: Tab) => void;
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
  onGoModule,
}: EventOverviewPanelProps) {
  const checklists = event.checklists || [];
  const avgProgress = checklists.length
    ? Math.round(checklists.reduce((s, c) => s + (c.progressPct || 0), 0) / checklists.length)
    : 0;
  const pendingAuth = checklists.filter((c) => c.deliveredAt && !c.authorizedAt).length;
  const needsWork = checklists.filter((c) => c.progressPct < 80).length;

  return (
    <div className="stack">
      {onGoModule ? (
        <div className="event-quick-actions">
          <span className="event-quick-actions__label muted kpi-sub">Ir a</span>
          <div className="event-quick-actions__row row">
            <button className="btn ghost btn-sm" type="button" onClick={() => onGoModule('checklists')}>
              Checklists
            </button>
            <button className="btn ghost btn-sm" type="button" onClick={() => onGoModule('ocs')}>
              Órdenes de compra
            </button>
            <button className="btn ghost btn-sm" type="button" onClick={() => onGoModule('finance')}>
              Corrida
            </button>
            <button className="btn ghost btn-sm" type="button" onClick={() => onGoModule('tasks')}>
              Tareas
            </button>
          </div>
        </div>
      ) : null}

      {editingMeta && !closed ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Editar datos del evento</h2>
            <button className="btn btn-sm" type="button" onClick={saveEventMeta}>
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
          <div className="value">{avgProgress}%</div>
          <div className="progress" style={{ marginTop: 8 }}>
            <span style={{ width: `${avgProgress}%` }} />
          </div>
        </div>
        <div className="kpi">
          <div className="label">Checklists</div>
          <div className="value">{checklists.length}</div>
          <div className="kpi-sub muted">
            {needsWork} por completar · {pendingAuth} pend. autorización
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
          <div className="value value--money">
            {(() => {
              const run = event.financeRuns?.[0];
              const d = asFinance(run?.dataJson);
              const net = Number(d.totalIncome || 0) - Number(d.totalExpense || 0);
              return `$${Math.round(net).toLocaleString('es-MX')}`;
            })()}
          </div>
          <div className="kpi-sub muted">
            {event.financeRuns?.[0]?.locked ? (
              <StatusBadge value="Bloqueada" kind="raw" className="warn" />
            ) : (
              'Abierta'
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Salud por disciplina</h2>
          {onGoModule ? (
            <button className="btn ghost btn-sm" type="button" onClick={() => onGoModule('checklists')}>
              Ver todos
            </button>
          ) : null}
        </div>
        <div className="panel-body">
          {!checklists.length ? (
            <EmptyState
              title="Sin checklists en este evento"
              description="Las plantillas se instancian al crear el show."
            />
          ) : (
            <ChecklistPicker
              checklists={checklists.slice().sort((a, b) => a.progressPct - b.progressPct).slice(0, 6)}
              onSelect={(c) => onOpenChecklist(c)}
              compact
            />
          )}
          {checklists.length > 6 && onGoModule ? (
            <button
              className="btn ghost btn-sm"
              type="button"
              style={{ marginTop: '0.75rem' }}
              onClick={() => onGoModule('checklists')}
            >
              Ver los {checklists.length} formatos
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Notas del evento</h2>
          {!closed ? (
            <button className="btn ghost btn-sm" type="button" onClick={saveEventNotes}>
              Guardar notas
            </button>
          ) : null}
        </div>
        <div className="panel-body">
          <textarea
            rows={4}
            disabled={closed}
            value={eventNotes}
            onChange={(e) => setEventNotes(e.target.value)}
            placeholder="Acuerdos, pendientes, contexto para el equipo…"
            className="field"
          />
        </div>
      </div>

      {canVendorPin ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Acceso proveedor (PIN)</h2>
          </div>
          <div className="panel-body stack">
            <p className="muted kpi-sub" style={{ margin: 0 }}>
              Genera un enlace + PIN para que proveedores vean solo lo que autorices (archivos, formatos,
              hospedaje).
            </p>
            {!closed ? (
              <div className="form panel--narrow">
                <FormGrid>
                  <label>
                    Etiqueta
                    <input
                      value={pinForm.label}
                      onChange={(e) => setPinForm({ ...pinForm, label: e.target.value })}
                      placeholder="Ej. Catering externo"
                    />
                  </label>
                  <label>
                    PIN (mín. 4)
                    <input
                      value={pinForm.pin}
                      onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value })}
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
                    Qué puede ver
                  </div>
                  <div className="row row--tight">
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
                        <span>{SCOPE_LABELS[s] || s}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button className="btn btn-sm" type="button" onClick={createVendorPin}>
                  Generar enlace + PIN
                </button>
              </div>
            ) : null}

            {revealedPin ? (
              <div className="credential-strip">
                <span>
                  <strong>PIN (única vez):</strong> <code>{revealedPin.pin}</code>
                </span>
                <Link className="btn ghost btn-sm" href={revealedPin.path} target="_blank">
                  Abrir portal
                </Link>
                <button
                  className="btn ghost btn-sm"
                  type="button"
                  onClick={() => {
                    const url =
                      typeof window !== 'undefined'
                        ? `${window.location.origin}${revealedPin.path}`
                        : revealedPin.path;
                    navigator.clipboard?.writeText(`${url}\nPIN: ${revealedPin.pin}`).catch(() => undefined);
                  }}
                >
                  Copiar enlace + PIN
                </button>
              </div>
            ) : null}

            {!vendorPins.length ? (
              <EmptyState
                title="Sin PINs activos"
                description="Cuando generes uno, aparecerá aquí con su link /v/…"
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Link</th>
                      <th>Acceso</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {vendorPins.map((p) => (
                      <tr key={p.id}>
                        <td>{p.label}</td>
                        <td>
                          <Link href={`/v/${p.id}`} target="_blank">
                            /v/{p.id.slice(0, 8)}…
                          </Link>
                        </td>
                        <td className="muted kpi-sub">
                          {p.scopes.map((s) => SCOPE_LABELS[s] || s).join(' · ')}
                        </td>
                        <td>
                          <StatusBadge
                            value={p.active ? 'Activo' : 'Inactivo'}
                            kind="raw"
                            className={p.active ? 'ok' : 'warn'}
                          />
                        </td>
                        <td>
                          {p.active && !closed ? (
                            <button
                              className="btn ghost btn-sm btn-danger"
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
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
