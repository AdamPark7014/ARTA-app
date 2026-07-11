'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [permCatalog, setPermCatalog] = useState<PermOpt[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [permsUserId, setPermsUserId] = useState<string | null>(null);

  async function load() {
    const [u, r, p] = await Promise.all([
      api<UserRow[]>('/users'),
      api<RoleOpt[]>('/users/roles'),
      api<PermOpt[]>('/users/permissions/catalog'),
    ]);
    setUsers(u);
    setRoles(r);
    setPermCatalog(p);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

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
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(EMPTY);
      setMsg('Usuario creado');
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

  function togglePerm(u: UserRow, key: string) {
    const next = u.permissions.includes(key)
      ? u.permissions.filter((p) => p !== key)
      : [...u.permissions, key];
    patchUser(u.id, { permissions: next }).catch((e) => setMsg(e.message));
  }

  const editingUser = users.find((u) => u.id === permsUserId) || null;

  return (
    <AppShell title="Usuarios">
      <div className="page-workspace stack">
        <div className="page-intro">
          <p className="muted">
            Solo Arturo y Chacho gestionan cuentas. El rol define el acceso base; los permisos extra se
            suman sin cambiar el rol.
          </p>
        </div>

        <div className="users-layout">
          <div className="panel">
            <div className="panel-head">
              <h2>Nuevo usuario</h2>
            </div>
            <div className="panel-body">
              <form className="form" onSubmit={onCreate}>
                <label>
                  Nombre
                  <input
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </label>
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
                  Cargo
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </label>
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
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? 'Creando…' : 'Crear usuario'}
                </button>
              </form>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Directorio · {users.length}</h2>
            </div>
            <div className="panel-body">
              {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Rol</th>
                      <th>Entidades</th>
                      <th>Extras</th>
                      <th>Estado</th>
                      <th>Reset</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.fullName}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {u.email}
                            {u.title ? ` · ${u.title}` : ''}
                          </div>
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
                        </td>
                        <td>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => setActive(u.id, !u.active)}
                          >
                            {u.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))}
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
