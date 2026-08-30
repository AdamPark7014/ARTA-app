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
  FormGrid,
  PageHeader,
} from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

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

const PLAN_LIMITS: Record<
  string,
  { label: string; users: number | '∞'; events: number | '∞'; features: string[] }
> = {
  TRIAL: {
    label: 'Trial',
    users: 10,
    events: 5,
    features: ['Ops básico', 'Webhooks limitados', 'Digests email'],
  },
  OPS: {
    label: 'Ops',
    users: 50,
    events: 40,
    features: ['Multi-entidad', 'Vendor PIN', 'Analytics completo'],
  },
  ENTERPRISE: {
    label: 'Enterprise',
    users: '∞',
    events: '∞',
    features: ['SSO path', 'Prioridad sync boletera', 'Soporte dedicado'],
  },
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
      if (q.get('billing') === 'success') setMsg('Suscripción actualizada · Stripe');
      if (q.get('billing') === 'cancel') setMsg('Checkout cancelado');
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
      setMsg(err instanceof Error ? err.message : 'Error checkout');
    }
  }

  async function openPortal() {
    setMsg('');
    try {
      const res = await api<{ url: string }>('/billing/portal', { method: 'POST' });
      if (res.url) window.location.href = res.url;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error portal');
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/organizations', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', slug: '' });
      setMsg('Organización creada (trial)');
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
      setMsg(`Invitación enviada a ${created.email} (también en outbox email)`);
      await loadPeople(me.id);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error invite');
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

  const msgVariant =
    msg === 'Checkout cancelado' || msg === 'Elige al menos una entidad'
      ? 'warn'
      : msg === 'Organización creada (trial)' ||
          msg === 'Suscripción actualizada · Stripe' ||
          msg.startsWith('Invitación enviada')
        ? 'success'
        : 'error';

  return (
    <AppShell title="Organizaciones">
      <div className="stack page-workspace">
        <PageHeader description="Tenants aislados (usuarios + eventos). Planes TRIAL / OPS / ENTERPRISE con límites soft enforced en API (crear usuarios, invites y eventos)." />
        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        {loading ? (
          <>
            <LoadingKpis count={4} />
            <LoadingBlock rows={4} label="Cargando organizaciones…" />
          </>
        ) : (
          <>
            {me ? (
              <div className="grid-cards kpi-grid-dense">
                <div className="kpi">
                  <div className="label">Tenant</div>
                  <div className="value" style={{ fontSize: '1.1rem' }}>
                    {me.name}
                  </div>
                  <div className="kpi-sub muted">
                    {me.slug} · {limits.label}
                  </div>
                </div>
                <div className={`kpi ${usage.usersNear ? 'kpi--danger' : ''}`}>
                  <div className="label">Usuarios</div>
                  <div className="value">
                    {usersNow}
                    <span className="muted" style={{ fontSize: 14 }}>
                      {' '}
                      / {limits.users}
                    </span>
                  </div>
                  {limits.users !== '∞' ? (
                    <div className="progress" style={{ marginTop: 8 }}>
                      <span style={{ width: `${usage.usersPct}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className={`kpi ${usage.eventsNear ? 'kpi--danger' : ''}`}>
                  <div className="label">Eventos</div>
                  <div className="value">
                    {eventsNow}
                    <span className="muted" style={{ fontSize: 14 }}>
                      {' '}
                      / {limits.events}
                    </span>
                  </div>
                  {limits.events !== '∞' ? (
                    <div className="progress" style={{ marginTop: 8 }}>
                      <span style={{ width: `${usage.eventsPct}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="kpi">
                  <div className="label">Activos</div>
                  <div className="value">{stats?.activeEvents ?? '—'}</div>
                </div>
              </div>
            ) : null}

            <div className="dash-split">
              <div className="panel">
                <div className="panel-head">
                  <h2>Plan · {limits.label}</h2>
                </div>
                <div className="panel-body">
                  <ul className="muted" style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
                    {limits.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                    Invita por email (sin password inicial). El link vive 7 días; si no hay SMTP, copia
                    la URL que aparece al crear.
                  </p>
                  <div style={{ marginTop: 14 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                      Billing · {billing?.billingStatus || '—'}
                      {billing && !billing.configured ? ' · Stripe no configurado (env)' : ''}
                    </div>
                    <div className="btn-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {billing?.configured && plan !== 'OPS' ? (
                        <button className="btn" type="button" onClick={() => startCheckout('OPS')}>
                          Suscribir Ops
                        </button>
                      ) : null}
                      {billing?.configured && plan !== 'ENTERPRISE' ? (
                        <button className="btn ghost" type="button" onClick={() => startCheckout('ENTERPRISE')}>
                          Suscribir Enterprise
                        </button>
                      ) : null}
                      {billing?.stripeCustomerId ? (
                        <button className="btn ghost" type="button" onClick={openPortal}>
                          Portal Stripe
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {isPlatform ? (
                    <div className="panel" style={{ marginTop: 12 }}>
                      <div className="panel-head">
                        <h2>Nueva organización</h2>
                      </div>
                      <div className="panel-body">
                        <form className="form" onSubmit={onCreate}>
                          <FormGrid>
                            <label>
                              Nombre
                              <input
                                required
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                              />
                            </label>
                            <label>
                              Slug
                              <input
                                required
                                value={form.slug}
                                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                                placeholder="mi-org"
                              />
                            </label>
                          </FormGrid>
                          <button className="btn" type="submit">
                            Crear trial
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>Directorio · {rows.length}</h2>
                </div>
                <div className="panel-body">
                  {!rows.length ? (
                    <EmptyState
                      title="Sin listado"
                      description="Requiere rol de dirección, o aún no hay orgs además del tenant actual."
                    />
                  ) : (
                    <div className="table-wrap">
                      <table className="table table-sticky">
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th>Slug</th>
                            <th>Plan</th>
                            <th>2FA obligatorio</th>
                            <th className="num">Usuarios</th>
                            <th className="num">Eventos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((o) => (
                            <tr key={o.id}>
                              <td>
                                <strong>{o.name}</strong>
                                {!o.active ? <StatusBadge value="off" kind="raw" /> : null}
                              </td>
                              <td>
                                <code>{o.slug}</code>
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
                                        setMsg(err instanceof Error ? err.message : 'Error plan');
                                      }
                                    }}
                                    label={`Plan de ${o.name}`}
                                    options={[
                                      { value: 'TRIAL', label: 'TRIAL' },
                                      { value: 'OPS', label: 'OPS' },
                                      { value: 'ENTERPRISE', label: 'ENTERPRISE' },
                                    ]}
                                  />
                                ) : (
                                  <StatusBadge value={o.plan} kind="raw" />
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
                                        setMsg(err instanceof Error ? err.message : 'Error 2FA');
                                      }
                                    }}
                                  />
                                  <span>{o.settingsJson?.require2fa ? 'Sí' : 'No'}</span>
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
                </div>
              </div>
            </div>

            {me ? (
              <div className="dash-split">
                <div className="panel">
                  <div className="panel-head">
                    <h2>Invitar miembro</h2>
                  </div>
                  <div className="panel-body">
                    <form className="form" onSubmit={sendInvite}>
                      <FormGrid>
                        <label>
                          Email
                          <input
                            required
                            type="email"
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
                            options={(roles.length
                              ? roles
                              : [{ key: 'logistica', label: 'Logística' }]
                            ).map((r) => ({ value: r.key, label: r.label }))}
                          />
                        </label>
                      </FormGrid>
                      <div className="row" style={{ gap: 12 }}>
                        {(['ARTA', 'EXPLANADA'] as const).map((ent) => (
                          <FieldCheck
                            key={ent}
                            checked={inviteForm.entities.includes(ent)}
                            onChange={() => toggleInviteEntity(ent)}
                            label={ent === 'ARTA' ? 'Arta' : 'Auditorio'}
                          />
                        ))}
                      </div>
                      <button className="btn" type="submit">
                        Enviar invitación
                      </button>
                    </form>
                    {lastInviteUrl ? (
                      <p className="muted" style={{ marginTop: 12, fontSize: 13, wordBreak: 'break-all' }}>
                        Link (cópialo si SMTP está off):{' '}
                        <a href={lastInviteUrl}>{lastInviteUrl}</a>
                      </p>
                    ) : null}

                    <h3 style={{ marginTop: 20, fontSize: 15 }}>Invitaciones · {invites.length}</h3>
                    {!invites.length ? (
                      <EmptyState
                        title="Sin invitaciones"
                        description="Invita por email para onboarding sin crear password a mano."
                      />
                    ) : (
                      <div className="table-wrap" style={{ marginTop: 8 }}>
                        <table className="table table-sticky">
                          <thead>
                            <tr>
                              <th>Email</th>
                              <th>Rol</th>
                              <th>Estado</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {invites.map((inv) => {
                              const status = inv.acceptedAt
                                ? 'aceptada'
                                : inv.revokedAt
                                  ? 'revocada'
                                  : new Date(inv.expiresAt) < new Date()
                                    ? 'expirada'
                                    : 'pendiente';
                              return (
                                <tr key={inv.id}>
                                  <td>{inv.email}</td>
                                  <td className="muted">{inv.roleKey}</td>
                                  <td>
                                    <StatusBadge value={status} kind="raw" />
                                  </td>
                                  <td>
                                    {status === 'pendiente' ? (
                                      <button
                                        className="btn ghost btn-sm btn-danger"
                                        type="button"
                                        onClick={() => revokeInvite(inv.id)}
                                      >
                                        Revocar
                                      </button>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h2>Miembros · {members.length}</h2>
                    <ActionLink href="/users" variant="ghost">
                      Gobernanza
                    </ActionLink>
                  </div>
                  <div className="panel-body">
                    {!members.length ? (
                      <EmptyState
                        title="Sin miembros listados"
                        description="Requiere permiso users.manage, o aún no hay usuarios en el tenant."
                      />
                    ) : (
                      <div className="table-wrap">
                        <table className="table table-sticky">
                          <thead>
                            <tr>
                              <th>Nombre</th>
                              <th>Rol</th>
                              <th>Entidades</th>
                              <th>Último login</th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.map((u) => (
                              <tr key={u.id}>
                                <td>
                                  <strong>{u.fullName}</strong>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    {u.email}
                                    {!u.active ? ' · inactivo' : ''}
                                  </div>
                                </td>
                                <td className="muted">{u.roleKey}</td>
                                <td className="muted">{u.entities.join(', ')}</td>
                                <td className="muted">
                                  {u.lastLoginAt
                                    ? new Date(u.lastLoginAt).toLocaleDateString('es-MX')
                                    : '—'}
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
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
