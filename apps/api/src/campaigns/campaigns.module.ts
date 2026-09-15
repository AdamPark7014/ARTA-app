import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [NotificationsModule], controllers: [CampaignsController] })
export class CampaignsModule {}
