import { Module } from '@nestjs/common';
import { PracticantesController } from './practicantes.controller';

@Module({ controllers: [PracticantesController] })
export class PracticantesModule {}
