'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { askConfirm, askPrompt } from '@/components/ui/AskDialog';
import { EmptyLite, Pill, Tile } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { userHasPermission } from '@/lib/access-matrix';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type Profile = {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
  accessExpiresAt?: string | null;
  accessLabel?: string | null;
  createdAt: string;
  canPublish: boolean;
  lastSeenAt?: string | null;
  expired: boolean;
};

/** Lo que dura una temporada si nadie dice otra cosa. */
const SEASON_DAYS = 90;

function isoDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysFromNow(days: number) {
  return isoDay(new Date(Date.now() + days * 86_400_000));
}

function dayLabel(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Hasta el final del día que se eligió. */
function endOfDay(day: string) {
  return new Date(`${day}T23:59:59`).toISOString();
}

const emptyForm = () => ({ fullName: '', email: '', label: '', expiresAt: daysFromNow(SEASON_DAYS), canPublish: true });

function stateOf(p: Profile) {
  if (!p.active) return { label: 'Desactivado', tone: 'draft' };
  if (p.expired) return { label: 'Vencido', tone: 'warn' };
  return { label: 'Activo', tone: 'ok' };
}

/**
 * Perfiles de practicante por temporada: se generan desde Studio, vencen solos y se renuevan. Editan
 * el sitio y suben testigos de publicidad; nada más del sistema. La contraseña se ve una sola vez.
 */
export default function PracticantesPage() {
  const { user } = useUser();
  const allowed = userHasPermission(user?.roleKey || '', user?.permissions || [], ['practicantes.manage', 'everything']);
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; variant: 'success' | 'error' } | null>(null);
  /** Acceso recién generado: se enseña una vez y no se vuelve a poder leer. */
  const [access, setAccess] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api<Profile[]>('/practicantes'));
    } catch (e) {
      setRows([]);
      setMsg({ text: e instanceof Error ? e.message : 'No se pudieron cargar los perfiles', variant: 'error' });
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy || form.fullName.trim().length < 2) return;
    setBusy(true);
    try {
      const created = await api<Profile & { password: string }>('/practicantes', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          ...(form.label.trim() ? { label: form.label.trim() } : {}),
          expiresAt: endOfDay(form.expiresAt),
          canPublish: form.canPublish,
        }),
      });
      setAccess({ name: created.fullName, email: created.email, password: created.password });
      setCopied(false);
      setForm(emptyForm());
      setAdding(false);
      await load();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo generar el perfil', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function patch(p: Profile, body: Record<string, unknown>, done: string) {
    try {
      await api(`/practicantes/${p.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setMsg({ text: done, variant: 'success' });
      await load();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo guardar', variant: 'error' });
    }
  }

  async function renew(p: Profile) {
    const day = await askPrompt({
      title: `Renovar a ${p.fullName}`,
      label: 'Nueva fecha de término (AAAA-MM-DD)',
      defaultValue: daysFromNow(SEASON_DAYS),
    });
    if (!day) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.trim())) {
      setMsg({ text: 'Escribe la fecha como AAAA-MM-DD', variant: 'error' });
      return;
    }
    await patch(p, { expiresAt: endOfDay(day.trim()), active: true }, `${p.fullName} renovado hasta ${day.trim()}`);
  }

  async function toggleActive(p: Profile) {
    if (p.active) {
      const ok = await askConfirm({
        title: `¿Desactivar a ${p.fullName}?`,
        body: 'Se cierra su sesión y deja de entrar. Lo que subió se queda.',
        danger: true,
      });
      if (!ok) return;
    }
    await patch(p, { active: !p.active }, p.active ? `${p.fullName} desactivado` : `${p.fullName} activado`);
  }

  async function newPassword(p: Profile) {
    const ok = await askConfirm({
      title: `¿Nueva contraseña para ${p.fullName}?`,
      body: 'La anterior deja de servir y se cierra su sesión.',
    });
    if (!ok) return;
    try {
      const { password } = await api<{ password: string }>(`/practicantes/${p.id}/password`, { method: 'POST', body: '{}' });
      setAccess({ name: p.fullName, email: p.email, password });
      setCopied(false);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo cambiar', variant: 'error' });
    }
  }

  async function copyAccess() {
    if (!access) return;
    try {
      await navigator.clipboard.writeText(`Usuario: ${access.email}\nContraseña: ${access.password}`);
      setCopied(true);
    } catch {
      setMsg({ text: 'No se pudo copiar: selecciónalo y cópialo a mano', variant: 'error' });
    }
  }

  const live = (rows ?? []).filter((p) => p.active && !p.expired).length;

  return (
    <AppShell title="Perfiles de practicante">
      <div className="stack page-workspace">
        <PageHeader
          title="Perfiles de practicante"
          description="Accesos por temporada para editar el sitio y subir testigos de publicidad."
        >
          <Link className="btn-quiet" href="/studio">
            Volver a Studio
          </Link>
          {allowed ? (
            <button className={`btn btn-sm ${adding ? 'ghost' : ''}`} type="button" onClick={() => setAdding((v) => !v)}>
              {adding ? 'Cerrar' : 'Generar perfil'}
            </button>
          ) : null}
        </PageHeader>

        {msg ? (
          <FlashMessage variant={msg.variant} onDismiss={() => setMsg(null)}>
            {msg.text}
          </FlashMessage>
        ) : null}

        {!allowed ? (
          <div className="surface">
            <EmptyLite icon="+" title="Esta pantalla no está a tu alcance" />
          </div>
        ) : null}

        {access ? (
          <section className="surface practicante-access" aria-live="polite">
            <div className="surface__head">
              <h3 className="surface__title">Acceso de {access.name}</h3>
              <button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setAccess(null)}>
                ×
              </button>
            </div>
            <div className="surface__body sx-stack">
              <p className="t-small muted">Cópialo ahora: esta contraseña no se vuelve a mostrar.</p>
              <dl className="ev-facts">
                <div>
                  <dt>Usuario</dt>
                  <dd>{access.email}</dd>
                </div>
                <div>
                  <dt>Contraseña</dt>
                  <dd className="practicante-access__secret">{access.password}</dd>
                </div>
              </dl>
              <div className="sx-actions">
                <button className="btn btn-sm" type="button" onClick={() => void copyAccess()}>
                  {copied ? 'Copiado' : 'Copiar acceso'}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {adding && allowed ? (
          <section className="surface">
            <form className="fx practicante-form" onSubmit={create}>
              <label className="fx-field">
                <span>Nombre</span>
                <input
                  autoFocus
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </label>
              <label className="fx-field">
                <span>Correo (opcional)</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Sin correo se le arma un usuario"
                />
              </label>
              <label className="fx-field">
                <span>Temporada</span>
                <input
                  value={form.label}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Otoño 2026"
                />
              </label>
              <label className="fx-field">
                <span>Vence</span>
                <input
                  type="date"
                  required
                  min={isoDay(new Date())}
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </label>
              <label className="witness-form__check practicante-form__wide">
                <input
                  type="checkbox"
                  checked={form.canPublish}
                  onChange={(e) => setForm({ ...form, canPublish: e.target.checked })}
                />
                <span>Puede publicar en el sitio; si no, deja borradores para dirección</span>
              </label>
              <div className="sx-actions practicante-form__wide">
                <button className="btn btn-sm" type="submit" disabled={busy || form.fullName.trim().length < 2}>
                  {busy ? 'Generando…' : 'Generar perfil'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {allowed && rows === null ? <LoadingBlock rows={4} label="Cargando perfiles…" /> : null}

        {allowed && rows && !rows.length && !adding ? (
          <div className="surface">
            <EmptyLite icon="+" title="Sin perfiles todavía" text="Genera el primero para esta temporada." />
          </div>
        ) : null}

        {allowed && rows?.length ? (
          <>
            <div className="tiles">
              <Tile label="Activos" value={live} sub={`de ${rows.length} ${rows.length === 1 ? 'perfil' : 'perfiles'}`} />
            </div>
            <div className="surface">
              <div className="dtable-wrap">
                <table className="dtable dtable--cards">
                  <thead>
                    <tr>
                      <th>Practicante</th>
                      <th>Temporada</th>
                      <th>Vence</th>
                      <th>Estado</th>
                      <th>Publica</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const state = stateOf(p);
                      return (
                        <tr key={p.id}>
                          <td className="card-full">
                            <strong>{p.fullName}</strong>
                            <div className="t-small muted">{p.email}</div>
                          </td>
                          <td data-label="Temporada">{p.accessLabel || '—'}</td>
                          <td data-label="Vence">{dayLabel(p.accessExpiresAt)}</td>
                          <td data-label="Estado">
                            <Pill tone={state.tone}>{state.label}</Pill>
                          </td>
                          <td data-label="Publica">
                            <button
                              className="btn-quiet"
                              type="button"
                              onClick={() =>
                                void patch(
                                  p,
                                  { canPublish: !p.canPublish },
                                  p.canPublish ? `${p.fullName} ya solo deja borradores` : `${p.fullName} ya puede publicar`,
                                )
                              }
                            >
                              {p.canPublish ? 'Sí' : 'Solo borradores'}
                            </button>
                          </td>
                          <td className="card-full">
                            <div className="sx-actions">
                              <button className="btn-quiet" type="button" onClick={() => void renew(p)}>
                                Renovar
                              </button>
                              <button className="btn-quiet" type="button" onClick={() => void newPassword(p)}>
                                Nueva contraseña
                              </button>
                              <button className="btn-quiet" type="button" onClick={() => void toggleActive(p)}>
                                {p.active ? 'Desactivar' : 'Activar'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
