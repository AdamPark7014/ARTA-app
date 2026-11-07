import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateUserDto } from './users.controller';

/**
 * El alta de usuario manda `entities` (Arta, Auditorio o las dos). El `ValidationPipe` global corre con
 * `whitelist: true` (`bootstrap-config.ts`): todo campo sin decorador se quita del cuerpo. Así, `entities`
 * llegaba vacío al handler y la persona quedaba siempre con las entidades por omisión de su rol, sin
 * importar qué marcaran en el formulario.
 */
describe('CreateUserDto · entities sobrevive al ValidationPipe', () => {
  // Mismas opciones que la app real.
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const meta = { type: 'body' as const, metatype: CreateUserDto };
  const base = {
    email: 'nueva@arta.mx',
    fullName: 'Nueva Persona',
    roleKey: 'logistica',
    password: 'secreto1',
  };

  it('conserva las entidades que manda el formulario', async () => {
    const dto = (await pipe.transform({ ...base, entities: ['EXPLANADA'] }, meta)) as CreateUserDto;
    expect(dto).toBeInstanceOf(CreateUserDto);
    expect(dto.entities).toEqual(['EXPLANADA']);

    const both = (await pipe.transform({ ...base, entities: ['ARTA', 'EXPLANADA'] }, meta)) as CreateUserDto;
    expect(both.entities).toEqual(['ARTA', 'EXPLANADA']);
  });

  it('sin entidades sigue pasando (el handler aplica las del rol)', async () => {
    const dto = (await pipe.transform({ ...base }, meta)) as CreateUserDto;
    expect(dto.entities).toBeUndefined();
  });

  it('rechaza una entidad que no existe o algo que no es lista', async () => {
    await expect(pipe.transform({ ...base, entities: ['MARTE'] }, meta)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ ...base, entities: 'ARTA' }, meta)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la lista blanca sigue activa: lo que no está en el DTO se quita', async () => {
    const dto = (await pipe.transform({ ...base, entities: ['ARTA'], colado: 'x' }, meta)) as CreateUserDto &
      Record<string, unknown>;
    expect(dto.entities).toEqual(['ARTA']);
    expect(dto.colado).toBeUndefined();
  });
});
