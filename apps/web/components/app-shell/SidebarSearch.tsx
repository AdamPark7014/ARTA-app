'use client';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function SidebarSearch({ value, onChange }: Props) {
  return (
    <div className="sidebar-search">
      <input
        className="field field--search"
        type="search"
        placeholder="Buscar módulo…"
        aria-label="Buscar en el menú"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
