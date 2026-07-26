import { Module } from '@nestjs/common';
import { DigestsController } from './digests.controller';
import { DigestsService } from './digests.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule],
  controllers: [DigestsController],
  providers: [DigestsService],
  exports: [DigestsService],
})
export class DigestsModule {}
