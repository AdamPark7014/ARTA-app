'use client';



import { FormEvent, useEffect, useState } from 'react';

import { useParams, useRouter } from 'next/navigation';

import Image from 'next/image';

import Link from 'next/link';

import { ROLE_LABELS } from '@arta/rbac';

import { EmptyState } from '@/components/ui/EmptyState';

import { LoadingBlock } from '@/components/ui/LoadingBlock';

import { FlashMessage, FormGrid } from '@/components/ui/PageChrome';



type Preview = {

  email: string;

  roleKey: string;

  entities: string[];

  expiresAt: string;

  organization: { id: string; name: string; slug: string; plan: string };

  existingAccount: boolean;

};



const ENTITY_LABELS: Record<string, string> = {

  ARTA: 'Arta Producciones',

  EXPLANADA: 'Auditorio Arema · Explanada',

};



function roleLabel(key: string) {

  return ROLE_LABELS[key as keyof typeof ROLE_LABELS] || key;

}



function entityLabel(key: string) {

  return ENTITY_LABELS[key] || key;

}



export default function AcceptInvitePage() {

  const params = useParams();

  const token = params.token as string;

  const router = useRouter();

  const [preview, setPreview] = useState<Preview | null>(null);

  const [error, setError] = useState('');

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [showPass, setShowPass] = useState(false);

  const [form, setForm] = useState({ fullName: '', password: '', password2: '', title: '' });



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

    if (form.password !== form.password2) {

      setError('Las contraseñas no coinciden');

      return;

    }

    setSaving(true);

    setError('');

    try {

      const res = await fetch(`/api/invites/${encodeURIComponent(token)}/accept`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        credentials: 'include',

        body: JSON.stringify({

          fullName: form.fullName,

          password: form.password,

          title: form.title,

        }),

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



  const expiresLabel = preview?.expiresAt

    ? new Date(preview.expiresAt).toLocaleString('es-MX', {

        day: 'numeric',

        month: 'long',

        year: 'numeric',

        hour: '2-digit',

        minute: '2-digit',

      })

    : null;



  return (

    <main className="auth-page">

      <div className="auth-card auth-card--invite">

        <div className="auth-card__brand">

          <Image

            src="/brand/arta-logo.png"

            alt="arta"

            width={120}

            height={48}

            className="auth-card__logo"

          />

        </div>

        <p className="eyebrow">Invitación al panel</p>

        {loading ? <LoadingBlock rows={4} label="Validando invitación…" /> : null}

        {!loading && error && !preview ? (

          <EmptyState

            title="Invitación no disponible"

            description={error}

            actionHref="/login"

            actionLabel="Ir a login"

          />

        ) : null}

        {preview ? (

          <>

            <h1>Únete a {preview.organization.name}</h1>

            <p className="lead">

              Cuenta para <strong>{preview.email}</strong>

            </p>

            <div className="invite-meta">

              <span className="badge arta">{roleLabel(preview.roleKey)}</span>

              <span className="muted">

                {preview.entities.map(entityLabel).join(' · ')}

              </span>

            </div>

            {expiresLabel ? (

              <p className="invite-expiry muted">Válida hasta {expiresLabel}</p>

            ) : null}

            {preview.existingAccount ? (

              <FlashMessage variant="info">

                Ya tienes cuenta con este correo: al aceptar actualizarás tu organización y contraseña.

              </FlashMessage>

            ) : null}

            <form className="form" onSubmit={onSubmit}>

              <label>

                Nombre completo

                <input

                  className="field"

                  required

                  minLength={2}

                  value={form.fullName}

                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}

                  autoFocus

                />

              </label>

              <label>

                Título (opcional)

                <input

                  className="field"

                  value={form.title}

                  onChange={(e) => setForm({ ...form, title: e.target.value })}

                  placeholder="Ej. Coordinador de producción"

                />

              </label>

              <FormGrid>

                <label>

                  Contraseña

                  <div className="pass-field">

                    <input

                      className="field"

                      type={showPass ? 'text' : 'password'}

                      required

                      minLength={8}

                      value={form.password}

                      onChange={(e) => setForm({ ...form, password: e.target.value })}

                      placeholder="mín. 8 caracteres"

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

                <label>

                  Confirmar contraseña

                  <input

                    className="field"

                    type={showPass ? 'text' : 'password'}

                    required

                    minLength={8}

                    value={form.password2}

                    onChange={(e) => setForm({ ...form, password2: e.target.value })}

                  />

                </label>

              </FormGrid>

              {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}

              <button className="btn btn-login" type="submit" disabled={saving}>

                {saving ? 'Entrando…' : 'Aceptar e ingresar'}

              </button>

            </form>

            <p className="auth-foot">

              <Link href="/login">¿Ya tienes sesión? Inicia sesión</Link>

            </p>

          </>

        ) : null}

      </div>

    </main>

  );

}


