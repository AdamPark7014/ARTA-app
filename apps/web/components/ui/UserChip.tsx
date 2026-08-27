type Props = {
  name: string;
  subtitle?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function UserChip({ name, subtitle }: Props) {
  return (
    <div className="user-chip">
      <div className="user-chip__avatar" aria-hidden>
        {initials(name)}
      </div>
      <div className="user-chip__meta">
        <strong>{name}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </div>
  );
}
