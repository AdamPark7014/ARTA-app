import * as fs from 'fs';
import * as path from 'path';
import { EntityKey } from '@prisma/client';
import { ROLE_PERMISSIONS, type RoleKey } from '../src/common/rbac/roles';

/**
 * Personas que el seed da de alta en una base nueva. NO van en el repositorio, que es público (25-11-2026): viven en un
 * JSON local, `prisma/equipo.local.json` o la ruta de SEED_EQUIPO. Copia: C:/dev/secrets/seeders/arta.
 *
 *   { "equipo": [{ "email", "fullName", "title", "roleKey", "entities", "passAlias", "randomPasswordUnlessEnv"?,
 *                  "modules"? }], "renombrados": { "viejo@…": "nuevo@…" } }
 *
 * Sin el archivo no se crea ni se toca a nadie: el arranque de producción sigue con formatos y Studio.
 */
export type PersonaEquipo = {
  email: string;
  fullName: string;
  title: string;
  roleKey: RoleKey;
  entities: EntityKey[];
  permissions: string[];
  /** Contraseña inicial vía env SEED_PASS_<passAlias>. */
  passAlias: string;
  /** Sin SEED_PASS_<passAlias>: contraseña al azar, aunque haya SEED_PASSWORD. */
  randomPasswordUnlessEnv?: boolean;
  modules: string[];
};

export type Equipo = { equipo: PersonaEquipo[]; renombrados: Record<string, string> };

export function leerEquipo(ruta = process.env.SEED_EQUIPO || path.join(__dirname, 'equipo.local.json')): Equipo {
  if (!fs.existsSync(ruta)) return { equipo: [], renombrados: {} };
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8')) as Partial<Equipo>;
  const equipo = (datos.equipo ?? []).map((p) => {
    const permisos = ROLE_PERMISSIONS[p.roleKey];
    if (!p.email || !p.fullName || !p.passAlias || !permisos) throw new Error(`Equipo local: datos incompletos de ${p.email || 'una persona'}`);
    return { ...p, permissions: [...permisos], modules: p.modules ?? [] };
  });
  return { equipo, renombrados: datos.renombrados ?? {} };
}
