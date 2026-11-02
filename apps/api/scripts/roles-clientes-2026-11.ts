/**
 * Reglas de acceso que pidió el cliente el 01-11-2026 (docs/ROLES-Y-PERMISOS.md): deja a cada persona
 * real con su rol, sus negocios y sin permisos sueltos de antes, da de alta a Iliana, fija la contraseña
 * de quien no la tiene y crea las plantillas de barra y merch. Idempotente.
 *
 * No imprime ninguna contraseña: las escribe en `--out` (fuera del repo, permisos 600, no sobrescribe).
 *
 *   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/roles-clientes-2026-11.ts --dry
 *   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/roles-clientes-2026-11.ts --out=/tmp/arta-accesos.txt
 *
 * Personas con cambio de rol o de negocios: se cierran sus sesiones (el rol viaja en la sesión).
 */
import { EntityKey, Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { existsSync, writeFileSync } from 'fs';
import { STANDARD_FORMATS } from '../src/checklists/format-catalog';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length);
const ORG = 'org_arta_internal';

type Person = {
  /** Se busca por nombre: los correos son del cliente y no van en este repo público. */
  name: RegExp;
  roleKey: string;
  entities: EntityKey[];
  title?: string;
};

const BOTH = [EntityKey.ARTA, EntityKey.EXPLANADA];

const PEOPLE: Person[] = [
  { name: /^Arturo Taja/i, roleKey: 'dir_general', entities: BOTH },
  { name: /^José Luis Arista/i, roleKey: 'dir_general', entities: BOTH },
  { name: /^Leida Osorio/i, roleKey: 'dir_adjunta', entities: [EntityKey.ARTA] },
  { name: /^Marisol Pérez/i, roleKey: 'dir_adjunta', entities: [EntityKey.ARTA] },
  { name: /^Juan Pablo Ramírez/i, roleKey: 'compras', entities: BOTH },
  { name: /^Williams Taja/i, roleKey: 'produccion', entities: BOTH },
  { name: /^Rodrigo López/i, roleKey: 'dir_auditorio', entities: BOTH },
  { name: /^Monse\b/i, roleKey: 'contenido', entities: BOTH },
  { name: /^Kika\b/i, roleKey: 'contenido', entities: BOTH },
  { name: /^Paula Farfán/i, roleKey: 'contabilidad', entities: BOTH },
];

/** Altas nuevas o con contraseña que nadie conoce. */
const NEW_PEOPLE = [
  { fullName: 'Iliana', email: 'iliana@artaproducciones.com', roleKey: 'catering', entities: BOTH, title: 'Catering' },
];
const RESET_PASSWORD = [/^Paula Farfán/i];

const newPassword = () => randomBytes(9).toString('base64url');
const same = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();

async function main() {
  const lines: string[] = [];
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true, roleKey: true, entities: true, permissions: true, active: true },
  });

  for (const person of PEOPLE) {
    const user = users.find((u) => person.name.test(u.fullName));
    if (!user) {
      console.log(`FALTA  ${person.name.source}`);
      continue;
    }
    const changed =
      user.roleKey !== person.roleKey || !same(user.entities, person.entities) || user.permissions.length > 0;
    console.log(`${changed ? 'CAMBIA' : 'igual '} ${user.fullName}: ${user.roleKey} → ${person.roleKey} · ${person.entities.join('+')}`);
    if (!changed || DRY) continue;
    await prisma.user.update({
      where: { id: user.id },
      // Los permisos sueltos eran copia del rol anterior: el rol nuevo manda.
      data: { roleKey: person.roleKey, entities: person.entities, permissions: [] },
    });
    await prisma.orgMembership.updateMany({ where: { userId: user.id }, data: { roleKey: person.roleKey } });
    await prisma.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({
      data: {
        action: 'user.roles_2026_11',
        resource: 'User',
        resourceId: user.id,
        metaJson: { from: user.roleKey, to: person.roleKey, entities: person.entities },
      },
    });
  }

  for (const person of NEW_PEOPLE) {
    const existing = users.find((u) => u.email === person.email);
    if (existing) {
      console.log(`igual  ${person.fullName}: ya existe`);
      continue;
    }
    console.log(`ALTA   ${person.fullName}: ${person.roleKey}`);
    if (DRY) continue;
    const password = newPassword();
    await prisma.user.create({
      data: {
        email: person.email,
        fullName: person.fullName,
        title: person.title,
        roleKey: person.roleKey,
        entities: person.entities,
        permissions: [],
        passwordHash: await bcrypt.hash(password, 12),
        active: true,
        organizationId: ORG,
        memberships: { create: { organizationId: ORG, roleKey: person.roleKey } },
      },
    });
    lines.push(`${person.fullName}\t${person.email}\t${password}`);
  }

  for (const name of RESET_PASSWORD) {
    const user = users.find((u) => name.test(u.fullName));
    if (!user) continue;
    console.log(`CLAVE  ${user.fullName}`);
    if (DRY) continue;
    const password = newPassword();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 12), failedLoginCount: 0, lockedUntil: null },
    });
    await prisma.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    lines.push(`${user.fullName}\t${user.email}\t${password}`);
  }

  // Plantillas nuevas: sin tocar las que ya existen.
  for (const format of STANDARD_FORMATS.filter((f) => f.key === 'BARRA' || f.key === 'MERCH')) {
    const found = await prisma.checklistTemplate.findFirst({ where: { key: format.key } });
    console.log(`${found ? 'igual ' : 'CREA  '} plantilla ${format.name}`);
    if (found || DRY) continue;
    await prisma.checklistTemplate.create({
      data: {
        key: format.key,
        name: format.name,
        description: format.description,
        entities: format.entities,
        schemaJson: format.schema as unknown as Prisma.InputJsonValue,
        active: true,
      },
    });
  }

  if (DRY) {
    console.log('Ensayo: no se cambió nada.');
    return;
  }
  if (lines.length) {
    if (!OUT) throw new Error('Hay contraseñas nuevas y falta --out=<archivo>');
    if (existsSync(OUT)) throw new Error(`${OUT} ya existe: no se sobrescribe`);
    writeFileSync(OUT, `${lines.join('\n')}\n`, { mode: 0o600 });
    console.log(`${lines.length} acceso(s) en ${OUT}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
