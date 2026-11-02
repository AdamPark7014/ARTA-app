import { Module } from '@nestjs/common';
import { PdfBrandingService } from '../uploads/pdf-branding.service';
import { TestigosController } from './testigos.controller';

@Module({
  controllers: [TestigosController],
  providers: [PdfBrandingService],
})
export class TestigosModule {}
