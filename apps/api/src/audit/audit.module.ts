import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { PdfBrandingService } from '../uploads/pdf-branding.service';

@Module({
  controllers: [AuditController],
  providers: [PdfBrandingService],
})
export class AuditModule {}
