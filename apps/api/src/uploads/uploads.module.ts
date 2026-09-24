import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { XlsxPatchService } from './xlsx-patch.service';
import { ExcelPdfService } from './excel-pdf.service';
import { FinanceModule } from '../finance/finance.module';
import { PurchaseOrderExcelService } from '../purchase-orders/po-excel.service';
import { PdfBrandingService } from './pdf-branding.service';

@Module({
  imports: [FinanceModule],
  controllers: [UploadsController],
  providers: [XlsxPatchService, ExcelPdfService, PurchaseOrderExcelService, PdfBrandingService],
  exports: [XlsxPatchService, ExcelPdfService, PurchaseOrderExcelService, PdfBrandingService],
})
export class UploadsModule {}
