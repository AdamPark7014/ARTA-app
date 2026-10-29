/**
 * Junta 23-10-2026 · Paula Farfán: «Auditorio y Arta en temas contables, que tenga accesos muy
 * puntuales a temas comerciales y contables». Rol `contabilidad` en ARTA + EXPLANADA.
 *
 * Crea la cuenta (o la ajusta si ya existe) con una contraseña aleatoria fuerte. La contraseña en
 * claro va SOLO al archivo de --out (fuera del repo, permisos 600, no sobrescribe uno existente);
 * por consola no sale nada secreto.
 *
 *   # simulación: qué haría, sin escribir nada
 *   npx ts-node --transpile-only scripts/alta-paula-contabilidad-2310.ts --dry
 *   # aplicar (contraseña nueva al archivo)
 *   npx ts-node --transpile-only scripts/alta-paula-contabilidad-2310.ts --out=/tmp/arta-paula.txt
 *   # solo rol y entidades, sin tocar la contraseña
 *   npx ts-node --transpile-only scripts/alta-paula-contabilidad-2310.ts --keep-password
 *
 * Como en apply-access-arta-auditorio-1011.ts: si la cuenta ya existía y cambia su acceso o su
 * contraseña, se le cierran las sesiones (el token trae rol y entidades).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { NEW_TEAM_MEMBERS } from '../prisma/new-team-members';
import { ROLE_LABELS } from '../src/common/rbac/roles';

const EMAIL = 'paula@artaproducciones.com';
const ORG_ID = process.env.ARTA_ORG_ID || 'org_arta_internal';
/** Raíz del repo (apps/api/scripts → ../../..): el archivo de la contraseña nunca va dentro. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Sin letras ni números que se confunden al dictarlos (0/O, 1/I/L), como seed-credentials.ts. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generatePassword(): string {
  const block = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  // 15 símbolos de 54 ≈ 86 bits.
  return `Arta-${block(5)}-${block(5)}-${block(5)}`;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? 'true' : hit.slice(eq + 1);
}

export function isInsideRepo(file: string, repoRoot = REPO_ROOT): boolean {
  const rel = path.relative(repoRoot, path.resolve(file));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function main() {
  const dry = !!arg('dry');
  const keepPassword = !!arg('keep-password');
  const out = arg('out');

  const member = NEW_TEAM_MEMBERS.find((m) => m.email === EMAIL);
  if (!member) throw new Error(`${EMAIL} no está en prisma/new-team-members.ts`);

  if (!dry && !keepPassword) {
    if (!out || out === 'true') {
      console.error('Falta --out=<archivo fuera del repo> para la contraseña (o usa --keep-password / --dry).');
      process.exit(1);
    }
    if (isInsideRepo(out)) {
      console.error('El archivo de --out no puede quedar dentro del repo (es público). Usa p. ej. /tmp/arta-paula.txt.');
      process.exit(1);
    }
    if (fs.existsSync(out)) {
      console.error(`Ya existe ${out}: no se sobrescribe. Bórralo o elige otro nombre.`);
      process.exit(1);
    }
  }

  const prisma = new PrismaClient();
  let fd: number | null = null;
  try {
    const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
    const sameAccess =
      !!existing &&
      existing.roleKey === member.roleKey &&
      existing.entities.join(',') === member.entities.join(',') &&
      existing.permissions.join(',') === member.permissions.join(',') &&
      existing.active;

    const what = existing
      ? `${existing.fullName}: ${existing.roleKey} [${existing.entities.join('+')}] ⇒ ${member.roleKey} [${member.entities.join('+')}]`
      : `${member.fullName} <${EMAIL}>: alta nueva como ${member.roleKey} [${member.entities.join('+')}]`;
    console.log(`  → ${what} · ${ROLE_LABELS[member.roleKey]}`);
    console.log(`    contraseña: ${keepPassword ? (existing ? 'se conserva' : 'aleatoria, nadie la conoce') : 'nueva, al archivo de --out'}`);
    if (dry) {
      console.log('Simulación: no se escribió nada.');
      return;
    }
    if (existing && sameAccess && keepPassword) {
      console.log('  ✓ Ya tenía ese acceso; nada que hacer.');
      return;
    }

    // Se aparta el archivo ANTES de tocar la base: si no se puede escribir, no queda una contraseña perdida.
    const plain = generatePassword();
    if (!keepPassword) fd = fs.openSync(out as string, 'wx', 0o600);
    const passwordHash = await bcrypt.hash(plain, 12);
    const now = new Date();

    if (!existing) {
      const created = await prisma.user.create({
        data: {
          email: EMAIL,
          fullName: member.fullName,
          title: member.title,
          roleKey: member.roleKey,
          entities: member.entities,
          permissions: member.permissions,
          passwordHash,
          active: true,
          organizationId: ORG_ID,
          memberships: { create: { organizationId: ORG_ID, roleKey: member.roleKey } },
        },
        select: { id: true },
      });
      await prisma.auditLog.create({
        data: {
          userId: created.id,
          organizationId: ORG_ID,
          action: 'user.created',
          resource: 'User',
          resourceId: created.id,
          metaJson: { roleKey: member.roleKey, entities: member.entities, motivo: 'Junta 23-10-2026 · contabilidad' },
        },
      });
      console.log(`  ✓ Alta de ${member.fullName}.`);
    } else {
      const orgId = existing.organizationId || ORG_ID;
      const openSessions = { userId: existing.id, revokedAt: null, expiresAt: { gt: now } };
      const open = await prisma.userSession.count({ where: openSessions });
      await prisma.$transaction([
        prisma.user.update({
          where: { id: existing.id },
          data: {
            fullName: member.fullName,
            title: member.title,
            roleKey: member.roleKey,
            entities: member.entities,
            permissions: member.permissions,
            active: true,
            organizationId: orgId,
            failedLoginCount: 0,
            lockedUntil: null,
            ...(keepPassword ? {} : { passwordHash }),
          },
        }),
        prisma.orgMembership.upsert({
          where: { organizationId_userId: { organizationId: orgId, userId: existing.id } },
          create: { organizationId: orgId, userId: existing.id, roleKey: member.roleKey },
          update: { roleKey: member.roleKey },
        }),
        prisma.userSession.updateMany({ where: openSessions, data: { revokedAt: now } }),
        prisma.auditLog.create({
          data: {
            userId: existing.id,
            organizationId: orgId,
            action: 'user.access.changed',
            resource: 'User',
            resourceId: existing.id,
            metaJson: {
              from: { roleKey: existing.roleKey, entities: existing.entities },
              to: { roleKey: member.roleKey, entities: member.entities },
              passwordReset: !keepPassword,
              sessionsRevoked: open,
              motivo: 'Junta 23-10-2026 · contabilidad',
            },
          },
        }),
      ]);
      console.log(`  ✓ ${member.fullName} actualizada${open ? ` · ${open} sesión(es) cerrada(s)` : ''}.`);
    }

    if (fd !== null) {
      fs.writeSync(
        fd,
        [
          'ARTA · acceso de Paula Farfán (contabilidad y comercial)',
          'Panel: https://artaproducciones.com/login (o la app ARTA en el teléfono)',
          `Correo: ${EMAIL}`,
          `Contraseña: ${plain}`,
          '',
          'Entregar por un canal seguro y borrar este archivo después.',
          '',
        ].join('\n'),
      );
      fs.closeSync(fd);
      fd = null;
      console.log(`  ✓ Contraseña escrita en ${path.resolve(out as string)} (no se muestra aquí).`);
    }
  } catch (e) {
    // Si la base falló, el archivo apartado queda vacío: se quita para no confundir.
    if (fd !== null) {
      fs.closeSync(fd);
      fs.rmSync(out as string, { force: true });
    }
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
