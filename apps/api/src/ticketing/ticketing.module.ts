import { Module } from '@nestjs/common';
import { TicketingController } from './ticketing.controller';
import { TicketingSyncService } from './ticketing-sync.service';

@Module({
  controllers: [TicketingController],
  providers: [TicketingSyncService],
  exports: [TicketingSyncService],
})
export class TicketingModule {}
