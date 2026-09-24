'use client';

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { clearDraft, poHandoffKey, readDraft } from '@/lib/draft-store';
import { EmptyLite, Pill, SectionHead, Seg } from '@/components/ui/Lite';
import { PayDaysNote } from '@/components/purchase-orders/PoWindowBanner';
import { PoProofsBlock } from '@/components/purchase-orders/PoProofsBlock';
import type { EventPanelProps, Po } from '@/components/events/event-detail.types';
import { findPrice, mxn, numOrNull, PRICE_LIST } from '@/lib/price-list';
import { payBlockedLabel, payDaysLabel, usePoWindow } from '@/lib/po-window';
import {
  PO_PAYEE_LABELS,
  PO_PAYEE_TYPES,
  PO_PAYMENT_CHOICES,
  PO_PAYMENT_LABELS,
  isPoPaymentMethod,
  joinPoDescription,
  poDateShort,
  poInSection,
  poIsPending,
  poLineTotal,
  poNeedsProof,
  poPaymentLabel,
  poQtyLabel,
  poSavedTotals,
  poSectionOptions,
  poSectionStats,
  poStatusPill,
  poTotals,
  splitPoDescription,
  type PoPayeeType,
  type PoSection,
} from '@/lib/po-payment';
import {
  PO_RUBRO_KEYS,
  PO_RUBRO_LABELS,
  parsePoRubro,
  poRubroLabel,
  resolvePoRubro,
} from '@/lib/po-rubro';

/**
 * Órdenes de compra del evento (revisión 11-09-2026).
 *
 * Una lista por secciones —por autorizar, por pagar, pagadas, todas— y el
 * machote del cliente como formulario. El panel es autónomo: guarda por su
 * cuenta, avisa con `flash` y pide recargar con `onChanged`.
 */

/* ── Borrador del formulario ─────────────────────────────────────────────── */

type DraftLine = { key: string; concept: string; qty: number | null; unitPrice: number | null };

type PoDraft = {
  vendorName: string;
  payeeType: PoPayeeType;
  /** Clave del catálogo; si es «otro», el nombre real va en rubroOther. */
  rubro: string;
  rubroOther: string;
  paymentMethod: string;
  /** Legado: nota de «Forma de pago: …» de órdenes en OTRO. */
  paymentOther: string;
  withIva: boolean;
  /** Observaciones. */
  description: string;
  lines: DraftLine[];
};

let lineSeq = 0;

function newLine(over: Partial<Omit<DraftLine, 'key'>> = {}): DraftLine {
  lineSeq += 1;
  // El precio nace vacío: el «0» pintado fue una de las correcciones pedidas.
  return { key: `ln-${lineSeq}`, concept: '', qty: 1, unitPrice: null, ...over };
}

function emptyDraft(): PoDraft {
  return {
    vendorName: '',
    payeeType: 'PROVEEDOR',
    rubro: 'audio',
    rubroOther: '',
    paymentMethod: 'TRANSFERENCIA',
    paymentOther: '',
    withIva: false,
    description: '',
    lines: [newLine()],
  };
}

function draftFromPo(po: Po): PoDraft {
  const rubro = parsePoRubro(po.rubro);
  const desc = splitPoDescription(po.description);
  return {
    vendorName: po.vendorName || '',
    payeeType: po.payeeType === 'OTRO' ? 'OTRO' : 'PROVEEDOR',
    rubro: rubro.key,
    rubroOther: rubro.other,
    paymentMethod: po.paymentMethod || 'TRANSFERENCIA',
    paymentOther: desc.paymentOther,
    withIva: !!po.withIva,
    description: desc.description,
    lines: po.lines?.length
      ? po.lines.map((l) => {
          const qty = l.qty === null || l.qty === undefined ? null : Number(l.qty);
          const price = Number(l.unitPrice);
          return newLine({
            concept: l.concept,
            qty: qty !== null && Number.isFinite(qty) ? qty : null,
            unitPrice: Number.isFinite(price) && price > 0 ? price : null,
          });
        })
      : [newLine()],
  };
}

