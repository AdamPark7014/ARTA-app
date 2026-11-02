'use client';

import { useEffect, useRef, useState } from 'react';

type Step = { title: string; body: string; imageUrl?: string };

/** Cómo trabajamos: en computadora la foto se queda fija y cambia con el paso que se está leyendo. */
export function ProcessScroll({ steps }: { steps: Step[] }) {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const items = Array.from(list.current?.children ?? []);
    if (!items.length || !('IntersectionObserver' in window)) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(items.indexOf(entry.target));
        }
      },
      { rootMargin: '-46% 0px -46% 0px' },
    );
    items.forEach((item) => watcher.observe(item));
    setLive(true);
    return () => watcher.disconnect();
  }, [steps.length]);

  return (
    <div className={`sa-proc ${live ? 'is-live' : ''}`.trim()}>
      <div className="sa-proc__media" aria-hidden="true">
        {steps.map((step, i) =>
          step.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio
            <img key={`${step.title}-${i}`} className={i === active ? 'is-on' : ''} src={step.imageUrl} alt="" loading="lazy" decoding="async" />
          ) : null,
        )}
      </div>
      <ol className="sa-proc__steps" ref={list}>
        {steps.map((step, i) => (
          <li key={`${step.title}-${i}`} className={i === active ? 'is-on' : ''}>
            {step.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio
              <img className="sa-proc__phone" src={step.imageUrl} alt="" loading="lazy" decoding="async" />
            ) : null}
            <span className="sa-proc__n" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
