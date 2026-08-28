/**
 * Alta de las personas nuevas SIN tocar a nadie que ya exista.
 *
 * `prisma/seed.ts` reescribe el passwordHash de TODOS los usuarios en cada
 * corrida, así que no sirve para producción: pasar el seed en artaproducciones
 * le cambiaría la contraseña a los siete usuarios reales. Este script solo
 * inserta lo que falta y sale.
 *
 *   cd apps/api
 *   SEED_PASS_MONSE=... SEED_PASS_SOL=... SEED_PASS_KIKA=... \
 *     npx ts-node --transpile-only scripts/provision-new-users.ts
 *
 * Sin variables de entorno genera una contraseña aleatoria por persona y la
 * imprime una sola vez — cópiala antes de cerrar la terminal.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { NEW_TEAM_MEMBERS } from '../prisma/new-team-members';

const prisma = new PrismaClient();
const DEFAULT_ORG_ID = process.env.ARTA_ORG_ID || 'org_arta_internal';

function passwordFor(alias: string): { plain: string; generated: boolean } {
  const fromEnv = process.env[`SEED_PASS_${alias}`];
  if (fromEnv && fromEnv.length >= 8) return { plain: fromEnv, generated: false };
  return { plain: `Arta-${randomBytes(6).toString('base64url')}`, generated: true };
}

async function main() {
  const created: Array<{ email: string; plain: string; generated: boolean }> = [];

  for (const member of NEW_TEAM_MEMBERS) {
    const existing = await prisma.user.findUnique({ where: { email: member.email } });
    if (existing) {
      console.log(`  · ${member.email} ya existe — no se toca`);
      continue;
    }

    const { plain, generated } = passwordFor(member.passAlias);
    const passwordHash = await bcrypt.hash(plain, 12);

    await prisma.user.create({
      data: {
        email: member.email,
        fullName: member.fullName,
        title: member.title,
        roleKey: member.roleKey,
        entities: member.entities,
        permissions: member.permissions,
        passwordHash,
        active: true,
        organizationId: DEFAULT_ORG_ID,
        memberships: {
          create: { organizationId: DEFAULT_ORG_ID, roleKey: member.roleKey },
        },
      },
    });

    created.push({ email: member.email, plain, generated });
    console.log(`  ✓ ${member.fullName} · ${member.email} · ${member.roleKey}`);
  }

  const generated = created.filter((c) => c.generated);
  if (generated.length) {
    console.log('\n  Contraseñas generadas (solo se muestran ahora):');
    for (const c of generated) console.log(`    ${c.email}  ${c.plain}`);
    console.log('  Entrégalas por un canal seguro y pide cambio en el primer acceso.\n');
  }

  if (!created.length) console.log('\n  Nada que dar de alta.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