function draftPayload(d: PoDraft) {
  return {
    rubro: resolvePoRubro(d.rubro, d.rubroOther) || d.rubro,
    vendorName: d.vendorName.trim(),
    payeeType: d.payeeType,
    withIva: d.withIva,
    paymentMethod: d.paymentMethod,
    description: joinPoDescription(d.paymentMethod, d.paymentOther, d.description) ?? '',
    // Las partidas sin descripción no se guardan.
    lines: d.lines
      .filter((l) => l.concept.trim())
      .map((l) => ({ concept: l.concept.trim(), qty: l.qty ?? 0, unitPrice: l.unitPrice ?? 0 })),
  };
}

function dateLong(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Montos del formulario: «—» en lugar de «$0». */
const moneyOrDash = (n: number) => (n > 0 ? mxn(n) : '—');

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M11.2 2.3l2.5 2.5-8 8H3.2v-2.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M2.8 4.2h10.4M6.2 4.2V2.8h3.6v1.4M4.2 4.2l.7 9h6.2l.7-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Formulario (crear y editar) ─────────────────────────────────────────── */

type PoFormProps = {
  mode: 'create' | 'edit';
  initial: PoDraft;
  /** Datos automáticos del machote: fecha, solicitante, evento. */
  facts: Array<[string, string]>;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (draft: PoDraft) => void | Promise<void>;
};

function PoForm({ mode, initial, facts, busy, onCancel, onSubmit }: PoFormProps) {
  const [d, setD] = useState<PoDraft>(initial);
  const uid = useId();
  const listId = `${uid}-conceptos`;

  // Tarjeta u «otro» de órdenes viejas se siguen viendo y conservando.
  const methods = useMemo(() => {
    const base: string[] = [...PO_PAYMENT_CHOICES];
    if (initial.paymentMethod && !base.includes(initial.paymentMethod)) base.push(initial.paymentMethod);
    return base;
  }, [initial.paymentMethod]);

  function patch(p: Partial<PoDraft>) {
    setD((prev) => ({ ...prev, ...p }));
  }

  function patchLine(key: string, p: Partial<DraftLine>) {
    setD((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.key === key ? { ...l, ...p } : l)),
    }));
  }

  function setConcept(line: DraftLine, value: string) {
    const p: Partial<DraftLine> = { concept: value };
    if (line.unitPrice === null) {
      const hit = findPrice(value);
      if (hit?.interno) p.unitPrice = hit.interno;
    }
    patchLine(line.key, p);
  }

  function removeLine(key: string) {
    setD((prev) => {
      const rest = prev.lines.filter((l) => l.key !== key);
      return { ...prev, lines: rest.length ? rest : [newLine()] };
    });
  }

  const filled = d.lines.filter((l) => l.concept.trim());
  const totals = poTotals(filled, d.withIva);
  const rubro = resolvePoRubro(d.rubro, d.rubroOther);
  const reason = !filled.length
    ? 'Agrega una partida'
    : totals.subtotal <= 0
      ? 'Falta cantidad o precio'
      : !rubro
        ? 'Escribe el rubro'
        : '';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (reason || busy) return;
    void onSubmit(d);
  }

  /** Enter en una celda no debe crear la orden a medias. */
  function blockEnter(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
  }

  return (
    <form className="fx oc-form" onSubmit={submit} onKeyDown={blockEnter}>
      <dl className="oc-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || '—'}</dd>
          </div>
        ))}
      </dl>

      <div className="fx-grid oc-form__head">
        <label>
          Nombre de proveedor
          <input
            value={d.vendorName}
            onChange={(e) => patch({ vendorName: e.target.value })}
            placeholder="Razón social o nombre"
            autoComplete="organization"
          />
        </label>
        <div className="fx-field">
          <span>Se paga a</span>
          <div className="choice" role="radiogroup" aria-label="Se paga a">
            {PO_PAYEE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={d.payeeType === t}
                className={`choice__opt ${d.payeeType === t ? 'is-on' : ''}`}
                onClick={() => patch({ payeeType: t })}
              >
                {PO_PAYEE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <label>
          Rubro
          <span className="oc-rubro">
            <select
              value={d.rubro}
              onChange={(e) =>
                patch({ rubro: e.target.value, rubroOther: e.target.value === 'otro' ? d.rubroOther : '' })
              }
            >
              {PO_RUBRO_KEYS.map((r) => (
                <option key={r} value={r}>
                  {r === 'otro' ? 'Otro…' : PO_RUBRO_LABELS[r]}
                </option>
              ))}
            </select>
            {d.rubro === 'otro' ? (
              <input
                value={d.rubroOther}
                onChange={(e) => patch({ rubroOther: e.target.value })}
                placeholder="¿Cuál?"
                aria-label="Nombre del rubro"
                autoComplete="off"
              />
            ) : null}
          </span>
        </label>
      </div>

      <div className="oc-lines">
        <div className="dtable-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th className="num oc-col-qty">Cantidad</th>
                <th>Descripción</th>
                <th className="num oc-col-price">Precio</th>
                <th className="num oc-col-total">Total</th>
                <th className="col-act">
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((line, i) => {
                const total = poLineTotal(line);
                const n = i + 1;
                return (
                  <tr key={line.key}>
                    <td>
                      <input
                        className="cell num"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={line.qty ?? ''}
                        onChange={(e) => patchLine(line.key, { qty: numOrNull(e.target.value) })}
                        aria-label={`Cantidad, partida ${n}`}
                      />
                    </td>
                    <td>
                      <input
                        className="cell"
                        list={listId}
                        value={line.concept}
                        onChange={(e) => setConcept(line, e.target.value)}
                        placeholder="Qué se compra"
                        aria-label={`Descripción, partida ${n}`}
                        autoComplete="off"
                      />
                    </td>
                    <td>
                      <input
                        className="cell num"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={line.unitPrice ?? ''}
                        onChange={(e) => patchLine(line.key, { unitPrice: numOrNull(e.target.value) })}
                        placeholder="$"
                        aria-label={`Precio, partida ${n}`}
                      />
                    </td>
                    <td className="num t-money">
                      {total !== null && total > 0 ? mxn(total) : <span className="t-muted">—</span>}
                    </td>
                    <td className="col-act">
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        onClick={() => removeLine(line.key)}
                        aria-label={`Quitar partida ${n}`}
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
        <datalist id={listId}>
          {PRICE_LIST.map((p) => (
            <option key={p.concept} value={p.concept} />
          ))}
        </datalist>
        <button
          type="button"
          className="btn-quiet btn-quiet--accent"
          onClick={() => patch({ lines: [...d.lines, newLine()] })}
        >
          + Agregar partida
        </button>
      </div>

      <div className="oc-form__pay">
        <div className="fx-field">
          <span>Forma de pago</span>
          <div className="choice" role="radiogroup" aria-label="Forma de pago">
            {methods.map((m) => {
              const on = d.paymentMethod === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`choice__opt ${on ? 'is-on' : ''}`}
                  onClick={() => patch({ paymentMethod: m })}
                >
                  {m === 'OTRO'
                    ? poPaymentLabel('OTRO', d.paymentOther)
                    : isPoPaymentMethod(m)
                      ? PO_PAYMENT_LABELS[m]
                      : m}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={d.withIva}
          className={`oc-switch ${d.withIva ? 'is-on' : ''}`}
          onClick={() => patch({ withIva: !d.withIva })}
        >
          <span className="oc-switch__track" aria-hidden>
            <span className="oc-switch__knob" />
          </span>
          Agregar IVA 16 %
        </button>
      </div>

      <label>
        Observaciones
        <textarea
          rows={2}
          value={d.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Opcional"
        />
      </label>

      <div className="oc-form__foot">
        <div className="totals oc-totals" aria-live="polite">
          <div className="totals__item">
            <span className="totals__label">Subtotal</span>
            <span className="totals__value">{moneyOrDash(totals.subtotal)}</span>
          </div>
          <div className="totals__item">
            <span className="totals__label">IVA</span>
            <span className="totals__value">{d.withIva ? moneyOrDash(totals.iva) : '—'}</span>
          </div>
          <div className="totals__item">
            <span className="totals__label">Total</span>
            <span className="totals__value totals__value--accent">{moneyOrDash(totals.total)}</span>
          </div>
        </div>
        <div className="fx-actions">
          {reason ? <span className="oc-reason">{reason}</span> : null}
          <button type="button" className="btn ghost btn-sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-sm" disabled={!!reason || busy}>
            {busy
              ? 'Guardando…'
              : `${mode === 'create' ? 'Crear orden' : 'Guardar'}${totals.total > 0 ? ` · ${mxn(totals.total)}` : ''}`}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ── Detalle de una orden (lo comparte la torre de OC) ──────────────────── */

export function PoDetail({
  po,
  eventId,
  closed,
  onProofsChange,
  children,
}: {
  po: Po;
  eventId: string;
  closed: boolean;
  onProofsChange: () => void | Promise<void>;
  /** Acciones secundarias al pie (Rechazar, PDF…). */
  children?: ReactNode;
}) {
  const { description, paymentOther } = splitPoDescription(po.description);
  const method = po.paymentMethod || 'TRANSFERENCIA';
  const needsProof = poNeedsProof(method);
  const hasProof = !!po.proofs?.length;
  const lines = po.lines ?? [];
  const t = poSavedTotals(po);
  const payee = po.payeeType === 'OTRO' ? 'OTRO' : 'PROVEEDOR';

  const trail = [
    po.createdBy?.fullName
      ? `Solicitó ${po.createdBy.fullName}${po.createdAt ? ` · ${poDateShort(po.createdAt)}` : ''}`
      : po.createdAt
        ? `Solicitada ${poDateShort(po.createdAt)}`
        : '',
    po.authorizedBy?.fullName
      ? `Autorizó ${po.authorizedBy.fullName}${po.authorizedAt ? ` · ${poDateShort(po.authorizedAt)}` : ''}`
      : '',
    po.paidAt ? `Pagada ${poDateShort(po.paidAt)}` : '',
    `${PO_PAYEE_LABELS[payee]} · ${poPaymentLabel(method, paymentOther)}${needsProof ? '' : ' (sin comprobante)'}`,
  ].filter(Boolean);

  const showProofs = needsProof && (po.status === 'AUTHORIZED' || po.status === 'PAID' || hasProof);

  return (
    <div className="oc-detail">
      {lines.length ? (
        <table className="oc-mini">
          <thead>
            <tr>
              <th className="num">Cant.</th>
              <th>Descripción</th>
              <th className="num">Precio</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const price = Number(l.unitPrice);
              const lt = poLineTotal(l);
              return (
                <tr key={l.id || i}>
                  <td className="num">{poQtyLabel(l.qty) || '—'}</td>
                  <td>{l.concept}</td>
                  <td className="num">{Number.isFinite(price) && price > 0 ? mxn(price) : '—'}</td>
                  <td className="num">{lt !== null && lt > 0 ? mxn(lt) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {po.withIva ? (
              <>
                <tr>
                  <td colSpan={3}>Subtotal</td>
                  <td className="num">{mxn(t.subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={3}>IVA 16 %</td>
                  <td className="num">{mxn(t.iva)}</td>
                </tr>
              </>
            ) : null}
            <tr className="is-total">
              <td colSpan={3}>Total</td>
              <td className="num">{mxn(t.total)}</td>
            </tr>
          </tfoot>
        </table>
      ) : null}

      {description ? (
        <p className="oc-notes">
          <span>Observaciones</span>
          {description}
        </p>
      ) : null}

      <p className="oc-trail">
        {trail.map((f, i) => (
          <span key={i}>{f}</span>
        ))}
      </p>

      {showProofs ? (
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

      {children ? <div className="oc-detail__foot">{children}</div> : null}
    </div>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

const EMPTY_SECTION: Record<PoSection, string> = {
  auth: 'Nada por autorizar.',
  pay: 'Nada por pagar.',
  paid: 'Aún no hay órdenes pagadas.',
  all: 'Sin órdenes.',
};

export function EventPurchaseOrdersPanel({
  event,
  closed,
  canCreate,
  canAuthorize,
  canMarkPaid,
  currentUserName,
  onChanged,
  flash,
}: EventPanelProps & {
  canCreate: boolean;
  canAuthorize: boolean;
  canMarkPaid: boolean;
  currentUserName: string;
}) {
  const orders = useMemo(
    () =>
      [...(event.purchaseOrders ?? [])].sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      ),
    [event.purchaseOrders],
  );
  const stats = useMemo(() => poSectionStats(orders), [orders]);
  const win = usePoWindow();
  const blocked = payBlockedLabel(win);
  const editable = canCreate && !closed;

  const [section, setSection] = useState<PoSection>(() => (stats.auth.count > 0 ? 'auth' : 'all'));
  // Desde Campaña: «Crear OC» deja las partidas listas y abre el formulario.
  const [handoff] = useState<Partial<PoDraft> | null>(() =>
    editable ? readDraft<Partial<PoDraft>>(poHandoffKey(event.id)) : null,
  );
  const [creating, setCreating] = useState(() => !!handoff);
  useEffect(() => {
    clearDraft(poHandoffKey(event.id));
  }, [event.id]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 'create' · id de la orden · `pdf-<id>` */
  const [busy, setBusy] = useState<string | null>(null);

  const visible = orders.filter((po) => poInSection(po.status, section));

  const summary = (() => {
    const parts: string[] = [];
    if (stats.auth.count) parts.push(`${stats.auth.count} por autorizar`);
    if (stats.pay.amount > 0) parts.push(`${mxn(stats.pay.amount)} por pagar`);
    if (parts.length) return parts.join(' · ');
    if (!orders.length) return 'Sin órdenes todavía';
    if (stats.paid.count === orders.length) return 'Todo pagado';
    return `${orders.length} ${orders.length === 1 ? 'orden' : 'órdenes'}`;
  })();

  async function run(key: string, work: () => Promise<unknown>, ok: string, fail: string) {
    setBusy(key);
    try {
      await work();
    } catch (e) {
      flash(e instanceof Error && e.message ? e.message : fail, 'error');
      setBusy(null);
      return false;
    }
    flash(ok, 'success');
    try {
      await onChanged();
    } finally {
      setBusy(null);
    }
    return true;
  }

  function openCreate() {
    setCreating(true);
    setEditingId(null);
  }

  function toggle(id: string) {
    setEditingId(null);
    setOpenId((cur) => (cur === id ? null : id));
  }

  function startEdit(po: Po) {
    setCreating(false);
    setOpenId(po.id);
    setEditingId(po.id);
  }

  async function createPo(d: PoDraft) {
    const p = draftPayload(d);
    const ok = await run(
      'create',
      () =>
        api('/purchase-orders', {
          method: 'POST',
          body: JSON.stringify({
            eventId: event.id,
            ...p,
            vendorName: p.vendorName || undefined,
            description: p.description || undefined,
          }),
        }),
      'Orden creada',
      'No se pudo crear la orden',
    );
    if (ok) {
      setCreating(false);
      setSection('auth');
    }
  }

  async function saveEdit(po: Po, d: PoDraft) {
    const ok = await run(
      po.id,
      () => api(`/purchase-orders/${po.id}`, { method: 'PATCH', body: JSON.stringify(draftPayload(d)) }),
      'Orden actualizada',
      'No se pudo guardar la orden',
    );
    if (ok) setEditingId(null);
  }

  function setStatus(po: Po, status: 'AUTHORIZED' | 'PAID' | 'REJECTED') {
    const ok = { AUTHORIZED: 'Orden autorizada', PAID: 'Orden pagada', REJECTED: 'Orden rechazada' }[status];
    return run(
      po.id,
      () => api(`/purchase-orders/${po.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      ok,
      'No se pudo cambiar el estado',
    );
  }

  async function rejectPo(po: Po) {
    if (!window.confirm(`¿Rechazar la orden de ${po.vendorName || 'este proveedor'}?`)) return;
    await setStatus(po, 'REJECTED');
  }

  async function removePo(po: Po) {
    if (!window.confirm(`¿Eliminar la orden de ${po.vendorName || 'este proveedor'}? No se puede deshacer.`)) {
      return;
    }
    const ok = await run(
      po.id,
      () => api(`/purchase-orders/${po.id}`, { method: 'DELETE' }),
      'Orden eliminada',
      'No se pudo eliminar la orden',
    );
    if (ok && openId === po.id) setOpenId(null);
  }

  async function downloadPdf(po: Po) {
    setBusy(`pdf-${po.id}`);
    try {
      const res = await api<{ url: string }>(`/purchase-orders/${po.id}/export`, { method: 'POST', body: JSON.stringify({}) });
      window.open(res.url, '_blank', 'noopener');
    } catch (e) {
      flash('No se pudo generar el PDF', 'error');
    } finally {
      setBusy(null);
    }
  }

  /** Un solo botón fuerte por fila: lo que le toca a esta orden. */
  function primaryAction(po: Po): ReactNode {
    if (closed) return null;
    const rowBusy = busy === po.id;
    if (poIsPending(po.status) && canAuthorize) {
      return (
        <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => setStatus(po, 'AUTHORIZED')}>
          Autorizar
        </button>
      );
    }
    if (po.status === 'AUTHORIZED' && canMarkPaid) {
      if (poNeedsProof(po.paymentMethod || 'TRANSFERENCIA') && !po.proofs?.length) {
        return (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setEditingId(null);
              setOpenId(po.id);
            }}
          >
            Comprobante
          </button>
        );
      }
      if (blocked) {
        return (
          <span className="oc-wait" title="Los pagos se registran solo en días de cobro">
            {blocked}
          </span>
        );
      }
      return (
        <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => setStatus(po, 'PAID')}>
          Marcar pagada
        </button>
      );
    }
    return null;
  }

  return (
    <div className="sx-stack oc-panel">
      <SectionHead
        title="Órdenes de compra"
        sub={
          <span className="oc-sub">
            <span>{summary}</span>
            <PayDaysNote state={win} />
          </span>
        }
      >
        {editable && !creating && orders.length > 0 ? (
          <button type="button" className="btn btn-sm" onClick={openCreate}>
            + Nueva orden
          </button>
        ) : null}
      </SectionHead>

      {creating && editable ? (
        <section className="surface oc-create" aria-label="Nueva orden de compra">
          <div className="surface__head">
            <h3 className="surface__title">Nueva orden</h3>
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setCreating(false)}>
              ×
            </button>
          </div>
          <div className="surface__body">
            <PoForm
              mode="create"
              initial={
                handoff
                  ? {
                      ...emptyDraft(),
                      ...handoff,
                      lines: handoff.lines?.length
                        ? handoff.lines.map((l) => newLine({ concept: l.concept, qty: l.qty, unitPrice: l.unitPrice }))
                        : [newLine()],
                    }
                  : emptyDraft()
              }
              facts={[
                ['Fecha de solicitud', dateLong(new Date().toISOString())],
                ['Solicitante', currentUserName],
                ['Evento', event.name],
              ]}
              busy={busy === 'create'}
              onCancel={() => setCreating(false)}
              onSubmit={createPo}
            />
          </div>
        </section>
      ) : null}

      {!orders.length && !creating ? (
        <EmptyLite
          icon="$"
          title="Sin órdenes de compra"
          text={editable ? 'Crea la primera orden de este evento.' : undefined}
        >
          {editable ? (
            <button type="button" className="btn btn-sm" onClick={openCreate}>
              + Nueva orden
            </button>
          ) : null}
        </EmptyLite>
      ) : null}

      {orders.length ? (
        <>
          <Seg
            label="Secciones de órdenes de compra"
            value={section}
            options={poSectionOptions(stats)}
            onChange={setSection}
          />
          <div className="dtable-wrap">
            <table className="dtable oc-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th className="oc-hide-sm">Solicitud</th>
                  <th className="oc-hide-sm">Pago</th>
                  <th className="num">Total</th>
                  <th>Estado</th>
                  <th className="col-act">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((po) => {
                  const open = openId === po.id;
                  const pending = poIsPending(po.status);
                  const editing = editingId === po.id && editable && pending;
                  const pill = poStatusPill(po.status);
                  const method = po.paymentMethod || 'TRANSFERENCIA';
                  const { paymentOther } = splitPoDescription(po.description);
                  const rowBusy = busy === po.id;
                  const who = po.vendorName || 'este proveedor';
                  return (
                    <Fragment key={po.id}>
                      <tr className={`oc-row ${open ? 'is-open' : ''}`} onClick={() => toggle(po.id)}>
                        <td>
                          <button
                            type="button"
                            className="oc-vendor"
                            aria-expanded={open}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(po.id);
                            }}
                          >
                            <span className="oc-vendor__name">{po.vendorName || 'Sin proveedor'}</span>
                            <span className="oc-vendor__sub">{poRubroLabel(po.rubro)}</span>
                          </button>
                        </td>
                        <td className="oc-hide-sm t-muted t-small">{poDateShort(po.createdAt)}</td>
                        <td className="oc-hide-sm t-small">{poPaymentLabel(method, paymentOther)}</td>
                        <td className="num t-money oc-amount">{mxn(Number(po.amount))}</td>
                        <td>
                          <Pill tone={pill.tone}>{pill.label}</Pill>
                        </td>
                        <td className="col-act" onClick={(e) => e.stopPropagation()}>
                          <div className="oc-actions">
                            {primaryAction(po)}
                            <button
                              type="button"
                              className="btn-quiet"
                              onClick={() => downloadPdf(po)}
                              disabled={busy === `pdf-${po.id}`}
                              aria-label={`PDF de la orden de ${who}`}
                            >
                              PDF
                            </button>
                            {editable && pending ? (
                              <>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  title="Editar"
                                  aria-label={`Editar la orden de ${who}`}
                                  disabled={rowBusy}
                                  onClick={() => startEdit(po)}
                                >
                                  <IconEdit />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn icon-btn--danger"
                                  title="Eliminar"
                                  aria-label={`Eliminar la orden de ${who}`}
                                  disabled={rowBusy}
                                  onClick={() => removePo(po)}
                                >
                                  <IconTrash />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="oc-detail-row">
                          <td className="dtable__detail" colSpan={6}>
                            {editing ? (
                              <PoForm
                                key={`edit-${po.id}`}
                                mode="edit"
                                initial={draftFromPo(po)}
                                facts={[
                                  ['Fecha de solicitud', dateLong(po.createdAt)],
                                  ['Solicitante', po.createdBy?.fullName || '—'],
                                  ['Evento', event.name],
                                ]}
                                busy={rowBusy}
                                onCancel={() => setEditingId(null)}
                                onSubmit={(d) => saveEdit(po, d)}
                              />
                            ) : (
                              <PoDetail po={po} eventId={event.id} closed={closed} onProofsChange={onChanged}>
                                {!closed && canAuthorize && pending ? (
                                  <button
                                    type="button"
                                    className="btn-quiet oc-reject"
                                    disabled={rowBusy}
                                    onClick={() => rejectPo(po)}
                                  >
                                    Rechazar
                                  </button>
                                ) : null}
                              </PoDetail>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {!visible.length ? (
                  <tr>
                    <td colSpan={6} className="oc-empty-row">
                      {EMPTY_SECTION[section]}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
