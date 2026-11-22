'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Ventana del sistema. Una sola pieza para toda capa (entregar tarea, detalle de
 * anticipo, visor, formularios cortos): portal, role=dialog, aria-modal, título
 * enlazado, foco al primer campo (o al título), Tab atrapado, Esc y clic fuera
 * cierran, el foco vuelve a quien la abrió, el resto del panel queda `inert` y el
 * fondo no se desplaza. En el teléfono (<640 px) es hoja desde abajo con el pie fijo.
 *
 *   <Modal
 *     open={open}
 *     title="Entregar tarea"
 *     onClose={() => setOpen(false)}
 *     footer={
 *       <>
 *         <button className="btn ghost" type="button" onClick={close}>Cancelar</button>
 *         <button className="btn" type="submit" form="entrega">Enviar entrega</button>
 *       </>
 *     }
 *   >
 *     <form id="entrega" onSubmit={…}>…</form>
 *   </Modal>
 *
 * - `footer`: [Cancelar en contorno] [principal relleno], en ese orden. Nada de «Cerrar»
 *   y «Cancelar» a la vez: la × de la cabecera ya cierra.
 * - `busy`: mientras guarda, ni Esc, ni clic fuera, ni la × la cierran.
 * - `initialFocus`: ref del control que recibe el foco; si no, `[data-autofocus]`, luego
 *   el primer campo y, si no hay, el título.
 * - `size`: 'sm' 420 px · 'md' 560 px (por defecto) · 'lg' 760 px.
 * - Las preguntas de sí/no van con `askConfirm` (AskDialog), no con esta ventana.
 */

type Props = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Una línea bajo el título: qué se va a hacer. */
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  busy?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Texto accesible de la ×. */
  closeLabel?: string;
  className?: string;
};

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const FIELDS = 'input:not(:disabled):not([type="hidden"]):not([type="file"]), select:not(:disabled), textarea:not(:disabled)';

/** Capas abiertas, la última arriba: Esc y el Tab atrapado son solo de la de arriba. */
const stack: HTMLElement[] = [];
let lockCount = 0;
let lockedOverflow = '';

function isTop(node: HTMLElement | null) {
  return !!node && stack[stack.length - 1] === node;
}

/**
 * Comportamiento de capa compartido por `Modal` y `AskDialog`: entra a la pila,
 * deja `inert` al resto del documento, congela el desplazamiento del fondo, pone el
 * foco y lo devuelve al cerrar. Devuelve el manejador de teclado (Esc y Tab).
 */
export function useLayer({
  host,
  box,
  onEscape,
  focusFirst,
}: {
  host: HTMLElement | null;
  box: RefObject<HTMLElement | null>;
  onEscape: () => void;
  focusFirst: () => void;
}) {
  const escape = useRef(onEscape);
  escape.current = onEscape;
  const first = useRef(focusFirst);
  first.current = focusFirst;

  useEffect(() => {
    if (!host) return;
    const before = document.activeElement as HTMLElement | null;
    stack.push(host);

    // El resto del documento: ni foco, ni lector de pantalla, ni clics.
    const muted: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === host || el.hasAttribute('inert') || el.tagName === 'SCRIPT') continue;
      el.setAttribute('inert', '');
      muted.push(el);
    }

    if (lockCount === 0) {
      lockedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    const raf = requestAnimationFrame(() => first.current());

    return () => {
      cancelAnimationFrame(raf);
      const i = stack.lastIndexOf(host);
      if (i >= 0) stack.splice(i, 1);
      for (const el of muted) el.removeAttribute('inert');
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = lockedOverflow;
      if (before && document.contains(before)) before.focus?.({ preventScroll: true });
    };
  }, [host]);

  return function onKeyDown(e: React.KeyboardEvent) {
    if (!isTop(host)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      escape.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === firstItem || !box.current?.contains(active))) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && (active === lastItem || !box.current?.contains(active))) {
      e.preventDefault();
      firstItem.focus();
    }
  };
}

/** Nodo propio en <body> para la capa: así se puede dejar `inert` todo lo demás. */
export function useLayerHost(open: boolean) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const node = document.createElement('div');
    node.className = 'layer-host';
    document.body.appendChild(node);
    setHost(node);
    return () => {
      node.remove();
      setHost(null);
    };
  }, [open]);
  return host;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  description,
  footer,
  size = 'md',
  busy = false,
  initialFocus,
  closeLabel = 'Cerrar',
  className = '',
}: Props) {
  const host = useLayerHost(open);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const titleId = useId();
  const descId = useId();

  function requestClose() {
    if (!busy) onClose();
  }

  const onKeyDown = useLayer({
    host,
    box: boxRef,
    onEscape: requestClose,
    focusFirst: () => {
      const box = boxRef.current;
      if (!box) return;
      const target =
        initialFocus?.current ||
        box.querySelector<HTMLElement>('[data-autofocus]') ||
        box.querySelector<HTMLElement>(`.layer__body ${FIELDS.split(', ').join(', .layer__body ')}`) ||
        titleRef.current;
      target?.focus({ preventScroll: true });
    },
  });

  if (!open || !host) return null;

  return createPortal(
    <div
      className="layer-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={boxRef}
        className={`layer layer--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        aria-busy={busy || undefined}
        onKeyDown={onKeyDown}
      >
        <span className="layer__grip" aria-hidden />
        <header className="layer__head">
          <div className="layer__heading">
            <h2 className="layer__title" id={titleId} ref={titleRef} tabIndex={-1}>
              {title}
            </h2>
            {description ? (
              <p className="layer__desc" id={descId}>
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="layer__close" aria-label={closeLabel} onClick={requestClose} disabled={busy}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="layer__body">{children}</div>
        {footer ? <footer className="layer__foot">{footer}</footer> : null}
      </div>
    </div>,
    host,
  );
}
