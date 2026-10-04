import {
  assertCanSubmit,
  assertEvidencePresent,
  canApproveTask,
  normalizeAssigneeIds,
  taskAssigneeIds,
  taskNeedsApproval,
} from './task-workflow';

describe('task-workflow', () => {
  it('needs approval when requester differs from assignee', () => {
    expect(taskNeedsApproval({ assigneeId: 'a', createdById: 'b' })).toBe(true);
    expect(taskNeedsApproval({ assigneeId: 'a', createdById: 'a' })).toBe(false);
    expect(taskNeedsApproval({ assigneeId: 'a', createdById: null })).toBe(false);
  });

  it('una tarea de varias personas: el principal primero y sin repetidos', () => {
    const task = { assigneeId: 'a', coAssignees: [{ userId: 'b' }, { userId: 'a' }, { userId: 'c' }] };
    expect(taskAssigneeIds(task)).toEqual(['a', 'b', 'c']);
    expect(taskAssigneeIds({ assigneeId: null, coAssignees: [] })).toEqual([]);
  });

  it('cualquiera de los responsables entrega; quien pidió y también la tiene no se aprueba a sí mismo', () => {
    const task = { assigneeId: 'a', createdById: 'jefe', coAssignees: [{ userId: 'b' }] };
    expect(() => assertCanSubmit('b', task)).not.toThrow();
    expect(() => assertCanSubmit('a', task)).not.toThrow();
    expect(() => assertCanSubmit('x', task)).toThrow();
    expect(taskNeedsApproval(task)).toBe(true);
    expect(taskNeedsApproval({ ...task, coAssignees: [{ userId: 'jefe' }] })).toBe(false);
  });

  it('limpia la lista de responsables que manda el panel', () => {
    expect(normalizeAssigneeIds(['a', '', ' b ', 'a', null, 3])).toEqual(['a', 'b']);
    expect(normalizeAssigneeIds(undefined)).toEqual([]);
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
