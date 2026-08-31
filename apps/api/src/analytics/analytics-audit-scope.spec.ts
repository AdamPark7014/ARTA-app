import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * W3 P0: analytics overview/auditIntel must scope auditLog by tenant users.
 */
describe('analytics auditLog tenant scope', () => {
  const src = readFileSync(join(__dirname, 'analytics.service.ts'), 'utf8');

  it('overview recentActivity filters auditLog by user.organizationId', () => {
    expect(src).toMatch(/user:\s*\{\s*organizationId\s*\}/);
  });

  it('auditIntel does not OR-include bare userId: null cross-tenant', () => {
    // Legacy leak pattern was `{ OR: [{ user: { organizationId } }, { userId: null }] }`
    expect(src).not.toMatch(/userId:\s*null/);
  });
});
