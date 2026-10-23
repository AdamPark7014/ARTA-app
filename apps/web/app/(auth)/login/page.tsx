'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { useUser } from '@/lib/user-context';
import {
  entityFromHost,
  panelLoginUrl,
  publicSiteUrl,
  safePanelPath,
} from '@/lib/domains';

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Safari (Llavero, códigos de verificación de Contraseñas/Mensajes) puede
    // rellenar los campos sin que React se entere: manda lo que de verdad está
    // escrito en el formulario, no solo lo que quedó en el estado.
    const fd = new FormData(e.currentTarget);
    const typedEmail = String(fd.get('email') ?? email);
    const typedPassword = String(fd.get('password') ?? password);
    // El código TOTP son solo dígitos; el autollenado puede traer «123 456» o «123-456».
    const typedCode = String(fd.get('code') ?? totpCode).replace(/\D/g, '');
    setEmail(typedEmail);
    setPassword(typedPassword);
    setTotpCode(typedCode);
    setBusy(true);
    setError('');
    try {
      if (enrollToken) {
        await completeEnrollment(enrollToken, typedCode);
        router.replace(nextPath);
        return;
      }
      if (challengeId) {
        await verify2fa(challengeId, typedCode);
        router.replace(nextPath);
        return;
      }
      const result = await login(typedEmail.trim().toLowerCase(), typedPassword);
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

  const panelContext = useMemo(() => {
    if (typeof window === 'undefined') {
      return { title: 'Acceso al panel', hint: 'Operación Arta y Auditorio Arema', entity: null };
    }
    const hostEntity = entityFromHost(window.location.hostname);
    if (hostEntity === 'EXPLANADA') {
      return {
        title: 'Panel Auditorio Arema',
        hint: 'Explanada · operación y cierre del auditorio',
        entity: 'EXPLANADA' as const,
      };
    }
    if (hostEntity === 'ARTA') {
      return {
        title: 'Panel Arta Producciones',
        hint: 'Eventos, formatos, finanzas y Studio',
        entity: 'ARTA' as const,
      };
    }
    return { title: 'Acceso al panel', hint: 'Elige el subdominio de tu entidad', entity: null };
  }, []);

  const marketingUrl = publicSiteUrl();
  const entityName =
    panelContext.entity === 'EXPLANADA' ? 'Auditorio Arema' : panelContext.entity === 'ARTA' ? 'Arta Producciones' : 'Arta y Auditorio';

  return (
    <div className={`lg ${panelContext.entity === 'EXPLANADA' ? 'lg--audi' : 'lg--arta'}`}>
      <aside className="lg-brand">
        <div className="lg-brand__glow" aria-hidden />
        <div className="lg-brand__top">
          {panelContext.entity === 'EXPLANADA' ? (
            <div className="login-wordmark" role="img" aria-label="EXPLANADA · Auditorio Arema">
              <span className="brand-wordmark__mark" aria-hidden>
                EXPLANADA
              </span>
              <span className="login-wordmark__sub" aria-hidden>
                Auditorio Arema
              </span>
            </div>
          ) : (
            <Image
              src="/brand/arta-logo-ink.png"
              alt="arta producciones — La experiencia del Show"
              width={176}
              height={96}
              priority
              className="lg-brand__logo"
            />
          )}
        </div>
        <div className="lg-brand__copy">
          <p className="lg-brand__tagline">La experiencia del Show</p>
          <p className="lg-brand__text">
            Eventos, formatos, órdenes de compra, boletera y sitio web: todo el trabajo del equipo en un solo lugar.
          </p>
        </div>
        <nav className="lg-brand__links" aria-label="Otros sitios">
          <Link href="/p/arta">Sitio web Arta</Link>
          <a href={panelLoginUrl('ARTA')}>Panel Arta</a>
          <a href={panelLoginUrl('EXPLANADA')}>Panel Auditorio</a>
        </nav>
      </aside>

      <main className="lg-main">
        <div className="lg-card">
          <p className="lg-card__eyebrow">{entityName}</p>
          <h1 className="lg-card__title">
            {enrollToken
              ? 'Activa la verificación en dos pasos'
              : challengeId
                ? 'Verificación 2FA'
                : panelContext.title}
          </h1>
          <p className="lg-card__sub">
            {enrollToken
              ? 'Tu organización pide verificación en dos pasos. Escanea el código con tu app autenticadora y confirma con un código.'
              : challengeId
                ? 'Escribe el código de seis dígitos de tu app autenticadora.'
                : 'Entra con tu correo de trabajo.'}
          </p>
          <form className="form lg-form" onSubmit={onSubmit} autoComplete="on">
            {!in2faStep ? (
              <>
                <label>
                  Correo
                  <input
                    className="field"
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
                  <span className="pass-field">
                    <input
                      className="field"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPass ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      placeholder="Tu contraseña"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="pass-toggle"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      aria-pressed={showPass}
                    >
                      {showPass ? 'Ocultar' : 'Ver'}
                    </button>
                  </span>
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
                    className="field"
                    name="code"
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
                Código de verificación
                <input
                  className="field"
                  name="code"
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
            {/* Sin «deshabilitado si está vacío»: si Safari autollenó sin avisar a
                React, el botón se quedaba gris aunque los campos tuvieran datos. Los
                `required` del formulario ya frenan el envío vacío. */}
            <button className="btn btn-login" type="submit" disabled={busy}>
              {busy ? 'Verificando…' : enrollToken ? 'Activar y entrar' : challengeId ? 'Confirmar' : 'Entrar'}
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
          <p className="lg-card__foot">
            Acceso solo para el equipo · <a href={marketingUrl}>Ir al sitio público</a>
          </p>
        </div>
      </main>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="lg lg--arta">
      <aside className="lg-brand" aria-hidden>
        <div className="lg-brand__glow" />
      </aside>
      <main className="lg-main">
        <div className="lg-card">
          <LoadingBlock rows={4} label="Preparando acceso…" />
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
