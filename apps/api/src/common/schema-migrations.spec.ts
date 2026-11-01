import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El esquema y las migraciones no pueden separarse. Las pruebas del API corren con
 * Prisma de mentira, así que una migración olvidada no truena en ninguna y se descubre
 * en producción: el 01-11-2026 se desplegó `ChatMessageRef` sin su tabla y el chat y los
 * avisos fallaron unos minutos. Esto lo detiene antes de subir.
 */
const PRISMA_DIR = join(__dirname, '..', '..', 'prisma');

function allMigrations(): string {
  const dir = join(PRISMA_DIR, 'migrations');
  return readdirSync(dir)
    .map((name) => join(dir, name, 'migration.sql'))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

type Model = { name: string; columns: string[] };

/** Modelos del esquema con sus columnas: sin relaciones, listas ni campos sin columna. */
function models(schema: string): Model[] {
  const enums = new Set([...schema.matchAll(/^enum (\w+)/gm)].map((m) => m[1]));
  const names = new Set([...schema.matchAll(/^model (\w+)/gm)].map((m) => m[1]));
  const scalars = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);
  const out: Model[] = [];
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const columns: string[] = [];
    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const field = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(line);
      if (!field) continue;
      const type = field[2];
      if (names.has(type)) continue;
      if (scalars.has(type) || enums.has(type)) columns.push(field[1]);
    }
    out.push({ name: m[1], columns });
  }
  return out;
}

describe('esquema y migraciones', () => {
  const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
  const sql = allMigrations();

  it('cada modelo tiene su tabla en alguna migración', () => {
    const missing = models(schema)
      .filter((m) => !new RegExp(`CREATE TABLE (IF NOT EXISTS )?"${m.name}"`).test(sql))
      .map((m) => m.name);
    expect(missing).toEqual([]);
  });

  it('cada columna del esquema aparece en alguna migración', () => {
    const missing: string[] = [];
    for (const m of models(schema)) {
      for (const column of m.columns) {
        if (!sql.includes(`"${column}"`)) missing.push(`${m.name}.${column}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('las columnas de los avisos y de las referencias están creadas', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "targetKind"/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "ChatMessageRef"/);
  });
});
