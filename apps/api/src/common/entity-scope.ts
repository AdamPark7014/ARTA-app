import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { canAccessEntity, type EntityKey, type RoleKey } from './rbac/roles';

/**
 * ARTA y Auditorio (EXPLANADA) son negocios distintos dentro de la misma organización
 * (docs/entidades-arta-auditorio.md). Estas funciones deciden qué entidades ve cada quien
 * y a cuál va lo que se crea sin evento.
 */
export const ENTITY_KEYS: EntityKey[] = ['ARTA', 'EXPLANADA'];

export type EntityUser = { roleKey: string; entities?: string[] | null };

/** Entidades que la persona puede ver (dirección general y plataforma: las dos). */
export function userEntities(user: EntityUser): EntityKey[] {
  const own = (user.entities ?? []) as EntityKey[];
  return ENTITY_KEYS.filter((e) => canAccessEntity(own, user.roleKey as RoleKey, e));
}

function parseEntity(raw?: string | null): EntityKey | null {
  const value = (raw ?? '').trim().toUpperCase();
  if (!value) return null;
  if (!ENTITY_KEYS.includes(value as EntityKey)) throw new BadRequestException('Entidad inválida');
  return value as EntityKey;
}

/**
 * `?entity=` de un listado: sin él, todas las entidades de la persona (las apps 1.0.0 no lo mandan);
 * con una a la que no tiene acceso, 403.
 */
export function entityScope(user: EntityUser, requested?: string | null): EntityKey[] {
  const mine = userEntities(user);
  const wanted = parseEntity(requested);
  if (!wanted) return mine;
  if (!mine.includes(wanted)) throw new ForbiddenException('No tienes acceso a esa entidad');
  return [wanted];
}

/** Entidad de algo nuevo sin evento: la pedida (si tiene acceso), su única entidad o, para un híbrido, ARTA. */
export function entityForNew(user: EntityUser, requested?: string | null): EntityKey {
  if (parseEntity(requested)) return entityScope(user, requested)[0];
  const mine = userEntities(user);
  if (mine.length === 0) throw new ForbiddenException('No tienes una entidad asignada');
  return mine.includes('ARTA') ? 'ARTA' : mine[0];
}

/** ¿Puede la persona ver algo de esta entidad? Null (directos, avisos generales) es de todos. */
export function canSeeEntity(user: EntityUser, entity: EntityKey | string | null | undefined): boolean {
  if (!entity) return true;
  return userEntities(user).includes(entity as EntityKey);
}
