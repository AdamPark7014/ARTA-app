/**
 * Genera un PDF de checklist con el generador REAL y vuelca su mapa de campos,
 * para comprobar en el navegador que los campos de captura caen justo encima
 * de lo impreso. Se ejecuta desde apps/api con ts-node.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { ChecklistPdfService } from '../../src/checklists/checklist-pdf.service';

const OUT = process.env.OUT_DIR!;
process.env.UPLOAD_DIR = OUT;

const data = {
  sections: [
    {
      id: 'general',
      title: 'Datos del show',
      items: [
        { id: 'venue', label: 'Recinto', type: 'text', value: 'Auditorio Arema' },
        { id: 'fecha', label: 'Fecha de montaje', type: 'date', value: '2026-09-18' },
        { id: 'contacto', label: 'Contacto en sitio', type: 'text', value: '' },
        { id: 'aforo', label: 'Aforo autorizado', type: 'number', value: 4200 },
      ],
    },
    {
      id: 'produccion',
      title: 'Producción técnica',
      items: [
        { id: 'audio', label: 'Audio confirmado con proveedor', type: 'check', done: true },
        { id: 'luces', label: 'Plano de luces recibido', type: 'check', done: false },
        { id: 'planta', label: 'Planta de luz contratada', type: 'check', done: false },
        { id: 'rider', label: 'Rider técnico firmado por el artista', type: 'check', done: true },
        { id: 'notas', label: 'Observaciones de montaje', type: 'text', value: '' },
      ],
    },
  ],
};

async function main() {
  const svc = new ChecklistPdfService(null as never);
  const res = await svc.generate('demo-checklist', {
    title: 'Checklist Producción',
    eventName: 'ANDRES PARRA',
    entity: 'ARTA',
    artist: 'Andrés Parra',
    venue: 'Auditorio Arema',
    city: 'Puebla',
    templateKey: 'PRODUCCION',
    data,
    delivered: null,
    authorized: null,
    editedBy: 'Arturo Taja',
    editedAt: new Date('2026-08-28T19:15:00Z'),
  });

  writeFileSync(join(OUT, 'checklist-demo.fields.json'), JSON.stringify(res.fieldMap, null, 2));
  writeFileSync(join(OUT, 'checklist-demo.data.json'), JSON.stringify(data, null, 2));
  console.log('PDF:', res.filePath);
  console.log('campos:', res.fieldMap.fields.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
