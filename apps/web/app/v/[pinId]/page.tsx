'use client';

import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type Session = {
  event: {
    id: string;
    name: string;
    artist?: string | null;
    venue?: string | null;
    city?: string | null;
    entity: string;
    status: string;
  };
  label: string;
  scopes: string[];
  files: Array<{ id: string; fileName: string; url: string; kind?: string | null }>;
  checklists: Array<{
    id: string;
    title: string;
    progressPct: number;
    pdfUrl?: string | null;
    template?: { key: string } | null;
  }>;
};

export default function VendorPortalPage() {
  const params = useParams();
  const pinId = params.pinId as string;
  const [pin, setPin] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/vendor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinId, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  if (!session) {
    return (
      <main className="vendor-portal">
        <div className="vendor-card">
          <p className="eyebrow">arta · acceso vendor</p>
          <h1>Ingresa tu PIN</h1>
          <p className="lead">Portal externo para archivos y checklists del evento.</p>
          <form onSubmit={onSubmit}>
            <input
              type="password"
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
          <Link href="/p/arta">← Sitio Arta</Link>
        </div>
        <style jsx>{`
          .vendor-portal {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 2rem;
            background: linear-gradient(160deg, #0d0d0d, #1a1612 50%, #101010);
            color: #f3eee6;
            font-family: Georgia, 'Times New Roman', serif;
          }
          .vendor-card {
            width: min(420px, 100%);
            display: grid;
            gap: 0.85rem;
          }
          .eyebrow {
            letter-spacing: 0.14em;
            text-transform: uppercase;
            font-size: 0.72rem;
            opacity: 0.65;
            margin: 0;
          }
          h1 {
            margin: 0;
            font-size: 2rem;
          }
          .lead {
            opacity: 0.75;
            margin: 0 0 0.5rem;
          }
          input {
            width: 100%;
            padding: 0.85rem 1rem;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            background: rgba(255, 255, 255, 0.04);
            color: inherit;
            font-size: 1rem;
          }
          button {
            margin-top: 0.5rem;
            padding: 0.85rem 1.2rem;
            border: 0;
            border-radius: 999px;
            background: #c4a35a;
            color: #111;
            font-weight: 700;
            cursor: pointer;
          }
          .err {
            color: #ff8f8f;
            margin: 0;
          }
          a {
            color: inherit;
            opacity: 0.7;
            margin-top: 1rem;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="vendor-portal">
      <div className="vendor-session">
        <p className="eyebrow">
          {session.event.entity} · {session.label}
        </p>
        <h1>{session.event.name}</h1>
        <p className="lead">
          {[session.event.artist, session.event.venue, session.event.city].filter(Boolean).join(' · ')}
        </p>

        {session.scopes.includes('files') ? (
          <section>
            <h2>Archivos</h2>
            <ul>
              {session.files.map((f) => (
                <li key={f.id}>
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {f.fileName}
                  </a>
                </li>
              ))}
              {!session.files.length ? <li className="muted">Sin archivos</li> : null}
            </ul>
          </section>
        ) : null}

        {session.scopes.includes('checklists') ? (
          <section>
            <h2>Checklists / PDFs</h2>
            <ul>
              {session.checklists.map((c) => (
                <li key={c.id}>
                  {c.title} · {c.progressPct}%
                  {c.pdfUrl ? (
                    <>
                      {' '}
                      ·{' '}
                      <a href={c.pdfUrl} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <style jsx>{`
        .vendor-portal {
          min-height: 100vh;
          padding: 3rem 1.25rem 4rem;
          background: linear-gradient(160deg, #0d0d0d, #1a1612 50%, #101010);
          color: #f3eee6;
          font-family: Georgia, 'Times New Roman', serif;
        }
        .vendor-session {
          max-width: 720px;
          margin: 0 auto;
        }
        .eyebrow {
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-size: 0.72rem;
          opacity: 0.65;
        }
        h1 {
          margin: 0.2rem 0 0.4rem;
          font-size: clamp(1.8rem, 4vw, 2.6rem);
        }
        .lead {
          opacity: 0.75;
        }
        h2 {
          margin: 2rem 0 0.75rem;
          font-size: 1.15rem;
        }
        ul {
          padding-left: 1.1rem;
          line-height: 1.7;
        }
        a {
          color: #e2c27a;
        }
        .muted {
          opacity: 0.6;
        }
      `}</style>
    </main>
  );
}
