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
import { panelLoginUrl } from '@/lib/domains';
import { ROLE_DEFAULT_ENTITIES, ROLE_HINTS, type RoleKey } from '@arta/rbac';

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

type RoleOpt = {
  key: string;
  label: string;
  hint?: string;
  defaultEntities?: string[];
  permissions?: string[];
};
type PermOpt = { key: string; label: string };

type InviteRow = {
  id: string;
  email: string;
  roleKey: string;
  entities: string[];
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
};

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

type CreateForm = {
  email: string;
  fullName: string;
  title: string;
  roleKey: string;
  entities: string[];
  password: string;
  permissions: string[];
};

type CredsBox = {
  email: string;
  password: string;
  fullName: string;
  reactivated?: boolean;
};

const EMPTY: CreateForm = {
  email: '',
  fullName: '',
  title: '',
  roleKey: 'logistica',
  entities: [...(ROLE_DEFAULT_ENTITIES.logistica || ['ARTA'])],
  password: '',
  permissions: [],
};

function genPassword(len = 10): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 1e9);
  }
  let out = '';
  for (let i = 0; i < len; i++) out += chars[buf[i]! % chars.length];
  return out;
}

function entityLabel(e: string) {
  return e === 'ARTA' ? 'Arta' : e === 'EXPLANADA' ? 'Auditorio' : e;
}

