import { Module, forwardRef } from '@nestjs/common';
import { DigestsModule } from '../digests/digests.module';
import { TicketingModule } from '../ticketing/ticketing.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { JobsService } from './jobs.service';

@Module({
  imports: [DigestsModule, forwardRef(() => TicketingModule), WebhooksModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
