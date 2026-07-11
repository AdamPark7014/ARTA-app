import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { ChecklistsModule } from '../checklists/checklists.module';

@Module({
  imports: [ChecklistsModule],
  controllers: [EventsController],
})
export class EventsModule {}
