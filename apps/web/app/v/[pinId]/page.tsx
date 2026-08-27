'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FlashMessage } from '@/components/ui/PageChrome';

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

const SCOPE_LABELS: Record<string, string> = {
  files: 'Archivos',
  checklists: 'Checklists',
  hospitality: 'Hospitality',
};

function scopeLabel(scope: string) {
  return SCOPE_LABELS[scope] || scope;
}

export default function VendorPortalPage() {
  const params = useParams();
  const pinId = params.pinId as string;
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
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
      <main className="auth-page">
        <div className="auth-card auth-card--vendor">
          <LoadingBlock rows={3} label="Cargando portal…" />
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-page">
        <div className="auth-card auth-card--vendor">
          <p className="eyebrow">arta · acceso vendor</p>
          <h1>Ingresa tu PIN</h1>
          <p className="lead">
            Portal externo para archivos, checklists y hospitality del evento. Link ID:{' '}
            <code>{pinId.slice(0, 8)}…</code>
          </p>
          <form className="form" onSubmit={onSubmit}>
            <label>
              PIN de acceso
              <div className="pass-field">
                <input
                  className="field"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  required
                  minLength={4}
                  autoFocus
                />
                <button
                  type="button"
                  className="pass-toggle"
                  onClick={() => setShowPin((v) => !v)}
                  aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                >
                  {showPin ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </label>
            {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}
            <button className="btn btn-login" type="submit" disabled={loading || pin.length < 4}>
              {loading ? 'Entrando…' : 'Entrar al portal'}
            </button>
          </form>
          <div className="row-actions auth-foot">
            <button type="button" className="btn ghost btn-sm" onClick={copyLink}>
              {copied ? 'Link copiado ✓' : 'Copiar link del portal'}
            </button>
            <Link href="/p/arta">← Sitio Arta</Link>
          </div>
        </div>
      </main>
    );
  }

  const hosp = session.hospitality;
  const meta = [session.event.artist, session.event.venue, session.event.city]
    .filter(Boolean)
    .join(' · ');
  const scopeText = session.scopes.map(scopeLabel).join(' · ') || '—';

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
              Acceso: {scopeText}
              {session.event.startsAt
                ? ` · ${new Date(session.event.startsAt).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}`
                : ''}
            </p>
          </div>
          <div className="row-actions">
            <button type="button" className="btn ghost btn-sm" onClick={() => refresh()} disabled={loading}>
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button type="button" className="btn ghost btn-sm" onClick={() => logout()}>
              Salir
            </button>
          </div>
        </header>

        {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}

        {session.scopes.includes('files') ? (
          <section className="vendor-section panel">
            <div className="panel-head">
              <h2>Archivos</h2>
              <span className="badge">{session.files.length}</span>
            </div>
            <div className="panel-body">
              {!session.files.length ? (
                <EmptyState
                  title="Sin archivos compartidos"
                  description="Cuando el equipo suba documentos para tu alcance, aparecerán aquí."
                />
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
            </div>
          </section>
        ) : null}

        {session.scopes.includes('checklists') ? (
          <section className="vendor-section panel">
            <div className="panel-head">
              <h2>Checklists / PDFs</h2>
              <span className="badge">{session.checklists.length}</span>
            </div>
            <div className="panel-body">
              {!session.checklists.length ? (
                <EmptyState
                  title="Sin checklists visibles"
                  description="Los formatos compartidos con tu PIN se listarán aquí con enlace al PDF."
                />
              ) : (
                <ul className="file-list">
                  {session.checklists.map((c) => (
                    <li key={c.id}>
                      <span className="file-list__label">
                        {c.title}
                        <span className="muted"> · {c.progressPct}%</span>
                      </span>
                      {c.pdfUrl ? (
                        <a href={c.pdfUrl} target="_blank" rel="noreferrer">
                          Ver PDF
                        </a>
                      ) : (
                        <span className="tag">sin PDF</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {session.scopes.includes('hospitality') ? (
          <section className="vendor-section panel">
            <div className="panel-head">
              <h2>Hospitality / rider</h2>
              <span className="badge">
                {(hosp?.checklists.length || 0) + (hosp?.files.length || 0)}
              </span>
            </div>
            <div className="panel-body">
              {!hosp?.checklists.length && !hosp?.files.length ? (
                <EmptyState
                  title="Sin materiales de hospitality"
                  description="Rider, catering y hospitalidad aparecerán cuando el equipo los comparta."
                />
              ) : (
                <>
                  {hosp?.checklists.length ? (
                    <ul className="file-list">
                      {hosp.checklists.map((c) => (
                        <li key={c.id}>
                          <span className="file-list__label">
                            {c.title}
                            <span className="muted"> · {c.progressPct}%</span>
                          </span>
                          {c.pdfUrl ? (
                            <a href={c.pdfUrl} target="_blank" rel="noreferrer">
                              Ver PDF
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
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
