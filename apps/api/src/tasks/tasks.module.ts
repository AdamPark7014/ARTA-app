import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';

@Module({ imports: [NotificationsModule, ChatModule], controllers: [TasksController] })
export class TasksModule {}
