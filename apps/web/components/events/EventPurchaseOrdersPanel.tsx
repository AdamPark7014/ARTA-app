'use client';

import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Po, PoLine } from '@/components/events/event-detail.types';

const RUBROS = ['audio', 'luces', 'planta_luz', 'hospedaje', 'transporte', 'catering', 'artes', 'otro'];

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
  return (
    <div className="stack">
      {!closed ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Nueva orden de compra</h2>
          </div>
          <div className="panel-body">
            <div className="form panel--narrow">
              <FormGrid>
                <label>
                  Rubro
                  <select value={poForm.rubro} onChange={(e) => setPoForm({ ...poForm, rubro: e.target.value })}>
                    {RUBROS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Vendor
                  <input
                    value={poForm.vendorName}
                    onChange={(e) => setPoForm({ ...poForm, vendorName: e.target.value })}
                  />
                </label>
              </FormGrid>
              <label>
                Descripción
                <input
                  value={poForm.description}
                  onChange={(e) => setPoForm({ ...poForm, description: e.target.value })}
                />
              </label>
              <div>
                <div className="muted kpi-sub" style={{ marginBottom: 8 }}>
                  Partidas · total ${poLinesTotal.toLocaleString('es-MX')}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th>Cant.</th>
                      <th>P. unit.</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {poForm.lines.map((line, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
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
                            type="number"
                            value={line.unitPrice}
                            onChange={(e) => {
                              const lines = [...poForm.lines];
                              lines[idx] = { ...line, unitPrice: Number(e.target.value) };
                              setPoForm({ ...poForm, lines });
                            }}
                          />
                        </td>
                        <td className="muted">
                          ${(Number(line.qty || 0) * Number(line.unitPrice || 0)).toLocaleString('es-MX')}
                        </td>
                        <td>
                          <button
                            className="btn ghost"
                            type="button"
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
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() =>
                    setPoForm({
                      ...poForm,
                      lines: [...poForm.lines, { concept: '', qty: 1, unitPrice: 0 }],
                    })
                  }
                >
                  + Partida
                </button>
              </div>
              <button className="btn" type="button" onClick={onCreatePo}>
                Crear OC
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Flujo: pendiente → autorizado → pagado</h2>
        </div>
        <div className="panel-body stack">
          {purchaseOrders.map((po) => (
            <div key={po.id}>
              <div className="section-head-row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <strong>{po.rubro}</strong> · {po.vendorName || 'Sin vendor'} · $
                  {Number(po.amount).toLocaleString('es-MX')}
                  <div className="muted kpi-sub">{po.description || ''}</div>
                </div>
                <div className="row">
                  <StatusBadge value={poStatusValue(po.status)} kind="po" />
                  {!closed && po.status === 'PENDING_AUTH' ? (
                    <>
                      <button className="btn ghost" type="button" onClick={() => onStartEditPo(po)}>
                        Editar
                      </button>
                      <button className="btn ghost" type="button" onClick={() => onSetPoStatus(po.id, 'AUTHORIZED')}>
                        Autorizar
                      </button>
                      <button className="btn ghost" type="button" onClick={() => onDeletePo(po.id)}>
                        Eliminar
                      </button>
                    </>
                  ) : null}
                  {!closed && po.status === 'AUTHORIZED' ? (
                    <button className="btn ghost" type="button" onClick={() => onSetPoStatus(po.id, 'PAID')}>
                      Marcar pagado
                    </button>
                  ) : null}
                </div>
              </div>
              {editingPoId === po.id ? (
                <div className="form" style={{ marginTop: 10 }}>
                  <FormGrid>
                    <label>
                      Vendor
                      <input
                        value={editPoMeta.vendorName}
                        onChange={(e) => setEditPoMeta({ ...editPoMeta, vendorName: e.target.value })}
                      />
                    </label>
                    <label>
                      Descripción
                      <input
                        value={editPoMeta.description}
                        onChange={(e) => setEditPoMeta({ ...editPoMeta, description: e.target.value })}
                      />
                    </label>
                  </FormGrid>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Concepto</th>
                        <th>Cant.</th>
                        <th>P. unit.</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editPoLines.map((line, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
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
                              className="btn ghost"
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
                  <div className="row">
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => setEditPoLines([...editPoLines, { concept: '', qty: 1, unitPrice: 0 }])}
                    >
                      + Partida
                    </button>
                    <button className="btn" type="button" onClick={onSaveEditPo}>
                      Guardar OC
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setEditingPoId(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : po.lines?.length ? (
                <table className="table" style={{ marginTop: 8 }}>
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
                        <td>${Number(l.total ?? Number(l.qty) * Number(l.unitPrice)).toLocaleString('es-MX')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          ))}
          {!purchaseOrders.length ? <p className="muted">Sin OC aún.</p> : null}
        </div>
      </div>
    </div>
  );
}
