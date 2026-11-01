import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatController } from './chat.controller';
import { ChatRefsService } from './chat-refs.service';
import { ChatService } from './chat.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRefsService],
  exports: [ChatService, ChatRefsService],
})
export class ChatModule {}
