'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';

type AuditRow = {
  id: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  metaJson?: unknown;
  createdAt: string;
  user?: { fullName: string; email: string } | null;
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [resource, setResource] = useState('');
  const [error, setError] = useState('');

  async function load(res?: string) {
    setError('');
    try {
      const q = res ? `?resource=${encodeURIComponent(res)}&take=150` : '?take=150';
      const data = await api<AuditRow[]>(`/audit${q}`);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  return (
    <AppShell title="Audit log">
      <div className="stack">
        <p className="muted">Solo Arturo / Chacho. Últimas acciones del sistema.</p>
        <div className="row">
          <select
            value={resource}
            onChange={(e) => {
              setResource(e.target.value);
              load(e.target.value || undefined).catch(console.error);
            }}
          >
            <option value="">Todos los recursos</option>
            <option value="Event">Event</option>
            <option value="ChecklistInstance">Checklist</option>
            <option value="PageContent">Studio</option>
          </select>
          <button className="btn ghost" type="button" onClick={() => load(resource || undefined)}>
            Refrescar
          </button>
        </div>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <div className="panel">
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Recurso</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(r.createdAt).toLocaleString('es-MX')}
                    </td>
                    <td>
                      {r.user?.fullName || '—'}
                      <div className="muted" style={{ fontSize: 11 }}>
                        {r.user?.email || ''}
                      </div>
                    </td>
                    <td>
                      <span className="badge">{r.action}</span>
                    </td>
                    <td>{r.resource}</td>
                    <td className="muted" style={{ fontSize: 11 }}>
                      {r.resourceId || '—'}
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Sin registros.
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
