'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { EmptyLite, Pill, SectionHead, Seg, Tile } from '@/components/ui/Lite';
import { FieldSelect, FormGrid } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { mxn } from '@/lib/price-list';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';

type EventOpt = { id: string; name: string; entity: string; status?: string };
type AdvanceStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
type PersonRef = { id: string; fullName: string } | null;

/** Forma de `/finance/advances/*` (ver docs/ANTICIPOS-CONTRATO.md). */
type Advance = {
  id: string;
  eventId: string | null;
  label?: string | null;
  amount?: string | number | null;
  fileUrl?: string | null;
  note?: string | null;
  advanceStatus?: AdvanceStatus | null;
  createdAt: string;
  decidedAt?: string | null;
  rejectReason?: string | null;
  paidAt?: string | null;
  paidProofUrl?: string | null;
  event?: { id: string; name: string; entity: string } | null;
  uploadedBy?: PersonRef;
  decidedBy?: PersonRef;
  paidBy?: PersonRef;
};

type Tab = 'pending' | 'mine' | 'event';

const CLOSED_EVENT = new Set(['CLOSED', 'CANCELLED']);

const STATUS_PILL: Record<AdvanceStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Por aprobar', tone: 'review' },
  APPROVED: { label: 'Aprobado · por pagar', tone: 'ok' },
  REJECTED: { label: 'Rechazado', tone: 'danger' },
  PAID: { label: 'Pagado', tone: 'paid' },
};

const EMPTY_TAB: Record<Tab, { title: string; text: string }> = {
  pending: { title: 'Nada por resolver', text: 'Aquí llegan los anticipos que te toca aprobar o pagar.' },
  mine: { title: 'Aún no pides anticipos', text: 'Lo que solicites aparece aquí con su estado.' },
  event: { title: 'Sin anticipos en este evento', text: 'Las solicitudes del evento aparecen aquí.' },
};

const statusOf = (a: Advance): AdvanceStatus => a.advanceStatus ?? 'PAID';
const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '';
const plural = (n: number) => `${n} ${n === 1 ? 'anticipo' : 'anticipos'}`;
const sum = (rows: Advance[]) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);

async function uploadFile(file: File, eventId: string) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('eventId', eventId);
  fd.append('kind', 'proof');
  const uploaded = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
  return uploaded.url;
}

export default function AdvancesPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Anticipos">
          <div className="stack page-workspace">
            <LoadingBlock rows={4} label="Cargando anticipos…" />
          </div>
        </AppShell>
      }
    >
      <AdvancesPageInner />
    </Suspense>
  );
}

/**
 * Anticipos con aprobación: solicitar → aprobar o rechazar → pagado.
 * «Por resolver» es lo que me toca, «Mis solicitudes» lo que pedí y «Por
 * evento» todo lo de un evento. `?advance=<id>` (enlace de los avisos) abre la tarjeta.
 */
