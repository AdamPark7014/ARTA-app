import { Module } from '@nestjs/common';
import { TicketingController } from './ticketing.controller';
import { TicketingSyncService } from './ticketing-sync.service';
import { ChecklistsModule } from '../checklists/checklists.module';
import { TicketingPdfService } from './ticketing-pdf.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ChecklistsModule, NotificationsModule],
  controllers: [TicketingController],
  providers: [TicketingSyncService, TicketingPdfService],
  exports: [TicketingSyncService, TicketingPdfService],
})
export class TicketingModule {}
