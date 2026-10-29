import { Module } from '@nestjs/common';
import { ChecklistsModule } from '../checklists/checklists.module';
import { CleaningInventoryController } from './cleaning-inventory.controller';

/** Inventario de limpieza semanal del Auditorio (junta 23-10-2026); el PDF usa el motor de formatos. */
@Module({
  imports: [ChecklistsModule],
  controllers: [CleaningInventoryController],
})
export class CleaningInventoryModule {}
