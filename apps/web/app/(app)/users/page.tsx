'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  FieldCheck,
  FieldSearch,
  FieldSelect,
  FilterBar,
  FlashMessage,
  FormGrid,
  PageHeader,
} from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
  const [resetPwUserId, setResetPwUserId] = useState<string | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');

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

  const msgVariant =
    msg === 'Elige al menos una entidad'
      ? 'warn'
      : msg === 'Usuario creado' ||
          msg === 'Usuario actualizado' ||
          msg.startsWith('Invitación creada')
        ? 'success'
        : 'error';

  return (
    <AppShell title="Usuarios">
      <div className="page-workspace stack">
        <PageHeader
          description="Cuentas del equipo: actividad, riesgo, bloqueos y privilegios. Solo dirección gestiona usuarios; el rol define el acceso base y los permisos extra se suman."
          hint="Invitar por email deja que la persona elija su contraseña. «Crear con password» asigna una clave inicial."
        />

        {error ? (
          <FlashMessage variant="error" onDismiss={() => setError('')}>
            {error}
          </FlashMessage>
        ) : null}
        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

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
              <div className="label">Bloqueados ahora</div>
              <div className="value">{k.lockedNow}</div>
            </div>
            <div
              className={`kpi ${k.highRisk ? 'kpi--danger' : ''}`}
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
              onClick={() => setRiskFilter('high')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setRiskFilter('high');
              }}
              title="Filtrar alto riesgo"
            >
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
                  <FormGrid>
                    <label>
                      Nombre
                      <input
                        required
                        value={form.fullName}
                        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      />
                    </label>
                    <label>
                      Cargo
                      <input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                      />
                    </label>
                  </FormGrid>
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
                <label>
                  Rol
                  <FieldSelect
                    value={form.roleKey}
                    onChange={(v) => setForm({ ...form, roleKey: v })}
                    label="Rol del usuario"
                    options={roles.map((r) => ({ value: r.key, label: r.label }))}
                  />
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
                    <FieldCheck
                      key={ent}
                      checked={form.entities.includes(ent)}
                      onChange={() => toggleEntity(ent)}
                      label={ent === 'ARTA' ? 'Arta' : 'Auditorio'}
                    />
                  ))}
                </div>
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
              <FilterBar meta={`${filtered.length} de ${users.length} usuarios`}>
                <FieldSearch
                  value={q}
                  onChange={setQ}
                  placeholder="Nombre, email o rol…"
                  label="Buscar usuario"
                  maxWidth={240}
                />
                <FieldSelect
                  value={riskFilter}
                  onChange={(v) => setRiskFilter(v as typeof riskFilter)}
                  label="Filtrar por riesgo"
                  options={[
                    { value: 'all', label: 'Todo riesgo' },
                    { value: 'high', label: 'Alto' },
                    { value: 'medium', label: 'Medio' },
                    { value: 'low', label: 'Bajo' },
                  ]}
                />
              </FilterBar>
              {!filtered.length ? (
                <EmptyState
                  title={users.length ? 'Sin coincidencias' : 'Sin usuarios'}
                  description={
                    users.length
                      ? 'Ajusta búsqueda o filtro de riesgo.'
                      : 'Crea un usuario o envía una invitación desde el formulario de la izquierda.'
                  }
                />
              ) : (
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
                          <StatusBadge value={u.risk} kind="risk" />
                          {u.locked ? <div className="muted" style={{ fontSize: 11 }}>bloqueado</div> : null}
                          {u.failedLoginCount > 0 ? (
                            <div className="muted" style={{ fontSize: 11 }}>
                              {u.failedLoginCount} fallos de login
                            </div>
                          ) : null}
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {u.activity30d} auditoría
                          <div>{u.checklistEdits30d} ediciones chk</div>
                        </td>
                        <td className="muted">{u.activeSessions ?? 0}</td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleString('es-MX')
                            : 'Nunca'}
                        </td>
                        <td>
                          <FieldSelect
                            value={u.roleKey}
                            onChange={(v) => patchUser(u.id, { roleKey: v })}
                            label={`Rol de ${u.fullName}`}
                            options={roles.map((r) => ({ value: r.key, label: r.label }))}
                          />
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
                          <button className="btn ghost btn-sm" type="button" onClick={() => setPermsUserId(u.id)}>
                            {u.permissions.length ? `${u.permissions.length} extra` : 'Permisos'}
                          </button>
                        </td>
                        <td>
                          <StatusBadge value={u.active ? 'Activo' : 'Inactivo'} kind="raw" />
                        </td>
                        <td>
                          <div className="row row--tight" style={{ flexWrap: 'wrap' }}>
                            {resetPwUserId === u.id ? (
                              <>
                                <input
                                  className="field"
                                  type="password"
                                  autoComplete="new-password"
                                  placeholder="Nueva contraseña (mín. 6)"
                                  value={resetPwValue}
                                  onChange={(e) => setResetPwValue(e.target.value)}
                                  style={{ minWidth: 160 }}
                                />
                                <button
                                  className="btn btn-sm"
                                  type="button"
                                  onClick={() => {
                                    if (resetPwValue.length < 6) {
                                      setError('La contraseña debe tener al menos 6 caracteres');
                                      return;
                                    }
                                    void patchUser(u.id, { password: resetPwValue }).then(() => {
                                      setResetPwUserId(null);
                                      setResetPwValue('');
                                      setMsg('Contraseña actualizada');
                                    });
                                  }}
                                >
                                  Guardar
                                </button>
                                <button
                                  className="btn ghost btn-sm"
                                  type="button"
                                  onClick={() => {
                                    setResetPwUserId(null);
                                    setResetPwValue('');
                                  }}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn ghost btn-sm"
                                type="button"
                                onClick={() => {
                                  setResetPwUserId(u.id);
                                  setResetPwValue('');
                                }}
                              >
                                Restablecer
                              </button>
                            )}
                            {u.active ? (
                              <button
                                className="btn ghost btn-sm btn-danger"
                                type="button"
                                onClick={() => setActive(u.id, false)}
                              >
                                Desactivar
                              </button>
                            ) : (
                              <button
                                className="btn ghost btn-sm"
                                type="button"
                                onClick={() => setActive(u.id, true)}
                              >
                                Activar
                              </button>
                            )}
                          </div>
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
              <FormGrid cols={3}>
                {permCatalog.map((p) => (
                  <FieldCheck
                    key={p.key}
                    checked={editingUser.permissions.includes(p.key)}
                    onChange={() => togglePerm(editingUser, p.key)}
                    label={p.key}
                  />
                ))}
              </FormGrid>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