function AdvancesPageInner() {
  const { entity, user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedId = searchParams.get('advance');

  const roleKey = user?.roleKey || '';
  const perms = user?.permissions || [];
  const canRequest =
    userHasPermission(roleKey, perms, ['finance.view', 'finance.edit']) &&
    userHasPermission(roleKey, perms, ['checklist.edit']);
  const canApprove = userHasPermission(roleKey, perms, ['po.authorize']);
  const canPay = userHasPermission(roleKey, perms, ['po.mark_paid', 'finance.edit']);

  const [events, setEvents] = useState<EventOpt[]>([]);
  const [pending, setPending] = useState<Advance[] | null>(null);
  const [mine, setMine] = useState<Advance[] | null>(null);
  const [eventRows, setEventRows] = useState<Advance[] | null>(null);
  const [eventId, setEventId] = useState('');
  const [paidTotal, setPaidTotal] = useState(0);
  const [tab, setTab] = useState<Tab | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  /** Lo que se acaba de resolver aquí: la tarjeta abierta sigue mostrándolo aunque salga de «Por resolver». */
  const [patched, setPatched] = useState<Record<string, Advance>>({});
  const handledLink = useRef<string | null>(null);

  async function loadLists() {
    const [p, m] = await Promise.all([
      api<Advance[]>('/finance/advances/pending').catch(() => [] as Advance[]),
      api<Advance[]>('/finance/advances/mine').catch(() => [] as Advance[]),
    ]);
    setPending(p);
    setMine(m);
  }

  async function loadEventRows(id: string) {
    if (!id) {
      setEventRows([]);
      return;
    }
    setEventRows(null);
    setEventRows(await api<Advance[]>(`/finance/advances/event/${id}`).catch(() => [] as Advance[]));
  }

  useEffect(() => {
    setPending(null);
    setMine(null);
    Promise.all([
      api<EventOpt[]>(`/events?entity=${entity}`).catch(() => [] as EventOpt[]),
      api<{ kpis: { advanceTotal: number } }>(`/analytics/overview?entity=${entity}`).catch(() => null),
      loadLists(),
    ])
      .then(([evs, overview]) => {
        setEvents(evs);
        setPaidTotal(overview?.kpis.advanceTotal || 0);
        setEventId((cur) => (cur && evs.some((e) => e.id === cur) ? cur : evs[0]?.id || ''));
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    if (tab === 'event') loadEventRows(eventId).catch(console.error);
  }, [tab, eventId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const all = useMemo(() => {
    const byId = new Map<string, Advance>();
    for (const r of [...(eventRows ?? []), ...(mine ?? []), ...(pending ?? []), ...Object.values(patched)]) {
      byId.set(r.id, r);
    }
    return byId;
  }, [pending, mine, eventRows, patched]);

  // El enlace de un aviso abre la tarjeta en cuanto las listas cargan (una vez por enlace).
  useEffect(() => {
    if (!linkedId || pending === null || mine === null || handledLink.current === linkedId) return;
    handledLink.current = linkedId;
    if (pending.some((r) => r.id === linkedId)) setTab('pending');
    else if (mine.some((r) => r.id === linkedId)) setTab('mine');
    if (all.has(linkedId)) setOpenId(linkedId);
    else setNotice({ text: 'Ese anticipo ya no está en tus pendientes ni en tus solicitudes.', tone: 'error' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedId, pending, mine]);

  const current: Tab = tab ?? (pending && pending.length > 0 ? 'pending' : 'mine');
  const openEvents = useMemo(() => events.filter((e) => !CLOSED_EVENT.has(e.status || '')), [events]);
  const opened = openId ? all.get(openId) ?? null : null;

  const rows = current === 'pending' ? pending : current === 'mine' ? mine : eventRows;
  const toApprove = (pending ?? []).filter((r) => statusOf(r) === 'PENDING');
  const toPay = (pending ?? []).filter((r) => statusOf(r) === 'APPROVED');
  const myOpen = (mine ?? []).filter((r) => statusOf(r) === 'PENDING' || statusOf(r) === 'APPROVED');

  function closeCard() {
    setOpenId(null);
    if (linkedId) {
      handledLink.current = null;
      router.replace('/advances');
    }
  }

  async function afterChange(updated: Advance, text: string) {
    setNotice({ text, tone: 'ok' });
    setPatched((prev) => ({ ...prev, [updated.id]: updated }));
    setEventRows((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
    await loadLists();
  }

  return (
    <AppShell title="Anticipos">
      <div className="stack page-workspace">
        <SectionHead
          title="Anticipos"
          sub="Se solicitan, los aprueba quien autoriza OC en la entidad y después se pagan. Cada paso avisa."
        >
          {canRequest ? (
            <button type="button" className="btn btn-sm" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cerrar formulario' : 'Solicitar anticipo'}
            </button>
          ) : null}
          <Link className="btn-quiet" href="/events">
            Ir a eventos
          </Link>
        </SectionHead>

        {notice ? (
          <p className={`oc-flash ${notice.tone === 'error' ? 'is-error' : 'is-ok'}`} role="status">
            {notice.text}
          </p>
        ) : null}

        {showForm && canRequest ? (
          <RequestForm
            events={openEvents}
            defaultEventId={openEvents.some((e) => e.id === eventId) ? eventId : openEvents[0]?.id || ''}
            onCancel={() => setShowForm(false)}
            onCreated={async (created) => {
              setShowForm(false);
              setTab('mine');
              setNotice({ text: 'Solicitud enviada. Quien aprueba ya recibió el aviso.', tone: 'ok' });
              await loadLists();
              if (created.eventId === eventId) await loadEventRows(eventId);
            }}
          />
        ) : null}

        <div className="tiles">
          <Tile
            label="Por resolver"
            value={pending ? pending.length : '—'}
            sub={
              pending
                ? pending.length
                  ? `${toApprove.length} por aprobar · ${toPay.length} por pagar`
                  : 'Nada pendiente'
                : undefined
            }
            tone={pending && pending.length ? 'warn' : undefined}
            onClick={() => setTab('pending')}
          />
          <Tile
            label="Mis solicitudes abiertas"
            value={mine ? myOpen.length : '—'}
            sub={mine ? (myOpen.length ? mxn(sum(myOpen)) : 'Ninguna en curso') : undefined}
            onClick={() => setTab('mine')}
          />
          <Tile label="Pagado en la entidad" value={mxn(paidTotal)} sub="Anticipos ya entregados" tone="accent" />
        </div>

        <div className="oc-toolbar">
          <Seg<Tab>
            label="Secciones de anticipos"
            value={current}
            options={[
              { key: 'pending', label: 'Por resolver', count: pending?.length },
              { key: 'mine', label: 'Mis solicitudes', count: mine?.length },
              { key: 'event', label: 'Por evento' },
            ]}
            onChange={(k) => setTab(k)}
          />
          {current === 'event' && events.length ? (
            <FieldSelect
              value={eventId}
              onChange={setEventId}
              label="Evento"
              options={events.map((ev) => ({ value: ev.id, label: ev.name }))}
            />
          ) : null}
        </div>

        {current === 'event' && eventRows && eventRows.length ? (
          <p className="t-muted t-small adv-summary">
            {plural(eventRows.length)} · pagado {mxn(sum(eventRows.filter((r) => statusOf(r) === 'PAID')))}
          </p>
        ) : null}

        {rows === null ? (
          <LoadingBlock rows={3} label="Cargando anticipos…" />
        ) : rows.length ? (
          <div className="adv-list">
            {rows.map((r) => (
              <AdvanceCard key={r.id} advance={r} showEvent={current !== 'event'} onOpen={() => setOpenId(r.id)} />
            ))}
          </div>
        ) : (
          <EmptyLite icon="$" title={EMPTY_TAB[current].title} text={EMPTY_TAB[current].text}>
            {canRequest && current !== 'pending' ? (
              <button type="button" className="btn ghost btn-sm" onClick={() => setShowForm(true)}>
                Solicitar anticipo
              </button>
            ) : null}
          </EmptyLite>
        )}
      </div>

      {opened ? (
        <AdvanceDetail
          advance={opened}
          meId={user?.id || ''}
          canApprove={canApprove}
          canPay={canPay}
          onClose={closeCard}
          onChanged={afterChange}
        />
      ) : null}
    </AppShell>
  );
}

function AdvanceCard({ advance, showEvent, onOpen }: { advance: Advance; showEvent: boolean; onOpen: () => void }) {
  const pill = STATUS_PILL[statusOf(advance)];
  return (
    <button type="button" className="adv-card" onClick={onOpen}>
      <span className="adv-card__top">
        <span className="adv-card__title">{advance.label || 'Anticipo'}</span>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </span>
      <span className="adv-card__amount t-money">
        {advance.amount != null ? mxn(Number(advance.amount)) : 'Sin monto'}
      </span>
      <span className="adv-card__meta">
        {showEvent && advance.event ? <span>{advance.event.name}</span> : null}
        <span>
          {advance.uploadedBy?.fullName || 'Alguien del equipo'} · {when(advance.createdAt)}
        </span>
      </span>
      {advance.note ? <span className="adv-card__note">{advance.note}</span> : null}
    </button>
  );
}

function RequestForm({
  events,
  defaultEventId,
  onCancel,
  onCreated,
}: {
  events: EventOpt[];
  defaultEventId: string;
  onCancel: () => void;
  onCreated: (created: Advance) => Promise<void>;
}) {
  const [eventId, setEventId] = useState(defaultEventId);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!eventId) return setError('Elige el evento.');
    if (!amount || !Number.isFinite(value) || value <= 0) return setError('Escribe el monto (mayor a cero).');
    setBusy(true);
    setError('');
    try {
      const fileUrl = file ? await uploadFile(file, eventId) : undefined;
      const created = await api<Advance>('/finance/advances', {
        method: 'POST',
        body: JSON.stringify({
          eventId,
          label: label.trim() || undefined,
          amount: value,
          note: note.trim() || undefined,
          fileUrl,
        }),
      });
      await onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Solicitar anticipo</h2>
      </div>
      <div className="panel-body">
        {!events.length ? (
          <EmptyLite icon="+" title="Sin eventos abiertos" text="Los anticipos se piden sobre un evento abierto de la entidad.">
            <Link className="btn ghost btn-sm" href="/events/new">
              Crear evento
            </Link>
          </EmptyLite>
        ) : (
          <form className="form adv-form" onSubmit={onSubmit}>
            <FormGrid cols={2}>
              <label>
                Evento
                <select className="field" value={eventId} onChange={(e) => setEventId(e.target.value)} required>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Monto (MXN)
                <input
                  className="field"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </label>
            </FormGrid>
            <label>
              Concepto
              <input
                className="field"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Hospedaje, viáticos, anticipo a proveedor…"
                maxLength={120}
              />
            </label>
            <label>
              Nota (para qué es)
              <textarea
                className="field"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Lo que necesita saber quien aprueba"
              />
            </label>
            <label>
              Archivo (opcional: cotización, factura, PDF o imagen)
              <input className="field" type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            {error ? <div className="flash flash--error">{error}</div> : null}
            <div className="row row--tight">
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar solicitud'}
              </button>
              <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AdvanceDetail({
  advance,
  meId,
  canApprove,
  canPay,
  onClose,
  onChanged,
}: {
  advance: Advance;
  meId: string;
  canApprove: boolean;
  canPay: boolean;
  onClose: () => void;
  onChanged: (updated: Advance, text: string) => Promise<void>;
}) {
  const status = statusOf(advance);
  const pill = STATUS_PILL[status];
  const mineRequest = advance.uploadedBy?.id === meId;
  const mayDecide = status === 'PENDING' && canApprove && !mineRequest;
  const mayPay = status === 'APPROVED' && canPay;

  const [mode, setMode] = useState<'idle' | 'reject' | 'pay'>('idle');
  const [reason, setReason] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMode('idle');
    setReason('');
    setProof(null);
    setError('');
  }, [advance.id, status]);

  async function run(action: () => Promise<Advance>, text: string) {
    setBusy(true);
    setError('');
    try {
      await onChanged(await action(), text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar');
    } finally {
      setBusy(false);
    }
  }

  const approve = () =>
    run(
      () => api<Advance>(`/finance/advances/${advance.id}/approve`, { method: 'PATCH' }),
      'Anticipo aprobado. Quien paga ya recibió el aviso.',
    );

  const reject = () => {
    if (reason.trim().length < 3) return setError('Escribe el motivo (mínimo 3 caracteres).');
    return run(
      () =>
        api<Advance>(`/finance/advances/${advance.id}/reject`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: reason.trim() }),
        }),
      'Anticipo rechazado. Se le avisó a quien lo pidió.',
    );
  };

  const markPaid = () =>
    run(async () => {
      const proofUrl = proof && advance.eventId ? await uploadFile(proof, advance.eventId) : undefined;
      return api<Advance>(`/finance/advances/${advance.id}/paid`, {
        method: 'PATCH',
        body: JSON.stringify({ proofUrl }),
      });
    }, 'Anticipo marcado como pagado.');

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal panel adv-detail" role="dialog" aria-labelledby="adv-detail-title" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2 id="adv-detail-title">{advance.label || 'Anticipo'}</h2>
          <button className="btn ghost btn-sm" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="panel-body">
          <div className="adv-detail__head">
            <span className="adv-card__amount t-money">
              {advance.amount != null ? mxn(Number(advance.amount)) : 'Sin monto'}
            </span>
            <Pill tone={pill.tone}>{pill.label}</Pill>
          </div>

          <dl className="adv-detail__facts">
            {advance.event ? (
              <>
                <dt>Evento</dt>
                <dd>
                  <Link href={`/events/${advance.event.id}?tab=finance`}>{advance.event.name}</Link>
                </dd>
              </>
            ) : null}
            <dt>Solicitó</dt>
            <dd>
              {advance.uploadedBy?.fullName || 'Alguien del equipo'} · {when(advance.createdAt)}
            </dd>
            {advance.note ? (
              <>
                <dt>Nota</dt>
                <dd className="adv-detail__note">{advance.note}</dd>
              </>
            ) : null}
            {advance.decidedBy || advance.decidedAt ? (
              <>
                <dt>{status === 'REJECTED' ? 'Rechazó' : 'Aprobó'}</dt>
                <dd>
                  {advance.decidedBy?.fullName || '—'} · {when(advance.decidedAt)}
                </dd>
              </>
            ) : null}
            {status === 'REJECTED' && advance.rejectReason ? (
              <>
                <dt>Motivo</dt>
                <dd className="adv-detail__reason">{advance.rejectReason}</dd>
              </>
            ) : null}
            {status === 'PAID' && (advance.paidBy || advance.paidAt) ? (
              <>
                <dt>Pagó</dt>
                <dd>
                  {advance.paidBy?.fullName || '—'} · {when(advance.paidAt)}
                </dd>
              </>
            ) : null}
            {advance.fileUrl || advance.paidProofUrl ? (
              <>
                <dt>Archivos</dt>
                <dd className="adv-detail__files">
                  {advance.fileUrl ? (
                    <a className="btn-quiet" href={advance.fileUrl} target="_blank" rel="noreferrer">
                      Archivo de la solicitud
                    </a>
                  ) : null}
                  {advance.paidProofUrl ? (
                    <a className="btn-quiet" href={advance.paidProofUrl} target="_blank" rel="noreferrer">
                      Comprobante de pago
                    </a>
                  ) : null}
                </dd>
              </>
            ) : null}
          </dl>

          {status === 'PENDING' && mineRequest && canApprove ? (
            <p className="t-muted t-small">Es tu solicitud: la aprueba otra persona que autoriza OC.</p>
          ) : null}

          {mode === 'reject' ? (
            <label className="adv-detail__field">
              Motivo del rechazo
              <textarea
                className="field"
                rows={3}
                value={reason}
                autoFocus
                onChange={(e) => setReason(e.target.value)}
                placeholder="Le llega a quien lo pidió"
              />
            </label>
          ) : null}
          {mode === 'pay' ? (
            <label className="adv-detail__field">
              Comprobante de pago (opcional)
              <input className="field" type="file" accept=".pdf,image/*" onChange={(e) => setProof(e.target.files?.[0] || null)} />
            </label>
          ) : null}

          {error ? <div className="flash flash--error">{error}</div> : null}

          {mayDecide || mayPay ? (
            <div className="row row--tight adv-detail__actions">
              {mayDecide && mode === 'idle' ? (
                <>
                  <button className="btn" type="button" disabled={busy} onClick={approve}>
                    {busy ? 'Aprobando…' : 'Aprobar'}
                  </button>
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => setMode('reject')}>
                    Rechazar
                  </button>
                </>
              ) : null}
              {mayDecide && mode === 'reject' ? (
                <>
                  <button className="btn danger" type="button" disabled={busy} onClick={reject}>
                    {busy ? 'Rechazando…' : 'Confirmar rechazo'}
                  </button>
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => setMode('idle')}>
                    Cancelar
                  </button>
                </>
              ) : null}
              {mayPay && mode === 'idle' ? (
                <button className="btn" type="button" disabled={busy} onClick={() => setMode('pay')}>
                  Marcar pagado
                </button>
              ) : null}
              {mayPay && mode === 'pay' ? (
                <>
                  <button className="btn" type="button" disabled={busy} onClick={markPaid}>
                    {busy ? 'Guardando…' : 'Confirmar pago'}
                  </button>
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => setMode('idle')}>
                    Cancelar
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
