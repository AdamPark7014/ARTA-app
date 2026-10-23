import {
  advanceNotice,
  campaignNotice,
  checklistNotice,
  BODY_MAX,
  chatMembershipNotice,
  chatReportNotice,
  clip,
  dayLabel,
  eventNotice,
  eventRiskNotice,
  facts,
  financeNotice,
  money,
  notice,
  poAgingNotice,
  poNotice,
  poRef,
  taskNotice,
  ticketingMilestoneNotice,
  TITLE_MAX,
  whenLabel,
} from './notification-text';

/** Viernes 23-oct-2026, 12:00 en Puebla (18:00 UTC). */
const NOW = new Date('2026-10-23T18:00:00.000Z');

describe('notification-text · piezas', () => {
  it('recorta en palabra y cierra con «…»', () => {
    expect(clip('Sonido Quetzal Pro para la Noche de Boleros', 20)).toBe('Sonido Quetzal Pro…');
    expect(clip('corto', 20)).toBe('corto');
  });

  it('une hechos sin vacíos', () => {
    expect(facts('Audio Puebla', null, '', '$18,000', undefined, 'Concierto')).toBe('Audio Puebla · $18,000 · Concierto');
  });

  it('dinero en pesos sin centavos de relleno', () => {
    expect(money(37700)).toBe('$37,700');
    expect(money('1250.5')).toBe('$1,250.50');
  });

  it('el folio es el mismo que imprime el PDF de la OC', () => {
    expect(poRef('cmh3k2abc4f2a9c')).toBe('OC 4F2A9C');
  });

  it('fechas en la hora de Puebla: hoy, mañana, ayer o el día', () => {
    expect(whenLabel('2026-10-24T00:00:00.000Z', NOW)).toBe('mañana'); // fecha «solo día» del panel
    expect(whenLabel('2026-10-24T00:00:00.000Z', NOW)).not.toContain('a las');
    expect(whenLabel('2026-10-24T00:00:00.000Z', NOW)).toBe(dayLabel('2026-10-24', NOW));
    expect(whenLabel('2026-10-24T00:30:00.000Z', NOW)).toBe('hoy a las 18:30'); // 18:30 del 23 en Puebla
    expect(whenLabel('2026-10-22T00:00:00.000Z', NOW)).toBe('ayer');
    expect(whenLabel('2026-10-31T00:00:00.000Z', NOW)).toBe('el sáb 31 oct');
    expect(whenLabel('2027-01-08T00:00:00.000Z', NOW)).toBe('el vie 8 ene 2027');
    expect(whenLabel(null, NOW)).toBe('');
  });

  it('si no cabe, se recortan los hechos y la acción se queda entera', () => {
    const n = notice('Título', 'x '.repeat(200), 'Autorízala o recházala.');
    expect(n.body.length).toBeLessThanOrEqual(BODY_MAX);
    expect(n.body.endsWith('Autorízala o recházala.')).toBe(true);
  });
});

