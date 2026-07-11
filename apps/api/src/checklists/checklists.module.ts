import { Module } from '@nestjs/common';
import { ChecklistsController } from './checklists.controller';
import { ChecklistPdfService } from './checklist-pdf.service';

@Module({
  controllers: [ChecklistsController],
  providers: [ChecklistPdfService],
  exports: [ChecklistPdfService],
})
export class ChecklistsModule {}
