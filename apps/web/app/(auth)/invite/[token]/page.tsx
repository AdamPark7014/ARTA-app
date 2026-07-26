'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type Preview = {
  email: string;
  roleKey: string;
  entities: string[];
  expiresAt: string;
  organization: { id: string; name: string; slug: string; plan: string };
  existingAccount: boolean;
};

export default function AcceptInvitePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: '', password: '', title: '' });

  useEffect(() => {
    setLoading(true);
    fetch(`/api/invites/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
        setPreview(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Invitación no válida'))
      .finally(() => setLoading(false));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aceptar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="invite-page">
      <div className="invite-card">
        <p className="eyebrow">arta ops · invitación</p>
        {loading ? <p className="muted">Validando invitación…</p> : null}
        {!loading && error && !preview ? (
          <>
            <h1>Invitación no disponible</h1>
            <p className="lead">{error}</p>
            <Link href="/login">Ir a login</Link>
          </>
        ) : null}
        {preview ? (
          <>
            <h1>Únete a {preview.organization.name}</h1>
            <p className="lead">
              {preview.email} · rol <code>{preview.roleKey}</code> ·{' '}
              {preview.entities.join(', ')}
            </p>
            {preview.existingAccount ? (
              <p className="note">
                Ya tienes cuenta con este email: al aceptar actualizarás tu org primaria y
                contraseña.
              </p>
            ) : null}
            <form onSubmit={onSubmit}>
              <label>
                Nombre completo
                <input
                  required
                  minLength={2}
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </label>
              <label>
                Título (opcional)
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="mín. 8 caracteres"
                />
              </label>
              {error ? <p className="err">{error}</p> : null}
              <button type="submit" disabled={saving}>
                {saving ? 'Entrando…' : 'Aceptar e ingresar'}
              </button>
            </form>
            <Link href="/login">¿Ya tienes sesión? Login</Link>
          </>
        ) : null}
      </div>
      <style jsx>{`
        .invite-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 2rem;
          background: radial-gradient(ellipse at 20% 0%, #1c2420, #0e1210 55%, #0a0c0b);
          color: #eef2ef;
          font-family: 'Segoe UI', system-ui, sans-serif;
        }
        .invite-card {
          width: min(440px, 100%);
          display: grid;
          gap: 0.85rem;
        }
        .eyebrow {
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-size: 0.72rem;
          opacity: 0.6;
          margin: 0;
        }
        h1 {
          margin: 0;
          font-size: 1.85rem;
          font-weight: 650;
          letter-spacing: -0.02em;
        }
        .lead,
        .muted,
        .note {
          opacity: 0.78;
          margin: 0;
          line-height: 1.45;
        }
        .note {
          font-size: 0.9rem;
          padding: 0.65rem 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
        }
        form {
          display: grid;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }
        label {
          display: grid;
          gap: 0.35rem;
          font-size: 0.85rem;
          opacity: 0.9;
        }
        input {
          padding: 0.75rem 0.9rem;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.04);
          color: inherit;
          font-size: 1rem;
        }
        button {
          margin-top: 0.35rem;
          padding: 0.85rem 1.1rem;
          border: 0;
          border-radius: 8px;
          background: #8fbf4a;
          color: #111;
          font-weight: 700;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.6;
        }
        .err {
          color: #ff8f8f;
          margin: 0;
        }
        a {
          color: inherit;
          opacity: 0.65;
          margin-top: 0.5rem;
        }
        code {
          font-size: 0.9em;
        }
      `}</style>
    </main>
  );
}
