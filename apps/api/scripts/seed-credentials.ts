/**
 * Seeder de credenciales del equipo + Excel para entregarlas.
 *
 * Genera una contraseña aleatoria por persona activa de la organización, guarda
 * SOLO el hash (bcrypt) y escribe las contraseñas en claro en un .xlsx fuera
 * del repo. Nada de contraseñas en consola: el Excel es la única copia.
 *
 *   cd apps/api
 *   # simulación: quién recibiría contraseña, sin escribir nada
 *   npx ts-node --transpile-only scripts/seed-credentials.ts --dry
 *   # aplicar y generar el Excel
 *   npx ts-node --transpile-only scripts/seed-credentials.ts --yes --out=C:/ruta/ARTA-credenciales.xlsx
 *
 * Opciones:
 *   --only=a@x.com,b@x.com   solo esas personas
 *   --revoke                 cierra las sesiones abiertas de quien recibe contraseña nueva
 *   --confirm-produccion     obligatorio si la base NO es local (localhost / 127.0.0.1 / db de Docker)
 *
 * La lista de accesos es la de la junta 11-09-2026 («Definir quién puede editar»).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { ROLE_LABELS, type RoleKey } from '../src/common/rbac/roles';
import { NEW_TEAM_MEMBERS } from '../prisma/new-team-members';

const ORG_ID = process.env.ARTA_ORG_ID || 'org_arta_internal';

/**
 * El equipo oficial (seed + altas). En bases viejas conviven cuentas duplicadas
 * de un seed anterior (`@arta.mx`) con roles que ya no aplican: no se les
 * entregan credenciales salvo que se pida `--all`.
 */
const TEAM_EMAILS = [
  'arturo@artaproducciones.com',
  'chacho@artaproducciones.com',
  'rodrigo@arema.mx',
  'williams@artaproducciones.com',
  'leida@artaproducciones.com',
  'jp@artaproducciones.com',
  ...NEW_TEAM_MEMBERS.map((m) => m.email),
];

/** Sin letras ni números que se confunden al dictarlos (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generatePassword(): string {
  const block = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `Arta-${block(4)}-${block(4)}-${randomInt(10, 100)}`;
}

/** Qué ve y si edita cada rol, en palabras del cliente. */
const ACCESS: Record<string, { edita: boolean; texto: string }> = {
  super_admin: { edita: true, texto: 'Plataforma completa' },
  dir_general: { edita: true, texto: 'TODO de Arta y Auditorio Arema Explanada' },
  gerente_arta: { edita: true, texto: 'TODO de Arta' },
  dir_auditorio: { edita: true, texto: 'TODO del Auditorio · en Arta solo carpetas generales' },
  logistica: { edita: true, texto: 'Eventos, formatos, campaña y boletera (Arta y Auditorio)' },
  convenios: { edita: true, texto: 'Carpetas, convenios y formatos' },
  enlace_gobierno: { edita: true, texto: 'Carpetas y pagos de OC' },
  solo_carpetas: { edita: false, texto: 'Solo carpetas generales de Arta y Auditorio (para ver los shows)' },
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? 'true' : hit.slice(eq + 1);
}

function isLocalDatabase(url: string) {
  return /@(localhost|127\.0\.0\.1|db)(:\d+)?\//.test(url);
}

async function main() {
  const dry = !!arg('dry');
  const yes = !!arg('yes');
  const revoke = !!arg('revoke');
  const only = (arg('only') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const dbUrl = process.env.DATABASE_URL || '';

  if (!dry && !yes) {
    console.error('Falta --yes (o usa --dry para simular). No se escribió nada.');
    process.exit(1);
  }
  if (!dry && !isLocalDatabase(dbUrl) && !arg('confirm-produccion')) {
    console.error('La base no es local. Para cambiar contraseñas ahí agrega --confirm-produccion. No se escribió nada.');
    process.exit(1);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.resolve(arg('out') || path.join(process.cwd(), 'credenciales', `ARTA-credenciales-${stamp}.xlsx`));

  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        organizationId: ORG_ID,
        roleKey: { not: 'super_admin' },
        ...(only.length ? { email: { in: only } } : arg('all') ? {} : { email: { in: TEAM_EMAILS } }),
      },
      orderBy: [{ roleKey: 'asc' }, { fullName: 'asc' }],
      select: { id: true, fullName: true, email: true, title: true, roleKey: true, entities: true },
    });

    if (!users.length) {
      console.log('Nadie a quien generar credenciales.');
      return;
    }

    console.log(`${dry ? 'Simulación' : 'Credenciales'} para ${users.length} persona(s):`);
    for (const u of users) console.log(`  · ${u.fullName} <${u.email}> · ${u.roleKey}`);
    if (dry) {
      console.log('Simulación: no se escribió nada.');
      return;
    }

    const rows: Array<(typeof users)[number] & { password: string }> = [];
    for (const u of users) {
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: u.id },
          data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
        }),
        ...(revoke
          ? [prisma.userSession.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } })]
          : []),
        prisma.auditLog.create({
          data: {
            userId: u.id,
            organizationId: ORG_ID,
            action: 'user.password.seeded',
            resource: 'User',
            resourceId: u.id,
            metaJson: { revokedSessions: revoke },
          },
        }),
      ]);
      rows.push({ ...u, password });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ARTA';
    wb.created = new Date();
    const ws = wb.addWorksheet('Credenciales', { views: [{ state: 'frozen', ySplit: 3 }] });

    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = 'ARTA · Credenciales del panel';
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = `Generado ${stamp} · confidencial · pedir cambio de contraseña en el primer acceso`;
    ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF8A8A8A' } };

    const header = ['Nombre', 'Correo', 'Contraseña', 'Rol', 'Entidades', 'Puede editar', 'Acceso', 'Cargo'];
    ws.getRow(3).values = header;
    ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(3).alignment = { vertical: 'middle' };
    header.forEach((_, i) => {
      ws.getRow(3).getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111113' } };
    });
    ws.getRow(3).height = 22;

    for (const r of rows) {
      const access = ACCESS[r.roleKey] || { edita: true, texto: r.roleKey };
      const row = ws.addRow([
        r.fullName,
        r.email,
        r.password,
        ROLE_LABELS[r.roleKey as RoleKey] || r.roleKey,
        r.entities.map((e) => (e === 'ARTA' ? 'Arta' : 'Auditorio')).join(' + '),
        access.edita ? 'Sí' : 'No',
        access.texto,
        r.title || '',
      ]);
      row.getCell(3).font = { name: 'Consolas' };
      row.getCell(6).font = { bold: true, color: { argb: access.edita ? 'FF1F7A4D' : 'FFB3261E' } };
    }

    ws.columns = [
      { width: 26 },
      { width: 34 },
      { width: 22 },
      { width: 26 },
      { width: 18 },
      { width: 13 },
      { width: 56 },
      { width: 28 },
    ];
    ws.autoFilter = { from: 'A3', to: `H${rows.length + 3}` };

    fs.mkdirSync(path.dirname(out), { recursive: true });
    await wb.xlsx.writeFile(out);
    console.log(`Listo: ${rows.length} contraseña(s) nuevas${revoke ? ' y sesiones cerradas' : ''}.`);
    console.log(`Excel: ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