describe('notification-text · órdenes de compra', () => {
  const order = { id: 'po-xyz123', vendorName: 'Sonido Quetzal Pro', amount: 37700, paymentMethod: 'TRANSFERENCIA' };
  /** Viernes 30-oct a las 20:00 en Puebla. */
  const event = { name: 'Noche de Boleros', startsAt: new Date('2026-10-31T02:00:00.000Z') };

  it('nueva OC: quién, cuál, a quién se paga, cuánto, en qué evento y qué se espera', () => {
    const n = poNotice('requested', { actor: 'Mateo Ríos', order, event, now: NOW });
    expect(n.title).toBe('Mateo R. pide autorizar la OC XYZ123');
    expect(n.body).toBe('Sonido Quetzal Pro · $37,700 · Noche de Boleros. Autorízala o recházala; el evento es el vie 30 oct.');
  });

  it('cambio de una OC por autorizar enseña el monto de antes y el de ahora', () => {
    const n = poNotice('updated', { actor: 'Mateo Ríos', order, event, previousAmount: 30000, now: NOW });
    expect(n.body).toContain('$30,000 → $37,700');
    expect(n.body).toContain('Revísala de nuevo');
  });

  it('autorizada: a quien la pidió le dice qué falta y cuándo se paga', () => {
    const n = poNotice('authorized', {
      actor: 'Arturo Taja',
      order,
      event,
      payDay: { open: false, next: 'el lunes' },
      now: NOW,
    });
    expect(n.title).toBe('Arturo T. autorizó tu OC XYZ123');
    expect(n.body).toContain('Falta el comprobante de transferencia y pagarla el lunes, próximo día de cobro.');
  });

  it('por pagar: a finanzas le pide el comprobante; en efectivo, solo el pago', () => {
    const transfer = poNotice('to_pay', { actor: 'Arturo Taja', order: { ...order, proofCount: 0 }, event, payDay: { open: true, next: null } });
    expect(transfer.title).toBe('Arturo T. autorizó la OC XYZ123: falta pagarla');
    expect(transfer.body).toContain('Transferencia');
    expect(transfer.body).toContain('Sube el comprobante y márcala pagada hoy, día de cobro.');
    const cash = poNotice('to_pay', { actor: 'Arturo Taja', order: { ...order, paymentMethod: 'EFECTIVO' }, event, payDay: null });
    expect(cash.body.endsWith('Márcala pagada.')).toBe(true);
  });

  it('pagada, rechazada, cancelada y eliminada dicen quién y qué OC', () => {
    expect(poNotice('paid', { actor: null, order, event }).title).toBe('Finanzas pagó tu OC XYZ123');
    expect(poNotice('rejected', { actor: 'Ana Ruiz', order, event }).body).toContain('No se pagará');
    expect(poNotice('cancelled', { actor: 'Ana Ruiz', order, event }).title).toBe('Ana R. canceló tu OC XYZ123');
    expect(poNotice('deleted_mine', { actor: 'Ana Ruiz', order, event }).title).toBe('Ana R. eliminó tu OC XYZ123');
    expect(poNotice('reverted_draft', { actor: 'Ana Ruiz', order, event }).title).toBe('Ana R. regresó tu OC XYZ123 a borrador');
  });

  it('comprobante subido: si ya está autorizada, solo falta marcarla pagada', () => {
    const n = poNotice('proof', {
      actor: 'Luis Gómez',
      order: { ...order, status: 'AUTHORIZED' },
      event,
      proofAmount: 37700,
      payDay: { open: true, next: null },
    });
    expect(n.title).toBe('Luis G. subió el comprobante de tu OC XYZ123');
    expect(n.body).toContain('Solo falta marcarla pagada hoy, día de cobro.');
  });

  it('recordatorio de OC estancadas: cuántas, cuánto, en qué paso y la más vieja', () => {
    const n = poAgingNotice({
      unauthorized: { count: 2, amount: 54000 },
      unpaid: { count: 1, amount: 18000 },
      oldest: { vendorName: 'Audio Puebla', eventName: 'Concierto', days: 12 },
    });
    expect(n.title).toBe('3 OC llevan más de 7 días abiertas');
    expect(n.body).toContain('2 sin autorizar ($54,000)');
    expect(n.body).toContain('1 autorizada sin pagar ($18,000)');
    expect(n.body).toContain('la más antigua: Audio Puebla · Concierto (12 días)');
  });

  it('títulos y cuerpos caben en el push', () => {
    const long = { ...order, vendorName: 'Proveedor con un nombre larguísimo de verdad '.repeat(4) };
    const n = poNotice('requested', { actor: 'Mateo Ríos', order: long, event: { name: 'Evento '.repeat(30) }, now: NOW });
    expect(n.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(n.body.length).toBeLessThanOrEqual(BODY_MAX);
    expect(n.body.endsWith('Autorízala o recházala.')).toBe(true);
  });
});

describe('notification-text · anticipos y corrida', () => {
  const event = { name: 'Noche de Boleros' };

  it('anticipo pedido: quién, cuánto, para qué y qué hacer', () => {
    const n = advanceNotice('requested', { actor: 'Mateo Ríos', label: 'Hotel del staff', amount: 5000, event });
    expect(n.title).toBe('Mateo R. pide un anticipo de $5,000');
    expect(n.body).toBe('Hotel del staff · Noche de Boleros. Apruébalo o recházalo.');
  });

  it('por pagar dice quién lo pidió; rechazado lleva el motivo', () => {
    expect(advanceNotice('to_pay', { actor: 'Arturo Taja', label: 'Anticipo', amount: 5000, event, requester: 'Mateo Ríos' }).body).toBe(
      '$5,000 · Noche de Boleros · lo pidió Mateo R. Págalo y márcalo pagado.',
    );
    expect(advanceNotice('rejected', { actor: 'Arturo Taja', amount: 5000, event, reason: 'Ya se pagó por OC' }).body).toContain(
      'Motivo: Ya se pagó por OC',
    );
  });

  it('sello de la corrida dice qué implica', () => {
    expect(financeNotice('sealed', { actor: 'Ana Ruiz', event }).body).toContain('hay que quitar el sello');
    expect(financeNotice('unlocked', { actor: 'Ana Ruiz', event, reason: 'Faltó un ingreso' }).body).toContain('Motivo: Faltó un ingreso');
  });
});

describe('notification-text · tareas', () => {
  const task = { title: 'Montar escenario', dueAt: '2026-10-24T00:00:00.000Z' };
  const event = { name: 'Noche de Boleros' };

  it('asignada: qué tarea, en qué evento y para cuándo', () => {
    const n = taskNotice('assigned', { actor: 'Ana Ruiz', task, event, now: NOW });
    expect(n.title).toBe('Ana R. te asignó: Montar escenario');
    expect(n.body).toBe('Noche de Boleros. Entrégala a más tardar mañana.');
  });

  it('corrección pedida: el motivo entre comillas y hasta cuándo', () => {
    const n = taskNotice('rejected', { actor: 'Ana Ruiz', task, event, note: 'Falta la firma', now: NOW });
    expect(n.title).toBe('Ana R. pide corregir: Montar escenario');
    expect(n.body).toBe('«Falta la firma» · Noche de Boleros. Corrígela y vuelve a entregarla a más tardar mañana.');
  });

  it('recordatorios del cron: cuándo vence en el título', () => {
    expect(taskNotice('due_soon', { task, event, now: NOW }).title).toBe('Vence mañana: Montar escenario');
    const overdue = taskNotice('overdue', { task: { ...task, dueAt: '2026-10-22T00:00:00.000Z' }, event, now: NOW });
    expect(overdue.title).toBe('Venció ayer: Montar escenario');
    expect(overdue.body).toContain('pide otra fecha');
  });

  it('sin fecha lo dice', () => {
    expect(taskNotice('assigned', { actor: 'Ana Ruiz', task: { title: 'Rider' }, event: null, now: NOW }).body).toBe(
      'No tiene fecha de entrega.',
    );
  });
});

describe('notification-text · eventos, chat y boletera', () => {
  it('cambio de fecha: ahora y antes', () => {
    const n = eventNotice('rescheduled', {
      actor: 'Ana Ruiz',
      event: { name: 'Noche de Boleros', startsAt: '2026-10-31T02:00:00.000Z' },
      previousStartsAt: '2026-10-25T02:00:00.000Z',
      now: NOW,
    });
    expect(n.title).toBe('Ana R. cambió la fecha de Noche de Boleros');
    expect(n.body).toBe('ahora el vie 30 oct a las 20:00 · antes mañana a las 20:00. Revisa las fechas de tus tareas.');
  });

  it('cerrado dice qué implica', () => {
    expect(eventNotice('closed', { actor: 'Ana Ruiz', event: { name: 'Concierto' }, now: NOW }).body).toBe(
      'Ya no se editan tareas, formatos ni OC.',
    );
  });

  it('evento en riesgo: nombre, avance y días', () => {
    const n = eventRiskNotice({ name: 'Noche de Boleros', avg: 35, days: 5 });
    expect(n.title).toBe('En riesgo: Noche de Boleros');
    expect(n.body).toBe('formatos al 35 % · faltan 5 días. Revisa los formatos pendientes.');
  });

  it('chat: quién te agregó y a dónde; reporte dice dónde', () => {
    expect(chatMembershipNotice('added', { actor: 'Ana Ruiz', channel: { name: 'Producción', isGroupDm: true } }).title).toBe(
      'Ana R. te agregó al grupo Producción',
    );
    expect(chatMembershipNotice('removed', { actor: 'Ana Ruiz', channel: { name: 'produccion', isGroupDm: false } }).title).toBe(
      'Ana R. te quitó de #produccion',
    );
    const r = chatReportNotice({ where: '#general', reason: 'Spam', author: 'Luis Pérez', preview: 'compra ya' });
    expect(r.title).toBe('Reportaron un mensaje en #general');
    expect(r.body).toBe('Spam · Luis P.: «compra ya». Revísalo y decide si se oculta.');
  });

  it('boletera: cuántos boletos y cuándo es el evento', () => {
    const n = ticketingMilestoneNotice({
      event: { name: 'Noche de Boleros', startsAt: '2026-10-31T02:00:00.000Z' },
      milestone: 100,
      sold: 1200,
      capacity: 1200,
      now: NOW,
    });
    expect(n.title).toBe('Boletos agotados: Noche de Boleros');
    expect(n.body).toBe('1,200 de 1,200 boletos · el evento es el vie 30 oct');
  });
});

describe('notification-text · formatos y campañas', () => {
  it('formato a revisión: cuál, de qué evento y qué hacer', () => {
    const n = checklistNotice('submitted', { actor: 'Ana Ruiz', doc: { title: 'Rider técnico' }, event: { name: 'Concierto' } });
    expect(n.title).toBe('Ana R. mandó a revisión: Rider técnico');
    expect(n.body).toBe('Concierto. Apruébalo o regrésalo a borrador.');
    expect(checklistNotice('signature_needed', { actor: 'Ana Ruiz', doc: { title: 'Rider' }, event: { name: 'X' } }).body).toContain(
      'Falta la firma de autorización',
    );
  });

  it('campaña a revisión: de qué evento, cuándo es y qué hacer', () => {
    const n = campaignNotice('REVIEW', {
      actor: 'Ana Ruiz',
      scope: 'convenios',
      event: { name: 'Noche de Boleros', startsAt: '2026-10-31T02:00:00.000Z' },
      now: NOW,
    });
    expect(n.title).toBe('Ana R. mandó a revisión la campaña de convenios');
    expect(n.body).toBe('Noche de Boleros · el evento es el vie 30 oct. Autorízala o regrésala a borrador.');
  });
});
