'use client';

import { askConfirm } from '@/components/ui/AskDialog';
import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FlashMessage, PageHeader, ActionLink, SettingsSection } from '@/components/ui/PageChrome';
import { fullDateTime, shortDateTime } from '@/lib/format';
import { userHasPermission } from '@/lib/access-matrix';
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

  async function revokeAll() {
    if (
      !(await askConfirm({
        title: '¿Revocar todas las sesiones?',
        body: 'También cerrarás esta sesión y tendrás que volver a iniciar.',
        confirmLabel: 'Revocar todas',
        danger: true,
      }))
    ) {
      return;
    }
    await api('/auth/sessions/revoke-all', { method: 'POST' });
    setMsg('Todas las sesiones fueron revocadas. Vuelve a iniciar sesión.');
    window.location.href = '/login';
  }

  const msgVariant =
    msg.includes('activado') || msg.includes('desactivado') || msg.includes('revocada')
      ? 'success'
      : 'error';

  return (
    <AppShell title="Seguridad">
      <div className="stack page-workspace settings-page">
        <PageHeader
          title="Seguridad"
          description="Verificación en dos pasos y sesiones abiertas de tu cuenta."
          hint={
            user?.totpEnabled
              ? '2FA activo. Revisa sesiones y revoca las que no reconozcas.'
              : '2FA inactivo — actívalo con tu app autenticadora. El panel lo pide en el primer acceso.'
          }
        >
          {user && userHasPermission(user.roleKey, user.permissions, ['users.manage']) ? (
            <ActionLink href="/users" variant="ghost">
              Ir a Usuarios
            </ActionLink>
          ) : null}
        </PageHeader>
        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        <SettingsSection
          title="Verificación en dos pasos"
          description="Además de la contraseña, el panel pide un código de tu app autenticadora."
          aside={
            <span className={`set-state ${user?.totpEnabled ? 'is-on' : ''}`}>
              {user?.totpEnabled ? 'Activa' : 'Inactiva'}
            </span>
          }
        >
          {!user?.totpEnabled ? (
            !setup ? (
              <div className="set-row">
                <p className="set-row__text">Escanea un código con Google Authenticator, 1Password o una app similar.</p>
                <button className="btn" type="button" onClick={() => startSetup()}>
                  Configurar
                </button>
              </div>
            ) : (
              <form className="form set-form" onSubmit={enable}>
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
                <div className="set-form__foot">
                  <button className="btn" type="submit">
                    Activar
                  </button>
                </div>
              </form>
            )
          ) : (
            <form className="form set-form" onSubmit={disable}>
              <label>
                Para desactivarla, confirma tu contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                />
              </label>
              <div className="set-form__foot">
                <button className="btn ghost btn-danger" type="submit">
                  Desactivar
                </button>
              </div>
            </form>
          )}
        </SettingsSection>

        <SettingsSection
          title="Sesiones abiertas"
          description="Dispositivos con tu cuenta abierta. Cierra las que no reconozcas."
          aside={
            sessions.length > 1 ? (
              <button className="btn-quiet btn-quiet--danger" type="button" onClick={() => void revokeAll()}>
                Cerrar todas
              </button>
            ) : null
          }
        >
          {loading ? (
            <LoadingBlock rows={3} label="Cargando sesiones…" />
          ) : !sessions.length ? (
            <EmptyState
              title="Sin sesiones registradas"
              description="Las sesiones activas aparecerán aquí cuando inicies sesión en otros dispositivos."
            />
          ) : (
            <ul className="session-list">
              {sessions.map((s) => (
                <li key={s.id} className="session-row">
                  <span className="session-row__icon" aria-hidden>
                    <DeviceIcon label={s.deviceLabel} />
                  </span>
                  <span className="session-row__main">
                    <span className="session-row__device">{s.deviceLabel || 'Dispositivo sin nombre'}</span>
                    <span className="session-row__meta">
                      {s.ip ? <span>{s.ip}</span> : null}
                      <time dateTime={s.lastSeenAt} title={fullDateTime(s.lastSeenAt)}>
                        Último uso {shortDateTime(s.lastSeenAt)}
                      </time>
                    </span>
                  </span>
                  <button
                    className="btn-quiet btn-quiet--danger"
                    type="button"
                    onClick={async () => {
                      if (await askConfirm({ title: `¿Cerrar la sesión de ${s.deviceLabel || 'este dispositivo'}?`, confirmLabel: 'Cerrar sesión', danger: true })) void revoke(s.id);
                    }}
                  >
                    Revocar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SettingsSection>
      </div>
    </AppShell>
  );
}

/** Teléfono para las apps y los navegadores de móvil; laptop para lo demás. */
function DeviceIcon({ label }: { label?: string | null }) {
  const phone = /iphone|android|ipad|app arta|móvil|movil/i.test(label || '');
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      {phone ? (
        <path
          d="M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V15H5V6.5zM3 18h18"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
