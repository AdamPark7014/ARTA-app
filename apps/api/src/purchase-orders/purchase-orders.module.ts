import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [NotificationsModule, UploadsModule, ChatModule],
  controllers: [PurchaseOrdersController],
})
export class PurchaseOrdersModule {}
