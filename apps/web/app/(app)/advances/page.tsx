'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
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
  const [eventId, setEventId] = useState('');
  const [label, setLabel] = useState('Anticipo');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(forEvent?: string) {
    const evs = await api<EventOpt[]>(`/events?entity=${entity}`);
    setEvents(evs);
    const eid = forEvent || eventId || evs[0]?.id || '';
    if (!eventId && eid) setEventId(eid);
    if (!eid) {
      setRows([]);
      return;
    }
    const advances = await api<Advance[]>(`/finance/advances/event/${eid}`);
    setRows(advances);
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

  return (
    <AppShell title="Anticipos y pagos">
      <div className="stack">
        <p className="muted">Sube comprobante, registra monto y queda ligado al evento.</p>
        <div className="panel">
          <div className="panel-head">
            <h2>Subir anticipo / comprobante</h2>
          </div>
          <div className="panel-body">
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              </div>
              <label>
                Comprobante (PDF / imagen)
                <input
                  type="file"
                  accept=".pdf,image/*"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              {msg ? <div className="muted">{msg}</div> : null}
              <button className="btn" type="submit" disabled={saving}>
                {saving ? 'Subiendo…' : 'Subir anticipo'}
              </button>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Comprobantes del evento</h2>
            {eventId ? (
              <Link className="btn ghost" href={`/events/${eventId}`}>
                Abrir evento
              </Link>
            ) : null}
          </div>
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Monto</th>
                  <th>Quién</th>
                  <th>Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label || 'Anticipo'}</td>
                    <td>{r.amount != null ? `$${Number(r.amount).toLocaleString('es-MX')}` : '—'}</td>
                    <td className="muted">{r.uploadedBy?.fullName || '—'}</td>
                    <td className="muted">{new Date(r.createdAt).toLocaleString('es-MX')}</td>
                    <td>
                      <a href={r.fileUrl} target="_blank" rel="noreferrer">
                        Ver
                      </a>
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Sin anticipos aún para este evento.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
