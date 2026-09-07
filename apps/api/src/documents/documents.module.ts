import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentPdfService } from './document-pdf.service';
import { RevisionsModule } from '../common/revisions/revisions.module';

@Module({
  imports: [RevisionsModule],
  controllers: [DocumentsController],
  providers: [DocumentPdfService],
  exports: [DocumentPdfService],
})
export class DocumentsModule {}
