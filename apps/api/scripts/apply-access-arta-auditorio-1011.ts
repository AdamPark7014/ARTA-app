/**
 * 11-10-2026 · ARTA y Auditorio separados (docs/entidades-arta-auditorio.md). Lo que pidió Adam:
 *
 *   - Chacho y Arturo: las dos, y pueden todo (dir_general, sin cambio).
 *   - Leida y Marisol: solo Arta.
 *   - Monse y Kika: las dos.
 *   - Rodrigo, Will y JP: solo Auditorio, y pueden todo lo de Auditorio.
 *   - Todos menos Chacho y Arturo operan todo en sus entidades, pero no tocan usuarios existentes
 *     (solo dan de alta gente nueva) → dir_adjunta (`users.create` sin `users.manage`).
 *
 *   npx ts-node --transpile-only scripts/apply-access-arta-auditorio-1011.ts --dry
 *   npx ts-node --transpile-only scripts/apply-access-arta-auditorio-1011.ts
 *
 * Como en apply-access-junta-0911.ts: los permisos extra se reemplazan por los del rol nuevo y a quien
 * cambia se le cierran las sesiones (el token trae rol y entidades).
 */
import { EntityKey, PrismaClient } from '@prisma/client';
import { ROLES, ROLE_PERMISSIONS, type RoleKey } from '../src/common/rbac/roles';

type Change = { email: string; roleKey: RoleKey; entities: EntityKey[] };

const BOTH: EntityKey[] = ['ARTA', 'EXPLANADA'];

const CHANGES: Change[] = [
  { email: 'leida@artaproducciones.com', roleKey: ROLES.DIR_ADJUNTA, entities: ['ARTA'] },
  { email: 'marisol@artaproducciones.com', roleKey: ROLES.DIR_ADJUNTA, entities: ['ARTA'] },
  { email: 'monse@artaproducciones.com', roleKey: ROLES.DIR_ADJUNTA, entities: BOTH },
  { email: 'kika@artaproducciones.com', roleKey: ROLES.DIR_ADJUNTA, entities: BOTH },
  { email: 'rodrigo@artaproducciones.com', roleKey: ROLES.DIR_ADJUNTA, entities: ['EXPLANADA'] },
  { email: 'williams@artaproducciones.com', roleKey: ROLES.DIR_ADJUNTA, entities: ['EXPLANADA'] },
  { email: 'jp@artaproducciones.com', roleKey: ROLES.DIR_ADJUNTA, entities: ['EXPLANADA'] },
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
        console.log(`  ✓ ${user.fullName}: ya estaba como ${c.roleKey} [${c.entities.join('+')}]`);
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
              motivo: 'ARTA y Auditorio separados (11-10-2026)',
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
