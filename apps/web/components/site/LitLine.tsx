'use client';

import { useEffect, useRef } from 'react';

/**
 * Una frase que se enciende palabra por palabra al bajar. Sin JavaScript o con «reducir movimiento» se
 * lee completa: el CSS solo apaga las palabras mientras `data-lit` esté puesto, y esto lo pone al montar.
 */
export function LitLine({ id, text }: { id: string; text: string }) {
  const line = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = line.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const words = Array.from(el.children);
    let queued = false;
    const apply = () => {
      queued = false;
      const box = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = Math.min(1, Math.max(0, (vh * 0.82 - box.top) / (box.height + vh * 0.28)));
      const lit = Math.round(progress * words.length);
      words.forEach((word, i) => word.classList.toggle('is-on', i < lit));
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    };
    el.setAttribute('data-lit', 'on');
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeAttribute('data-lit');
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [text]);

  return (
    <p id={id} className="sa-say__text" ref={line}>
      {text
        .trim()
        .split(/\s+/)
        .map((word, i) => (
          <span key={`${word}-${i}`}>{word} </span>
        ))}
    </p>
  );
}
