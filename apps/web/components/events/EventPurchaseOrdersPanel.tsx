'use client';

import { useMemo } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlowSteps } from '@/components/ui/FlowSteps';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Po, PoLine } from '@/components/events/event-detail.types';

const RUBROS = ['audio', 'luces', 'planta_luz', 'hospedaje', 'transporte', 'catering', 'artes', 'otro'] as const;

const RUBRO_LABELS: Record<string, string> = {
  audio: 'Audio',
  luces: 'Luces',
  planta_luz: 'Planta de luz',
  hospedaje: 'Hospedaje',
  transporte: 'Transporte',
  catering: 'Catering',
  artes: 'Artes',
  otro: 'Otro',
};

const PO_FLOW = ['Pendiente', 'Autorizada', 'Pagada'];

type PoForm = {
  rubro: string;
  vendorName: string;
  description: string;
  lines: PoLine[];
};

type EditPoMeta = { vendorName: string; description: string };

type EventPurchaseOrdersPanelProps = {
  closed: boolean;
  poForm: PoForm;
  setPoForm: (form: PoForm) => void;
  poLinesTotal: number;
  onCreatePo: () => Promise<void>;
  purchaseOrders: Po[];
  editingPoId: string | null;
  setEditingPoId: (id: string | null) => void;
  editPoMeta: EditPoMeta;
  setEditPoMeta: (meta: EditPoMeta) => void;
  editPoLines: PoLine[];
  setEditPoLines: (lines: PoLine[]) => void;
  onStartEditPo: (po: Po) => void;
  onSaveEditPo: () => Promise<void>;
  onSetPoStatus: (poId: string, status: string) => Promise<void>;
  onDeletePo: (poId: string) => Promise<void>;
};

function poStatusValue(status: string) {
  return status === 'PENDING_AUTH' ? 'PENDING' : status;
}

function poFlowIndex(status: string) {
  if (status === 'PAID') return 2;
  if (status === 'AUTHORIZED') return 1;
  return 0;
}

function rubroLabel(key: string) {
  return RUBRO_LABELS[key] || key;
}

