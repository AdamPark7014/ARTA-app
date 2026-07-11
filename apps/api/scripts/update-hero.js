const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  await p.pageContent.upsert({
    where: { entity_sectionKey: { entity: 'ARTA', sectionKey: 'home_hero' } },
    create: {
      entity: 'ARTA',
      sectionKey: 'home_hero',
      title: 'Hero',
      published: true,
      contentJson: {
        brand: 'arta',
        brandSub: 'PRODUCCIONES',
        headline: 'La experiencia del Show',
        sub: 'Producción integral de conciertos y eventos: checklists, campaña, boletera, corrida financiera y cierre con firmas digitales.',
        cta: 'Ver operación',
        ctaHref: '#modulos',
      },
    },
    update: {
      published: true,
      contentJson: {
        brand: 'arta',
        brandSub: 'PRODUCCIONES',
        headline: 'La experiencia del Show',
        sub: 'Producción integral de conciertos y eventos: checklists, campaña, boletera, corrida financiera y cierre con firmas digitales.',
        cta: 'Ver operación',
        ctaHref: '#modulos',
      },
    },
  });
  console.log('Hero ARTA updated');
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
