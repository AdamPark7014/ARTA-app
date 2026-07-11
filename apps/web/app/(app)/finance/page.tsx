'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type FinanceData = {
  rows?: Array<{ concept?: string; type?: string; amount?: number }>;
  totalIncome?: number;
  totalExpense?: number;
};

type EventRow = {
  id: string;
  name: string;
  entity: string;
  status: string;
  artist?: string | null;
  financeRuns?: Array<{ id: string; title: string; locked: boolean; dataJson?: FinanceData }>;
};

export default function FinancePage() {
  const { entity, user } = useUser();
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    api<EventRow[]>(`/events?entity=${entity}`)
      .then(async (list) => {
        const detailed = await Promise.all(
          list.slice(0, 30).map((e) => api<EventRow>(`/events/${e.id}`)),
        );
        setEvents(detailed);
      })
      .catch(console.error);
  }, [entity]);

  const canEdit =
    user &&
    (user.roleKey === 'dir_general' ||
      user.roleKey === 'gerente_arta' ||
      user.roleKey === 'super_admin' ||
      user.permissions.includes('finance.edit'));

  return (
    <AppShell title="Finanzas / Corridas">
      <div className="stack">
        <p className="muted">
          Índice de corridas. El editor de filas vive en el evento (tab Corrida).
          {canEdit ? ' Tienes permiso de edición.' : ' Acceso de lectura / seguimiento.'}
        </p>
        <div className="panel">
          <div className="panel-head">
            <h2>Corridas · {entity}</h2>
          </div>
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Status</th>
                  <th>Ingresos</th>
                  <th>Egresos</th>
                  <th>Neto</th>
                  <th>Corrida</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const run = e.financeRuns?.[0];
                  const d = run?.dataJson;
                  const income = Number(d?.totalIncome ?? 0);
                  const expense = Number(d?.totalExpense ?? 0);
                  const net = income - expense;
                  return (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.name}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {e.artist || '—'}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${e.status === 'ACTIVE' ? 'ok' : 'warn'}`}>{e.status}</span>
                      </td>
                      <td>${income.toLocaleString('es-MX')}</td>
                      <td>${expense.toLocaleString('es-MX')}</td>
                      <td style={{ color: net >= 0 ? 'var(--ok, #2a7)' : 'var(--danger)' }}>
                        ${net.toLocaleString('es-MX')}
                      </td>
                      <td>
                        {run?.title || '—'} {run?.locked ? <span className="badge">LOCKED</span> : null}
                      </td>
                      <td>
                        <Link className="btn ghost" href={`/events/${e.id}?tab=finance`}>
                          Abrir corrida
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!events.length ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Sin eventos en {entity}.
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
