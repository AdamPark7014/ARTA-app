'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useUser } from '@/lib/user-context';
import { safePanelPath } from '@/lib/domains';

function LoginForm() {
  const { login, verify2fa, setupEnrollmentTotp, completeEnrollment, user, loading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safePanelPath(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [enrollToken, setEnrollToken] = useState<string | null>(null);
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace(nextPath);
  }, [loading, user, router, nextPath]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (enrollToken) {
        await completeEnrollment(enrollToken, totpCode.trim());
        router.replace(nextPath);
        return;
      }
      if (challengeId) {
        await verify2fa(challengeId, totpCode.trim());
        router.replace(nextPath);
        return;
      }
      const result = await login(email.trim().toLowerCase(), password);
      if ('requires2fa' in result && result.requires2fa) {
        setChallengeId(result.challengeId);
        return;
      }
      if ('requiresTotpEnrollment' in result && result.requiresTotpEnrollment) {
        const setup = await setupEnrollmentTotp(result.enrollToken);
        setEnrollToken(result.enrollToken);
        setEnrollQr(setup.qrDataUrl);
        setEnrollSecret(setup.secret);
        return;
      }
      router.replace(nextPath);
    } catch {
      setError(
        enrollToken
          ? 'Código incorrecto. Verifica la hora de tu dispositivo e inténtalo de nuevo.'
          : challengeId
            ? 'Código 2FA incorrecto.'
            : 'Correo o contraseña incorrectos.',
      );
    } finally {
      setBusy(false);
    }
  }

  const in2faStep = !!challengeId || !!enrollToken;

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
          <h1>
            {enrollToken ? 'Activa la verificación en dos pasos' : challengeId ? 'Verificación 2FA' : 'Acceso al panel'}
          </h1>
          <p className="login-sub">
            {enrollToken
              ? 'Tu organización requiere 2FA. Escanea el código con tu app autenticadora y confirma con un código.'
              : challengeId
                ? 'Introduce el código de tu app autenticadora'
                : 'Usa tu correo corporativo'}
          </p>
          <form className="form" onSubmit={onSubmit} autoComplete="on">
            {!in2faStep ? (
              <>
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
              </>
            ) : enrollToken ? (
              <>
                {enrollQr ? (
                  <div className="totp-enroll-qr">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, no next/image benefit */}
                    <img src={enrollQr} alt="Código QR para configurar 2FA" width={180} height={180} />
                    {enrollSecret ? (
                      <p className="totp-enroll-secret">
                        ¿No puedes escanear? Clave manual: <code>{enrollSecret}</code>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <label>
                  Código de la app autenticadora
                  <input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    required
                    autoFocus
                    minLength={6}
                  />
                </label>
              </>
            ) : (
              <label>
                Código TOTP
                <input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  required
                  autoFocus
                  minLength={6}
                />
              </label>
            )}
            {error ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : null}
            <button
              className="btn btn-login"
              type="submit"
              disabled={busy || (!in2faStep && (!email || !password)) || (in2faStep && !totpCode)}
            >
              {busy ? 'Verificando…' : enrollToken ? 'Activar y entrar' : challengeId ? 'Confirmar 2FA' : 'Entrar'}
            </button>
            {in2faStep ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setChallengeId(null);
                  setEnrollToken(null);
                  setEnrollQr(null);
                  setEnrollSecret(null);
                  setTotpCode('');
                }}
              >
                Volver
              </button>
            ) : null}
          </form>
          <p className="login-foot-note">Acceso restringido al equipo Arta / Auditorio Arema</p>
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
