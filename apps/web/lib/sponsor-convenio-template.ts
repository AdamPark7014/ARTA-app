import * as XLSX from 'xlsx';

export type SponsorConvenioInput = {
  eventName: string;
  artist?: string | null;
  venue?: string | null;
  city?: string | null;
  startsAt?: string | null;
  promoter?: string | null;
  sponsor: {
    name: string;
    tier?: string | null;
    status?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    contact?: string | null;
    contribution?: string | null;
    amount?: number | string | null;
    benefits?: string | null;
    deliverables?: string | null;
    paymentTerms?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    notes?: string | null;
  };
};

function money(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

function lines(text?: string | null): string[] {
  if (!text?.trim()) return ['—'];
  return text
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Excel de convenio comercial (copia de trabajo editable). */
export function buildSponsorConvenioWorkbook(input: SponsorConvenioInput) {
  const s = input.sponsor;
  const amount = s.amount != null && s.amount !== '' ? Number(s.amount) : null;

  const meta = [
    ['CONVENIO DE PATROCINIO · ARTA PRODUCCIONES'],
    [],
    ['Evento', input.eventName],
    ['Artista', input.artist || '—'],
    ['Venue', input.venue || '—'],
    ['Ciudad', input.city || '—'],
    ['Fecha del show', fmtDate(input.startsAt)],
    ['Promotor', input.promoter || 'ARTA PRODUCCIONES'],
    [],
    ['Patrocinador', s.name],
    ['Nivel / tier', s.tier || '—'],
    ['Estatus', s.status || 'PROPOSED'],
    ['Tipo de aportación', s.contribution || '—'],
    ['Monto (MXN)', amount != null && !Number.isNaN(amount) ? money(amount) : '—'],
    ['Vigencia desde', fmtDate(s.validFrom)],
    ['Vigencia hasta', fmtDate(s.validUntil)],
    [],
    ['Contacto comercial', s.contactName || '—'],
    ['Correo', s.contactEmail || '—'],
    ['Teléfono', s.contactPhone || s.contact || '—'],
    [],
    ['Condiciones de pago', s.paymentTerms || '—'],
    ['Notas', s.notes || '—'],
  ];

  const benefitsSheet = [
    ['BENEFICIOS PARA LA MARCA'],
    ['#', 'Beneficio / derecho'],
    ...lines(s.benefits).map((b, i) => [i + 1, b]),
  ];

  const deliverablesSheet = [
    ['ENTREGABLES DE ARTA / EVENTO'],
    ['#', 'Entregable', 'Estatus'],
    ...lines(s.deliverables).map((d, i) => [i + 1, d, 'Pendiente']),
  ];

  const firmas = [
    ['FIRMAS'],
    [],
    ['Por ARTA PRODUCCIONES', '', 'Por EL PATROCINADOR'],
    ['Nombre:', '', 'Nombre:'],
    ['Cargo:', '', 'Cargo:'],
    ['Fecha:', '', 'Fecha:'],
    ['Firma:', '', 'Firma:'],
  ];

  const wb = XLSX.utils.book_new();
  const wsMeta = XLSX.utils.aoa_to_sheet(meta);
  wsMeta['!cols'] = [{ wch: 28 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Convenio');

  const wsBen = XLSX.utils.aoa_to_sheet(benefitsSheet);
  wsBen['!cols'] = [{ wch: 4 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsBen, 'Beneficios');

  const wsDel = XLSX.utils.aoa_to_sheet(deliverablesSheet);
  wsDel['!cols'] = [{ wch: 4 }, { wch: 55 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsDel, 'Entregables');

  const wsSig = XLSX.utils.aoa_to_sheet(firmas);
  wsSig['!cols'] = [{ wch: 28 }, { wch: 8 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsSig, 'Firmas');

  return wb;
}

/** Portfolio de todos los patrocinios del evento. */
export function buildSponsorsPortfolioWorkbook(
  event: Omit<SponsorConvenioInput, 'sponsor'>,
  sponsors: SponsorConvenioInput['sponsor'][],
) {
  const rows: (string | number)[][] = [
    ['PORTAFOLIO DE PATROCINIOS · ' + event.eventName],
    ['Venue', event.venue || '—', 'Fecha', fmtDate(event.startsAt)],
    [],
    [
      'Marca',
      'Tier',
      'Estatus',
      'Aportación',
      'Monto MXN',
      'Contacto',
      'Correo',
      'Teléfono',
      'Vigencia',
    ],
  ];
  for (const s of sponsors) {
    const amount = s.amount != null && s.amount !== '' ? Number(s.amount) : '';
    rows.push([
      s.name,
      s.tier || '',
      s.status || '',
      s.contribution || '',
      typeof amount === 'number' && !Number.isNaN(amount) ? amount : '',
      s.contactName || '',
      s.contactEmail || '',
      s.contactPhone || s.contact || '',
      `${fmtDate(s.validFrom)} – ${fmtDate(s.validUntil)}`,
    ]);
  }
  const total = sponsors.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  rows.push([]);
  rows.push(['TOTAL APORTACIÓN', '', '', '', total]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 22 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 24 },
    { wch: 14 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Portafolio');
  return wb;
}

export function workbookToXlsxBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function sponsorConvenioFileName(sponsorName: string, eventName: string) {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'convenio';
  return `CONVENIO-${slug(sponsorName)}-${slug(eventName)}.xlsx`;
}

export function sponsorsPortfolioFileName(eventName: string) {
  const slug =
    eventName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'evento';
  return `PATROCINIOS-${slug}.xlsx`;
}

/** PDF de convenio (una hoja) para circular o firmar. */
export async function buildSponsorConvenioPdfBlob(input: SponsorConvenioInput): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const s = input.sponsor;
  const amount =
    s.amount != null && s.amount !== '' && !Number.isNaN(Number(s.amount))
      ? money(Number(s.amount))
      : '—';

  let y = 750;
  const left = 48;
  const width = 516;
  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.4, 0.4, 0.4);
  const gold = rgb(0.72, 0.55, 0.2);

  const write = (text: string, size: number, f = font, color = ink) => {
    page.drawText(text, { x: left, y, size, font: f, color });
    y -= size + 6;
  };

  write('ARTA PRODUCCIONES', 11, bold, gold);
  write('CONVENIO DE PATROCINIO', 18, bold);
  y -= 4;
  page.drawLine({
    start: { x: left, y },
    end: { x: left + width, y },
    thickness: 1,
    color: gold,
  });
  y -= 18;

  write(`Evento: ${input.eventName}`, 11, bold);
  write(
    `${input.artist || '—'} · ${input.venue || '—'}, ${input.city || '—'} · ${fmtDate(input.startsAt)}`,
    10,
    font,
    muted,
  );
  y -= 8;

  write(`Patrocinador: ${s.name}`, 12, bold);
  write(`Nivel: ${s.tier || '—'}   ·   Aportación: ${s.contribution || '—'}   ·   Monto: ${amount}`, 10);
  write(`Vigencia: ${fmtDate(s.validFrom)} — ${fmtDate(s.validUntil)}`, 10, font, muted);
  y -= 6;

  write('Contacto comercial', 11, bold);
  write(
    `${s.contactName || '—'} · ${s.contactEmail || '—'} · ${s.contactPhone || s.contact || '—'}`,
    10,
  );
  y -= 8;

  write('Beneficios para la marca', 11, bold);
  for (const line of lines(s.benefits).slice(0, 8)) {
    write(`• ${line}`, 10);
  }
  y -= 6;

  write('Entregables del evento', 11, bold);
  for (const line of lines(s.deliverables).slice(0, 8)) {
    write(`• ${line}`, 10);
  }
  y -= 6;

  if (s.paymentTerms?.trim()) {
    write('Condiciones de pago', 11, bold);
    write(s.paymentTerms.trim().slice(0, 280), 10);
    y -= 6;
  }
  if (s.notes?.trim()) {
    write('Notas', 11, bold);
    write(s.notes.trim().slice(0, 280), 10, font, muted);
  }

  y = Math.min(y, 160);
  page.drawLine({
    start: { x: left, y },
    end: { x: left + width, y },
    thickness: 0.5,
    color: muted,
  });
  y -= 28;
  write('Por ARTA PRODUCCIONES                    Por EL PATROCINADOR', 10, bold);
  y -= 36;
  write('________________________                 ________________________', 10, font, muted);
  write('Nombre / cargo / fecha                   Nombre / cargo / fecha', 9, font, muted);

  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export function sponsorConvenioPdfFileName(sponsorName: string, eventName: string) {
  return sponsorConvenioFileName(sponsorName, eventName).replace(/\.xlsx$/i, '.pdf');
}
