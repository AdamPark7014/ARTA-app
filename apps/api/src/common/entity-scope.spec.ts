import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { canSeeEntity, entityForNew, entityScope, userEntities } from './entity-scope';

// Quién ve qué (docs/entidades-arta-auditorio.md, 11-10-2026).
const arturo = { roleKey: 'dir_general', entities: ['ARTA', 'EXPLANADA'] };
const general = { roleKey: 'dir_general', entities: [] as string[] };
const monse = { roleKey: 'dir_adjunta', entities: ['ARTA', 'EXPLANADA'] };
const leida = { roleKey: 'dir_adjunta', entities: ['ARTA'] };
const rodrigo = { roleKey: 'dir_adjunta', entities: ['EXPLANADA'] };

describe('entity-scope · ARTA y Auditorio separados', () => {
  it('dirección general ve las dos aunque no las tenga en su lista', () => {
    expect(userEntities(general)).toEqual(['ARTA', 'EXPLANADA']);
    expect(userEntities(arturo)).toEqual(['ARTA', 'EXPLANADA']);
  });

  it('dirección adjunta ve solo sus entidades', () => {
    expect(userEntities(monse)).toEqual(['ARTA', 'EXPLANADA']);
    expect(userEntities(leida)).toEqual(['ARTA']);
    expect(userEntities(rodrigo)).toEqual(['EXPLANADA']);
  });

  it('sin ?entity= devuelve todas las de la persona (apps 1.0.0)', () => {
    expect(entityScope(monse)).toEqual(['ARTA', 'EXPLANADA']);
    expect(entityScope(leida, '')).toEqual(['ARTA']);
  });

  it('con ?entity= devuelve solo esa, sin importar mayúsculas', () => {
    expect(entityScope(monse, 'explanada')).toEqual(['EXPLANADA']);
    expect(entityScope(arturo, 'ARTA')).toEqual(['ARTA']);
  });

  it('pedir la entidad de otro da 403 y una inventada 400', () => {
    expect(() => entityScope(leida, 'EXPLANADA')).toThrow(ForbiddenException);
    expect(() => entityScope(rodrigo, 'ARTA')).toThrow(ForbiddenException);
    expect(() => entityScope(monse, 'OTRA')).toThrow(BadRequestException);
  });

  it('lo nuevo sin evento va a la pedida, a la única o a ARTA para un híbrido', () => {
    expect(entityForNew(rodrigo)).toBe('EXPLANADA');
    expect(entityForNew(leida)).toBe('ARTA');
    expect(entityForNew(monse)).toBe('ARTA');
    expect(entityForNew(monse, 'EXPLANADA')).toBe('EXPLANADA');
    expect(() => entityForNew(leida, 'EXPLANADA')).toThrow(ForbiddenException);
  });

  it('lo que no tiene entidad (directos, avisos generales) lo ve cualquiera', () => {
    expect(canSeeEntity(leida, null)).toBe(true);
    expect(canSeeEntity(leida, 'ARTA')).toBe(true);
    expect(canSeeEntity(leida, 'EXPLANADA')).toBe(false);
    expect(canSeeEntity(rodrigo, 'EXPLANADA')).toBe(true);
  });
});
