import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { XlsxPatchService } from './xlsx-patch.service';
import { ExcelPdfService } from './excel-pdf.service';
import { FinanceModule } from '../finance/finance.module';
import { PurchaseOrderExcelService } from '../purchase-orders/po-excel.service';

@Module({
  imports: [FinanceModule],
  controllers: [UploadsController],
  providers: [XlsxPatchService, ExcelPdfService, PurchaseOrderExcelService],
  exports: [XlsxPatchService, ExcelPdfService, PurchaseOrderExcelService],
})
export class UploadsModule {}
