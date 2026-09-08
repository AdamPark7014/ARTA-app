'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ChecklistPicker } from '@/components/events/ChecklistPicker';
import { asFinance, type Checklist, type EventDetail, type Tab } from '@/components/events/event-detail.types';
import { formatEventDate } from '@/lib/event-dates';

type MetaForm = {
  name: string;
  artist: string;
  promoter: string;
  venue: string;
  city: string;
  /** `datetime-local`; se convierte a instante absoluto al guardar. */
  startsAt: string;
  endsAt: string;
  campaignType: string;
};

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  NONE: 'Sin campaña',
  INTERNAL: 'Interna (equipo Arta)',
  EXTERNAL: 'Externa',
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
  setEditingMeta: (v: boolean) => void;
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
  setEditingMeta,
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

      {/*
        Los datos del show se ven siempre, no solo al entrar en «modo edición».
        Antes vivían medio escondidos: el nombre y la sede salían en la cinta de
        arriba, y el promotor, el fin y el tipo de campaña no salían en ninguna
        parte — había que abrir el formulario para enterarse de qué decían.
      */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Datos del show</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Lo que define el evento. Todo se puede corregir mientras esté abierto.
            </p>
          </div>
          {!closed ? (
            <div className="row row--tight">
              {editingMeta ? (
                <>
                  <button className="btn btn-sm" type="button" onClick={saveEventMeta}>
                    Guardar cambios
                  </button>
                  <button
                    className="btn ghost btn-sm"
                    type="button"
                    onClick={() => setEditingMeta(false)}
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button className="btn ghost btn-sm" type="button" onClick={() => setEditingMeta(true)}>
                  Editar datos
                </button>
              )}
            </div>
          ) : null}
        </div>
        <div className="panel-body">
          {editingMeta && !closed ? (
            <div className="form">
              <label>
                Nombre del show
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
                  Sede
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
              <FormGrid>
                <label>
                  Empieza
                  <input
                    type="datetime-local"
                    value={metaForm.startsAt}
                    onChange={(e) => setMetaForm({ ...metaForm, startsAt: e.target.value })}
                  />
                </label>
                <label>
                  Termina <span className="muted">(opcional)</span>
                  <input
                    type="datetime-local"
                    value={metaForm.endsAt}
                    min={metaForm.startsAt || undefined}
                    onChange={(e) => setMetaForm({ ...metaForm, endsAt: e.target.value })}
                  />
                </label>
              </FormGrid>
              <label>
                Campaña
                <select
                  value={metaForm.campaignType}
                  onChange={(e) => setMetaForm({ ...metaForm, campaignType: e.target.value })}
                >
                  <option value="NONE">Sin campaña</option>
                  <option value="INTERNAL">Interna (equipo Arta)</option>
                  <option value="EXTERNAL">Externa</option>
                </select>
              </label>
              <p className="muted kpi-sub" style={{ margin: 0 }}>
                El tipo de campaña decide qué precio usa la hoja de gastos:{' '}
                <strong>interna</strong> toma el precio interno de cada concepto,{' '}
                <strong>externa</strong> el externo.
              </p>
            </div>
          ) : (
            <dl className="event-facts">
              <div>
                <dt>Artista</dt>
                <dd>{event.artist || '—'}</dd>
              </div>
              <div>
                <dt>Promotor</dt>
                <dd>{event.promoter || '—'}</dd>
              </div>
              <div>
                <dt>Sede</dt>
                <dd>{event.venue || '—'}</dd>
              </div>
              <div>
                <dt>Ciudad</dt>
                <dd>{event.city || '—'}</dd>
              </div>
              <div>
                <dt>Empieza</dt>
                <dd>{formatEventDate(event.startsAt)}</dd>
              </div>
              <div>
                <dt>Termina</dt>
                <dd>{event.endsAt ? formatEventDate(event.endsAt) : '—'}</dd>
              </div>
              <div>
                <dt>Campaña</dt>
                <dd>{CAMPAIGN_TYPE_LABELS[event.campaignType] || event.campaignType}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

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
          {/* El `placeholder` no es un nombre accesible: se va en cuanto se
              escribe, y un lector de pantalla anunciaba «cuadro de texto» a secas. */}
          <textarea
            rows={4}
            disabled={closed}
            aria-label="Notas del evento"
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
