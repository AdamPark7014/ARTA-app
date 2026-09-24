import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { CampaignExcelService } from './campaign-excel.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [NotificationsModule, UploadsModule],
  controllers: [CampaignsController],
  providers: [CampaignExcelService],
})
export class CampaignsModule {}
