import { Module } from '@nestjs/common';
import { ChecklistsController } from './checklists.controller';
import { ChecklistPdfService } from './checklist-pdf.service';
import { PdfBrandingService } from '../uploads/pdf-branding.service';

@Module({
  controllers: [ChecklistsController],
  providers: [ChecklistPdfService, PdfBrandingService],
  exports: [ChecklistPdfService, PdfBrandingService],
})
export class ChecklistsModule {}
