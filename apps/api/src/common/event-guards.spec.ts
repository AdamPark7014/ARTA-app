import { ForbiddenException } from '@nestjs/common';
import { assertEventNotClosed } from './event-guards';

describe('assertEventNotClosed', () => {
  it('allows DRAFT and ACTIVE', () => {
    expect(() => assertEventNotClosed('DRAFT')).not.toThrow();
    expect(() => assertEventNotClosed('ACTIVE')).not.toThrow();
  });

  it('blocks CLOSED and CANCELLED', () => {
    expect(() => assertEventNotClosed('CLOSED')).toThrow(ForbiddenException);
    expect(() => assertEventNotClosed('CANCELLED')).toThrow(ForbiddenException);
  });
});
