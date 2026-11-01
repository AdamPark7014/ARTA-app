import { initials } from './UserChip';

/** Caras de una tarea o un equipo, encimadas. Decorativo: el nombre va en texto al lado. */
export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  if (!names.length) return null;
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="av-stack" aria-hidden>
      {shown.map((name) => (
        <span key={name} className="av-stack__face" title={name}>
          {initials(name)}
        </span>
      ))}
      {rest > 0 ? <span className="av-stack__face av-stack__face--more">+{rest}</span> : null}
    </span>
  );
}
