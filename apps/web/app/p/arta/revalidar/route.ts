import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { apiBase } from '@/lib/site-seo';

/**
 * Studio llama aquí al publicar para que el cambio se vea al momento en vez de esperar la caché.
 * Solo quien entra a Studio: se le pregunta al API con la misma sesión.
 */
export async function POST(request: NextRequest) {
  const cookie = request.headers.get('cookie') || '';
  const allowed = await fetch(`${apiBase()}/studio/slides`, { headers: { cookie }, cache: 'no-store' })
    .then((res) => res.ok)
    .catch(() => false);
  if (!allowed) return NextResponse.json({ ok: false }, { status: 403 });
  revalidateTag('sitio');
  revalidatePath('/p/arta', 'layout');
  return NextResponse.json({ ok: true });
}
