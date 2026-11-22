'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLayer, useLayerHost } from './Modal';

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
 *
 * El botón dice la acción, nunca «Aceptar»: pasa `confirmLabel` («Eliminar tarea»,
 * «Desactivar», «Cerrar evento»). Si falta, sale del verbo del título
 * («¿Eliminar la carpeta «X»?» → «Eliminar carpeta»). Cuando la acción misma es
 * cancelar algo («¿Cancelar el evento?») los botones son «Sí, cancelar evento» y
 * «No, volver». En una pregunta destructiva el foco empieza en «Cancelar»: un Enter
 * de más no borra nada.
 */

export type AskConfirm = {
  title: string;
  body?: ReactNode;
  /** El verbo de la acción («Eliminar tarea»). Sin él se arma con el verbo del título. */
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
  return <AskDialog key={pending.opts.title} pending={pending} onDone={() => setPending(null)} />;
}

const SKIP = new Set(['el', 'la', 'los', 'las', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'un', 'una', 'tu', 'su', 'todo', 'toda', 'todos', 'todas', 'de', 'a']);

/**
 * Botón a partir del título: «¿Eliminar la carpeta «X»?» → «Eliminar carpeta»,
 * «¿Quitar «X»?» → «Quitar». Si el título no empieza con un verbo, «Continuar».
 */
export function actionFromTitle(title: string): { verb: string; label: string } {
  const words = title.replace(/^[¿\s]+/, '').split(/\s+/);
  const verb = words[0]?.replace(/[?¿,.:;!]+$/, '') || '';
  if (!/^[A-ZÁÉÍÓÚÑa-záéíóúñ]+(ar|er|ir)(lo|la|los|las|le|les)?$/.test(verb)) return { verb: '', label: 'Continuar' };
  const rest = words.slice(1);
  while (rest.length && SKIP.has(rest[0].toLowerCase())) rest.shift();
  const noun = rest[0]?.replace(/[?¿,.:;!]+$/, '') || '';
  const STOP = new Set(['por', 'para', 'con', 'en', 'al', 'del', 'sin', 'y', 'o', 'que', 'como', 'ya']);
  const plain = /^[a-záéíóúñ]+[?¿,.:;!]*$/.test(rest[0] || '') && !STOP.has(noun);
  const nice = verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase();
  return { verb: nice, label: plain ? `${nice} ${noun}` : nice };
}

function AskDialog({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const [value, setValue] = useState(pending.kind === 'prompt' ? pending.opts.defaultValue || '' : '');
  const host = useLayerHost(true);
  const boxRef = useRef<HTMLFormElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const { opts } = pending;
  const danger = pending.kind === 'confirm' && !!pending.opts.danger;
  const blocked = pending.kind === 'prompt' && pending.opts.required && !value.trim();

  const derived = actionFromTitle(opts.title);
  // La acción es cancelar algo: «Sí, cancelar evento» / «No, volver», nunca «Cancelar» contra «Cancelar».
  const cancelsSomething = derived.verb === 'Cancelar';
  const confirmText =
    opts.confirmLabel || (cancelsSomething ? `Sí, ${derived.label.toLowerCase()}` : derived.label);
  const cancelText =
    (pending.kind === 'confirm' && pending.opts.cancelLabel) || (cancelsSomething || /^cancelar\b/i.test(confirmText) ? 'No, volver' : 'Cancelar');

  function finish(ok: boolean) {
    if (pending.kind === 'confirm') pending.resolve(ok);
    else pending.resolve(ok ? value.trim() : null);
    onDone();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!blocked) finish(true);
  }

  const onKeyDown = useLayer({
    host,
    box: boxRef,
    onEscape: () => finish(false),
    focusFirst: () => boxRef.current?.querySelector<HTMLElement>('[data-ask-focus]')?.focus({ preventScroll: true }),
  });

  if (!host) return null;

  return createPortal(
    <div
      className="askd-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish(false);
      }}
    >
      <form
        ref={boxRef}
        className={`askd ${danger ? 'askd--danger' : ''}`.trim()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={opts.body ? bodyId : undefined}
        onSubmit={submit}
        onKeyDown={onKeyDown}
        noValidate
      >
        <h2 className="askd__title" id={titleId}>
          {opts.title}
        </h2>
        {opts.body ? (
          <div className="askd__body" id={bodyId}>
            {opts.body}
          </div>
        ) : null}
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
          <button
            className="btn ghost"
            type="button"
            onClick={() => finish(false)}
            data-ask-focus={pending.kind === 'confirm' && danger ? true : undefined}
          >
            {cancelText}
          </button>
          <button
            className={`btn ${danger ? 'danger' : ''}`.trim()}
            type="submit"
            disabled={blocked}
            data-ask-focus={pending.kind === 'confirm' && !danger ? true : undefined}
          >
            {confirmText}
          </button>
        </div>
      </form>
    </div>,
    host,
  );
}
