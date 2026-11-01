'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Las preguntas del panel, en su propio diálogo y no en el `confirm`/`prompt` del
 * navegador: con el tema de la entidad, el botón que dice lo que va a pasar y
 * cancelar de verdad (`window.prompt(...) || ''` seguía adelante al cancelar).
 *
 *   if (!(await askConfirm({ title: '¿Eliminar archivo?', danger: true }))) return;
 *   const note = await askPrompt({ title: 'Motivo del reemplazo' });
 *   if (note === null) return;
 *
 * Basta montar `<AskDialogHost />` una vez (va en `(app)/layout`). Lo que tenga
 * que contestar sin esperar —salir con cambios sin guardar— sigue con `confirm`.
 */

export type AskConfirm = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** La acción destruye algo: el botón va en rojo. */
  danger?: boolean;
};

export type AskPrompt = {
  title: string;
  body?: ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  /** No deja continuar con el campo vacío. */
  required?: boolean;
};

type Pending =
  | { kind: 'confirm'; opts: AskConfirm; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; opts: AskPrompt; resolve: (value: string | null) => void };

let show: ((pending: Pending) => void) | null = null;

export function askConfirm(opts: AskConfirm): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(opts.title));
  return new Promise((resolve) => show?.({ kind: 'confirm', opts, resolve }));
}

export function askPrompt(opts: AskPrompt): Promise<string | null> {
  if (!show) return Promise.resolve(window.prompt(opts.title, opts.defaultValue));
  return new Promise((resolve) => show?.({ kind: 'prompt', opts, resolve }));
}

export function AskDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    show = setPending;
    return () => {
      show = null;
    };
  }, []);

  if (!pending) return null;
  return createPortal(<AskDialog key={pending.opts.title} pending={pending} onDone={() => setPending(null)} />, document.body);
}

function AskDialog({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const [value, setValue] = useState(pending.kind === 'prompt' ? pending.opts.defaultValue || '' : '');
  const boxRef = useRef<HTMLFormElement | null>(null);
  const { opts } = pending;
  const danger = pending.kind === 'confirm' && pending.opts.danger;
  const blocked = pending.kind === 'prompt' && pending.opts.required && !value.trim();

  function finish(ok: boolean) {
    if (pending.kind === 'confirm') pending.resolve(ok);
    else pending.resolve(ok ? value.trim() : null);
    onDone();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!blocked) finish(true);
  }

  // Foco adentro y de regreso al botón que abrió la pregunta; la página de atrás no se mueve.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    boxRef.current?.querySelector<HTMLElement>('[data-ask-focus]')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(
      boxRef.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? [],
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="askd-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish(false);
      }}
    >
      <form
        ref={boxRef}
        className="askd"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="askd-title"
        onSubmit={submit}
        onKeyDown={onKeyDown}
      >
        <h2 className="askd__title" id="askd-title">
          {opts.title}
        </h2>
        {opts.body ? <div className="askd__body">{opts.body}</div> : null}
        {pending.kind === 'prompt' ? (
          <label className="askd__field">
            {pending.opts.label ? <span>{pending.opts.label}</span> : null}
            <input
              className="field"
              data-ask-focus
              aria-label={pending.opts.label ? undefined : opts.title}
              value={value}
              placeholder={pending.opts.placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        ) : null}
        <div className="askd__actions">
          <button className="btn ghost" type="button" onClick={() => finish(false)}>
            {pending.kind === 'confirm' ? pending.opts.cancelLabel || 'Cancelar' : 'Cancelar'}
          </button>
          <button
            className={`btn ${danger ? 'danger' : ''}`}
            type="submit"
            disabled={blocked}
            data-ask-focus={pending.kind === 'confirm' ? true : undefined}
          >
            {opts.confirmLabel || (danger ? 'Eliminar' : 'Aceptar')}
          </button>
        </div>
      </form>
    </div>
  );
}
