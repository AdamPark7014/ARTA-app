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
