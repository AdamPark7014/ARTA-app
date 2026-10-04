import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [UsersController],
})
export class UsersModule {}
