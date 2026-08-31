import { ForbiddenException } from '@nestjs/common';
import { EventStatus } from '@prisma/client';

/** Blocks mutations on events that are closed or cancelled. */
export function assertEventNotClosed(status: EventStatus | string) {
  if (status === 'CLOSED' || status === 'CANCELLED') {
    throw new ForbiddenException('Evento cerrado / cancelado — solo lectura');
  }
}
