import type { EntityKey } from '@/lib/api';

type NoticeLink = { linkUrl?: string | null; entity?: string | null };

/**
 * Abre la liga de un aviso en su unidad y en el punto exacto.
 *
 * - Las OC, los anticipos y las listas solo buscan en la unidad activa: un aviso del Auditorio tocado
 *   estando en Arta abría la página y no encontraba nada. Se cambia de unidad primero.
 * - Varias páginas leen `?po=`, `?checklist=` o `?tab=` al montarse: un aviso de la misma página (otra
 *   OC de la torre, otro formato del mismo evento) no hacía nada. Ahí se navega completo.
 */
export function openNoticeLink(
  notice: NoticeLink,
  ctx: { entity: string; entities?: string[] | null; setEntity: (e: EntityKey) => void; push: (url: string) => void },
) {
  if (!notice.linkUrl) return;
  const target = notice.entity;
  if (target && target !== ctx.entity && (ctx.entities ?? []).includes(target)) ctx.setEntity(target as EntityKey);
  if (typeof window !== 'undefined') {
    const next = new URL(notice.linkUrl, window.location.origin);
    if (next.pathname === window.location.pathname && next.search !== window.location.search) {
      window.location.assign(next.pathname + next.search + next.hash);
      return;
    }
  }
  ctx.push(notice.linkUrl);
}
