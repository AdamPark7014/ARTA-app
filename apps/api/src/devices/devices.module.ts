import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { PushDispatchService } from './push-dispatch.service';

@Global()
@Module({
  controllers: [DevicesController],
  providers: [DevicesService, PushDispatchService],
  exports: [DevicesService, PushDispatchService],
})
export class DevicesModule {}
