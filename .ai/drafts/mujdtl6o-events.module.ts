import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { ChecklistsModule } from '../checklists/checklists.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ChecklistsModule, NotificationsModule],
  controllers: [EventsController],
})
export class EventsModule {}