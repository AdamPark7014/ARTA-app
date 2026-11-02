import { Module } from '@nestjs/common';
import { FinanzasController } from './finanzas.controller';

@Module({ controllers: [FinanzasController] })
export class FinanzasModule {}
