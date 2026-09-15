'use client';

import { useId } from 'react';
import {
  boleteraChoiceOf,
  boleteraCustomOf,
  KNOWN_BOLETERAS,
  resolveBoleteraName,
} from '@/lib/boletera';

type Props = {
  boletera: string;
  onBoleteraChange: (boletera: string) => void;
  disabled?: boolean;
};

const OPTIONS = [...KNOWN_BOLETERAS, 'Otra'] as const;

/** Arema · eTicket · Otra — y si es otra, su nombre. */
export function BoleteraFields({ boletera, onBoleteraChange, disabled }: Props) {
  const labelId = useId();
  const choice = boleteraChoiceOf(boletera);
  const custom = boleteraCustomOf(boletera);

  return (
    <div className="fx-field bol-provider">
      <span id={labelId}>Boletera</span>
      <div className="bol-provider__row">
        <div className="choice" role="radiogroup" aria-labelledby={labelId}>
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={choice === opt}
              className={`choice__opt ${choice === opt ? 'is-on' : ''}`}
              disabled={disabled}
              onClick={() => onBoleteraChange(opt === 'Otra' ? custom || 'Otra' : opt)}
            >
              {opt}
            </button>
          ))}
        </div>
        {choice === 'Otra' ? (
          <input
            className="bol-provider__custom"
            disabled={disabled}
            placeholder="Nombre de la boletera"
            aria-label="Nombre de la boletera"
            value={custom}
            onChange={(e) => onBoleteraChange(e.target.value || 'Otra')}
            autoComplete="organization"
          />
        ) : null}
      </div>
    </div>
  );
}

export { resolveBoleteraName };
