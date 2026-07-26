'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  title?: string | null;
  roleKey: string;
  roleLabel?: string;
  entities: string[];
  permissions: string[];
  active: boolean;
  lastLoginAt?: string | null;
};

type GovUser = UserRow & {
  activity30d: number;
  checklistEdits30d: number;
  activeSessions?: number;
  inactive30: boolean;
  locked: boolean;
  risk: 'high' | 'medium' | 'low';
  riskScore: number;
  failedLoginCount: number;
};

type UsersGov = {
  kpis: {
    total: number;
    active: number;
    inactive: number;
    neverLoggedIn: number;
    inactive30d: number;
    lockedNow: number;
    highRisk: number;
    loggedIn7d: number;
  };
  byRole: Record<string, number>;
  users: GovUser[];
};

type RoleOpt = { key: string; label: string };
type PermOpt = { key: string; label: string };

const EMPTY = {
  email: '',
  fullName: '',
  title: '',
  roleKey: 'logistica',
  entities: ['ARTA'] as string[],
  password: '',
};

export default function UsersPage() {
  const [gov, setGov] = useState<UsersGov | null>(null);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [permCatalog, setPermCatalog] = useState<PermOpt[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [inviteMode, setInviteMode] = useState(true);
  const [inviteUrl, setInviteUrl] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [permsUserId, setPermsUserId] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const [g, r, p, meOrg] = await Promise.all([
      api<UsersGov>('/analytics/users'),
      api<RoleOpt[]>('/users/roles'),
      api<PermOpt[]>('/users/permissions/catalog'),
      api<{ id: string }>('/organizations/me').catch(() => null),
    ]);
    setGov(g);
    setRoles(r);
    setPermCatalog(p);
    if (meOrg?.id) setOrgId(meOrg.id);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const users = gov?.users || [];

  const filtered = useMemo(() => {
    let list = users;
    if (riskFilter !== 'all') list = list.filter((u) => u.risk === riskFilter);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(n) ||
          u.email.toLowerCase().includes(n) ||
          u.roleKey.toLowerCase().includes(n),
      );
    }
    return list;
  }, [users, riskFilter, q]);

  function toggleEntity(ent: string) {
    setForm((f) => ({
      ...f,
      entities: f.entities.includes(ent) ? f.entities.filter((e) => e !== ent) : [...f.entities, ent],
    }));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.entities.length) {
      setMsg('Elige al menos una entidad');
      return;
    }
    setSaving(true);
    setMsg('');
    setInviteUrl('');
    try {
      if (inviteMode) {
        if (!orgId) throw new Error('Sin organización activa');
        if (!form.email) throw new Error('Email requerido');
        const created = await api<{ acceptUrl: string }>(`/organizations/${orgId}/invites`, {
          method: 'POST',
          body: JSON.stringify({
            email: form.email,
            roleKey: form.roleKey,
            entities: form.entities,
          }),
        });
        setInviteUrl(created.acceptUrl);
        setForm({ ...EMPTY, roleKey: form.roleKey, entities: form.entities });
        setMsg('Invitación creada — copia el link si SMTP está off');
      } else {
        await api('/users', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        setForm(EMPTY);
        setMsg('Usuario creado');
      }
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    await api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
    await load();
  }

  async function patchUser(
    id: string,
    body: { roleKey?: string; entities?: string[]; password?: string; title?: string; permissions?: string[] },
  ) {
    await api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setMsg('Usuario actualizado');
    await load();
  }

  function togglePerm(u: GovUser, key: string) {
    const next = u.permissions.includes(key)
      ? u.permissions.filter((p) => p !== key)
      : [...u.permissions, key];
    patchUser(u.id, { permissions: next }).catch((e) => setMsg(e.message));
  }

  const editingUser = users.find((u) => u.id === permsUserId) || null;
  const k = gov?.kpis;

  return (
    <AppShell title="Identity & Access">
      <div className="page-workspace stack">
        <div className="page-intro">
          <p className="muted">
            Gobernanza de identidades: actividad, riesgo, lockouts y privilegios. Solo dirección gestiona
            cuentas; el rol define el acceso base y los permisos extra se suman.
          </p>
        </div>

        {loading ? (
          <>
            <LoadingKpis count={6} />
            <LoadingBlock rows={5} label="Cargando gobernanza de usuarios…" />
          </>
        ) : null}

        {!loading && k ? (
          <div className="grid-cards kpi-grid-dense">
            <div className="kpi">
              <div className="label">Usuarios</div>
              <div className="value">{k.total}</div>
            </div>
            <div className="kpi">
              <div className="label">Activos</div>
              <div className="value">{k.active}</div>
            </div>
            <div className="kpi">
              <div className="label">Login 7d</div>
              <div className="value">{k.loggedIn7d}</div>
            </div>
            <div className={`kpi ${k.inactive30d ? 'kpi--danger' : ''}`}>
              <div className="label">Inactivos 30d</div>
              <div className="value">{k.inactive30d}</div>
            </div>
            <div className={`kpi ${k.lockedNow ? 'kpi--danger' : ''}`}>
              <div className="label">Locked ahora</div>
              <div className="value">{k.lockedNow}</div>
            </div>
            <div className={`kpi ${k.highRisk ? 'kpi--danger' : ''}`}>
              <div className="label">Alto riesgo</div>
              <div className="value">{k.highRisk}</div>
            </div>
          </div>
        ) : null}

        {!loading && gov ? (
          <div className="panel">
            <div className="panel-body">
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Distribución por rol
              </div>
              <DistBar
                segments={Object.entries(gov.byRole).map(([label, value], i) => ({
                  label,
                  value,
                  tone: (['ok', 'warn', 'muted', 'danger'] as const)[i % 4],
                }))}
              />
            </div>
          </div>
        ) : null}

        <div className="users-layout">
          <div className="panel">
            <div className="panel-head">
              <h2>{inviteMode ? 'Invitar usuario' : 'Nuevo usuario'}</h2>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setInviteMode((v) => !v);
                  setInviteUrl('');
                  setMsg('');
                }}
              >
                {inviteMode ? 'Crear con password' : 'Invitar por email'}
              </button>
            </div>
            <div className="panel-body">
              <form className="form" onSubmit={onCreate}>
                {!inviteMode ? (
                  <label>
                    Nombre
                    <input
                      required
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    />
                  </label>
                ) : null}
                <label>
                  Email
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
                {!inviteMode ? (
                  <label>
                    Cargo
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </label>
                ) : null}
                <label>
                  Rol
                  <select
                    className="field"
                    value={form.roleKey}
                    onChange={(e) => setForm({ ...form, roleKey: e.target.value })}
                  >
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                {!inviteMode ? (
                  <label>
                    Password temporal
                    <input
                      required
                      type="password"
                      minLength={6}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                  </label>
                ) : (
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                    Recibe un link de 7 días a <code>/invite/…</code> para elegir nombre y
                    password. También aparece en Organizaciones.
                  </p>
                )}
                <div className="row">
                  {(['ARTA', 'EXPLANADA'] as const).map((ent) => (
                    <label key={ent} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={form.entities.includes(ent)}
                        onChange={() => toggleEntity(ent)}
                      />
                      {ent === 'ARTA' ? 'Arta' : 'Auditorio'}
                    </label>
                  ))}
                </div>
                {msg ? <div className="muted">{msg}</div> : null}
                {inviteUrl ? (
                  <p className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                    <a href={inviteUrl}>{inviteUrl}</a>
                  </p>
                ) : null}
                <button className="btn" type="submit" disabled={saving}>
                  {saving
                    ? 'Guardando…'
                    : inviteMode
                      ? 'Enviar invitación'
                      : 'Crear usuario'}
                </button>
              </form>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Directorio · {filtered.length}</h2>
            </div>
            <div className="panel-body">
              {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
              <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                  className="field"
                  style={{ maxWidth: 240 }}
                  placeholder="Buscar…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <select
                  className="field"
                  style={{ width: 'auto' }}
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
                >
                  <option value="all">Todo riesgo</option>
                  <option value="high">Alto</option>
                  <option value="medium">Medio</option>
                  <option value="low">Bajo</option>
                </select>
              </div>
              <div className="table-wrap">
                <table className="table table-sticky">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Riesgo</th>
                      <th>Actividad 30d</th>
                      <th>Sesiones</th>
                      <th>Último acceso</th>
                      <th>Rol</th>
                      <th>Entidades</th>
                      <th>Extras</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.fullName}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {u.email}
                            {u.title ? ` · ${u.title}` : ''}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              u.risk === 'high' ? 'danger' : u.risk === 'medium' ? 'warn' : 'ok'
                            }`}
                          >
                            {u.risk}
                          </span>
                          {u.locked ? <div className="muted" style={{ fontSize: 11 }}>locked</div> : null}
                          {u.failedLoginCount > 0 ? (
                            <div className="muted" style={{ fontSize: 11 }}>
                              fails {u.failedLoginCount}
                            </div>
                          ) : null}
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {u.activity30d} audit
                          <div>{u.checklistEdits30d} edits chk</div>
                        </td>
                        <td className="muted">{u.activeSessions ?? 0}</td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleString('es-MX')
                            : 'Nunca'}
                        </td>
                        <td>
                          <select
                            className="field"
                            value={u.roleKey}
                            onChange={(e) => patchUser(u.id, { roleKey: e.target.value })}
                          >
                            {roles.map((r) => (
                              <option key={r.key} value={r.key}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="row">
                            {(['ARTA', 'EXPLANADA'] as const).map((ent) => (
                              <label
                                key={ent}
                                style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}
                              >
                                <input
                                  type="checkbox"
                                  checked={u.entities.includes(ent)}
                                  onChange={() => {
                                    const next = u.entities.includes(ent)
                                      ? u.entities.filter((x) => x !== ent)
                                      : [...u.entities, ent];
                                    if (!next.length) return;
                                    patchUser(u.id, { entities: next });
                                  }}
                                />
                                {ent === 'ARTA' ? 'Arta' : 'Auditorio'}
                              </label>
                            ))}
                          </div>
                        </td>
                        <td>
                          <button className="btn ghost" type="button" onClick={() => setPermsUserId(u.id)}>
                            {u.permissions.length ? `${u.permissions.length} extra` : 'Permisos'}
                          </button>
                        </td>
                        <td>
                          <span className={`badge ${u.active ? 'ok' : 'warn'}`}>
                            {u.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() => {
                                const password = prompt('Nueva contraseña (mín. 6)');
                                if (password && password.length >= 6) patchUser(u.id, { password });
                              }}
                            >
                              Reset
                            </button>
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() => setActive(u.id, !u.active)}
                            >
                              {u.active ? 'Off' : 'On'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filtered.length ? (
                      <tr>
                        <td colSpan={10}>
                          <EmptyState
                            title="Sin usuarios para este filtro"
                            description="Ajusta búsqueda o riesgo, o crea un usuario nuevo."
                          />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {editingUser ? (
          <div className="panel">
            <div className="panel-head">
              <h2>Permisos extra · {editingUser.fullName}</h2>
              <button className="btn ghost" type="button" onClick={() => setPermsUserId(null)}>
                Cerrar
              </button>
            </div>
            <div className="panel-body">
              <p className="muted" style={{ marginTop: 0 }}>
                Se suman al rol base. Ejemplo: dar <code>campaign.edit</code> o <code>po.mark_paid</code>{' '}
                sin cambiar el rol.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 8,
                }}
              >
                {permCatalog.map((p) => (
                  <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={editingUser.permissions.includes(p.key)}
                      onChange={() => togglePerm(editingUser, p.key)}
                    />
                    {p.key}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
