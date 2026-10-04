import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentPdfService } from './document-pdf.service';
import { RevisionsModule } from '../common/revisions/revisions.module';
import { PdfBrandingService } from '../uploads/pdf-branding.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RevisionsModule, NotificationsModule],
  controllers: [DocumentsController],
  providers: [DocumentPdfService, PdfBrandingService],
  exports: [DocumentPdfService],
})
export class DocumentsModule {}
