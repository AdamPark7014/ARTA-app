import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentPdfService } from './document-pdf.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentPdfService],
  exports: [DocumentPdfService],
})
export class DocumentsModule {}
