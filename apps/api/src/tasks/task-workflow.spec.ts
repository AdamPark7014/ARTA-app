import {
  assertEvidencePresent,
  canApproveTask,
  taskNeedsApproval,
} from './task-workflow';

describe('task-workflow', () => {
  it('needs approval when requester differs from assignee', () => {
    expect(taskNeedsApproval({ assigneeId: 'a', createdById: 'b' })).toBe(true);
    expect(taskNeedsApproval({ assigneeId: 'a', createdById: 'a' })).toBe(false);
    expect(taskNeedsApproval({ assigneeId: 'a', createdById: null })).toBe(false);
  });

  it('allows requester and directors to review', () => {
    expect(canApproveTask('u1', 'logistica', { createdById: 'u1' })).toBe(true);
    expect(canApproveTask('u2', 'logistica', { createdById: 'u1' })).toBe(false);
    expect(canApproveTask('u2', 'dir_general', { createdById: 'u1' })).toBe(true);
  });

  it('requires note or files for delivery', () => {
    expect(() => assertEvidencePresent('', [], 0)).toThrow();
    expect(() => assertEvidencePresent('listo', [], 0)).not.toThrow();
    expect(() => assertEvidencePresent('', ['x'], 0)).not.toThrow();
    expect(() => assertEvidencePresent('', [], 1)).not.toThrow();
  });
});
