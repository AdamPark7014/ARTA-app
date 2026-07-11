'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';

type Task = {
  id: string;
  title: string;
  module?: string | null;
  status: string;
  dueAt?: string | null;
  event: { id: string; name: string; entity: string; status: string };
};

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [msg, setMsg] = useState('');

  async function load() {
    const data = await api<Task[]>('/tasks/mine');
    setTasks(data);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function setStatus(id: string, status: string) {
    await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setMsg(status === 'DONE' ? 'Tarea marcada como hecha' : 'Tarea reabierta');
    await load();
  }

  return (
    <AppShell title="Mis tareas">
      <div className="stack">
        <p className="muted">Tareas asignadas a ti en eventos de tus entidades.</p>
        {msg ? <div className="muted">{msg}</div> : null}
        <div className="panel">
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Evento</th>
                  <th>Módulo</th>
                  <th>Vence</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>
                      <Link href={`/events/${t.event.id}`}>{t.event.name}</Link>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {t.event.entity}
                      </div>
                    </td>
                    <td className="muted">{t.module || '—'}</td>
                    <td className="muted">
                      {t.dueAt ? new Date(t.dueAt).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td>
                      <span className={`badge ${t.status === 'DONE' ? 'ok' : 'warn'}`}>{t.status}</span>
                    </td>
                    <td>
                      {t.status !== 'DONE' ? (
                        <button className="btn ghost" type="button" onClick={() => setStatus(t.id, 'DONE')}>
                          Hecha
                        </button>
                      ) : (
                        <button className="btn ghost" type="button" onClick={() => setStatus(t.id, 'OPEN')}>
                          Reabrir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!tasks.length ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No tienes tareas asignadas.
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