export default function UsersPage() {
  const { user: me } = useUser();
  const canManage = userHasPermission(me?.roleKey || '', me?.permissions || [], [
    'users.manage',
    'everything',
  ]);

  const [gov, setGov] = useState<UsersGov | null>(null);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [permCatalog, setPermCatalog] = useState<PermOpt[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<CreateForm>(() => ({
    ...EMPTY,
    password: genPassword(),
  }));
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [showPw, setShowPw] = useState(true);
  const [showCreatePerms, setShowCreatePerms] = useState(false);
  const [creds, setCreds] = useState<CredsBox | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [roleFilter, setRoleFilter] = useState('all');
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
    if (meOrg?.id) {
      setOrgId(meOrg.id);
      const inv = await api<InviteRow[]>(`/organizations/${meOrg.id}/invites`).catch(
        () => [] as InviteRow[],
      );
      setInvites(inv);
    }
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
  const pendingInvites = useMemo(
    () =>
      invites.filter(
        (i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date(),
      ),
    [invites],
  );

  const filtered = useMemo(() => {
    let list = users;
    if (!showInactive) list = list.filter((u) => u.active);
    if (riskFilter !== 'all') list = list.filter((u) => u.risk === riskFilter);
    if (roleFilter !== 'all') list = list.filter((u) => u.roleKey === roleFilter);
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
  }, [users, riskFilter, roleFilter, q, showInactive]);

  const selectedRole = roles.find((r) => r.key === form.roleKey);
  const roleHint =
    selectedRole?.hint ||
    ROLE_HINTS[form.roleKey as RoleKey] ||
    '';

  function applyRole(roleKey: string) {
    const meta = roles.find((r) => r.key === roleKey);
    const defaults =
      meta?.defaultEntities ||
      ROLE_DEFAULT_ENTITIES[roleKey as RoleKey] ||
      (['ARTA'] as string[]);
    setForm((f) => ({
      ...f,
      roleKey,
      entities: [...defaults],
      title: f.title.trim() ? f.title : meta?.label || f.title,
    }));
  }

  function toggleEntityCreate(ent: string) {
    setForm((f) => ({
      ...f,
      entities: f.entities.includes(ent) ? f.entities.filter((e) => e !== ent) : [...f.entities, ent],
    }));
  }

  function toggleCreatePerm(key: string) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
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
    setCreds(null);
  }

  async function copyText(text: string, okMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(okMsg);
    } catch {
      setMsg('No se pudo copiar — selecciónalo a mano');
    }
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
    setCreds(null);
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
            permissions: form.permissions,
          }),
        });
        setInviteUrl(created.acceptUrl);
        setForm({
          ...EMPTY,
          roleKey: form.roleKey,
          entities: form.entities,
          password: genPassword(),
        });
        setMsg('Invitación lista — copia el link y envíaselo (válido 7 días)');
        await load();
      } else {
        if (!form.fullName.trim()) throw new Error('Nombre requerido');
        if (form.password.trim().length < 6) throw new Error('Password mínimo 6 caracteres');
        const created = await api<{
          email: string;
          fullName: string;
          reactivated?: boolean;
        }>('/users', {
          method: 'POST',
          body: JSON.stringify({
            email: form.email,
            fullName: form.fullName,
            title: form.title || undefined,
            roleKey: form.roleKey,
            entities: form.entities,
            password: form.password,
            permissions: form.permissions,
          }),
        });
        setCreds({
          email: created.email,
          password: form.password,
          fullName: created.fullName,
          reactivated: created.reactivated,
        });
        setForm({
          ...EMPTY,
          roleKey: form.roleKey,
          entities: form.entities,
          password: genPassword(),
        });
        setMsg(
          created.reactivated
            ? 'Usuario reactivado con datos nuevos'
            : 'Usuario creado — entrega email y clave al equipo',
        );
        await load();
      }
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

  async function reactivateUser(u: GovUser) {
    setSaving(true);
    try {
      await api(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: true, unlock: true }),
      });
      setMsg(`${u.fullName} reactivado`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reactivar');
    } finally {
      setSaving(false);
    }
  }

  async function unlockUser(u: GovUser) {
    setSaving(true);
    try {
      await api(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ unlock: true }),
      });
      setMsg(`Login desbloqueado para ${u.fullName}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al desbloquear');
    } finally {
      setSaving(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!orgId) return;
    setSaving(true);
    try {
      await api(`/organizations/${orgId}/invites/${inviteId}`, { method: 'DELETE' });
      setMsg('Invitación revocada');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al revocar');
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
    msg.includes('Elige') || msg.includes('requerido') || msg.includes('mínimo') || msg.includes('No se pudo')
      ? 'warn'
      : msg.includes('creado') ||
          msg.includes('actualizado') ||
          msg.includes('Invitación') ||
          msg.includes('eliminado') ||
          msg.includes('reactivado') ||
          msg.includes('desbloqueado') ||
          msg.includes('Copiado') ||
          msg.includes('revocada')
        ? 'success'
        : 'error';

  const loginUrl = panelLoginUrl('ARTA');

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
          description="Alta, roles, entidades, permisos y bajas. Solo Directores Generales (Arturo y José Luis)."
          hint="Alta inmediata = les das email + clave ya. Invitar = ellos eligen password con un link de 7 días."
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
              <h2>Nuevo integrante</h2>
            </div>
            <div className="panel-body">
              <div className="row row--tight" style={{ marginBottom: '0.85rem' }}>
                <button
                  className={`btn btn-sm ${!inviteMode ? '' : 'ghost'}`}
                  type="button"
                  onClick={() => {
                    setInviteMode(false);
                    setInviteUrl('');
                    if (!form.password) setForm((f) => ({ ...f, password: genPassword() }));
                  }}
                >
                  Alta inmediata
                </button>
                <button
                  className={`btn btn-sm ${inviteMode ? '' : 'ghost'}`}
                  type="button"
                  onClick={() => {
                    setInviteMode(true);
                    setCreds(null);
                  }}
                >
                  Invitar por email
                </button>
              </div>

              <form className="form" onSubmit={onCreate}>
                {!inviteMode ? (
                  <FormGrid>
                    <label>
                      Nombre completo
                      <input
                        required
                        value={form.fullName}
                        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                        placeholder="Ej. Ana López"
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Cargo (opcional)
                      <input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="Se sugiere según el rol"
                      />
                    </label>
                  </FormGrid>
                ) : (
                  <p className="muted kpi-sub" style={{ marginTop: 0 }}>
                    Solo necesitas email + rol. La persona pone su nombre y password al abrir el link.
                  </p>
                )}

                <label>
                  Email
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="nombre@correo.com"
                    autoComplete="off"
                  />
                </label>

                <label>
                  Rol
                  <FieldSelect
                    value={form.roleKey}
                    onChange={applyRole}
                    label="Rol del usuario"
                    options={roles.map((r) => ({ value: r.key, label: r.label }))}
                  />
                </label>
                {roleHint ? (
                  <p className="muted kpi-sub" style={{ margin: '-0.35rem 0 0.5rem' }}>
                    {roleHint}
                  </p>
                ) : null}

                <div className="label">Acceso a</div>
                <div className="row">
                  {(['ARTA', 'EXPLANADA'] as const).map((ent) => (
                    <FieldCheck
                      key={ent}
                      checked={form.entities.includes(ent)}
                      onChange={() => toggleEntityCreate(ent)}
                      label={entityLabel(ent)}
                    />
                  ))}
                </div>

                {!inviteMode ? (
                  <label>
                    Password temporal
                    <div className="row row--tight" style={{ alignItems: 'center', marginTop: 4 }}>
                      <input
                        required
                        type={showPw ? 'text' : 'password'}
                        minLength={6}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <button
                        className="btn ghost btn-sm"
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                      >
                        {showPw ? 'Ocultar' : 'Ver'}
                      </button>
                      <button
                        className="btn ghost btn-sm"
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, password: genPassword() }))}
                      >
                        Generar
                      </button>
                      <button
                        className="btn ghost btn-sm"
                        type="button"
                        onClick={() => void copyText(form.password, 'Password copiado')}
                      >
                        Copiar
                      </button>
                    </div>
                  </label>
                ) : null}

                <button
                  className="btn ghost btn-sm"
                  type="button"
                  onClick={() => setShowCreatePerms((v) => !v)}
                >
                  {showCreatePerms ? 'Ocultar permisos extra' : 'Permisos extra (opcional)'}
                </button>
                {showCreatePerms ? (
                  <FormGrid cols={2}>
                    {permCatalog.map((p) => (
                      <FieldCheck
                        key={p.key}
                        checked={form.permissions.includes(p.key)}
                        onChange={() => toggleCreatePerm(p.key)}
                        label={p.label || p.key}
                      />
                    ))}
                  </FormGrid>
                ) : null}

                {inviteUrl ? (
                  <div className="panel" style={{ margin: '0.5rem 0', padding: '0.75rem' }}>
                    <div className="muted kpi-sub">Link de invitación</div>
                    <p style={{ fontSize: 12, wordBreak: 'break-all', margin: '0.35rem 0' }}>
                      <a href={inviteUrl}>{inviteUrl}</a>
                    </p>
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => void copyText(inviteUrl, 'Link copiado')}
                    >
                      Copiar link
                    </button>
                  </div>
                ) : null}

                {creds ? (
                  <div className="panel" style={{ margin: '0.5rem 0', padding: '0.75rem' }}>
                    <strong>
                      {creds.reactivated ? 'Reactivado' : 'Listo'} · {creds.fullName}
                    </strong>
                    <p className="muted kpi-sub" style={{ margin: '0.35rem 0' }}>
                      Entrégales esto (también puedes copiarlo todo):
                    </p>
                    <pre
                      style={{
                        fontSize: 12,
                        whiteSpace: 'pre-wrap',
                        margin: '0.35rem 0 0.6rem',
                        padding: '0.55rem',
                        background: 'var(--bg-soft)',
                        borderRadius: 8,
                      }}
                    >{`Panel: ${loginUrl}
Email: ${creds.email}
Password: ${creds.password}`}</pre>
                    <div className="row row--tight">
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() =>
                          void copyText(
                            `Panel: ${loginUrl}\nEmail: ${creds.email}\nPassword: ${creds.password}`,
                            'Credenciales copiadas',
                          )
                        }
                      >
                        Copiar todo
                      </button>
                      <button className="btn ghost btn-sm" type="button" onClick={() => setCreds(null)}>
                        Cerrar
                      </button>
                    </div>
                  </div>
                ) : null}

                <button className="btn" type="submit" disabled={saving}>
                  {saving
                    ? 'Guardando…'
                    : inviteMode
                      ? 'Crear invitación'
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
              <FilterBar meta={`${filtered.length} de ${users.length}`}>
                <FieldSearch
                  value={q}
                  onChange={setQ}
                  placeholder="Nombre, email o rol…"
                  label="Buscar"
                  maxWidth={220}
                />
                <FieldSelect
                  value={roleFilter}
                  onChange={setRoleFilter}
                  label="Rol"
                  options={[
                    { value: 'all', label: 'Todos los roles' },
                    ...roles.map((r) => ({ value: r.key, label: r.label })),
                  ]}
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
                            {u.entities.map(entityLabel).join(' · ') || '—'}
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
                            <div className="row row--tight" style={{ flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => openEdit(u)}
                              >
                                Editar
                              </button>
                              {!u.active ? (
                                <button
                                  className="btn ghost btn-sm"
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void reactivateUser(u)}
                                >
                                  Reactivar
                                </button>
                              ) : null}
                              {u.locked ? (
                                <button
                                  className="btn ghost btn-sm"
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void unlockUser(u)}
                                >
                                  Desbloquear
                                </button>
                              ) : null}
                              {u.active ? (
                                <button
                                  className="btn ghost btn-sm btn-danger"
                                  type="button"
                                  disabled={saving || u.id === me?.id}
                                  onClick={() => void deleteUser(u)}
                                >
                                  Eliminar
                                </button>
                              ) : null}
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

        {pendingInvites.length ? (
          <div className="panel">
            <div className="panel-head">
              <h2>Invitaciones pendientes · {pendingInvites.length}</h2>
            </div>
            <div className="panel-body">
              <div className="table-wrap">
                <table className="table table-sticky">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Rol</th>
                      <th>Entidades</th>
                      <th>Expira</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvites.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td className="muted">
                          {roles.find((r) => r.key === inv.roleKey)?.label || inv.roleKey}
                        </td>
                        <td className="muted kpi-sub">
                          {(inv.entities || []).map(entityLabel).join(' · ')}
                        </td>
                        <td className="muted kpi-sub">
                          {new Date(inv.expiresAt).toLocaleDateString('es-MX')}
                        </td>
                        <td>
                          <button
                            className="btn ghost btn-sm btn-danger"
                            type="button"
                            disabled={saving}
                            onClick={() => void revokeInvite(inv.id)}
                          >
                            Revocar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

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
                      onChange={(v) => {
                        const meta = roles.find((r) => r.key === v);
                        const defaults =
                          meta?.defaultEntities ||
                          ROLE_DEFAULT_ENTITIES[v as RoleKey] ||
                          edit.entities;
                        setEdit({
                          ...edit,
                          roleKey: v,
                          entities: [...defaults],
                        });
                      }}
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
                      label={entityLabel(ent)}
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
                  <div className="row row--tight" style={{ alignItems: 'center', marginTop: 4 }}>
                    <input
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="Dejar vacío para no cambiar"
                      value={edit.password}
                      onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn ghost btn-sm"
                      type="button"
                      onClick={() => setEdit({ ...edit, password: genPassword() })}
                    >
                      Generar
                    </button>
                  </div>
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
                    disabled={saving || edit.id === me?.id || !edit.active}
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
