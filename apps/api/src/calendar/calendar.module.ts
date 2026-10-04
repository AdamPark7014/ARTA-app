import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CalendarController],
})
export class CalendarModule {}
