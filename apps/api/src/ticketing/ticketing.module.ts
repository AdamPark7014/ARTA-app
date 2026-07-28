import { Module } from '@nestjs/common';
import { TicketingController } from './ticketing.controller';
import { TicketingSyncService } from './ticketing-sync.service';
import { ChecklistsModule } from '../checklists/checklists.module';

@Module({
  imports: [ChecklistsModule],
  controllers: [TicketingController],
  providers: [TicketingSyncService],
  exports: [TicketingSyncService],
})
export class TicketingModule {}
