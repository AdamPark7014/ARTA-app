import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [NotificationsModule], controllers: [TasksController] })
export class TasksModule {}