export function EventPurchaseOrdersPanel({
  closed,
  poForm,
  setPoForm,
  poLinesTotal,
  onCreatePo,
  purchaseOrders,
  editingPoId,
  setEditingPoId,
  editPoMeta,
  setEditPoMeta,
  editPoLines,
  setEditPoLines,
  onStartEditPo,
  onSaveEditPo,
  onSetPoStatus,
  onDeletePo,
}: EventPurchaseOrdersPanelProps) {
  const stats = useMemo(() => {
    const pending = purchaseOrders.filter((p) => p.status === 'PENDING_AUTH').length;
    const authorized = purchaseOrders.filter((p) => p.status === 'AUTHORIZED').length;
    const paid = purchaseOrders.filter((p) => p.status === 'PAID').length;
    const total = purchaseOrders.reduce((s, p) => s + Number(p.amount || 0), 0);
    return { pending, authorized, paid, total };
  }, [purchaseOrders]);

  return (
    <div className="stack">
      <div className="grid-cards kpi-grid-dense">
        <div className="kpi">
          <div className="label">Pendientes</div>
          <div className="value">{stats.pending}</div>
        </div>
        <div className="kpi">
          <div className="label">Autorizadas</div>
          <div className="value">{stats.authorized}</div>
        </div>
        <div className="kpi">
          <div className="label">Pagadas</div>
          <div className="value">{stats.paid}</div>
        </div>
        <div className="kpi">
          <div className="label">Monto total</div>
          <div className="value value--money">${stats.total.toLocaleString('es-MX')}</div>
        </div>
      </div>

      <FlowSteps steps={PO_FLOW} activeIndex={stats.paid > 0 ? 2 : stats.authorized > 0 ? 1 : 0} />

      {!closed ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Nueva orden de compra</h2>
              <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
                Agrega partidas con concepto, cantidad y precio. Total estimado: $
                {poLinesTotal.toLocaleString('es-MX')}
              </p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form panel--narrow">
              <FormGrid>
                <label>
                  Rubro
                  <select
                    className="field"
                    value={poForm.rubro}
                    onChange={(e) => setPoForm({ ...poForm, rubro: e.target.value })}
                  >
                    {RUBROS.map((r) => (
                      <option key={r} value={r}>
                        {rubroLabel(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Proveedor
                  <input
                    className="field"
                    value={poForm.vendorName}
                    onChange={(e) => setPoForm({ ...poForm, vendorName: e.target.value })}
                    placeholder="Nombre del vendor"
                  />
                </label>
              </FormGrid>
              <label>
                Descripción
                <input
                  className="field"
                  value={poForm.description}
                  onChange={(e) => setPoForm({ ...poForm, description: e.target.value })}
                  placeholder="Qué cubre esta OC…"
                />
              </label>
              <div>
                <div className="muted kpi-sub" style={{ marginBottom: 8 }}>
                  Partidas
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Concepto</th>
                        <th>Cant.</th>
                        <th>P. unit.</th>
                        <th>Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {poForm.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              className="field"
                              value={line.concept}
                              onChange={(e) => {
                                const lines = [...poForm.lines];
                                lines[idx] = { ...line, concept: e.target.value };
                                setPoForm({ ...poForm, lines });
                              }}
                              placeholder="Concepto"
                            />
                          </td>
                          <td>
                            <input
                              className="field"
                              type="number"
                              value={line.qty}
                              onChange={(e) => {
                                const lines = [...poForm.lines];
                                lines[idx] = { ...line, qty: Number(e.target.value) };
                                setPoForm({ ...poForm, lines });
                              }}
                            />
                          </td>
                          <td>
                            <input
                              className="field"
                              type="number"
                              value={line.unitPrice}
                              onChange={(e) => {
                                const lines = [...poForm.lines];
                                lines[idx] = { ...line, unitPrice: Number(e.target.value) };
                                setPoForm({ ...poForm, lines });
                              }}
                            />
                          </td>
                          <td className="muted kpi-sub">
                            ${(Number(line.qty || 0) * Number(line.unitPrice || 0)).toLocaleString('es-MX')}
                          </td>
                          <td>
                            <button
                              className="btn ghost btn-sm"
                              type="button"
                              aria-label="Quitar partida"
                              onClick={() =>
                                setPoForm({
                                  ...poForm,
                                  lines: poForm.lines.filter((_, i) => i !== idx),
                                })
                              }
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="btn ghost btn-sm"
                  type="button"
                  onClick={() =>
                    setPoForm({
                      ...poForm,
                      lines: [...poForm.lines, { concept: '', qty: 1, unitPrice: 0 }],
                    })
                  }
                >
                  + Agregar partida
                </button>
              </div>
              <button className="btn" type="button" onClick={onCreatePo}>
                Crear orden de compra
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Órdenes del evento · {purchaseOrders.length}</h2>
        </div>
        <div className="panel-body stack">
          {!purchaseOrders.length ? (
            <EmptyState
              title="Sin órdenes de compra"
              description="Crea la primera OC con rubro, proveedor y partidas. Luego autoriza y marca pagado cuando corresponda."
              steps={['Crear OC con partidas', 'Autorizar con dirección', 'Marcar pagado al liquidar']}
            />
          ) : (
            purchaseOrders.map((po) => (
              <article key={po.id} className="po-card">
                <div className="po-card__head">
                  <div>
                    <strong>{rubroLabel(po.rubro)}</strong>
                    <span className="muted kpi-sub"> · {po.vendorName || 'Sin proveedor'}</span>
                    <div className="po-card__amount">${Number(po.amount).toLocaleString('es-MX')}</div>
                    {po.description ? <p className="muted kpi-sub">{po.description}</p> : null}
                    <FlowSteps steps={PO_FLOW} activeIndex={poFlowIndex(po.status)} />
                  </div>
                  <div className="panel-head-actions">
                    <StatusBadge value={poStatusValue(po.status)} kind="po" />
                    {!closed && po.status === 'PENDING_AUTH' ? (
                      <>
                        <button className="btn ghost btn-sm" type="button" onClick={() => onStartEditPo(po)}>
                          Editar
                        </button>
                        <button className="btn btn-sm" type="button" onClick={() => onSetPoStatus(po.id, 'AUTHORIZED')}>
                          Autorizar
                        </button>
                        <button
                          className="btn ghost btn-sm btn-danger"
                          type="button"
                          onClick={() => onDeletePo(po.id)}
                        >
                          Eliminar
                        </button>
                      </>
                    ) : null}
                    {!closed && po.status === 'AUTHORIZED' ? (
                      <button className="btn btn-sm" type="button" onClick={() => onSetPoStatus(po.id, 'PAID')}>
                        Marcar pagado
                      </button>
                    ) : null}
                  </div>
                </div>

                {editingPoId === po.id ? (
                  <div className="po-card__edit form">
                    <FormGrid>
                      <label>
                        Proveedor
                        <input
                          className="field"
                          value={editPoMeta.vendorName}
                          onChange={(e) => setEditPoMeta({ ...editPoMeta, vendorName: e.target.value })}
                        />
                      </label>
                      <label>
                        Descripción
                        <input
                          className="field"
                          value={editPoMeta.description}
                          onChange={(e) => setEditPoMeta({ ...editPoMeta, description: e.target.value })}
                        />
                      </label>
                    </FormGrid>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Cant.</th>
                            <th>P. unit.</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {editPoLines.map((line, idx) => (
                            <tr key={idx}>
                              <td>
                                <input
                                  className="field"
                                  value={line.concept}
                                  onChange={(e) => {
                                    const lines = [...editPoLines];
                                    lines[idx] = { ...line, concept: e.target.value };
                                    setEditPoLines(lines);
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  className="field"
                                  type="number"
                                  value={line.qty}
                                  onChange={(e) => {
                                    const lines = [...editPoLines];
                                    lines[idx] = { ...line, qty: Number(e.target.value) };
                                    setEditPoLines(lines);
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  className="field"
                                  type="number"
                                  value={line.unitPrice}
                                  onChange={(e) => {
                                    const lines = [...editPoLines];
                                    lines[idx] = { ...line, unitPrice: Number(e.target.value) };
                                    setEditPoLines(lines);
                                  }}
                                />
                              </td>
                              <td>
                                <button
                                  className="btn ghost btn-sm"
                                  type="button"
                                  onClick={() => setEditPoLines(editPoLines.filter((_, i) => i !== idx))}
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="row row--tight">
                      <button
                        className="btn ghost btn-sm"
                        type="button"
                        onClick={() => setEditPoLines([...editPoLines, { concept: '', qty: 1, unitPrice: 0 }])}
                      >
                        + Partida
                      </button>
                      <button className="btn btn-sm" type="button" onClick={onSaveEditPo}>
                        Guardar cambios
                      </button>
                      <button className="btn ghost btn-sm" type="button" onClick={() => setEditingPoId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : po.lines?.length ? (
                  <div className="table-wrap po-card__lines">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Concepto</th>
                          <th>Cant.</th>
                          <th>P. unit.</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.lines.map((l) => (
                          <tr key={l.id || `${l.concept}-${l.qty}`}>
                            <td>{l.concept}</td>
                            <td>{Number(l.qty)}</td>
                            <td>${Number(l.unitPrice).toLocaleString('es-MX')}</td>
                            <td>
                              ${Number(l.total ?? Number(l.qty) * Number(l.unitPrice)).toLocaleString('es-MX')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
