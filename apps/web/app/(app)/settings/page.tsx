'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FormGrid, PageHeader } from '@/components/ui/PageChrome';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';
import {
  DAY_NAMES,
  fetchPoWindow,
  savePoWindow,
  type PoWindowConfig,
  type PoWindowState,
} from '@/lib/po-window';

const TIME_ZONES = [
  'America/Mexico_City',
  'America/Cancun',
  'America/Tijuana',
  'America/Monterrey',
  'UTC',
];

/**
 * Configuración operativa de la organización.
 *
 * Hoy vive aquí la ventana de solicitud de órdenes de compra, que la junta del
 * 2026-08-28 pidió volver configurable: «se propone que el sistema permita
 * configurar los días y horarios disponibles para solicitar órdenes de compra.
 * Actualmente el periodo disponible es de lunes y jueves de 10:00 a 14:00».
 */
export default function SettingsPage() {
  const { user } = useUser();
  const [state, setState] = useState<PoWindowState | null>(null);
  const [form, setForm] = useState<PoWindowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const canEdit = user
    ? userHasPermission(user.roleKey, user.permissions, ['users.manage', 'everything'])
    : false;

  useEffect(() => {
    fetchPoWindow()
      .then((s) => {
        setState(s);
        setForm(s.config);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración'))
      .finally(() => setLoading(false));
  }, []);

  function toggleDay(day: number) {
    if (!form) return;
    const days = form.days.includes(day)
      ? form.days.filter((d) => d !== day)
      : [...form.days, day].sort((a, b) => a - b);
    setForm({ ...form, days });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const next = await savePoWindow(form);
      setState(next);
      setForm(next.config);
      setMsg('Ventana de órdenes de compra actualizada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Configuración">
      <div className="stack page-workspace">
        <PageHeader
          description="Reglas de operación de la organización. Aplican a todo el equipo."
          hint="La ventana de OC concentra las solicitudes de compra en días y horas fijas. Dirección puede capturar fuera de horario."
        />

        {msg ? (
          <div className="module-banner module-banner--ok" role="status">
            {msg}
          </div>
        ) : null}
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        {loading || !form ? (
          <LoadingBlock rows={4} label="Cargando configuración…" />
        ) : (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Ventana para solicitar órdenes de compra</h2>
                <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
                  {state?.open
                    ? `Abierta ahora · ${state.scheduleLabel}`
                    : `Cerrada${state?.nextOpenLabel ? ` · abre ${state.nextOpenLabel}` : ''}`}
                </p>
              </div>
              <span className={`badge ${state?.open ? 'ok' : 'warn'}`}>
                {state?.open ? 'Abierta' : 'Cerrada'}
              </span>
            </div>
            <div className="panel-body">
              <div className="form panel--narrow">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  <span>
                    Limitar la captura de OC a días y horarios concretos
                    {form.enabled ? '' : ' (desactivado: se puede solicitar a cualquier hora)'}
                  </span>
                </label>

                <fieldset className="fieldset" disabled={!canEdit || !form.enabled}>
                  <legend>Días disponibles</legend>
                  <div className="day-picker">
                    {DAY_NAMES.map((name, day) => (
                      <label key={name} className="day-chip">
                        <input
                          type="checkbox"
                          checked={form.days.includes(day)}
                          onChange={() => toggleDay(day)}
                        />
                        <span>{name.slice(0, 3)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <FormGrid cols={3}>
                  <label>
                    Desde
                    <input
                      className="field"
                      type="time"
                      disabled={!canEdit || !form.enabled}
                      value={form.start}
                      onChange={(e) => setForm({ ...form, start: e.target.value })}
                    />
                  </label>
                  <label>
                    Hasta
                    <input
                      className="field"
                      type="time"
                      disabled={!canEdit || !form.enabled}
                      value={form.end}
                      onChange={(e) => setForm({ ...form, end: e.target.value })}
                    />
                  </label>
                  <label>
                    Zona horaria
                    <select
                      className="field"
                      disabled={!canEdit || !form.enabled}
                      value={form.timeZone}
                      onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
                    >
                      {(TIME_ZONES.includes(form.timeZone)
                        ? TIME_ZONES
                        : [form.timeZone, ...TIME_ZONES]
                      ).map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </label>
                </FormGrid>

                <label>
                  Nota para el equipo
                  <input
                    className="field"
                    disabled={!canEdit}
                    value={form.note || ''}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="Ej. Urgencias fuera de ventana: avisar a dirección por WhatsApp."
                  />
                </label>

                {canEdit ? (
                  <button className="btn" type="button" disabled={saving} onClick={save}>
                    {saving ? 'Guardando…' : 'Guardar ventana'}
                  </button>
                ) : (
                  <p className="muted kpi-sub">Solo dirección puede cambiar esta configuración.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
