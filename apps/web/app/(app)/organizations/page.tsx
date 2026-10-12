'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  ActionLink,
  FieldCheck,
  FieldSelect,
  FlashMessage,
  PageHeader,
} from '@/components/ui/PageChrome';
import { roleLabel } from '@arta/rbac';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { fullDateTime, shortDate } from '@/lib/format';

type Org = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  active: boolean;
  settingsJson?: { require2fa?: boolean } | null;
  _count?: { users: number; events: number };
};

type MeOrg = Org & { _count?: { users: number; events: number; memberships: number } };

type Member = {
  id: string;
  email: string;
  fullName: string;
  roleKey: string;
  entities: string[];
  active: boolean;
  lastLoginAt?: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  roleKey: string;
  entities: string[];
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

/** Planes en lenguaje de negocio (los valores del API siguen siendo TRIAL / OPS / ENTERPRISE). */
const PLAN_LIMITS: Record<
  string,
  { label: string; users: number | '∞'; events: number | '∞'; features: string[] }
> = {
  TRIAL: {
    label: 'Prueba',
    users: 10,
    events: 5,
    features: ['Operación de eventos básica', 'Pocas conexiones con otros sistemas', 'Resumen diario por correo'],
  },
  OPS: {
    label: 'Operación',
    users: 50,
    events: 40,
    features: ['Arta y Auditorio en un mismo panel', 'Acceso de proveedores con PIN', 'Reportes completos'],
  },
  ENTERPRISE: {
    label: 'Empresa',
    users: '∞',
    events: '∞',
    features: ['Inicio de sesión corporativo', 'Boletera sincronizada con prioridad', 'Soporte dedicado'],
  },
};

const BILLING_LABEL: Record<string, string> = {
  active: 'Pagos al corriente',
  trialing: 'En periodo de prueba',
  past_due: 'Pago pendiente',
  unpaid: 'Pago pendiente',
  canceled: 'Suscripción cancelada',
  incomplete: 'Pago por completar',
};

export default function OrganizationsPage() {
  const { user } = useUser();
  const isPlatform = user?.roleKey === 'super_admin';
  const [me, setMe] = useState<MeOrg | null>(null);
  const [rows, setRows] = useState<Org[]>([]);
  const [form, setForm] = useState({ name: '', slug: '' });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    users?: number;
    events?: number;
    activeEvents?: number;
  } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    roleKey: 'logistica',
    entities: ['ARTA'] as string[],
  });
  const [lastInviteUrl, setLastInviteUrl] = useState('');
  const [roles, setRoles] = useState<Array<{ key: string; label: string }>>([]);
  const [billing, setBilling] = useState<{
    configured: boolean;
    plan: string;
    billingStatus: string;
    stripeCustomerId?: string | null;
  } | null>(null);

  async function loadPeople(orgId: string) {
    const [m, i, r] = await Promise.all([
      api<Member[]>(`/organizations/${orgId}/members`).catch(() => [] as Member[]),
      api<InviteRow[]>(`/organizations/${orgId}/invites`).catch(() => [] as InviteRow[]),
      api<Array<{ key: string; label: string }>>('/users/roles').catch(() => []),
    ]);
    setMembers(m);
    setInvites(i);
    if (r.length) setRoles(r);
  }

  async function load() {
    const [m, list, bill] = await Promise.all([
      api<MeOrg>('/organizations/me'),
      api<Org[]>('/organizations').catch(() => [] as Org[]),
      api<{
        configured: boolean;
        plan: string;
        billingStatus: string;
        stripeCustomerId?: string | null;
      }>('/billing/status').catch(() => null),
    ]);
    setMe(m);
    setRows(list);
    setBilling(bill);
    if (m?.id) {
      const s = await api<{ users?: number; events?: number; activeEvents?: number }>(
        `/organizations/${m.id}/stats`,
      ).catch(() => null);
      setStats(s);
      await loadPeople(m.id);
    }
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('billing') === 'success') setMsg('Suscripción actualizada');
      if (q.get('billing') === 'cancel') setMsg('Pago cancelado');
    }
  }, []);

  async function startCheckout(plan: 'OPS' | 'ENTERPRISE') {
    setMsg('');
    try {
      const res = await api<{ url: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      if (res.url) window.location.href = res.url;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo abrir el pago');
    }
  }

  async function openPortal() {
    setMsg('');
    try {
      const res = await api<{ url: string }>('/billing/portal', { method: 'POST' });
      if (res.url) window.location.href = res.url;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo abrir la facturación');
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/organizations', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', slug: '' });
      setMsg('Organización creada en plan de prueba');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    }
  }

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    if (!me?.id) return;
    if (!inviteForm.entities.length) {
      setMsg('Elige al menos una entidad');
      return;
    }
    setMsg('');
    setLastInviteUrl('');
    try {
      const created = await api<{ acceptUrl: string; email: string }>(
        `/organizations/${me.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify(inviteForm),
        },
      );
      setInviteForm({ email: '', roleKey: inviteForm.roleKey, entities: inviteForm.entities });
      setLastInviteUrl(created.acceptUrl);
      setMsg(`Invitación enviada a ${created.email}`);
      await loadPeople(me.id);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo enviar la invitación');
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!me?.id) return;
    await api(`/organizations/${me.id}/invites/${inviteId}`, { method: 'DELETE' });
    await loadPeople(me.id);
  }

  function toggleInviteEntity(ent: string) {
    setInviteForm((f) => ({
      ...f,
      entities: f.entities.includes(ent)
        ? f.entities.filter((e) => e !== ent)
        : [...f.entities, ent],
    }));
  }

  const plan = me?.plan || 'OPS';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.OPS;
  const usersNow = stats?.users ?? me?._count?.users ?? 0;
  const eventsNow = stats?.events ?? me?._count?.events ?? 0;

  const usage = useMemo(() => {
    const uMax = limits.users === '∞' ? null : Number(limits.users);
    const eMax = limits.events === '∞' ? null : Number(limits.events);
    return {
      usersPct: uMax ? Math.min(100, Math.round((usersNow / uMax) * 100)) : 0,
      eventsPct: eMax ? Math.min(100, Math.round((eventsNow / eMax) * 100)) : 0,
      usersNear: uMax ? usersNow / uMax >= 0.8 : false,
      eventsNear: eMax ? eventsNow / eMax >= 0.8 : false,
    };
  }, [limits, usersNow, eventsNow]);

  const billingLabel = billing?.billingStatus ? BILLING_LABEL[billing.billingStatus] || '' : '';

  const msgVariant =
    msg === 'Pago cancelado' || msg === 'Elige al menos una entidad'
      ? 'warn'
      : msg === 'Organización creada en plan de prueba' ||
          msg === 'Suscripción actualizada' ||
          msg.startsWith('Invitación enviada')
        ? 'success'
        : 'error';

  return (
    <AppShell title="Organizaciones">
      <div className="stack page-workspace">
        <PageHeader
          title="Organizaciones"
          description="Cada organización tiene su propio equipo y sus eventos; el plan marca cuántos caben."
        />
        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        {loading ? (
          <>
            <LoadingKpis count={3} />
            <LoadingBlock rows={4} label="Cargando organizaciones…" />
          </>
        ) : (
          <>
            {me ? (
              <section className="org-card">
                <div className="org-card__main">
                  <p className="ph__eyebrow">Tu organización</p>
                  <h2 className="org-card__name">{me.name}</h2>
                  <p className="org-card__meta">
                    <span className="pill">Plan {limits.label}</span>
                    {typeof stats?.activeEvents === 'number' ? (
                      <span>
                        {stats.activeEvents} {stats.activeEvents === 1 ? 'evento activo' : 'eventos activos'}
                      </span>
                    ) : null}
                    {billingLabel ? <span>{billingLabel}</span> : null}
                  </p>
                  <div className="org-usage">
                    <UsageMeter label="Personas" now={usersNow} max={limits.users} pct={usage.usersPct} near={usage.usersNear} />
                    <UsageMeter label="Eventos" now={eventsNow} max={limits.events} pct={usage.eventsPct} near={usage.eventsNear} />
                  </div>
                </div>
                <div className="org-card__plan">
                  <p className="ph__eyebrow">Incluye</p>
                  <ul className="org-features">
                    {limits.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {billing?.configured || billing?.stripeCustomerId ? (
                    <div className="org-card__actions">
                      {billing?.configured && plan !== 'OPS' ? (
                        <button className="btn" type="button" onClick={() => startCheckout('OPS')}>
                          Contratar Operación
                        </button>
                      ) : null}
                      {billing?.configured && plan !== 'ENTERPRISE' ? (
                        <button className="btn ghost" type="button" onClick={() => startCheckout('ENTERPRISE')}>
                          Contratar Empresa
                        </button>
                      ) : null}
                      {billing?.stripeCustomerId ? (
                        <button className="btn ghost" type="button" onClick={openPortal}>
                          Facturas y forma de pago
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div className="panel">
              <div className="panel-head">
                <h2>Directorio · {rows.length}</h2>
              </div>
              {!rows.length ? (
                <div className="panel-body">
                  <EmptyState
                    title="Sin otras organizaciones"
                    description="Aquí aparecen las organizaciones de la plataforma cuando tienes permiso de dirección."
                  />
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table table-sticky org-table">
                    <colgroup>
                      <col />
                      <col style={{ width: 170 }} />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 110 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Organización</th>
                        <th>Plan</th>
                        <th>Dos pasos</th>
                        <th className="num">Personas</th>
                        <th className="num">Eventos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <span className="org-table__name">{o.name}</span>
                            <span className="org-table__sub">
                              {o.slug}
                              {!o.active ? ' · desactivada' : ''}
                            </span>
                          </td>
                          <td>
                            {isPlatform ? (
                              <FieldSelect
                                value={o.plan}
                                onChange={async (v) => {
                                  try {
                                    await api(`/organizations/${o.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ plan: v }),
                                    });
                                    await load();
                                  } catch (err) {
                                    setMsg(err instanceof Error ? err.message : 'No se pudo cambiar el plan');
                                  }
                                }}
                                label={`Plan de ${o.name}`}
                                options={Object.entries(PLAN_LIMITS).map(([value, p]) => ({ value, label: p.label }))}
                              />
                            ) : (
                              <span className="pill">{(PLAN_LIMITS[o.plan] || PLAN_LIMITS.OPS).label}</span>
                            )}
                          </td>
                          <td>
                            <label className="toggle-inline">
                              <input
                                type="checkbox"
                                checked={!!o.settingsJson?.require2fa}
                                onChange={async (e) => {
                                  try {
                                    await api(`/organizations/${o.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ require2fa: e.target.checked }),
                                    });
                                    await load();
                                  } catch (err) {
                                    setMsg(err instanceof Error ? err.message : 'No se pudo cambiar la verificación');
                                  }
                                }}
                              />
                              <span>{o.settingsJson?.require2fa ? 'Obligatoria' : 'Opcional'}</span>
                            </label>
                          </td>
                          <td className="num">{o._count?.users ?? 0}</td>
                          <td className="num">{o._count?.events ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {isPlatform ? (
                <form className="org-new" onSubmit={onCreate}>
                  <span className="org-new__title">Nueva organización</span>
                  <input
                    required
                    aria-label="Nombre de la organización"
                    placeholder="Nombre"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  <input
                    required
                    aria-label="Identificador para la dirección web"
                    placeholder="identificador-web"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  />
                  <button className="btn ghost" type="submit">
                    Crear en prueba
                  </button>
                </form>
              ) : null}
            </div>

            {me ? (
              <div className="users-layout">
                <div className="panel">
                  <div className="panel-head">
                    <h2>Invitar a alguien</h2>
                  </div>
                  <div className="panel-body">
                    <form className="form" onSubmit={sendInvite}>
                      <label>
                        Correo
                        <input
                          required
                          type="email"
                          placeholder="nombre@correo.com"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                        />
                      </label>
                      <label>
                        Rol
                        <FieldSelect
                          value={inviteForm.roleKey}
                          onChange={(v) => setInviteForm({ ...inviteForm, roleKey: v })}
                          label="Rol del invitado"
                          options={(roles.length ? roles : [{ key: 'logistica', label: 'Logística' }]).map((r) => ({
                            value: r.key,
                            label: r.label,
                          }))}
                        />
                      </label>
                      <div className="row" style={{ gap: 16 }}>
                        {(['ARTA', 'EXPLANADA'] as const).map((ent) => (
                          <FieldCheck
                            key={ent}
                            checked={inviteForm.entities.includes(ent)}
                            onChange={() => toggleInviteEntity(ent)}
                            label={ent === 'ARTA' ? 'Arta' : 'Auditorio'}
                          />
                        ))}
                      </div>
                      <p className="muted kpi-sub" style={{ margin: 0 }}>
                        Le llega un enlace para elegir su contraseña; vale 7 días.
                      </p>
                      <button className="btn" type="submit">
                        Enviar invitación
                      </button>
                    </form>
                    {lastInviteUrl ? (
                      <p className="muted" style={{ marginTop: 12, fontSize: 13, wordBreak: 'break-all' }}>
                        Si el correo no llega, comparte este enlace: <a href={lastInviteUrl}>{lastInviteUrl}</a>
                      </p>
                    ) : null}
                  </div>
                  <div className="panel-head panel-head--sub">
                    <h2>Invitaciones · {invites.length}</h2>
                  </div>
                  {!invites.length ? (
                    <div className="panel-body">
                      <p className="muted kpi-sub" style={{ margin: 0 }}>
                        Sin invitaciones por ahora.
                      </p>
                    </div>
                  ) : (
                    <ul className="org-invites">
                      {invites.map((inv) => {
                        const status = inv.acceptedAt
                          ? 'Aceptada'
                          : inv.revokedAt
                            ? 'Revocada'
                            : new Date(inv.expiresAt) < new Date()
                              ? 'Vencida'
                              : 'Pendiente';
                        return (
                          <li key={inv.id} className="org-invites__row">
                            <span className="org-invites__main">
                              <span className="org-invites__email">{inv.email}</span>
                              <span className="org-invites__meta">
                                {roleLabel(inv.roleKey)} · {status}
                              </span>
                            </span>
                            {status === 'Pendiente' ? (
                              <button
                                className="btn-quiet btn-quiet--danger"
                                type="button"
                                onClick={() => {
                                  if (confirm(`¿Revocar la invitación de ${inv.email}?`)) void revokeInvite(inv.id);
                                }}
                              >
                                Revocar
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h2>Miembros · {members.length}</h2>
                    <ActionLink href="/users" variant="ghost">
                      Administrar en Usuarios
                    </ActionLink>
                  </div>
                  {!members.length ? (
                    <div className="panel-body">
                      <EmptyState
                        title="Sin miembros listados"
                        description="Aparecen cuando tienes permiso para administrar usuarios."
                      />
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table className="table table-sticky org-members">
                        <colgroup>
                          <col />
                          <col style={{ width: 200 }} />
                          <col style={{ width: 150 }} />
                          <col style={{ width: 120 }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th>Rol</th>
                            <th>Entidades</th>
                            <th>Último acceso</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((u) => (
                            <tr key={u.id}>
                              <td>
                                <span className="org-table__name">{u.fullName}</span>
                                <span className="org-table__sub">
                                  {u.email}
                                  {!u.active ? ' · inactivo' : ''}
                                </span>
                              </td>
                              <td className="muted">{roleLabel(u.roleKey)}</td>
                              <td className="muted">
                                {u.entities.map((e) => (e === 'EXPLANADA' ? 'Auditorio' : 'Arta')).join(' · ')}
                              </td>
                              <td className="muted t-num">
                                {u.lastLoginAt ? (
                                  <time dateTime={u.lastLoginAt} title={fullDateTime(u.lastLoginAt)}>
                                    {shortDate(u.lastLoginAt)}
                                  </time>
                                ) : (
                                  'Nunca'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

/** Uso del plan: cifra, tope y barra fina. Cerca del tope, el detalle avisa (sin teñir la tarjeta). */
function UsageMeter({
  label,
  now,
  max,
  pct,
  near,
}: {
  label: string;
  now: number;
  max: number | '∞';
  pct: number;
  near: boolean;
}) {
  return (
    <div className="usage">
      <div className="usage__head">
        <span className="usage__label">{label}</span>
        <span className="usage__value">
          {now}
          <span className="usage__max"> {max === '∞' ? 'sin tope' : `de ${max}`}</span>
        </span>
      </div>
      {max !== '∞' ? (
        <div className="usage__bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {near ? <span className="usage__warn">Cerca del tope del plan</span> : null}
    </div>
  );
}
