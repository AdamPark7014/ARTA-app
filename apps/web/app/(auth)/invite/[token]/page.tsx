'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FlashMessage } from '@/components/ui/PageChrome';

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
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">arta ops · invitación</p>
        {loading ? <p className="muted">Validando invitación…</p> : null}
        {!loading && error && !preview ? (
          <>
            <h1>Invitación no disponible</h1>
            <p className="lead">{error}</p>
            <p className="auth-foot">
              <Link href="/login">Ir a login</Link>
            </p>
          </>
        ) : null}
        {preview ? (
          <>
            <h1>Únete a {preview.organization.name}</h1>
            <p className="lead">
              {preview.email} · rol <code>{preview.roleKey}</code> · {preview.entities.join(', ')}
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
              {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}
              <button className="btn btn-login" type="submit" disabled={saving}>
                {saving ? 'Entrando…' : 'Aceptar e ingresar'}
              </button>
            </form>
            <p className="auth-foot">
              <Link href="/login">¿Ya tienes sesión? Login</Link>
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
