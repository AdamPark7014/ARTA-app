import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { join } from 'path';
import { promises as fs } from 'fs';

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production' && !process.env.E2E_PORT) return notFound();
  const url = new URL(req.url);
  const name = url.searchParams.get('name');
  if (!name || !/^[A-Z_]+\.xlsx$/i.test(name)) return NextResponse.json({ error: 'bad name' }, { status: 400 });
  // Resolve from repo root in dev/e2e; Next standalone can change cwd.
  const candidates = [
    join(process.cwd(), 'apps/api/assets/format-sources', name),
    join(process.cwd(), '../../apps/api/assets/format-sources', name),
    join('/workspace', 'apps/api/assets/format-sources', name),
  ];
  let path = candidates[0];
  try {
    // pick the first that exists
    for (const p of candidates) {
      try {
        await fs.access(p);
        path = p;
        break;
      } catch {
        /* keep looking */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const buf = await fs.readFile(path);
    return new NextResponse(buf, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return notFound();
  }
}

