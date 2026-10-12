/**
 * Auditoría de «cortes» por DOM (pedido de Adam, 11-10-2026: «tiene muchos
 * cortes no agradables»). Corre dentro de la página con `page.evaluate` y
 * reporta:
 *
 * a) texto cortado: puntos suspensivos, `line-clamp` o desborde oculto;
 * b) elementos recortados por un ancestro con overflow o por el borde de la ventana;
 *    y contenedores con scroll que cortan un ítem a la mitad sin desvanecido;
 * c) scroll horizontal de la página;
 * d) controles que se enciman (o que tapa otra cosa en su centro);
 * e) contraste de texto menor a 4.5:1 (3:1 en texto grande).
 *
 * Todo vive dentro de la función porque Playwright la serializa tal cual.
 */

export type AuditIssue = {
  kind: string;
  path: string;
  text?: string;
  detail?: string;
  justified?: boolean;
};

export type AuditResult = {
  url: string;
  viewport: { w: number; h: number };
  hscroll: AuditIssue | null;
  text: AuditIssue[];
  clip: AuditIssue[];
  scrollers: AuditIssue[];
  overlap: AuditIssue[];
  contrast: AuditIssue[];
};

export function domAudit(): AuditResult {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;

  const short = (s: string | null | undefined, n = 70) => {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n)}…` : t;
  };

  const path = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    for (let i = 0; cur && i < 4 && cur !== document.body; i++) {
      const cls = Array.from(cur.classList)
        .filter((c) => !/^(is-|has-|active$|__)/.test(c) && !/^[a-z]+-[0-9a-f]{6,}/.test(c))
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join('');
      parts.unshift(`${cur.tagName.toLowerCase()}${cls}`);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };

  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const anyEl = el as Element & {
      checkVisibility?: (o?: Record<string, boolean>) => boolean;
    };
    if (anyEl.checkVisibility && !anyEl.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
      return false;
    const cs = getComputedStyle(el);
    // sr-only y similares
    if (cs.clip && cs.clip !== 'auto' && cs.position === 'absolute') return false;
    if (cs.clipPath && cs.clipPath.startsWith('inset(50%')) return false;
    return true;
  };

  const ownText = (el: Element) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent || '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

  const hasTitle = (el: Element) => {
    const t = el.closest('[title]');
    if (t && (t.getAttribute('title') || '').trim()) return true;
    return false;
  };

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'SVG', 'PATH', 'path', 'HEAD', 'META', 'LINK']);
  const all = Array.from(document.body.querySelectorAll('*')).filter(
    (el) => !SKIP.has(el.tagName) && !(el.closest('svg') && el.tagName.toLowerCase() !== 'svg'),
  );
  const vis = new Map<Element, boolean>();
  const isVis = (el: Element) => {
    if (!vis.has(el)) vis.set(el, visible(el));
    return vis.get(el)!;
  };

  const out: AuditResult = {
    url: location.pathname + location.search,
    viewport: { w: vw, h: vh },
    hscroll: null,
    text: [],
    clip: [],
    scrollers: [],
    overlap: [],
    contrast: [],
  };

  // ── c) scroll horizontal de la página ──────────────────────────────────
  const docSW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (docSW > vw + 1) {
    const culprits = all
      .filter((el) => {
        if (!isVis(el)) return false;
        const r = el.getBoundingClientRect();
        return r.right > vw + 1 && getComputedStyle(el).position !== 'fixed';
      })
      .slice(0, 6)
      .map((el) => `${path(el)} (→${Math.round(el.getBoundingClientRect().right)})`);
    out.hscroll = { kind: 'hscroll', path: 'document', detail: `scrollWidth ${docSW} > ${vw}; ${culprits.join(' | ')}` };
  }

  const FORM = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);

  // ── a) texto cortado ───────────────────────────────────────────────────
  for (const el of all) {
    if (FORM.has(el.tagName)) continue;
    if (!isVis(el)) continue;
    const txt = (el.textContent || '').trim();
    if (!txt) continue;
    const cs = getComputedStyle(el);
    const he = el as HTMLElement;
    const clamp = (cs as unknown as Record<string, string>).webkitLineClamp;
    let kind = '';
    if (cs.textOverflow === 'ellipsis' && he.scrollWidth > he.clientWidth + 1) kind = 'ellipsis';
    else if (clamp && clamp !== 'none' && he.scrollHeight > he.clientHeight + 2) kind = `clamp-${clamp}`;
    else if (
      (cs.overflowX === 'hidden' || cs.overflowX === 'clip') &&
      cs.whiteSpace.startsWith('nowrap') &&
      he.scrollWidth > he.clientWidth + 1 &&
      ownText(el)
    )
      kind = 'clipped-text';
    if (!kind) continue;
    const titled = hasTitle(el);
    out.text.push({
      kind,
      path: path(el),
      text: short(txt),
      detail: `${he.scrollWidth}>${he.clientWidth}${titled ? ' · title' : ''}`,
      // Un renglón con title es aceptable; un clamp a 2+ líneas también.
      justified: (kind === 'ellipsis' && titled) || (kind.startsWith('clamp-') && clamp !== '1' && titled),
    });
  }

  // ── b) recortes por overflow de un ancestro o por la ventana ──────────
  const clipCache = new Map<Element, { scroll: boolean; masked: boolean } | null>();
  const clipInfo = (a: Element) => {
    if (clipCache.has(a)) return clipCache.get(a)!;
    const cs = getComputedStyle(a);
    const ox = cs.overflowX;
    const oy = cs.overflowY;
    let info: { scroll: boolean; masked: boolean } | null = null;
    if (ox !== 'visible' || oy !== 'visible') {
      const mask =
        (cs as unknown as Record<string, string>).webkitMaskImage || (cs as unknown as Record<string, string>).maskImage;
      info = {
        scroll: ['auto', 'scroll'].includes(ox) || ['auto', 'scroll'].includes(oy),
        masked: !!mask && mask !== 'none',
      };
    }
    clipCache.set(a, info);
    return info;
  };

  const reported = new Set<Element>();
  const scrollersSeen = new Map<Element, number>();
  const LEAF = (el: Element) =>
    !!ownText(el) ||
    ['A', 'BUTTON', 'IMG', 'INPUT', 'SELECT', 'TEXTAREA', 'svg'].includes(el.tagName) ||
    el.getAttribute('role') === 'tab';

  for (const el of all) {
    if (!LEAF(el) || !isVis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    // ¿Fijo fuera de pantalla (cajón cerrado)? No cuenta.
    let L = 0;
    let T = 0;
    let R = vw;
    let B = Number.POSITIVE_INFINITY;
    let clipper: Element | null = null;
    let clipperScroll = false;
    let masked = false;
    let fixedAnc = false;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.position === 'fixed') fixedAnc = true;
      const info = clipInfo(a);
      if (!info) continue;
      if (info.masked) masked = true;
      const ar = a.getBoundingClientRect();
      const he = a as HTMLElement;
      const cl = ar.left + he.clientLeft;
      const ct = ar.top + he.clientTop;
      const cr = cl + he.clientWidth;
      const cb = ct + he.clientHeight;
      const before = [L, T, R, B];
      L = Math.max(L, cl);
      T = Math.max(T, ct);
      R = Math.min(R, cr);
      B = Math.min(B, cb);
      const cuts =
        r.left < cl - 2 || r.right > cr + 2 || r.top < ct - 2 || r.bottom > cb + 2;
      if (cuts && !clipper && (L !== before[0] || T !== before[1] || R !== before[2] || B !== before[3])) {
        clipper = a;
        clipperScroll = info.scroll;
      }
    }
    const ix = Math.max(0, Math.min(r.right, R) - Math.max(r.left, L));
    const iy = Math.max(0, Math.min(r.bottom, B) - Math.max(r.top, T));
    const visibleArea = ix * iy;
    const area = r.width * r.height;
    if (visibleArea <= 0) continue; // del todo escondido: no es un corte visible
    if (visibleArea >= area * 0.985) continue;
    // Si el padre ya se reportó por el mismo corte, no repetir.
    if (el.parentElement && reported.has(el.parentElement)) {
      reported.add(el);
      continue;
    }
    reported.add(el);
    const outsideX = r.left < L - 2 || r.right > R + 2;
    const byViewport = !clipper && outsideX;
    if (!clipper && !byViewport) continue;
    if (clipper && clipperScroll) {
      scrollersSeen.set(clipper, (scrollersSeen.get(clipper) || 0) + 1);
      if (masked) continue; // corte suave: el contenedor se desvanece
    }
    if (fixedAnc && byViewport && (r.right < 0 || r.left > vw)) continue;
    out.clip.push({
      kind: byViewport ? 'viewport-x' : clipperScroll ? 'scroll-edge' : 'hidden-clip',
      path: path(el),
      text: short(el.textContent || el.getAttribute('aria-label') || ''),
      detail: clipper
        ? `por ${path(clipper)} (${Math.round((visibleArea / area) * 100)}% visible)`
        : `fuera de la ventana (${Math.round(r.left)}→${Math.round(r.right)} de ${vw})`,
    });
  }

  // Contenedores con scroll que desbordan (para revisar desvanecidos).
  for (const el of all) {
    const info = clipInfo(el);
    if (!info || !info.scroll || !isVis(el)) continue;
    const he = el as HTMLElement;
    const xo = he.scrollWidth > he.clientWidth + 1;
    const yo = he.scrollHeight > he.clientHeight + 1;
    if (!xo && !yo) continue;
    const cs = getComputedStyle(el);
    const scrollX = ['auto', 'scroll'].includes(cs.overflowX);
    const scrollY = ['auto', 'scroll'].includes(cs.overflowY);
    if (!((xo && scrollX) || (yo && scrollY))) continue;
    out.scrollers.push({
      kind: `${xo && scrollX ? 'x' : ''}${yo && scrollY ? 'y' : ''}`,
      path: path(el),
      detail: `${info.masked ? 'con desvanecido' : 'SIN desvanecido'}; ${scrollersSeen.get(el) || 0} ítems a medias`,
      justified: info.masked || !scrollersSeen.get(el),
    });
  }

  // ── d) controles encimados ────────────────────────────────────────────
  /** Caja visible de verdad: recortada por cada ancestro con overflow. */
  const visibleRect = (el: Element): DOMRect | null => {
    const r = el.getBoundingClientRect();
    let L = r.left;
    let T = r.top;
    let R = r.right;
    let B = r.bottom;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (!clipInfo(a)) continue;
      const ar = a.getBoundingClientRect();
      const he = a as HTMLElement;
      L = Math.max(L, ar.left + he.clientLeft);
      T = Math.max(T, ar.top + he.clientTop);
      R = Math.min(R, ar.left + he.clientLeft + he.clientWidth);
      B = Math.min(B, ar.top + he.clientTop + he.clientHeight);
    }
    if (R - L < 4 || B - T < 4) return null;
    if ((R - L) * (B - T) < r.width * r.height * 0.5) return null;
    return new DOMRect(L, T, R - L, B - T);
  };
  const inter: Element[] = [];
  const rects: DOMRect[] = [];
  for (const el of all) {
    if (!el.matches('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem]'))
      continue;
    if (!isVis(el)) continue;
    const r = visibleRect(el);
    if (!r) continue;
    if (!(r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw)) continue;
    inter.push(el);
    rects.push(r);
  }
  /**
   * Capas que a propósito van encima de la pantalla (modal, menú, panel de
   * avisos, cajón del menú en el teléfono): lo que tapan no es un choque.
   */
  const LAYER =
    '.modal-backdrop, [role=dialog], [role=menu], [role=listbox], .notif-panel, .account__menu, .ev-more__menu, .shell-backdrop, .shell--nav-open > .sidebar, .topbar-search__results, .topbar-search.has-query';
  const layerOf = (el: Element) => el.closest(LAYER);
  const anyLayerOpen = !!document.querySelector(LAYER);
  for (let i = 0; i < inter.length; i++) {
    for (let j = i + 1; j < inter.length; j++) {
      const a = inter[i];
      const b = inter[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (layerOf(a) !== layerOf(b)) continue;
      const ra = rects[i];
      const rb = rects[j];
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 2 && oy > 2) {
        out.overlap.push({
          kind: 'overlap',
          path: `${path(a)}  ×  ${path(b)}`,
          text: `${short(a.textContent || a.getAttribute('aria-label'), 30)} × ${short(b.textContent || b.getAttribute('aria-label'), 30)}`,
          detail: `${Math.round(ox)}×${Math.round(oy)}px`,
        });
      }
    }
  }
  // Tapados en el centro por otra cosa (barra fija, capa).
  for (let i = 0; i < inter.length; i++) {
    const el = inter[i];
    const r = rects[i];
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue;
    const top = document.elementFromPoint(cx, cy);
    if (!top || el.contains(top) || top.contains(el)) continue;
    // Una etiqueta que envuelve el control cuenta como el mismo.
    if (top.closest('label') && top.closest('label')!.contains(el)) continue;
    // Debajo de una capa abierta: tapado a propósito.
    if (anyLayerOpen && layerOf(top) && layerOf(top) !== layerOf(el)) continue;
    out.overlap.push({
      kind: 'occluded',
      path: path(el),
      text: short(el.textContent || el.getAttribute('aria-label'), 40),
      detail: `tapado por ${path(top)}`,
    });
  }

  // ── e) contraste ──────────────────────────────────────────────────────
  type RGBA = [number, number, number, number];
  const parse = (c: string): RGBA | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) {
      const srgb = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
      if (srgb)
        return [+srgb[1] * 255, +srgb[2] * 255, +srgb[3] * 255, srgb[4] === undefined ? 1 : +srgb[4]];
      return null;
    }
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
  };
  const over = (fg: RGBA, bg: RGBA): RGBA => {
    const a = fg[3] + bg[3] * (1 - fg[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [
      (fg[0] * fg[3] + bg[0] * bg[3] * (1 - fg[3])) / a,
      (fg[1] * fg[3] + bg[1] * bg[3] * (1 - fg[3])) / a,
      (fg[2] * fg[3] + bg[2] * bg[3] * (1 - fg[3])) / a,
      a,
    ];
  };
  const lum = (c: RGBA) =>
    [c[0], c[1], c[2]]
      .map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      })
      .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: RGBA, b: RGBA) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const firstGradientColor = (img: string): RGBA | null => {
    const m = img.match(/rgba?\([^)]+\)/g);
    if (!m || !m.length) return null;
    // Promedio simple de las paradas: aproximación suficiente para degradados suaves.
    const cs = m.map((x) => parse(x)!).filter(Boolean);
    const n = cs.length;
    return [
      cs.reduce((s, c) => s + c[0], 0) / n,
      cs.reduce((s, c) => s + c[1], 0) / n,
      cs.reduce((s, c) => s + c[2], 0) / n,
      cs.reduce((s, c) => s + c[3], 0) / n,
    ];
  };
  const backgroundOf = (el: Element): { bg: RGBA; unsure: boolean } => {
    const layers: RGBA[] = [];
    let unsure = false;
    for (let a: Element | null = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const img = cs.backgroundImage;
      if (img && img !== 'none') {
        if (img.includes('url(')) unsure = true;
        const g = firstGradientColor(img);
        if (g && g[3] > 0) layers.push(g);
      }
      const bc = parse(cs.backgroundColor);
      if (bc && bc[3] > 0) layers.push(bc);
      if (layers.length && layers[layers.length - 1][3] >= 0.999) break;
    }
    let bg: RGBA = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return { bg, unsure };
  };

  const seenContrast = new Set<string>();
  for (const el of all) {
    const t = ownText(el);
    if (!t || t.length < 2 || FORM.has(el.tagName)) continue;
    if (!isVis(el)) continue;
    if (el.closest('[disabled], [aria-disabled="true"], .is-disabled')) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh * 3) continue;
    const cs = getComputedStyle(el);
    if ((cs as unknown as Record<string, string>).webkitTextFillColor?.includes('rgba(0, 0, 0, 0)')) continue;
    let fg = parse(cs.color);
    if (!fg) continue;
    let op = 1;
    for (let a: Element | null = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity || 1);
    const { bg, unsure } = backgroundOf(el);
    fg = [fg[0], fg[1], fg[2], fg[3] * op];
    const fgOn = over(fg, bg);
    const cr = ratio(fgOn, bg);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const min = large ? 3 : 4.5;
    if (cr + 0.01 < min) {
      const key = `${path(el)}|${t.slice(0, 20)}`;
      if (seenContrast.has(key)) continue;
      seenContrast.add(key);
      out.contrast.push({
        kind: unsure ? 'contrast?' : 'contrast',
        path: path(el),
        text: short(t, 40),
        detail: `${cr.toFixed(2)}:1 (${size}px${bold ? ' bold' : ''}) fg ${cs.color} bg rgb(${bg
          .slice(0, 3)
          .map((v) => Math.round(v))
          .join(',')})`,
      });
    }
  }

  return out;
}
