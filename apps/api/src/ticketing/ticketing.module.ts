import { Module } from '@nestjs/common';
import { TicketingController } from './ticketing.controller';

@Module({ controllers: [TicketingController] })
export class TicketingModule {}
