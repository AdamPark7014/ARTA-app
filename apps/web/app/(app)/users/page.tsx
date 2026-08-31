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
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';

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

type EditDraft = {
  id: string;
  email: string;
  fullName: string;
  title: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  active: boolean;
  password: string;
};

const EMPTY = {
  email: '',
  fullName: '',
  title: '',
  roleKey: 'logistica',
  entities: ['ARTA'] as string[],
  password: '',
};

export default function UsersPage() {
  const { user: me } = useUser();
  const canManage = userHasPermission(me?.roleKey || '', me?.permissions || [], [
    'users.manage',
    'everything',
  ]);

  const [gov, setGov] = useState<UsersGov | null>(null);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [permCatalog, setPermCatalog] = useState<PermOpt[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(true);

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
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [canManage]);

  const users = gov?.users || [];

  const filtered = useMemo(() => {
    let list = users;
    if (!showInactive) list = list.filter((u) => u.active);
    if (riskFilter !== 'all') list = list.filter((u) => u.risk === riskFilter);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(n) ||
          u.email.toLowerCase().includes(n) ||
          u.roleKey.toLowerCase().includes(n) ||
          (u.roleLabel || '').toLowerCase().includes(n),
      );
    }
    return list;
  }, [users, riskFilter, q, showInactive]);

  function toggleEntityCreate(ent: string) {
    setForm((f) => ({
      ...f,
      entities: f.entities.includes(ent) ? f.entities.filter((e) => e !== ent) : [...f.entities, ent],
    }));
  }

  function openEdit(u: GovUser) {
    setEdit({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      title: u.title || '',
      roleKey: u.roleKey,
      entities: [...u.entities],
      permissions: [...u.permissions],
      active: u.active,
      password: '',
    });
    setMsg('');
    setError('');
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.entities.length) {
      setMsg('Elige al menos una entidad (Arta y/o Auditorio)');
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
        setMsg('Invitación creada — copia el link si el correo no llega');
      } else {
        if (!form.fullName.trim()) throw new Error('Nombre requerido');
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

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    if (!edit.entities.length) {
      setError('Elige al menos una entidad');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        email: edit.email,
        fullName: edit.fullName,
        title: edit.title || null,
        roleKey: edit.roleKey,
        entities: edit.entities,
        permissions: edit.permissions,
        active: edit.active,
      };
      if (edit.password.trim().length >= 6) body.password = edit.password.trim();
      await api(`/users/${edit.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setMsg('Usuario actualizado');
      setEdit(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(u: GovUser) {
    if (u.id === me?.id) {
      setError('No puedes eliminarte a ti mismo');
      return;
    }
    if (
      !confirm(
        `¿Eliminar acceso de ${u.fullName}?\nSe desactiva la cuenta y se cierran sus sesiones. El historial se conserva.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      setMsg(`${u.fullName} eliminado (desactivado)`);
      if (edit?.id === u.id) setEdit(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setSaving(false);
    }
  }

  function toggleEditPerm(key: string) {
    if (!edit) return;
    setEdit({
      ...edit,
      permissions: edit.permissions.includes(key)
        ? edit.permissions.filter((p) => p !== key)
        : [...edit.permissions, key],
    });
  }

  const k = gov?.kpis;
  const msgVariant =
    msg.includes('Elige') || msg.includes('requerido')
      ? 'warn'
      : msg.includes('creado') || msg.includes('actualizado') || msg.includes('Invitación') || msg.includes('eliminado')
        ? 'success'
        : 'error';

  if (!canManage) {
    return (
      <AppShell title="Usuarios">
        <div className="page-workspace">
          <EmptyState
            title="Solo dirección"
            description="Arturo y José Luis (Directores Generales) gestionan altas, roles, permisos y bajas del equipo."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Usuarios">
      <div className="page-workspace stack">
        <PageHeader
          description="Alta, edición, roles, entidades, permisos extra y baja de cuentas. Solo Directores Generales (Arturo y José Luis)."
          hint="Crear con password da acceso inmediato. Invitar por email deja que la persona elija su clave. Eliminar = desactivar + cerrar sesiones."
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
            <LoadingBlock rows={5} label="Cargando usuarios…" />
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
              <div className="label">Bloqueados</div>
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
              <h2>{inviteMode ? 'Invitar usuario' : 'Crear usuario'}</h2>
              <button
                className="btn ghost btn-sm"
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
                      Nombre completo
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
                        placeholder="Ej. Logística"
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
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                  </label>
                ) : (
                  <p className="muted kpi-sub" style={{ margin: 0 }}>
                    Link de 7 días a <code>/invite/…</code> para que elija nombre y password.
                  </p>
                )}
                <div className="row">
                  {(['ARTA', 'EXPLANADA'] as const).map((ent) => (
                    <FieldCheck
                      key={ent}
                      checked={form.entities.includes(ent)}
                      onChange={() => toggleEntityCreate(ent)}
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
                  {saving ? 'Guardando…' : inviteMode ? 'Enviar invitación' : 'Crear usuario'}
                </button>
              </form>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Directorio · {filtered.length}</h2>
            </div>
            <div className="panel-body">
              <FilterBar meta={`${filtered.length} de ${users.length}`}>
                <FieldSearch
                  value={q}
                  onChange={setQ}
                  placeholder="Nombre, email o rol…"
                  label="Buscar"
                  maxWidth={240}
                />
                <FieldSelect
                  value={riskFilter}
                  onChange={(v) => setRiskFilter(v as typeof riskFilter)}
                  label="Riesgo"
                  options={[
                    { value: 'all', label: 'Todo riesgo' },
                    { value: 'high', label: 'Alto' },
                    { value: 'medium', label: 'Medio' },
                    { value: 'low', label: 'Bajo' },
                  ]}
                />
                <FieldCheck
                  checked={showInactive}
                  onChange={setShowInactive}
                  label="Mostrar inactivos"
                />
              </FilterBar>
              {!filtered.length ? (
                <EmptyState
                  title={users.length ? 'Sin coincidencias' : 'Sin usuarios'}
                  description={
                    users.length
                      ? 'Ajusta búsqueda o filtros.'
                      : 'Crea el primer usuario con el formulario de la izquierda.'
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="table table-sticky">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Rol</th>
                        <th>Entidades</th>
                        <th>Estado</th>
                        <th>Último acceso</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u) => (
                        <tr key={u.id} className={!u.active ? 'is-muted' : undefined}>
                          <td>
                            <strong>{u.fullName}</strong>
                            <div className="muted kpi-sub">
                              {u.email}
                              {u.title ? ` · ${u.title}` : ''}
                            </div>
                          </td>
                          <td>
                            <div>{u.roleLabel || u.roleKey}</div>
                            {u.permissions.length ? (
                              <div className="muted kpi-sub">{u.permissions.length} permisos extra</div>
                            ) : null}
                          </td>
                          <td className="muted kpi-sub">
                            {u.entities
                              .map((e) => (e === 'ARTA' ? 'Arta' : 'Auditorio'))
                              .join(' · ') || '—'}
                          </td>
                          <td>
                            <StatusBadge value={u.active ? 'Activo' : 'Inactivo'} kind="raw" />
                            {u.locked ? (
                              <div className="muted kpi-sub">login bloqueado</div>
                            ) : null}
                          </td>
                          <td className="muted kpi-sub">
                            {u.lastLoginAt
                              ? new Date(u.lastLoginAt).toLocaleString('es-MX')
                              : 'Nunca'}
                          </td>
                          <td>
                            <div className="row row--tight">
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => openEdit(u)}
                              >
                                Editar
                              </button>
                              <button
                                className="btn ghost btn-sm btn-danger"
                                type="button"
                                disabled={saving || u.id === me?.id}
                                onClick={() => void deleteUser(u)}
                              >
                                Eliminar
                              </button>
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

        {edit ? (
          <div className="panel">
            <div className="panel-head">
              <h2>Editar usuario · {edit.fullName}</h2>
              <button className="btn ghost btn-sm" type="button" onClick={() => setEdit(null)}>
                Cerrar
              </button>
            </div>
            <div className="panel-body">
              <form className="form" onSubmit={saveEdit}>
                <FormGrid>
                  <label>
                    Nombre completo
                    <input
                      required
                      value={edit.fullName}
                      onChange={(e) => setEdit({ ...edit, fullName: e.target.value })}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      required
                      type="email"
                      value={edit.email}
                      onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                    />
                  </label>
                  <label>
                    Cargo
                    <input
                      value={edit.title}
                      onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                    />
                  </label>
                  <label>
                    Rol
                    <FieldSelect
                      value={edit.roleKey}
                      onChange={(v) => setEdit({ ...edit, roleKey: v })}
                      label="Rol"
                      options={roles.map((r) => ({ value: r.key, label: r.label }))}
                    />
                  </label>
                </FormGrid>

                <div className="label" style={{ marginTop: '0.75rem' }}>
                  Entidades
                </div>
                <div className="row">
                  {(['ARTA', 'EXPLANADA'] as const).map((ent) => (
                    <FieldCheck
                      key={ent}
                      checked={edit.entities.includes(ent)}
                      onChange={() =>
                        setEdit({
                          ...edit,
                          entities: edit.entities.includes(ent)
                            ? edit.entities.filter((x) => x !== ent)
                            : [...edit.entities, ent],
                        })
                      }
                      label={ent === 'ARTA' ? 'Arta' : 'Auditorio'}
                    />
                  ))}
                </div>

                <FieldCheck
                  checked={edit.active}
                  onChange={(v) => setEdit({ ...edit, active: v })}
                  label="Cuenta activa (puede iniciar sesión)"
                />

                <label>
                  Nueva contraseña (opcional)
                  <input
                    type="password"
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Dejar vacío para no cambiar"
                    value={edit.password}
                    onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                  />
                </label>

                <div className="label" style={{ marginTop: '0.75rem' }}>
                  Permisos extra (se suman al rol)
                </div>
                <FormGrid cols={3}>
                  {permCatalog.map((p) => (
                    <FieldCheck
                      key={p.key}
                      checked={edit.permissions.includes(p.key)}
                      onChange={() => toggleEditPerm(p.key)}
                      label={p.label || p.key}
                    />
                  ))}
                </FormGrid>

                <div className="row row--tight" style={{ marginTop: '1rem' }}>
                  <button className="btn" type="submit" disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    className="btn ghost btn-danger"
                    type="button"
                    disabled={saving || edit.id === me?.id}
                    onClick={() => {
                      const u = users.find((x) => x.id === edit.id);
                      if (u) void deleteUser(u);
                    }}
                  >
                    Eliminar acceso
                  </button>
                  <button className="btn ghost" type="button" onClick={() => setEdit(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
