import { pushMetaFor, shortName } from './notification-push-meta';

describe('pushMetaFor', () => {
  test('chat.mention -> chat high', () => {
    expect(pushMetaFor('chat.mention')).toEqual({ category: 'chat', priority: 'high' });
  });

  test('po.requested -> approvals high', () => {
    expect(pushMetaFor('po.requested')).toEqual({ category: 'approvals', priority: 'high' });
  });

  test('campaign.review -> approvals high', () => {
    expect(pushMetaFor('campaign.review')).toEqual({ category: 'approvals', priority: 'high' });
  });

  test('task.assigned -> tasks high', () => {
    expect(pushMetaFor('task.assigned')).toEqual({ category: 'tasks', priority: 'high' });
  });

  test('task.done -> tasks normal', () => {
    expect(pushMetaFor('task.done')).toEqual({ category: 'tasks', priority: 'normal' });
  });

  test('po.paid -> finance', () => {
    expect(pushMetaFor('po.paid')).toEqual({ category: 'finance', priority: 'normal' });
  });

  test('unknown -> general normal', () => {
    expect(pushMetaFor('unknown')).toEqual({ category: 'general', priority: 'normal' });
  });
});

describe('shortName', () => {
  test('Arturo Taja Ramirez -> Arturo T.', () => {
    expect(shortName('Arturo Taja Ramirez')).toBe('Arturo T.');
  });

  test('empty string -> empty string', () => {
    expect(shortName('')).toBe('');
  });
});