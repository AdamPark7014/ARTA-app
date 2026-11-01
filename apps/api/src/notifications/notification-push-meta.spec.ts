import { pushMetaFor, shortName, pushActionsFor, pushCategoryFor, targetFromLink } from './notification-push-meta';

describe('pushMetaFor', () => {
  it.each([
    ['chat.mention', 'chat', 'high'],
    ['po.requested', 'approvals', 'high'],
    ['campaign.review', 'approvals', 'high'],
    ['convenios.review', 'approvals', 'high'],
    ['task.submitted', 'approvals', 'high'],
    ['task.assigned', 'tasks', 'high'],
    ['task.done', 'tasks', 'normal'],
    ['po.paid', 'finance', 'normal'],
    ['campaign.paid', 'finance', 'normal'],
    ['campaign.authorized', 'approvals', 'normal'],
    ['event.updated', 'events', 'normal'],
    ['event.deleted', 'events', 'high'],
    ['po.updated', 'approvals', 'high'],
    ['po.aging', 'approvals', 'normal'],
    ['task.unassigned', 'tasks', 'normal'],
    ['task.reopened', 'tasks', 'high'],
    ['task.due_soon', 'tasks', 'high'],
    ['checklist.signature_needed', 'approvals', 'high'],
    ['checklist.returned', 'approvals', 'normal'],
    ['checklist.approved', 'documents', 'normal'],
    ['document.updated', 'documents', 'normal'],
    ['file.uploaded', 'documents', 'normal'],
    ['folder.shared', 'documents', 'normal'],
    ['ticketing.sold_out', 'events', 'high'],
    ['calendar.note', 'general', 'normal'],
    ['algo.nuevo', 'general', 'normal'],
  ])('%s → %s / %s', (type, channel, priority) => {
    expect(pushMetaFor(type)).toEqual({ channel, priority });
  });
});

describe('shortName', () => {
  it('nombre y la inicial del apellido', () => {
    expect(shortName('Arturo Taja Ramírez')).toBe('Arturo T.');
    expect(shortName('Leida')).toBe('Leida');
    expect(shortName('')).toBe('');
    expect(shortName(null)).toBe('');
  });
});

describe('botones del aviso por caso de uso', () => {
  it('saca de la liga de qué trata el aviso', () => {
    expect(targetFromLink('/events/e1?tab=tasks&task=t1')).toEqual({ kind: 'task', id: 't1' });
    expect(targetFromLink('/tasks?task=t2')).toEqual({ kind: 'task', id: 't2' });
    expect(targetFromLink('/purchase-orders?po=p1')).toEqual({ kind: 'po', id: 'p1' });
    expect(targetFromLink('/events/e1?tab=checklists&checklist=c1')).toEqual({ kind: 'format', id: 'c1' });
    expect(targetFromLink('/advances?advance=a1')).toEqual({ kind: 'advance', id: 'a1' });
    expect(targetFromLink('/chat?channel=c1&msg=m1')).toEqual({ kind: 'message', id: 'm1' });
    expect(targetFromLink('/events/e1?tab=ocs')).toEqual({ kind: 'event', id: 'e1' });
    expect(targetFromLink('/notifications')).toBeNull();
    expect(targetFromLink(null)).toBeNull();
  });

  it('lo que te toca se entrega ahí mismo; lo que te entregan se aprueba', () => {
    const task = { kind: 'task' as const, id: 't1' };
    expect(pushActionsFor('task.assigned', task)).toEqual(['task.deliver', 'open']);
    expect(pushActionsFor('task.overdue', task)).toEqual(['task.deliver', 'open']);
    expect(pushActionsFor('chat.ref.task', task)).toEqual(['task.deliver', 'open']);
    expect(pushActionsFor('task.submitted', task)).toEqual(['task.approve', 'open']);
    expect(pushActionsFor('chat.ref.task_requested', task)).toEqual(['open']);
  });

  it('el dinero y las firmas nunca se aprueban a ciegas: el botón abre la pantalla', () => {
    expect(pushActionsFor('po.requested', { kind: 'po', id: 'p1' })).toEqual(['review']);
    expect(pushActionsFor('advance.requested', { kind: 'advance', id: 'a1' })).toEqual(['review']);
    expect(pushActionsFor('checklist.signature_needed', { kind: 'format', id: 'c1' })).toEqual(['review']);
  });

  it('el chat se responde y lo informativo solo se abre', () => {
    expect(pushActionsFor('chat.mention', { kind: 'message', id: 'm1' })).toEqual(['reply', 'open']);
    expect(pushActionsFor('file.uploaded', { kind: 'event', id: 'e1' })).toEqual(['open']);
    expect(pushActionsFor('task.done', { kind: 'task', id: 't1' })).toEqual(['open']);
    expect(pushActionsFor('otro.tipo', null)).toEqual([]);
  });

  it('cada juego de botones tiene su categoría de iOS', () => {
    expect(pushCategoryFor(['task.deliver', 'open'])).toBe('ARTA_TASK');
    expect(pushCategoryFor(['task.approve', 'open'])).toBe('ARTA_TASK_REVIEW');
    expect(pushCategoryFor(['review'])).toBe('ARTA_APPROVAL');
    expect(pushCategoryFor(['reply', 'open'])).toBeNull();
    expect(pushCategoryFor([])).toBeNull();
  });
});
