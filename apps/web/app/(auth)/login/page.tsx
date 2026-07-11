'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useUser } from '@/lib/user-context';

function LoginForm() {
  const { login, user, loading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(nextPath.startsWith('/') ? nextPath : '/dashboard');
  }, [loading, user, router, nextPath]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace(nextPath.startsWith('/') ? nextPath : '/dashboard');
    } catch {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap login-pro">
      <div className="login-stage" aria-hidden />
      <div className="login-layout">
        <aside className="login-brand-panel">
          <Image
            src="/brand/arta-logo.png"
            alt="arta — La experiencia del Show"
            width={320}
            height={160}
            priority
            className="login-logo"
          />
          <p className="login-tagline">La experiencia del Show</p>
          <p className="login-brand-copy">
            Operación de eventos Arta Producciones y Auditorio Arema Explanada.
            Checklists, finanzas, boletera y Studio en un solo panel.
          </p>
          <div className="login-brand-links">
            <Link href="/p/arta">Sitio web Arta</Link>
          </div>
        </aside>

        <div className="login-card login-card-pro">
          <h1>Acceso al panel</h1>
          <p className="login-sub">Usa tu correo corporativo</p>
          <form className="form" onSubmit={onSubmit} autoComplete="on">
            <label>
              Correo
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                name="email"
                autoComplete="username"
                placeholder="tu@correo.com"
                required
                autoFocus
              />
            </label>
            <label>
              Contraseña
              <div className="pass-field">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="pass-toggle"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </label>
            {error ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : null}
            <button className="btn btn-login" type="submit" disabled={busy || !email || !password}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <p className="login-foot-note">
            Acceso restringido al equipo Arta / Auditorio Arema
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-wrap">
          <p className="muted">Cargando…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
