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
  splitPoDescription,
  type PoPaymentMethod,
} from '@/lib/po-payment';
import {
  PO_RUBRO_KEYS,
  PO_RUBRO_LABELS,
  poRubroLabel,
  resolvePoRubro,
} from '@/lib/po-rubro';

const PO_FLOW = ['Pendiente', 'Autorizada', 'Pagada'];

type PoForm = {
  /** Clave del catálogo; si es «otro», el nombre real va en rubroOther. */
  rubro: string;
  rubroOther: string;
  vendorName: string;
  description: string;
  paymentMethod: string;
  /** Cuando la forma de pago es OTRO: cheque, depósito, etc. */
  paymentOther: string;
  lines: PoLine[];
};

type EditPoMeta = {
  rubro: string;
  rubroOther: string;
  vendorName: string;
  description: string;
  paymentMethod: string;
  paymentOther: string;
};

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
  const resolvedRubro = resolvePoRubro(poForm.rubro, poForm.rubroOther);
  const missingRubro = !resolvedRubro;
  const missingPaymentOther =
    poForm.paymentMethod === 'OTRO' && !poForm.paymentOther.trim();
  /**
   * Sin esto, «Crear orden de compra» sobre el formulario vacío creaba una OC
   * de $0 sin concepto, contestaba «OC creada» y dejaba a alguien con una fila
   * fantasma que autorizar. Se pide lo mínimo para que la orden signifique
   * algo: un concepto y un importe.
   */
  const missingConcept = !poForm.lines.some((l) => l.concept.trim());
  const canCreate =
    !missingConcept && !missingRubro && !missingPaymentOther && poLinesTotal > 0;

  let createBlockReason = '';
  if (missingRubro) {
    createBlockReason =
      'Elige un rubro del catálogo o, si es «Otro», escribe el nombre del área.';
  } else if (missingPaymentOther) {
    createBlockReason = 'Si la forma de pago es «Otro», especifica cómo se paga (cheque, depósito…).';
  } else if (missingConcept) {
    createBlockReason = 'Escribe al menos un concepto en las partidas — qué se está comprando.';
  } else if (poLinesTotal <= 0) {
    createBlockReason = 'Pon cantidad y precio para que la orden tenga importe.';
  }

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
                Completa el área, la forma de pago y las partidas. Total estimado:{' '}
                <strong>{money(poLinesTotal)}</strong>
              </p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form po-create-form">
              <section className="po-form-section">
                <h3 className="po-form-section__title">Datos de la orden</h3>
                <FormGrid>
                  <label>
                    Rubro / área
                    <select
                      className="field"
                      value={poForm.rubro}
                      onChange={(e) =>
                        setPoForm({
                          ...poForm,
                          rubro: e.target.value,
                          rubroOther: e.target.value === 'otro' ? poForm.rubroOther : '',
                        })
                      }
                    >
                      {PO_RUBRO_KEYS.map((r) => (
                        <option key={r} value={r}>
                          {PO_RUBRO_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {poForm.rubro === 'otro' ? (
                    <label>
                      Especificar rubro
                      <input
                        className="field"
                        value={poForm.rubroOther}
                        onChange={(e) => setPoForm({ ...poForm, rubroOther: e.target.value })}
                        placeholder="Ej. Escenografía, seguridad, renta de equipo…"
                        autoComplete="off"
                      />
                    </label>
                  ) : null}
                  <label>
                    Forma de pago
                    <select
                      className="field"
                      value={poForm.paymentMethod}
                      onChange={(e) =>
                        setPoForm({
                          ...poForm,
                          paymentMethod: e.target.value,
                          paymentOther:
                            e.target.value === 'OTRO' ? poForm.paymentOther : '',
                        })
                      }
                    >
                      {PO_PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m === 'OTRO' ? 'Otro (especificar)' : PO_PAYMENT_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {poForm.paymentMethod === 'OTRO' ? (
                    <label>
                      Especificar forma de pago
                      <input
                        className="field"
                        value={poForm.paymentOther}
                        onChange={(e) => setPoForm({ ...poForm, paymentOther: e.target.value })}
                        placeholder="Ej. Cheque, depósito en ventanilla…"
                        autoComplete="off"
                      />
                    </label>
                  ) : null}
                  <label>
                    Proveedor
                    <input
                      className="field"
                      value={poForm.vendorName}
                      onChange={(e) => setPoForm({ ...poForm, vendorName: e.target.value })}
                      placeholder="Razón social o nombre comercial"
                      autoComplete="organization"
                    />
                  </label>
                </FormGrid>

                <div
                  className={`module-banner ${createNeedsProof ? '' : 'module-banner--ok'}`}
                  role="note"
                >
                  {createNeedsProof ? (
                    <>
                      Pago por{' '}
                      <strong>
                        {poForm.paymentMethod === 'OTRO' && poForm.paymentOther.trim()
                          ? poForm.paymentOther.trim()
                          : poPaymentLabel(poForm.paymentMethod)}
                      </strong>
                      : al liquidar se pedirá <strong>comprobante</strong>.
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
                    placeholder="Detalle de lo que cubre esta orden (opcional)"
                  />
                </label>
              </section>

              <section className="po-form-section">
                <div className="po-form-section__head">
                  <h3 className="po-form-section__title">Partidas</h3>
                  <span className="muted kpi-sub">Concepto, cantidad y precio unitario</span>
                </div>
                <div className="table-wrap">
                  <table className="table po-lines-table">
                    <thead>
                      <tr>
                        <th>Concepto</th>
                        <th>Cantidad</th>
                        <th>Precio unitario</th>
                        <th>Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {poForm.lines.map((line, idx) => {
                        // Con cinco partidas había cinco «Cantidad» idénticas:
                        // el nombre tiene que decir de qué fila es.
                        const fila = line.concept.trim() || `partida ${idx + 1}`;
                        return (
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
                              aria-label={`Concepto de la partida ${idx + 1}`}
                              placeholder="Qué se compra o contrata"
                            />
                          </td>
                          <td>
                            <input
                              className="field"
                              type="number"
                              min={0}
                              step="any"
                              value={line.qty}
                              onChange={(e) => {
                                const lines = [...poForm.lines];
                                lines[idx] = { ...line, qty: Number(e.target.value) };
                                setPoForm({ ...poForm, lines });
                              }}
                              aria-label={`Cantidad de ${fila}`}
                            />
                          </td>
                          <td>
                            <input
                              className="field"
                              type="number"
                              min={0}
                              step="any"
                              value={line.unitPrice}
                              onChange={(e) => {
                                const lines = [...poForm.lines];
                                lines[idx] = { ...line, unitPrice: Number(e.target.value) };
                                setPoForm({ ...poForm, lines });
                              }}
                              aria-label={`Precio unitario de ${fila}`}
                            />
                          </td>
                          <td className="muted kpi-sub">
                            {money(Number(line.qty || 0) * Number(line.unitPrice || 0))}
                          </td>
                          <td>
                            <button
                              className="btn ghost btn-sm"
                              type="button"
                              aria-label={`Quitar ${fila}`}
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
                        );
                      })}
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
              </section>

              {!canCreate && createBlockReason ? (
                <p className="po-next-hint" role="note">
                  {createBlockReason}
                </p>
              ) : null}
              <button className="btn" type="button" disabled={!canCreate} onClick={onCreatePo}>
                {canCreate
                  ? `Crear orden de compra por ${money(poLinesTotal)}`
                  : 'Crear orden de compra'}
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
              const descParts = splitPoDescription(po.description);

              return (
                <article key={po.id} className="po-card">
                  <div className="po-card__head">
                    <div>
                      <strong>{poRubroLabel(po.rubro)}</strong>
                      <span className="muted kpi-sub"> · {po.vendorName || 'Sin proveedor'}</span>
                      <div className="po-card__meta-row">
                        <StatusBadge
                          value={poPaymentLabel(method, descParts.paymentOther)}
                          kind="raw"
                          className="ok"
                        />
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
                      {descParts.description ? (
                        <p className="muted kpi-sub">{descParts.description}</p>
                      ) : null}
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
                          Rubro / área
                          <select
                            className="field"
                            value={editPoMeta.rubro}
                            onChange={(e) =>
                              setEditPoMeta({
                                ...editPoMeta,
                                rubro: e.target.value,
                                rubroOther:
                                  e.target.value === 'otro' ? editPoMeta.rubroOther : '',
                              })
                            }
                          >
                            {PO_RUBRO_KEYS.map((r) => (
                              <option key={r} value={r}>
                                {PO_RUBRO_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </label>
                        {editPoMeta.rubro === 'otro' ? (
                          <label>
                            Especificar rubro
                            <input
                              className="field"
                              value={editPoMeta.rubroOther}
                              onChange={(e) =>
                                setEditPoMeta({ ...editPoMeta, rubroOther: e.target.value })
                              }
                              placeholder="Ej. Escenografía, seguridad…"
                            />
                          </label>
                        ) : null}
                        <label>
                          Proveedor
                          <input
                            className="field"
                            value={editPoMeta.vendorName}
                            onChange={(e) =>
                              setEditPoMeta({ ...editPoMeta, vendorName: e.target.value })
                            }
                            placeholder="Razón social o nombre comercial"
                          />
                        </label>
                        <label>
                          Forma de pago
                          <select
                            className="field"
                            value={editPoMeta.paymentMethod}
                            onChange={(e) =>
                              setEditPoMeta({
                                ...editPoMeta,
                                paymentMethod: e.target.value,
                                paymentOther:
                                  e.target.value === 'OTRO' ? editPoMeta.paymentOther : '',
                              })
                            }
                          >
                            {PO_PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m}>
                                {m === 'OTRO' ? 'Otro (especificar)' : PO_PAYMENT_LABELS[m]}
                              </option>
                            ))}
                          </select>
                        </label>
                        {editPoMeta.paymentMethod === 'OTRO' ? (
                          <label>
                            Especificar forma de pago
                            <input
                              className="field"
                              value={editPoMeta.paymentOther}
                              onChange={(e) =>
                                setEditPoMeta({ ...editPoMeta, paymentOther: e.target.value })
                              }
                              placeholder="Ej. Cheque, depósito…"
                            />
                          </label>
                        ) : null}
                        <label>
                          Descripción
                          <input
                            className="field"
                            value={editPoMeta.description}
                            onChange={(e) =>
                              setEditPoMeta({ ...editPoMeta, description: e.target.value })
                            }
                            placeholder="Detalle de lo que cubre (opcional)"
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
                            {editPoLines.map((line, idx) => {
                              const fila = line.concept.trim() || `partida ${idx + 1}`;
                              return (
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
                                    aria-label={`Concepto de la partida ${idx + 1}`}
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
                                    aria-label={`Cantidad de ${fila}`}
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
                                    aria-label={`Precio unitario de ${fila}`}
                                  />
                                </td>
                                <td>
                                  <button
                                    className="btn ghost btn-sm"
                                    type="button"
                                    aria-label={`Quitar ${fila}`}
                                    onClick={() =>
                                      setEditPoLines(editPoLines.filter((_, i) => i !== idx))
                                    }
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                              );
                            })}
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
