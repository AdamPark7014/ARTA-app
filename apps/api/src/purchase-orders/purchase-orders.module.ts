import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';

@Module({
  controllers: [PurchaseOrdersController],
})
export class PurchaseOrdersModule {}
