import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { XlsxPatchService } from './xlsx-patch.service';
import { ExcelPdfService } from './excel-pdf.service';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [FinanceModule],
  controllers: [UploadsController],
  providers: [XlsxPatchService, ExcelPdfService],
  exports: [XlsxPatchService, ExcelPdfService],
})
export class UploadsModule {}
