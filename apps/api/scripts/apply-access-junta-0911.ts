/**
 * Junta 11-09-2026 · «Definir quién puede editar y quién no puede editar».
 *
 * La lista que mandó Arta:
 *   - Arturo Taja y José Luis Arista — TODO de Arta y Explanada (ya lo tienen).
 *   - Leida y Sol — TODO de Arta                      → gerente_arta · ARTA
 *   - Rodrigo López — TODO del Auditorio y carpetas de Arta (ya lo tiene).
 *   - Williams Taja — solo carpetas generales          → solo_carpetas · ambas
 *   - Juan Pablo Ramírez — solo carpetas generales     → solo_carpetas · ambas
 *
 * 16-09-2026 · Adam: «dale los mismos permisos a Leida y Marisol de Arturo y
 * José Luis excepto gestión de usuarios» → dir_adjunta · ambas.
 *
 * El seed no pisa roles de usuarios existentes (se cambian desde el panel), así
 * que en una base viva esto se aplica con este script:
 *
 *   npx ts-node --transpile-only scripts/apply-access-junta-0911.ts --dry
 *   npx ts-node --transpile-only scripts/apply-access-junta-0911.ts
 *
 * Los permisos extra se REEMPLAZAN por los del rol nuevo: `hasPermission` suma
 * los extra a los del rol, y con los viejos Williams seguiría editando.
 *
 * El token de sesión trae rol y permisos, así que a quien cambia se le cierran
 * las sesiones abiertas: si no, el cambio no se nota hasta que el token expira.
 */
import { EntityKey, PrismaClient } from '@prisma/client';
import { ROLES, ROLE_PERMISSIONS, type RoleKey } from '../src/common/rbac/roles';

type Change = { email: string; roleKey: RoleKey; entities: EntityKey[] };

const CHANGES: Change[] = [
  { email: 'leida@artaproducciones.com', roleKey: ROLES.DIR_ADJUNTA, entities: ['ARTA', 'EXPLANADA'] },
  { email: 'marisol@artaproducciones.com', roleKey: ROLES.DIR_ADJUNTA, entities: ['ARTA', 'EXPLANADA'] },
  { email: 'williams@artaproducciones.com', roleKey: ROLES.SOLO_CARPETAS, entities: ['ARTA', 'EXPLANADA'] },
  { email: 'jp@artaproducciones.com', roleKey: ROLES.SOLO_CARPETAS, entities: ['ARTA', 'EXPLANADA'] },
];

async function main() {
  const dry = process.argv.includes('--dry');
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    for (const c of CHANGES) {
      const user = await prisma.user.findUnique({ where: { email: c.email } });
      if (!user) {
        console.log(`  · ${c.email}: no existe, se omite`);
        continue;
      }
      const permissions = [...ROLE_PERMISSIONS[c.roleKey]];
      const same =
        user.roleKey === c.roleKey &&
        user.entities.join(',') === c.entities.join(',') &&
        user.permissions.join(',') === permissions.join(',');
      if (same) {
        console.log(`  ✓ ${user.fullName}: ya estaba como ${c.roleKey}`);
        continue;
      }
      const openSessions = { userId: user.id, revokedAt: null, expiresAt: { gt: now } };
      const open = await prisma.userSession.count({ where: openSessions });
      console.log(
        `  → ${user.fullName}: ${user.roleKey} [${user.entities.join('+')}] ⇒ ${c.roleKey} [${c.entities.join('+')}]` +
          (open ? ` · cierra ${open} sesión(es)` : ''),
      );
      if (dry) continue;
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { roleKey: c.roleKey, entities: c.entities, permissions },
        }),
        prisma.orgMembership.updateMany({ where: { userId: user.id }, data: { roleKey: c.roleKey } }),
        prisma.userSession.updateMany({ where: openSessions, data: { revokedAt: now } }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId,
            action: 'user.access.changed',
            resource: 'User',
            resourceId: user.id,
            metaJson: {
              from: { roleKey: user.roleKey, entities: user.entities },
              to: { roleKey: c.roleKey, entities: c.entities },
              sessionsRevoked: open,
            },
          },
        }),
      ]);
    }
    console.log(dry ? 'Simulación: no se escribió nada.' : 'Accesos aplicados.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
