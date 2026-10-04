'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { SectionHead } from '@/components/ui/Lite';
import { WebPushCard } from '@/components/web-push/WebPushCard';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';
import {
  DAY_NAMES,
  fetchPoWindow,
  savePoWindow,
  type PoWindowConfig,
  type PoWindowState,
} from '@/lib/po-window';

/** Lunes primero, como se lee la semana en la oficina. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/**
 * Configuración de la organización: días de cobro de órdenes de compra.
 *
 * Revisión 11-09-2026 — «La orden de compra se puede crear el día que sea.
 * SOLO SE DEJARÁ LOS DÍAS DE COBRO». Ya no hay horario ni zona que elegir.
 */
export default function SettingsPage() {
  const { user } = useUser();
  const [state, setState] = useState<PoWindowState | null>(null);
  const [form, setForm] = useState<PoWindowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  const canEdit = user
    ? userHasPermission(user.roleKey, user.permissions, ['users.manage', 'everything'])
    : false;

  useEffect(() => {
    fetchPoWindow()
      .then((s) => {
        setState(s);
        setForm(s.config);
      })
      .catch((e) =>
        setMsg({ text: e instanceof Error ? e.message : 'No se pudo cargar la configuración', tone: 'error' }),
      )
      .finally(() => setLoading(false));
  }, []);

  function edit(next: PoWindowConfig) {
    setForm(next);
    setMsg(null);
  }

  function toggleDay(day: number) {
    if (!form) return;
    const on = form.days.includes(day);
    // Siempre queda al menos un día de cobro.
    if (on && form.days.length === 1) return;
    const days = on ? form.days.filter((d) => d !== day) : [...form.days, day].sort((a, b) => a - b);
    edit({ ...form, days });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setMsg(null);
    try {
      const next = await savePoWindow(form);
      setState(next);
      setForm(next.config);
      setMsg({ text: 'Días de cobro guardados', tone: 'ok' });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo guardar', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    !!form &&
    !!state &&
    (form.enabled !== state.config.enabled ||
      form.days.join() !== state.config.days.join() ||
      (form.note || '') !== (state.config.note || ''));

  const status = !state?.config.enabled
    ? 'Sin restricción: los pagos se registran cualquier día'
    : state.open
      ? 'Hoy es día de cobro'
      : `Hoy no es día de cobro${state.nextOpenLabel ? ` · próximo ${state.nextOpenLabel}` : ''}`;

  return (
    <AppShell title="Configuración">
      <div className="sx-stack page-workspace oc-settings">
        <WebPushCard />
        <SectionHead
          title="Días de cobro"
          sub="Las órdenes de compra se crean cualquier día; los pagos se registran solo en estos."
        />

        {loading ? <LoadingBlock rows={3} label="Cargando configuración…" /> : null}

        {!loading && !form && msg ? (
          <p className="oc-flash is-error" role="alert">
            {msg.text}
          </p>
        ) : null}

        {form ? (
          <section className="surface surface--pad">
            <div className="fx">
              <div className="oc-set-row">
                <span className="inline-note">
                  <span className={`oc-dot ${state?.config.enabled && state.open ? 'is-on' : ''}`} aria-hidden />
                  {status}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.enabled}
                  className={`oc-switch ${form.enabled ? 'is-on' : ''}`}
                  disabled={!canEdit}
                  onClick={() => edit({ ...form, enabled: !form.enabled })}
                >
                  <span className="oc-switch__track" aria-hidden>
                    <span className="oc-switch__knob" />
                  </span>
                  Limitar pagos a estos días
                </button>
              </div>

              <div className="fx-field">
                <span>Días</span>
                <div className="choice oc-days" role="group" aria-label="Días de cobro">
                  {WEEK.map((day) => {
                    const on = form.days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        title={DAY_NAMES[day]}
                        className={`choice__opt ${on ? 'is-on' : ''}`}
                        disabled={!canEdit || !form.enabled}
                        onClick={() => toggleDay(day)}
                      >
                        {DAY_NAMES[day].slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label>
                Nota para el equipo
                <input
                  value={form.note || ''}
                  disabled={!canEdit}
                  maxLength={300}
                  onChange={(e) => edit({ ...form, note: e.target.value })}
                  placeholder="Opcional · se añade al aviso cuando hoy no es día de cobro"
                />
              </label>

              <div className="fx-actions">
                {msg ? (
                  <span className={`oc-flash ${msg.tone === 'error' ? 'is-error' : 'is-ok'}`} role="status">
                    {msg.text}
                  </span>
                ) : null}
                {canEdit ? (
                  <button type="button" className="btn btn-sm" disabled={saving || !dirty} onClick={save}>
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                ) : (
                  <span className="t-muted t-small">Solo dirección cambia esta configuración.</span>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
