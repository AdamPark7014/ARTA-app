import { pushMetaFor, shortName } from './notification-push-meta';

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
