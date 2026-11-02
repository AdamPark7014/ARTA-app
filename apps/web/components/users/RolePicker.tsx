'use client';

import { useId } from 'react';
import { ROLE_HINTS, roleLabel, type EntityKey, type RoleKey } from '@arta/rbac';
import { describeAccess, type AccessLevel } from '@/lib/role-access';

type RoleOption = { key: string; label: string };

/** Quién es quién en el equipo actual primero; los roles de antes, plegados. */
const ROLE_GROUPS: Array<{ title: string; roles: string[] }> = [
  { title: 'Dirección', roles: ['dir_general', 'dir_adjunta', 'gerente_arta'] },
  { title: 'Operación', roles: ['dir_auditorio', 'produccion', 'compras', 'contabilidad'] },
  { title: 'Apoyo', roles: ['contenido', 'catering', 'practicante'] },
];
const LEVEL_LABEL: Record<AccessLevel, string> = { edit: 'Edita', view: 'Ve', none: 'Sin acceso' };
const ENTITY_LABEL: Record<string, string> = { ARTA: 'Arta', EXPLANADA: 'Auditorio' };

function RoleCard({
  role,
  name,
  checked,
  onPick,
}: {
  role: RoleOption;
  name: string;
  checked: boolean;
  onPick: (key: string) => void;
}) {
  return (
    <label className={`role-card ${checked ? 'is-on' : ''}`}>
      <input type="radio" name={name} value={role.key} checked={checked} onChange={() => onPick(role.key)} />
      <span className="role-card__name">{role.label || roleLabel(role.key)}</span>
    </label>
  );
}

/** Elegir el rol viendo qué hace cada uno, en vez de adivinar con un nombre en una lista. */
export function RolePicker({
  roles,
  value,
  onChange,
}: {
  roles: RoleOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const name = useId();
  const grouped = new Set(ROLE_GROUPS.flatMap((g) => g.roles));
  const others = roles.filter((r) => !grouped.has(r.key));
  const otherSelected = others.some((r) => r.key === value);

  return (
    <div className="role-picker" role="radiogroup" aria-label="Rol">
      {ROLE_GROUPS.map((group) => {
        const list = group.roles
          .map((key) => roles.find((r) => r.key === key))
          .filter((r): r is RoleOption => !!r);
        if (!list.length) return null;
        return (
          <div key={group.title} className="role-picker__group">
            <div className="role-picker__title">{group.title}</div>
            <div className="role-picker__cards">
              {list.map((role) => (
                <RoleCard key={role.key} role={role} name={name} checked={value === role.key} onPick={onChange} />
              ))}
            </div>
          </div>
        );
      })}
      {others.length ? (
        <details className="role-picker__more" open={otherSelected}>
          <summary>Otros roles</summary>
          <div className="role-picker__cards">
            {others.map((role) => (
              <RoleCard key={role.key} role={role} name={name} checked={value === role.key} onPick={onChange} />
            ))}
          </div>
        </details>
      ) : null}
      {ROLE_HINTS[value as RoleKey] ? <p className="role-picker__hint">{ROLE_HINTS[value as RoleKey]}</p> : null}
    </div>
  );
}

/** Lo que verá la persona en cada negocio, antes de guardar. */
export function RoleAccessPreview({
  roleKey,
  entities,
  permissions,
}: {
  roleKey: string;
  entities: string[];
  permissions?: string[];
}) {
  const shown = (['ARTA', 'EXPLANADA'] as EntityKey[]).filter((e) => entities.includes(e));
  if (!shown.length) {
    return <p className="role-preview__empty">Elige al menos un negocio para ver qué podrá hacer.</p>;
  }
  const user = { roleKey, entities, permissions: permissions ?? [] };
  return (
    <div className="role-preview">
      {shown.map((entity) => (
        <div key={entity} className="role-preview__entity">
          <div className="role-preview__title">En {ENTITY_LABEL[entity]}</div>
          <ul className="role-preview__list">
            {describeAccess(user, entity)
              .filter((m) => entity !== 'EXPLANADA' || !['corrida', 'campaign', 'convenios'].includes(m.key))
              .map((m) => (
                <li key={m.key} className={`role-preview__item is-${m.level}`}>
                  <span className="role-preview__module">{m.label}</span>
                  <span className="role-preview__level">{m.note || LEVEL_LABEL[m.level]}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
