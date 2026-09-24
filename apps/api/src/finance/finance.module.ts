import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceExcelController } from './finance-excel.controller';
import { FinanceExtractService } from './finance-extract.service';
import { FinanceExcelService } from './finance-excel.service';
import { ExcelPdfService } from '../uploads/excel-pdf.service';
import { PdfBrandingService } from '../uploads/pdf-branding.service';

@Module({
  controllers: [FinanceController, FinanceExcelController],
  providers: [FinanceExtractService, FinanceExcelService, ExcelPdfService, PdfBrandingService],
  exports: [FinanceExtractService, FinanceExcelService],
})
export class FinanceModule {}
