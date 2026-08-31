import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * W3 P0: PATCH /events/:id must not accept `status` (bypass of EVENT_CLOSE).
 * Close/cancel/reopen go through dedicated POST routes.
 */
describe('events UpdateEventDto status strip', () => {
  const src = readFileSync(join(__dirname, 'events.controller.ts'), 'utf8');
  const dtoBlock = src.match(/class UpdateEventDto \{[\s\S]*?\n\}/)?.[0] || '';

  it('UpdateEventDto exists and omits status', () => {
    expect(dtoBlock).toContain('class UpdateEventDto');
    expect(dtoBlock).not.toMatch(/status\?:/);
    expect(dtoBlock).toMatch(/Status solo vía POST/);
  });

  it('update() does not write status from dto', () => {
    const updateFn = src.match(/async update\([\s\S]*?\n  \}/)?.[0] || '';
    expect(updateFn).toBeTruthy();
    expect(updateFn).not.toMatch(/status:\s*dto\.status/);
  });
});
