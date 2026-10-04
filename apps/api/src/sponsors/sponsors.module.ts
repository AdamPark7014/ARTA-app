import { Module } from '@nestjs/common';
import { SponsorsController } from './sponsors.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [NotificationsModule], controllers: [SponsorsController] })
export class SponsorsModule {}
