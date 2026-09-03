import { Global, Module } from '@nestjs/common';
import { RevisionService } from './revision.service';

/**
 * Global: checklists, finanzas, documentos y archivos escriben todos su
 * historial por aquí, y hacerlo global evita repetir el import en cada módulo.
 */
@Global()
@Module({
  providers: [RevisionService],
  exports: [RevisionService],
})
export class RevisionsModule {}
