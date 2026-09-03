import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { XlsxPatchService } from './xlsx-patch.service';
import { FinanceModule } from '../finance/finance.module';

@Module({
  // Al guardar el Excel de la corrida hay que releer sus cifras: el archivo es
  // la fuente y los KPIs salen de él.
  imports: [FinanceModule],
  controllers: [UploadsController],
  providers: [XlsxPatchService],
  exports: [XlsxPatchService],
})
export class UploadsModule {}
