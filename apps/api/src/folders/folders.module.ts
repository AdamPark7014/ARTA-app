import { Module } from '@nestjs/common';
import { FoldersController } from './folders.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [FoldersController],
})
export class FoldersModule {}
