'use client';

import { useEffect, useState } from 'react';
import { SettingsSection } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { CHANNEL_HINTS, CHANNEL_LABELS, type NoticeChannel } from '@/lib/notification-kinds';

type Prefs = {
  muted: NoticeChannel[];
  quietHours: { enabled: boolean; start: string; end: string };
};

const CHANNELS = Object.keys(CHANNEL_LABELS) as NoticeChannel[];

function Switch({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`oc-switch nt-switch ${on ? 'is-on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="oc-switch__track" aria-hidden>
        <span className="oc-switch__knob" />
      </span>
    </button>
  );
}

/**
 * Qué llega al teléfono y al navegador. Se guarda por persona: vale en todos sus
 * dispositivos. La campana recibe todo, siempre.
 */
export function NotificationPrefsCard() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Prefs>('/notifications/preferences')
      .then(setPrefs)
      .catch(() => setError('No se pudieron cargar tus preferencias de avisos'));
  }, []);

  async function save(next: Prefs) {
    const before = prefs;
    setPrefs(next);
    setError('');
    try {
      setPrefs(await api<Prefs>('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(next) }));
    } catch (e) {
      setPrefs(before);
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  return (
    <section id="avisos">
      <SettingsSection
        title="Qué te avisamos"
        description="Lo que llega a tu teléfono y a este navegador, en todos tus dispositivos. La campana siempre lo guarda todo."
      >
        {error ? (
          <p className="oc-flash is-error" role="alert">
            {error}
          </p>
        ) : null}
        {prefs ? (
          <div className="nt-prefs">
            {CHANNELS.map((channel) => (
              <div key={channel} className="nt-prefs__row">
                <div className="nt-prefs__copy">
                  <strong>{CHANNEL_LABELS[channel]}</strong>
                  <span>{CHANNEL_HINTS[channel]}</span>
                </div>
                <Switch
                  label={`Avisos de ${CHANNEL_LABELS[channel]}`}
                  on={!prefs.muted.includes(channel)}
                  onChange={(on) =>
                    void save({
                      ...prefs,
                      muted: on ? prefs.muted.filter((c) => c !== channel) : [...prefs.muted, channel],
                    })
                  }
                />
              </div>
            ))}
            <div className="nt-prefs__row nt-prefs__row--quiet">
              <div className="nt-prefs__copy">
                <strong>Horario silencioso</strong>
                <span>De noche solo llega lo urgente; el chat y lo demás te esperan a la mañana.</span>
                {prefs.quietHours.enabled ? (
                  <div className="nt-prefs__hours">
                    <label>
                      De
                      <input
                        type="time"
                        value={prefs.quietHours.start}
                        onChange={(e) =>
                          e.target.value &&
                          void save({ ...prefs, quietHours: { ...prefs.quietHours, start: e.target.value } })
                        }
                      />
                    </label>
                    <label>
                      a
                      <input
                        type="time"
                        value={prefs.quietHours.end}
                        onChange={(e) =>
                          e.target.value &&
                          void save({ ...prefs, quietHours: { ...prefs.quietHours, end: e.target.value } })
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>
              <Switch
                label="Horario silencioso"
                on={prefs.quietHours.enabled}
                onChange={(enabled) => void save({ ...prefs, quietHours: { ...prefs.quietHours, enabled } })}
              />
            </div>
          </div>
        ) : null}
      </SettingsSection>
    </section>
  );
}
