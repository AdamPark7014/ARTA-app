'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type Session = {
  pinId: string;
  label: string;
  scopes: string[];
  event: {
    id: string;
    name: string;
    artist?: string | null;
    venue?: string | null;
    city?: string | null;
    entity: string;
    status: string;
    startsAt?: string | null;
  };
  files: Array<{ id: string; fileName: string; url: string; kind?: string | null }>;
  checklists: Array<{
    id: string;
    title: string;
    progressPct: number;
    pdfUrl?: string | null;
    template?: { key: string } | null;
  }>;
  hospitality?: {
    checklists: Session['checklists'];
    files: Session['files'];
  };
};

export default function VendorPortalPage() {
  const params = useParams();
  const pinId = params.pinId as string;
  const [pin, setPin] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [copied, setCopied] = useState(false);

  const applySession = useCallback((data: Session) => {
    setSession(data);
  }, []);

  useEffect(() => {
    fetch('/api/vendor/session', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (data?.pinId === pinId) applySession(data);
      })
      .catch(() => undefined)
      .finally(() => setBooting(false));
  }, [pinId, applySession]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/vendor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pinId, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
      applySession(data);
      setPin('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/vendor/session', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Sesión expirada');
      applySession(data);
    } catch (err) {
      setSession(null);
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch('/api/vendor/logout', { method: 'POST', credentials: 'include' });
    setSession(null);
  }

  async function copyLink() {
    const url = typeof window !== 'undefined' ? window.location.href : `/v/${pinId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('No se pudo copiar el link');
    }
  }

  if (booting) {
    return (
      <main className="vendor-portal">
        <p className="muted">Cargando portal…</p>
        <PortalStyles />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="vendor-portal">
        <div className="vendor-card">
          <p className="eyebrow">arta · acceso vendor</p>
          <h1>Ingresa tu PIN</h1>
          <p className="lead">
            Portal externo para archivos, checklists y hospitality del evento. Link ID:{' '}
            <code>{pinId.slice(0, 8)}…</code>
          </p>
          <form onSubmit={onSubmit}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              required
              minLength={4}
            />
            {error ? <p className="err">{error}</p> : null}
            <button type="submit" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <div className="row-actions">
            <button type="button" className="ghost" onClick={copyLink}>
              {copied ? 'Link copiado' : 'Copiar link del portal'}
            </button>
            <Link href="/p/arta">← Sitio Arta</Link>
          </div>
        </div>
        <PortalStyles />
      </main>
    );
  }

  const hosp = session.hospitality;
  const meta = [session.event.artist, session.event.venue, session.event.city]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="vendor-portal vendor-portal--session">
      <div className="vendor-session">
        <header className="session-head">
          <div>
            <p className="eyebrow">
              {session.event.entity} · {session.label}
            </p>
            <h1>{session.event.name}</h1>
            <p className="lead">{meta || 'Evento operativo'}</p>
            <p className="scopes">
              Acceso: {session.scopes.join(' · ') || '—'}
              {session.event.startsAt
                ? ` · ${new Date(session.event.startsAt).toLocaleDateString('es-MX')}`
                : ''}
            </p>
          </div>
          <div className="row-actions">
            <button type="button" className="ghost" onClick={() => refresh()} disabled={loading}>
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button type="button" className="ghost" onClick={() => logout()}>
              Salir
            </button>
          </div>
        </header>

        {error ? <p className="err">{error}</p> : null}

        {session.scopes.includes('files') ? (
          <section>
            <h2>Archivos</h2>
            {!session.files.length ? (
              <p className="empty">Sin archivos compartidos aún.</p>
            ) : (
              <ul className="file-list">
                {session.files.map((f) => (
                  <li key={f.id}>
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.fileName}
                    </a>
                    {f.kind ? <span className="tag">{f.kind}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {session.scopes.includes('checklists') ? (
          <section>
            <h2>Checklists / PDFs</h2>
            {!session.checklists.length ? (
              <p className="empty">Sin checklists visibles.</p>
            ) : (
              <ul className="file-list">
                {session.checklists.map((c) => (
                  <li key={c.id}>
                    <span>
                      {c.title} · {c.progressPct}%
                    </span>
                    {c.pdfUrl ? (
                      <a href={c.pdfUrl} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    ) : (
                      <span className="tag">sin PDF</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {session.scopes.includes('hospitality') ? (
          <section>
            <h2>Hospitality / rider</h2>
            {!hosp?.checklists.length && !hosp?.files.length ? (
              <p className="empty">
                Sin materiales de hospitality coincidentes (rider / catering / hospital*).
              </p>
            ) : (
              <>
                {hosp?.checklists.length ? (
                  <ul className="file-list">
                    {hosp.checklists.map((c) => (
                      <li key={c.id}>
                        <span>
                          {c.title} · {c.progressPct}%
                        </span>
                        {c.pdfUrl ? (
                          <a href={c.pdfUrl} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {hosp?.files.length ? (
                  <ul className="file-list">
                    {hosp.files.map((f) => (
                      <li key={f.id}>
                        <a href={f.url} target="_blank" rel="noreferrer">
                          {f.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>
        ) : null}
      </div>
      <PortalStyles />
    </main>
  );
}

function PortalStyles() {
  return (
    <style jsx global>{`
      .vendor-portal {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem 1.25rem 3rem;
        background: linear-gradient(165deg, #0c0c0c 0%, #17140f 48%, #0f1010 100%);
        color: #f3eee6;
        font-family: Georgia, 'Times New Roman', serif;
      }
      .vendor-portal--session {
        display: block;
        place-items: initial;
      }
      .vendor-card {
        width: min(420px, 100%);
        display: grid;
        gap: 0.85rem;
      }
      .vendor-session {
        max-width: 760px;
        margin: 0 auto;
      }
      .session-head {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        align-items: flex-start;
        margin-bottom: 1.5rem;
      }
      .eyebrow {
        letter-spacing: 0.14em;
        text-transform: uppercase;
        font-size: 0.72rem;
        opacity: 0.65;
        margin: 0;
      }
      h1 {
        margin: 0.2rem 0 0.4rem;
        font-size: clamp(1.8rem, 4vw, 2.6rem);
        font-weight: 500;
      }
      .lead {
        opacity: 0.75;
        margin: 0;
      }
      .scopes {
        margin: 0.55rem 0 0;
        font-size: 0.85rem;
        opacity: 0.55;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      form {
        display: grid;
        gap: 0.65rem;
      }
      input {
        width: 100%;
        padding: 0.85rem 1rem;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.04);
        color: inherit;
        font-size: 1.1rem;
        letter-spacing: 0.12em;
      }
      button[type='submit'] {
        margin-top: 0.25rem;
        padding: 0.85rem 1.2rem;
        border: 0;
        border-radius: 999px;
        background: #c4a35a;
        color: #111;
        font-weight: 700;
        cursor: pointer;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      button.ghost {
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: transparent;
        color: inherit;
        border-radius: 999px;
        padding: 0.45rem 0.9rem;
        cursor: pointer;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.85rem;
      }
      .row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-top: 0.35rem;
      }
      .err {
        color: #ff8f8f;
        margin: 0;
      }
      .muted,
      .empty {
        opacity: 0.6;
      }
      a {
        color: #e2c27a;
      }
      h2 {
        margin: 1.75rem 0 0.65rem;
        font-size: 1.15rem;
      }
      .file-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 0.45rem;
      }
      .file-list li {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        align-items: center;
        padding: 0.65rem 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.92rem;
      }
      .tag {
        opacity: 0.5;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      code {
        font-size: 0.85em;
        opacity: 0.8;
      }
    `}</style>
  );
}
