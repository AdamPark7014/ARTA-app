type Props = {
  steps: string[];
  activeIndex: number;
};

/** Indicador visual de flujo (ej. pendiente → autorizado → pagado). */
export function FlowSteps({ steps, activeIndex }: Props) {
  return (
    <div className="flow-steps" role="list" aria-label="Flujo del proceso">
      {steps.map((label, i) => (
        <span
          key={label}
          role="listitem"
          className={`flow-steps__step ${
            i < activeIndex ? 'is-done' : i === activeIndex ? 'is-active' : ''
          }`}
        >
          <span className="flow-steps__num">{i + 1}</span>
          {label}
        </span>
      ))}
    </div>
  );
}
