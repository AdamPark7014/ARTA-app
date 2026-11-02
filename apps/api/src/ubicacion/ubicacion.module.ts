import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { UbicacionController } from './ubicacion.controller';
import { UbicacionLatidoService } from './ubicacion-latido.service';

@Module({
  imports: [DevicesModule],
  controllers: [UbicacionController],
  providers: [UbicacionLatidoService],
})
export class UbicacionModule {}
