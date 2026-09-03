import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceExtractService } from './finance-extract.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceExtractService],
  exports: [FinanceExtractService],
})
export class FinanceModule {}
