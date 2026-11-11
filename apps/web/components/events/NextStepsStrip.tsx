'use client';

import type { NextAction, NextSteps } from './next-steps';

type Props = {
  steps: NextSteps;
  onAction: (a: NextAction) => void;
};

/** Franja «Lo siguiente» arriba del resumen del evento. */
export function NextStepsStrip({ steps, onAction }: Props) {
  return (
    <section className={`next-steps next-steps--${steps.tone}`} aria-label="Lo siguiente">
      <div className="next-steps__main">
        <div className="next-steps__copy">
          <span className="next-steps__eyebrow">Lo siguiente</span>
          <strong className="next-steps__headline">{steps.headline}</strong>
          {steps.detail ? <span className="next-steps__detail">{steps.detail}</span> : null}
        </div>
        {steps.action ? (
          <button type="button" className="btn next-steps__cta" onClick={() => onAction(steps.action!)}>
            {steps.action.label}
          </button>
        ) : null}
      </div>
      {steps.extras.length ? (
        <div className="next-steps__extras">
          {steps.extras.map((x) => (
            <button key={x.label} type="button" className="next-steps__extra" onClick={() => onAction(x)}>
              <span>{x.label}</span>
              <span className="next-steps__extra-cta">{x.cta} ›</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
