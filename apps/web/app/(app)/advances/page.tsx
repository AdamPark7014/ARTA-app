'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  ActionLink,
  FlashMessage,
  FormGrid,
  PageHeader,
} from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type EventOpt = { id: string; name: string; entity: string };
type Advance = {
  id: string;
  label?: string | null;
  amount?: string | number | null;
  fileUrl: string;
  createdAt: string;
  uploadedBy?: { fullName: string } | null;
};

export default function AdvancesPage() {
  const { entity } = useUser();
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [rows, setRows] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventId, setEventId] = useState('');
  const [label, setLabel] = useState('Anticipo');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [portfolioAdvances, setPortfolioAdvances] = useState(0);

  async function load(forEvent?: string) {
    setLoading(true);
    try {
      const [evs, overview] = await Promise.all([
        api<EventOpt[]>(`/events?entity=${entity}`),
        api<{ kpis: { advanceTotal: number } }>(`/analytics/overview?entity=${entity}`).catch(
          () => null,
        ),
      ]);
      setEvents(evs);
      if (overview) setPortfolioAdvances(overview.kpis.advanceTotal || 0);
      const eid = forEvent || eventId || evs[0]?.id || '';
      if (!eventId && eid) setEventId(eid);
      if (!eid) {
        setRows([]);
        return;
      }
      const advances = await api<Advance[]>(`/finance/advances/event/${eid}`);
      setRows(advances);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, eventId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !eventId) return;
    setSaving(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', eventId);
      fd.append('kind', 'proof');
      const uploaded = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
      await api('/finance/advances', {
        method: 'POST',
        body: JSON.stringify({
          eventId,
          label,
          amount: amount ? Number(amount) : undefined,
          fileUrl: uploaded.url,
        }),
      });
      setMsg('Anticipo registrado con comprobante');
      setFile(null);
      setAmount('');
      await load(eventId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error al subir');
    } finally {
      setSaving(false);
    }
  }

  const eventTotal = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const msgVariant =
    msg.includes('registrado') ? 'success' : msg.toLowerCase().includes('error') ? 'error' : 'info';

  return (
    <AppShell title="Anticipos · Cash control">
      <div className="stack page-workspace">
        <PageHeader
          description="Control de anticipos y comprobantes ligados a eventos. Portfolio vs evento seleccionado."
        >
          <ActionLink href="/events" variant="ghost">Ir a eventos</ActionLink>
        </PageHeader>

        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        {loading && !events.length ? (
          <>
            <LoadingKpis count={3} />
            <LoadingBlock rows={4} label="Cargando anticipos…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <div className="kpi">
                <div className="label">Portfolio anticipos</div>
                <div className="value" style={{ fontSize: '1.25rem' }}>
                  ${Math.round(portfolioAdvances).toLocaleString('es-MX')}
                </div>
              </div>
              <div className="kpi">
                <div className="label">Este evento</div>
                <div className="value" style={{ fontSize: '1.25rem' }}>
                  ${Math.round(eventTotal).toLocaleString('es-MX')}
                </div>
              </div>
              <div className="kpi">
                <div className="label">Comprobantes</div>
                <div className="value">{rows.length}</div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Subir anticipo / comprobante</h2>
              </div>
              <div className="panel-body">
                {!events.length ? (
                  <EmptyState
                    title="Sin eventos en esta entidad"
                    description="Crea un evento para registrar anticipos y comprobantes."
                    actionHref="/events/new"
                    actionLabel="Crear evento"
                  />
                ) : (
                  <form className="form" onSubmit={onSubmit} style={{ maxWidth: 640 }}>
                    <label>
                      Evento
                      <select required value={eventId} onChange={(e) => setEventId(e.target.value)}>
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <FormGrid cols={2}>
                      <label>
                        Concepto
                        <input value={label} onChange={(e) => setLabel(e.target.value)} />
                      </label>
                      <label>
                        Monto
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </label>
                    </FormGrid>
                    <label>
                      Comprobante (PDF / imagen)
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        required
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <button className="btn" type="submit" disabled={saving}>
                      {saving ? 'Subiendo…' : 'Subir anticipo'}
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Comprobantes del evento</h2>
                {eventId ? (
                  <ActionLink href={`/events/${eventId}`} variant="ghost">
                    Abrir evento
                  </ActionLink>
                ) : null}
              </div>
              <div className="panel-body">
                {loading ? (
                  <LoadingBlock rows={3} label="Cargando comprobantes…" />
                ) : (
                  <div className="table-wrap">
                    <table className="table table-sticky">
                      <thead>
                        <tr>
                          <th>Concepto</th>
                          <th className="num">Monto</th>
                          <th>Quién</th>
                          <th>Fecha</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <td>{r.label || 'Anticipo'}</td>
                            <td className="num">
                              {r.amount != null
                                ? `$${Number(r.amount).toLocaleString('es-MX')}`
                                : '—'}
                            </td>
                            <td className="muted">{r.uploadedBy?.fullName || '—'}</td>
                            <td className="muted">
                              {new Date(r.createdAt).toLocaleString('es-MX')}
                            </td>
                            <td>
                              <a className="btn ghost" href={r.fileUrl} target="_blank" rel="noreferrer">
                                Ver
                              </a>
                            </td>
                          </tr>
                        ))}
                        {!rows.length ? (
                          <tr>
                            <td colSpan={5}>
                              <EmptyState
                                title="Sin anticipos en este evento"
                                description="Sube un comprobante PDF o imagen con monto y concepto."
                              />
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
