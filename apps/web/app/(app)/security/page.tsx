'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type Session = {
  id: string;
  deviceLabel?: string | null;
  ip?: string | null;
  createdAt: string;
  lastSeenAt: string;
};

type Setup = { secret: string; qrDataUrl: string; otpauth: string };

export default function SecurityPage() {
  const { user, refresh } = useUser();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const s = await api<Session[]>('/auth/sessions');
    setSessions(s);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setMsg(e instanceof Error ? e.message : 'Error al cargar sesiones'))
      .finally(() => setLoading(false));
  }, []);

  async function startSetup() {
    setMsg('');
    const data = await api<Setup>('/auth/2fa/setup', { method: 'POST' });
    setSetup(data);
  }

  async function enable(e: FormEvent) {
    e.preventDefault();
    await api('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
    setMsg('2FA activado correctamente');
    setSetup(null);
    setCode('');
    await refresh();
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    await api('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password }) });
    setMsg('2FA desactivado');
    setPassword('');
    await refresh();
  }

  async function revoke(id: string) {
    await api(`/auth/sessions/${id}/revoke`, { method: 'POST' });
    setMsg('Sesión revocada');
    await load();
  }

  const msgVariant =
    msg.includes('activado') || msg.includes('desactivado') || msg.includes('revocada')
      ? 'success'
      : 'error';

  return (
    <AppShell title="Seguridad · 2FA & sesiones">
      <div className="stack page-workspace">
        <PageHeader
          description="Endurecimiento de identidad: TOTP, sesiones activas y cookie HttpOnly."
          hint={
            user?.totpEnabled
              ? '2FA activo. Revisa sesiones y revoca las que no reconozcas.'
              : '2FA inactivo — actívalo con tu app autenticadora. El panel lo pide en el primer acceso.'
          }
        />
        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        <div className="dash-split">
          <div className="panel">
            <div className="panel-head">
              <h2>Autenticación en dos pasos</h2>
            </div>
            <div className="panel-body stack">
              {!user?.totpEnabled ? (
                <>
                  {!setup ? (
                    <button className="btn" type="button" onClick={() => startSetup()}>
                      Configurar 2FA
                    </button>
                  ) : (
                    <form className="form" onSubmit={enable}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={setup.qrDataUrl} alt="Código QR para 2FA" width={180} height={180} />
                      <p className="muted kpi-sub">
                        Clave secreta: <code>{setup.secret}</code>
                      </p>
                      <label>
                        Código de verificación
                        <input
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          required
                          minLength={6}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="000000"
                        />
                      </label>
                      <button className="btn" type="submit">
                        Activar 2FA
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <form className="form" onSubmit={disable}>
                  <p className="muted">Para desactivar, confirma tu contraseña actual.</p>
                  <label>
                    Contraseña
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </label>
                  <button className="btn ghost btn-danger" type="submit">
                    Desactivar 2FA
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Sesiones activas · {sessions.length}</h2>
            </div>
            <div className="panel-body">
              {loading ? (
                <LoadingBlock rows={3} label="Cargando sesiones…" />
              ) : !sessions.length ? (
                <EmptyState
                  title="Sin sesiones registradas"
                  description="Las sesiones activas aparecerán aquí cuando inicies sesión en otros dispositivos."
                />
              ) : (
                <div className="table-wrap">
                  <table className="table table-sticky">
                    <thead>
                      <tr>
                        <th>Dispositivo</th>
                        <th>IP</th>
                        <th>Último uso</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id}>
                          <td>{s.deviceLabel || '—'}</td>
                          <td className="muted">{s.ip || '—'}</td>
                          <td className="muted">{new Date(s.lastSeenAt).toLocaleString('es-MX')}</td>
                          <td>
                            <button
                              className="btn ghost btn-sm btn-danger"
                              type="button"
                              onClick={() => revoke(s.id)}
                            >
                              Revocar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
