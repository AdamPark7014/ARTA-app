type Props = {
  name: string;
  subtitle?: string;
  /** Nombre corto (nombre + primer apellido) para espacios angostos como el pie del menú. */
  short?: boolean;
};

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * «Ana Robles Villaseñor» → «Ana Robles»; «José Luis Pérez García» → «José Pérez».
 * Con tres partes o más: el primer nombre y el primer apellido (penúltima parte).
 */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[parts.length - 2]}`;
}

export function UserChip({ name, subtitle, short }: Props) {
  const shown = short ? shortName(name) : name;
  return (
    <div className="user-chip">
      <div className="user-chip__avatar" aria-hidden>
        {initials(name)}
      </div>
      <div className="user-chip__meta">
        <strong title={shown !== name ? name : undefined}>{shown}</strong>
        {subtitle ? <span title={subtitle}>{subtitle}</span> : null}
      </div>
    </div>
  );
}
