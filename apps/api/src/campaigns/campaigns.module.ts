import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CampaignExcelService } from './campaign-excel.service';

@Module({
  imports: [NotificationsModule, UploadsModule],
  controllers: [CampaignsController],
  providers: [CampaignExcelService],
})
export class CampaignsModule {}
