import { cleanDisplayTitle } from './pdf-branding.service';

describe('cleanDisplayTitle', () => {
  it('quita el paréntesis que solo repite el tipo de archivo', () => {
    expect(cleanDisplayTitle('Distribución de Pendones (Excel)')).toBe('Distribución de Pendones');
    expect(cleanDisplayTitle('CORRIDA ANDRES PARRA (excel)')).toBe('CORRIDA ANDRES PARRA');
    expect(cleanDisplayTitle('Acta de junta (Word)')).toBe('Acta de junta');
    expect(cleanDisplayTitle('Reporte (PDF)')).toBe('Reporte');
    expect(cleanDisplayTitle('Base [xlsx]')).toBe('Base');
  });

  it('no toca un título que no trae esa marca', () => {
    expect(cleanDisplayTitle('Checklist Hospedaje')).toBe('Checklist Hospedaje');
    expect(cleanDisplayTitle('Convenio Puebla (2026)')).toBe('Convenio Puebla (2026)');
  });

  it('aguanta vacíos y solo espacios sin reventar', () => {
    expect(cleanDisplayTitle('')).toBe('');
    expect(cleanDisplayTitle('   ')).toBe('');
    expect(cleanDisplayTitle(undefined as unknown as string)).toBe('');
  });

  it('nunca deja el título vacío si lo original solo era la marca', () => {
    expect(cleanDisplayTitle('(Excel)')).toBe('(Excel)');
  });
});
