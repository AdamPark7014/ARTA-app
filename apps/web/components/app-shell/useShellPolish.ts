'use client';

import { useEffect } from 'react';

/**
 * Contenedores con scroll propio que deben desvanecerse en el borde por donde
 * sigue el contenido, en vez de cortar un ítem a la mitad (pedido de Adam,
 * 11-10-2026: «tiene muchos cortes no agradables»). Cualquier otro contenedor
 * puede sumarse con `data-fade`.
 */
const FADE_SELECTOR = [
  '.nav',
  '.tab-bar',
  '.seg',
  '.chip-row',
  '.choice',
  '.filter-chips',
  '.fchips',
  '.dtable-wrap',
  '.table-wrap',
  '.notif-panel__body',
  '.topbar-search__results',
  '.chat-list',
  '.chat-scroll',
  '.sheet-wrap',
  '.expandbox--inline > .expandbox__body',
  '[data-fade]',
].join(',');

/**
 * Textos que a propósito se recortan: los de un renglón (vista previa del chat,
 * nombre en una fila densa…) y los títulos que pasan a dos renglones como máximo.
 * Si de verdad se cortan, llevan el texto completo en `title`.
 */
const SINGLE_LINE_SELECTOR = [
  '.ap-row__title',
  '.tl__title',
  '.ev-card__name',
  '.ev-card__meta',
  '.fmt-row__name',
  '.task2__title',
  '.adv-card__title',
  '.folder-card__desc',
  '.sidebar-foot--lite .user-chip__meta span',
  '.user-chip__meta strong',
  '.topbar h1',
  '.chat-row__name',
  '.chat-row__preview',
  '.chat-head__title',
  '.chat-head__sub',
  '.chat-msg__author',
  '.chat-msg__role',
  '.chat-doc__name',
  '.chat-audio__name',
  '.chat-member__name',
  '.chat-member__meta',
  '.chat-panel__title',
  '.chat-panel__sub',
  '.chat-replybar__text',
  '.chat-mentions__name',
  '.chat-mentions__meta',
  '.chat-viewer__name',
  '.assignees__text',
  '.assignees-pop__name',
  '.oc-chip',
  '.mcal__chip',
  '.hub-attach__name',
  '.file-row__name',
  '.ev-card__meta',
  '[data-trunc]',
].join(',');

const EDGE = 2;

function isTruncated(el: HTMLElement) {
  if (el.scrollWidth - el.clientWidth > 1) {
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden') return true;
  }
  if (el.scrollHeight - el.clientHeight > 2) {
    const clamp = (getComputedStyle(el) as unknown as Record<string, string>).webkitLineClamp;
    if (clamp && clamp !== 'none') return true;
  }
  return false;
}

/** Pone (o quita) el texto completo como `title` según esté cortado o no. */
function syncTitle(el: HTMLElement) {
  const auto = el.hasAttribute('data-auto-title');
  if (el.hasAttribute('title') && !auto) return;
  if (isTruncated(el)) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text && el.getAttribute('title') !== text) {
      el.setAttribute('title', text);
      el.setAttribute('data-auto-title', '');
    }
  } else if (auto) {
    el.removeAttribute('title');
    el.removeAttribute('data-auto-title');
  }
}

function update(el: HTMLElement) {
  const x = el.scrollWidth - el.clientWidth > EDGE;
  const y = el.scrollHeight - el.clientHeight > EDGE;
  const cs = getComputedStyle(el);
  const sx = x && /(auto|scroll)/.test(cs.overflowX);
  const sy = y && /(auto|scroll)/.test(cs.overflowY);
  const side = (pos: number, max: number) => {
    const start = pos > EDGE;
    const end = pos < max - EDGE;
    return start && end ? 'both' : start ? 'start' : end ? 'end' : '';
  };
  // scrollLeft es negativo en RTL; aquí todo es LTR.
  const fx = sx ? side(el.scrollLeft, el.scrollWidth - el.clientWidth) : '';
  const fy = sy ? side(el.scrollTop, el.scrollHeight - el.clientHeight) : '';
  if (fx) el.setAttribute('data-fade-x', fx);
  else el.removeAttribute('data-fade-x');
  if (fy) el.setAttribute('data-fade-y', fy);
  else el.removeAttribute('data-fade-y');
}

/**
 * Detalles de acabado del marco, una sola vez por página:
 * - desvanecidos de borde solo cuando un contenedor de verdad desborda;
 * - `data-scrolled` en <html> para que la barra superior muestre su línea al bajar;
 * - el texto completo en `title` para lo que de verdad se corta (lista curada al
 *   montar y cualquier otro texto o campo al pasar el cursor).
 */
export function useShellPolish(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const tracked = new Set<HTMLElement>();
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) update(e.target as HTMLElement);
    });
    const onScroll = (ev: Event) => {
      const t = ev.target;
      if (t instanceof HTMLElement && tracked.has(t)) update(t);
    };

    const scan = () => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(FADE_SELECTOR))) {
        if (!tracked.has(el)) {
          tracked.add(el);
          ro.observe(el);
        }
      }
      for (const el of Array.from(tracked)) {
        if (!el.isConnected) {
          tracked.delete(el);
          ro.unobserve(el);
          continue;
        }
        update(el);
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(SINGLE_LINE_SELECTOR))) syncTitle(el);
    };

    // Cualquier otro texto cortado muestra el completo al pasar el cursor.
    const onOver = (ev: PointerEvent) => {
      // Campo de texto cuyo valor no cabe (concepto largo en una tabla): el valor completo al pasar el cursor.
      if (ev.target instanceof HTMLInputElement && /^(text|search|)$/.test(ev.target.type)) {
        const input = ev.target;
        const auto = input.hasAttribute('data-auto-title');
        if (input.hasAttribute('title') && !auto) return;
        if (input.value && input.scrollWidth - input.clientWidth > 1) {
          input.setAttribute('title', input.value);
          input.setAttribute('data-auto-title', '');
        } else if (auto) {
          input.removeAttribute('title');
          input.removeAttribute('data-auto-title');
        }
        return;
      }
      let el = ev.target instanceof HTMLElement ? ev.target : null;
      for (let i = 0; el && i < 3; i++, el = el.parentElement) {
        if (el.hasAttribute('title') && !el.hasAttribute('data-auto-title')) return;
        if (isTruncated(el) || el.hasAttribute('data-auto-title')) {
          syncTitle(el);
          return;
        }
      }
    };
    document.addEventListener('pointerover', onOver, { passive: true });

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        scan();
      });
    };

    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    // El scroll no burbujea: se escucha en captura para todos los contenedores.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });

    const root = document.documentElement;
    const onPageScroll = () => {
      if (window.scrollY > 4) root.setAttribute('data-scrolled', '');
      else root.removeAttribute('data-scrolled');
    };
    window.addEventListener('scroll', onPageScroll, { passive: true });
    window.addEventListener('resize', schedule);
    onPageScroll();
    scan();

    return () => {
      mo.disconnect();
      ro.disconnect();
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('pointerover', onOver);
      window.removeEventListener('scroll', onPageScroll);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
      root.removeAttribute('data-scrolled');
      for (const el of Array.from(tracked)) {
        el.removeAttribute('data-fade-x');
        el.removeAttribute('data-fade-y');
      }
    };
  }, [enabled]);
}
