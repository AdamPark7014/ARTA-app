'use client';

import { useMemo } from 'react';
import { PoWindowBanner } from '@/components/purchase-orders/PoWindowBanner';
import { PoProofsBlock } from '@/components/purchase-orders/PoProofsBlock';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlowSteps } from '@/components/ui/FlowSteps';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Po, PoLine } from '@/components/events/event-detail.types';
import type { PoWindowState } from '@/lib/po-window';
import {
  PO_PAYMENT_METHODS,
  PO_PAYMENT_LABELS,
  poNeedsProof,
  poNextStep,
  poPaymentLabel,
  type PoPaymentMethod,
} from '@/lib/po-payment';

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
  paymentMethod: string;
  lines: PoLine[];
};

type EditPoMeta = { vendorName: string; description: string; paymentMethod: string };

type EventPurchaseOrdersPanelProps = {
  closed: boolean;
  canAuthorize?: boolean;
  canMarkPaid?: boolean;
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
  onProofsChange: () => void | Promise<void>;
  eventId: string;
  poWindow?: PoWindowState | null;
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

function money(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export function EventPurchaseOrdersPanel({
  closed,
  canAuthorize = false,
  canMarkPaid = false,
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
  onProofsChange,
  eventId,
  poWindow,
}: EventPurchaseOrdersPanelProps) {
  const stats = useMemo(() => {
    const pending = purchaseOrders.filter((p) => p.status === 'PENDING_AUTH').length;
    const authorized = purchaseOrders.filter((p) => p.status === 'AUTHORIZED').length;
    const paid = purchaseOrders.filter((p) => p.status === 'PAID').length;
    const total = purchaseOrders.reduce((s, p) => s + Number(p.amount || 0), 0);
    return { pending, authorized, paid, total };
  }, [purchaseOrders]);

  const createNeedsProof = poNeedsProof(poForm.paymentMethod);
  /**
   * Sin esto, «Crear orden de compra» sobre el formulario vacío creaba una OC
   * de $0 sin concepto, contestaba «OC creada» y dejaba a alguien con una fila
   * fantasma que autorizar. Se pide lo mínimo para que la orden signifique
   * algo: un concepto y un importe.
   */
  const missingConcept = !poForm.lines.some((l) => l.concept.trim());
  const canCreate = !missingConcept && poLinesTotal > 0;

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
          <div className="value value--money">{money(stats.total)}</div>
        </div>
      </div>

      <FlowSteps steps={PO_FLOW} activeIndex={stats.paid > 0 ? 2 : stats.authorized > 0 ? 1 : 0} />

      {!closed ? <PoWindowBanner state={poWindow} /> : null}

      {!closed ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Nueva orden de compra</h2>
              <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
                Rubro, forma de pago y partidas. Total estimado:{' '}
                <strong>{money(poLinesTotal)}</strong>
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
                  Forma de pago
                  <select
                    className="field"
                    value={poForm.paymentMethod}
                    onChange={(e) => setPoForm({ ...poForm, paymentMethod: e.target.value })}
                  >
                    {PO_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PO_PAYMENT_LABELS[m]}
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
                    placeholder="A quién se le paga"
                  />
                </label>
              </FormGrid>

              <div
                className={`module-banner ${createNeedsProof ? '' : 'module-banner--ok'}`}
                role="note"
              >
                {createNeedsProof ? (
                  <>
                    Pago por <strong>{poPaymentLabel(poForm.paymentMethod)}</strong>: al liquidar se
                    pedirá <strong>comprobante</strong> (transferencia, tarjeta u otro).
                  </>
                ) : (
                  <>
                    Pago en <strong>efectivo</strong>: no se pide comprobante.
                  </>
                )}
              </div>

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
                            {money(Number(line.qty || 0) * Number(line.unitPrice || 0))}
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
              {!canCreate ? (
                <p className="po-next-hint" role="note">
                  {missingConcept
                    ? 'Escribe al menos un concepto en las partidas — qué se está comprando.'
                    : 'Pon cantidad y precio para que la orden tenga importe.'}
                </p>
              ) : null}
              <button className="btn" type="button" disabled={!canCreate} onClick={onCreatePo}>
                {canCreate ? `Crear orden de compra por ${money(poLinesTotal)}` : 'Crear orden de compra'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Órdenes del evento · {purchaseOrders.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Efectivo no pide comprobante. Transferencia, tarjeta u otro sí — antes de marcar
              pagado.
            </p>
          </div>
        </div>
        <div className="panel-body stack">
          {!purchaseOrders.length ? (
            <EmptyState
              title="Sin órdenes de compra"
              description="Crea la primera OC con rubro, forma de pago y partidas. Luego autoriza y marca pagado."
              steps={[
                'Crear OC (elige efectivo o transferencia)',
                'Autorizar con dirección',
                'Si no es efectivo: subir comprobante → marcar pagado',
              ]}
            />
          ) : (
            purchaseOrders.map((po) => {
              const method = (po.paymentMethod || 'TRANSFERENCIA') as PoPaymentMethod;
              const needsProof = poNeedsProof(method);
              const hasProof = (po.proofs?.length ?? 0) > 0;
              const canPay =
                !closed &&
                canMarkPaid &&
                po.status === 'AUTHORIZED' &&
                (!needsProof || hasProof);
              const next = poNextStep({
                status: po.status,
                paymentMethod: method,
                proofCount: po.proofs?.length ?? 0,
              });

              return (
                <article key={po.id} className="po-card">
                  <div className="po-card__head">
                    <div>
                      <strong>{rubroLabel(po.rubro)}</strong>
                      <span className="muted kpi-sub"> · {po.vendorName || 'Sin proveedor'}</span>
                      <div className="po-card__meta-row">
                        <StatusBadge value={poPaymentLabel(method)} kind="raw" className="ok" />
                        {/*
                          En efectivo no «falta» el comprobante: no aplica. Y
                          cuando sí falta, ya lo dice la píldora de «qué sigue»
                          arriba, así que aquí basta con el hecho.
                        */}
                        {!needsProof ? (
                          <StatusBadge value="No lleva comprobante" kind="raw" />
                        ) : hasProof ? (
                          <StatusBadge value="Con comprobante" kind="raw" className="ok" />
                        ) : null}
                      </div>
                      <div className="po-card__amount">{money(Number(po.amount))}</div>
                      {po.description ? <p className="muted kpi-sub">{po.description}</p> : null}
                      <FlowSteps steps={PO_FLOW} activeIndex={poFlowIndex(po.status)} />
                    </div>
                    <div className="panel-head-actions">
                      <div className={`po-next po-next--${next.tone}`}>{next.label}</div>
                      <StatusBadge value={poStatusValue(po.status)} kind="po" />
                      {!closed && po.status === 'PENDING_AUTH' ? (
                        <>
                          <button
                            className="btn ghost btn-sm"
                            type="button"
                            onClick={() => onStartEditPo(po)}
                          >
                            Editar
                          </button>
                          {canAuthorize ? (
                            <button
                              className="btn btn-sm"
                              type="button"
                              onClick={() => onSetPoStatus(po.id, 'AUTHORIZED')}
                            >
                              Autorizar
                            </button>
                          ) : null}
                          <button
                            className="btn ghost btn-sm btn-danger"
                            type="button"
                            onClick={() => onDeletePo(po.id)}
                          >
                            Eliminar
                          </button>
                        </>
                      ) : null}
                      {/*
                        El botón solo aparece cuando de verdad se puede apretar.
                        Antes se enseñaba apagado con el motivo en un `title`, que
                        en un botón deshabilitado el navegador ni siquiera muestra:
                        quedaba un botón muerto sin explicación. Si falta algo, lo
                        dice `.po-next-hint` con todas sus letras.
                      */}
                      {canPay ? (
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() => onSetPoStatus(po.id, 'PAID')}
                        >
                          Marcar pagada
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
                            onChange={(e) =>
                              setEditPoMeta({ ...editPoMeta, vendorName: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Forma de pago
                          <select
                            className="field"
                            value={editPoMeta.paymentMethod}
                            onChange={(e) =>
                              setEditPoMeta({ ...editPoMeta, paymentMethod: e.target.value })
                            }
                          >
                            {PO_PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m}>
                                {PO_PAYMENT_LABELS[m]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Descripción
                          <input
                            className="field"
                            value={editPoMeta.description}
                            onChange={(e) =>
                              setEditPoMeta({ ...editPoMeta, description: e.target.value })
                            }
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
                                    onClick={() =>
                                      setEditPoLines(editPoLines.filter((_, i) => i !== idx))
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
                      <div className="row row--tight">
                        <button
                          className="btn ghost btn-sm"
                          type="button"
                          onClick={() =>
                            setEditPoLines([...editPoLines, { concept: '', qty: 1, unitPrice: 0 }])
                          }
                        >
                          + Partida
                        </button>
                        <button className="btn btn-sm" type="button" onClick={onSaveEditPo}>
                          Guardar cambios
                        </button>
                        <button
                          className="btn ghost btn-sm"
                          type="button"
                          onClick={() => setEditingPoId(null)}
                        >
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
                              <td>{money(Number(l.unitPrice))}</td>
                              <td>
                                {money(
                                  Number(l.total ?? Number(l.qty) * Number(l.unitPrice)),
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {po.status !== 'PAID' ? (
                    <p
                      className={`po-next-hint ${
                        next.tone === 'todo' ? 'po-next-hint--todo' : ''
                      }`}
                      role="note"
                    >
                      {next.hint}
                    </p>
                  ) : null}

                  {!needsProof && po.status === 'PAID' ? (
                    <div className="module-banner module-banner--ok" role="status">
                      Pagada en efectivo — no requiere comprobante.
                    </div>
                  ) : null}

                  {needsProof &&
                  (po.status === 'AUTHORIZED' ||
                    po.status === 'PAID' ||
                    hasProof) ? (
                    <PoProofsBlock
                      poId={po.id}
                      eventId={eventId}
                      poAmount={Number(po.amount)}
                      proofs={po.proofs}
                      canUpload={!closed && po.status === 'AUTHORIZED'}
                      required={po.status === 'AUTHORIZED'}
                      onChange={onProofsChange}
                    />
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
