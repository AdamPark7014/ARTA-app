import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { leerEquipo } from '../../../prisma/equipo';
import { ROLE_PERMISSIONS } from './roles';

/** Las personas del seed viven en un JSON local: el repositorio es público. */
describe('equipo local del seed', () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'equipo-'));
  const ruta = path.join(carpeta, 'equipo.json');
  const PRISMA = path.resolve(__dirname, '../../../prisma');
  afterAll(() => fs.rmSync(carpeta, { recursive: true, force: true }));

  const persona = {
    email: 'persona@prueba.example',
    fullName: 'Persona',
    title: 'Contabilidad',
    roleKey: 'contabilidad',
    entities: ['ARTA', 'EXPLANADA'],
    passAlias: 'PERSONA',
    randomPasswordUnlessEnv: true,
  };

  it('sin archivo no hay a quién crear ni tocar', () => {
    expect(leerEquipo(path.join(carpeta, 'no.json'))).toEqual({ equipo: [], renombrados: {} });
  });

  it('los permisos salen del rol, no del archivo', () => {
    fs.writeFileSync(ruta, JSON.stringify({ equipo: [{ ...persona, permissions: ['users.manage'] }] }));
    const [p] = leerEquipo(ruta).equipo;
    expect(p.permissions).toEqual([...ROLE_PERMISSIONS.contabilidad]);
  });

  it('se detiene con un rol que no existe', () => {
    fs.writeFileSync(ruta, JSON.stringify({ equipo: [{ ...persona, roleKey: 'inventado' }] }));
    expect(() => leerEquipo(ruta)).toThrow('datos incompletos');
  });

  it('el seed no trae correos de personas ni contraseña por omisión, y al existente solo le actualiza nombre y puesto', () => {
    const seed = fs.readFileSync(path.join(PRISMA, 'seed.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(seed).not.toMatch(/@artaproducciones|@arema|ArtaDevLocal/);
    const bloque = seed.slice(seed.indexOf('const user = await prisma.user.upsert'));
    expect(bloque.slice(bloque.indexOf('update: {'), bloque.indexOf('});'))).not.toMatch(/passwordHash|roleKey|permissions|active/);
  });
});
