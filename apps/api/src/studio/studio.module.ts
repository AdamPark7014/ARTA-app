import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StudioController } from './studio.controller';

@Module({
  // «Enviar a revisión» del practicante avisa a quien publica (junta 23-10-2026).
  imports: [NotificationsModule],
  controllers: [StudioController],
})
export class StudioModule {}
