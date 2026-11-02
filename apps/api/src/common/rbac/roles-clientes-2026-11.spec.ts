import { ForbiddenException } from '@nestjs/common';
import { EXTRA_TEMPLATE_ENTITIES, formatsForEntity } from '../../checklists/format-catalog';
import { EventsController } from '../../events/events.controller';
import { SlotsController } from '../../slots/slots.controller';
import { TicketingController } from '../../ticketing/ticketing.controller';
import {
  ALL_ROLES,
  ASSIGNABLE_PERMISSIONS,
  canAddFormatImages,
  canApproveFormat,
  canEditCampaign,
  canEditEventInfo,
  canEditFormat,
  canEditTicketing,
  canSeeFormat,
  canSeeModule,
  entityHasModule,
  hasPermission,
  PERMISSIONS,
  type AccessUser,
  type EntityKey,
  type EventModule,
  type Permission,
  type RoleKey,
} from './roles';

/**
 * Reglas de acceso que pidió el cliente el 01-11-2026: qué ve y qué edita cada persona, en Arta y en el
 * Auditorio. Cada fila dice exactamente lo que le toca: lo que no aparece en la lista, no lo tiene.
 *
 * Las personas son las de `scripts/roles-clientes-2026-11.ts`, con sus mismos negocios y sin permisos extra.
 */

const ALL_MODULES: EventModule[] = [
  'corrida',
  'campaign',
  'convenios',
  'formats',
  'po',
  'adendum',
  'ticketing',
  'tasks',
  'documents',
  'testigos',
];
/** El Auditorio no lleva corrida, campaña ni convenios. */
const AUDITORIO_MODULES: EventModule[] = ['formats', 'po', 'adendum', 'ticketing', 'tasks', 'documents', 'testigos'];

/** `CUSTOM` es la Distribución de Pendones en Excel. */
const ARTA_FORMATS = [
  'EVENTO_GENERAL',
  'PRODUCCION',
  'HOSPEDAJE',
  'TRANSPORTACION',
  'RUEDA_PRENSA',
  'ARTES_SHOWS',
  'PENDONES',
  'CATERING',
  'CUSTOM',
];
const AUDITORIO_FORMATS = [
  'CHECKLIST_AUDITORIO',
  'BARRA',
  'MERCH',
  'LIMPIEZA',
  'MANTENIMIENTO',
  'COMPROMISO_HORARIOS',
  'RECORRIDO_SEGURIDAD',
  'SEGURIDAD_INTERNA',
  'SEGURIDAD_PROMOTOR',
];
const TOP_FORMATS = ['EVENTO_GENERAL', 'ARTES_SHOWS', 'PENDONES'];

const ALL: EntityKey[] = ['ARTA', 'EXPLANADA'];
const ONLY_ARTA: EntityKey[] = ['ARTA'];

type EntityRow = {
  modules: EventModule[];
  see: string[];
  edit: string[];
  approve: string[];
  info: boolean;
  ticketing: boolean;
};
type Access = { ARTA: EntityRow; EXPLANADA: EntityRow };
type Person = Access & { who: string; roleKey: RoleKey; entities: EntityKey[] };

const NOTHING: EntityRow = { modules: [], see: [], edit: [], approve: [], info: false, ticketing: false };

/** Chacho y Arturo: todo, en los dos negocios, sin corrida, campaña ni convenios en el Auditorio. */
const DIRECCION_GENERAL: Access = {
  ARTA: { modules: ALL_MODULES, see: ARTA_FORMATS, edit: ARTA_FORMATS, approve: ARTA_FORMATS, info: true, ticketing: true },
  EXPLANADA: {
    modules: AUDITORIO_MODULES,
    see: AUDITORIO_FORMATS,
    edit: AUDITORIO_FORMATS,
    approve: AUDITORIO_FORMATS,
    info: true,
    ticketing: true,
  },
};

/** Leida y Sol, y la gerencia de Arta: todo Arta, sin aprobar Evento General, Artes ni Pendones. */
const DIRECCION_ADJUNTA: Access = {
  ARTA: {
    modules: ALL_MODULES,
    see: ARTA_FORMATS,
    edit: ARTA_FORMATS,
    approve: ['PRODUCCION', 'HOSPEDAJE', 'TRANSPORTACION', 'RUEDA_PRENSA', 'CATERING'],
    info: true,
    ticketing: true,
  },
  EXPLANADA: NOTHING,
};

/** Juan Pablo: ve todo sin la corrida; edita solo barra y merch. */
const COMPRAS: Access = {
  ARTA: {
    modules: ['campaign', 'convenios', 'formats', 'po', 'adendum', 'ticketing', 'tasks', 'documents', 'testigos'],
    see: ARTA_FORMATS,
    edit: [],
    approve: [],
    info: false,
    ticketing: false,
  },
  EXPLANADA: {
    modules: AUDITORIO_MODULES,
    see: AUDITORIO_FORMATS,
    edit: ['BARRA', 'MERCH'],
    approve: [],
    info: false,
    ticketing: false,
  },
};

/** Williams: en Arta ve y edita producción, transporte y hospedaje; en Auditorio edita todo menos OC. */
const PRODUCCION: Access = {
  ARTA: {
    modules: ['campaign', 'convenios', 'formats', 'ticketing', 'tasks', 'documents', 'testigos'],
    see: ARTA_FORMATS,
    edit: ['PRODUCCION', 'TRANSPORTACION', 'HOSPEDAJE'],
    approve: [],
    info: false,
    ticketing: false,
  },
  EXPLANADA: {
    modules: ['formats', 'ticketing', 'tasks', 'documents', 'testigos'],
    see: AUDITORIO_FORMATS,
    edit: AUDITORIO_FORMATS,
    approve: [],
    info: true,
    ticketing: true,
  },
};

/** Rodrigo: el Auditorio todo menos OC; en Arta, solo transporte, hospedaje y catering. */
const DIRECCION_AUDITORIO: Access = {
  ARTA: {
    modules: ['formats'],
    see: ['TRANSPORTACION', 'HOSPEDAJE', 'CATERING'],
    edit: ['TRANSPORTACION', 'HOSPEDAJE', 'CATERING'],
    approve: [],
    info: false,
    ticketing: false,
  },
  EXPLANADA: {
    modules: ['formats', 'ticketing', 'tasks', 'documents', 'testigos'],
    see: AUDITORIO_FORMATS,
    edit: AUDITORIO_FORMATS,
    approve: AUDITORIO_FORMATS,
    info: true,
    ticketing: true,
  },
};

/** Monse y Kika: la campaña y los formatos generales; ahí solo suben imágenes. */
const CONTENIDO: Access = {
  ARTA: { modules: ['campaign', 'formats', 'testigos'], see: ['EVENTO_GENERAL'], edit: [], approve: [], info: false, ticketing: false },
  EXPLANADA: { modules: ['formats', 'testigos'], see: ['CHECKLIST_AUDITORIO'], edit: [], approve: [], info: false, ticketing: false },
};

/** Iliana: el formato de catering y nada más. El Auditorio no trae uno en su catálogo. */
const CATERING: Access = {
  ARTA: { modules: ['formats'], see: ['CATERING'], edit: ['CATERING'], approve: [], info: false, ticketing: false },
  EXPLANADA: { modules: ['formats'], see: [], edit: [], approve: [], info: false, ticketing: false },
};

/** Paula: ve lo de los dos negocios sin la corrida y edita la boletera; los formatos, no. */
const CONTABILIDAD: Access = {
  ARTA: {
    modules: ALL_MODULES.filter((m) => m !== 'corrida'),
    see: ARTA_FORMATS,
    edit: [],
    approve: [],
    info: false,
    ticketing: true,
  },
  EXPLANADA: { modules: AUDITORIO_MODULES, see: AUDITORIO_FORMATS, edit: [], approve: [], info: false, ticketing: true },
};

/** No opera eventos: solo testigos (y Studio y el calendario, fuera de esta matriz). */
const PRACTICANTE: Access = {
  ARTA: { ...NOTHING, modules: ['testigos'] },
  EXPLANADA: { ...NOTHING, modules: ['testigos'] },
};

const LOGISTICA: Access = {
  ARTA: {
    modules: ['campaign', 'formats', 'ticketing', 'tasks', 'documents', 'testigos'],
    see: ARTA_FORMATS,
    edit: ARTA_FORMATS,
    approve: [],
    info: true,
    ticketing: true,
  },
  EXPLANADA: {
    modules: ['formats', 'ticketing', 'tasks', 'documents', 'testigos'],
    see: AUDITORIO_FORMATS,
    edit: AUDITORIO_FORMATS,
    approve: [],
    info: true,
    ticketing: true,
  },
};

const CONVENIOS: Access = {
  ARTA: {
    modules: ['campaign', 'convenios', 'formats', 'tasks', 'documents', 'testigos'],
    see: ARTA_FORMATS,
    edit: ARTA_FORMATS,
    approve: [],
    info: true,
    ticketing: false,
  },
  EXPLANADA: {
    modules: ['formats', 'tasks', 'documents', 'testigos'],
    see: AUDITORIO_FORMATS,
    edit: AUDITORIO_FORMATS,
    approve: [],
    info: true,
    ticketing: false,
  },
};

const ENLACE_GOBIERNO: Access = {
  ARTA: {
    modules: ['formats', 'po', 'adendum', 'tasks', 'documents', 'testigos'],
    see: ARTA_FORMATS,
    edit: ARTA_FORMATS,
    approve: [],
    info: true,
    ticketing: false,
  },
  EXPLANADA: {
    modules: ['formats', 'po', 'adendum', 'tasks', 'documents', 'testigos'],
    see: AUDITORIO_FORMATS,
    edit: AUDITORIO_FORMATS,
    approve: [],
    info: true,
    ticketing: false,
  },
};

const PEOPLE: Person[] = [
  { who: 'Chacho', roleKey: 'dir_general', entities: ALL, ...DIRECCION_GENERAL },
  { who: 'Arturo', roleKey: 'dir_general', entities: ALL, ...DIRECCION_GENERAL },
  { who: 'Leida', roleKey: 'dir_adjunta', entities: ONLY_ARTA, ...DIRECCION_ADJUNTA },
  { who: 'Sol', roleKey: 'dir_adjunta', entities: ONLY_ARTA, ...DIRECCION_ADJUNTA },
  { who: 'la gerencia de Arta', roleKey: 'gerente_arta', entities: ONLY_ARTA, ...DIRECCION_ADJUNTA },
  { who: 'Juan Pablo', roleKey: 'compras', entities: ALL, ...COMPRAS },
  { who: 'Williams', roleKey: 'produccion', entities: ALL, ...PRODUCCION },
  { who: 'Rodrigo', roleKey: 'dir_auditorio', entities: ALL, ...DIRECCION_AUDITORIO },
  { who: 'Monse', roleKey: 'contenido', entities: ALL, ...CONTENIDO },
  { who: 'Kika', roleKey: 'contenido', entities: ALL, ...CONTENIDO },
  { who: 'Iliana', roleKey: 'catering', entities: ALL, ...CATERING },
  { who: 'Paula', roleKey: 'contabilidad', entities: ALL, ...CONTABILIDAD },
  { who: 'un practicante', roleKey: 'practicante', entities: ALL, ...PRACTICANTE },
  { who: 'logística (rol viejo)', roleKey: 'logistica', entities: ALL, ...LOGISTICA },
  { who: 'convenios (rol viejo)', roleKey: 'convenios', entities: ALL, ...CONVENIOS },
  { who: 'enlace de gobierno (rol viejo)', roleKey: 'enlace_gobierno', entities: ALL, ...ENLACE_GOBIERNO },
  { who: 'solo carpetas', roleKey: 'solo_carpetas', entities: ALL, ARTA: NOTHING, EXPLANADA: NOTHING },
];

const ENTITIES: Array<{ name: string; entity: EntityKey; formats: string[] }> = [
  { name: 'Arta', entity: 'ARTA', formats: ARTA_FORMATS },
  { name: 'el Auditorio', entity: 'EXPLANADA', formats: AUDITORIO_FORMATS },
];

const userOf = (p: Pick<Person, 'roleKey' | 'entities'>, permissions: string[] = []): AccessUser => ({
  roleKey: p.roleKey,
  entities: p.entities,
  permissions,
});

/** Mismo orden que la lista completa, para comparar exactamente qué entra y qué no. */
const inOrderOf = <T>(all: T[], some: T[]) => all.filter((x) => some.includes(x));

describe('roles del cliente, 01-11-2026: la matriz por persona', () => {
  it('la matriz cubre el catálogo real de formatos de cada negocio', () => {
    expect(formatsForEntity('ARTA').map((f) => f.key).sort()).toEqual(ARTA_FORMATS.filter((k) => k !== 'CUSTOM').sort());
    expect(EXTRA_TEMPLATE_ENTITIES.filter((t) => t.entities.includes('ARTA')).map((t) => t.key)).toEqual(['CUSTOM']);
    expect(formatsForEntity('EXPLANADA').map((f) => f.key).sort()).toEqual([...AUDITORIO_FORMATS].sort());
  });

  it('la matriz tiene una fila para cada rol de operación', () => {
    const covered = new Set(PEOPLE.map((p) => p.roleKey));
    expect(ALL_ROLES.filter((r) => !covered.has(r))).toEqual(['super_admin']);
  });

  describe.each(PEOPLE)('$who ($roleKey)', (person) => {
    const user = userOf(person);

    describe.each(ENTITIES)('en $name', ({ entity, formats }) => {
      const row = person[entity];

      it('canSeeModule', () => {
        expect(ALL_MODULES.filter((m) => canSeeModule(user, entity, m))).toEqual(inOrderOf(ALL_MODULES, row.modules));
      });

      it('canSeeFormat', () => {
        expect(formats.filter((k) => canSeeFormat(user, entity, k))).toEqual(inOrderOf(formats, row.see));
      });

      it('canEditFormat', () => {
        expect(formats.filter((k) => canEditFormat(user, entity, k))).toEqual(inOrderOf(formats, row.edit));
      });

      it('canApproveFormat', () => {
        expect(formats.filter((k) => canApproveFormat(user, entity, k))).toEqual(inOrderOf(formats, row.approve));
      });

      it('canEditEventInfo', () => {
        expect(canEditEventInfo(user, entity)).toBe(row.info);
      });

      it('canEditTicketing', () => {
        expect(canEditTicketing(user, entity)).toBe(row.ticketing);
      });
    });
  });
});

/** Roles que cumplen algo, con todos los negocios asignados: sin la barrera de entidad, sale la regla sola. */
const rolesWhere = (test: (user: AccessUser) => boolean, permissions: string[] = []) =>
  ALL_ROLES.filter((roleKey) => test({ roleKey, entities: ALL, permissions })).sort();
const rolesWithPermission = (needed: Permission) => ALL_ROLES.filter((r) => hasPermission(r, [], needed)).sort();

describe('lo que el cliente pidió sobre todo', () => {
  describe('la corrida', () => {
    it('de la gente con nombre, solo la ven Chacho, Arturo, Leida y Sol', () => {
      const named = PEOPLE.filter((p) => !p.who.includes('(rol viejo)') && p.who !== 'la gerencia de Arta');
      expect(named.filter((p) => canSeeModule(userOf(p), 'ARTA', 'corrida')).map((p) => p.who)).toEqual([
        'Chacho',
        'Arturo',
        'Leida',
        'Sol',
      ]);
      expect(named.filter((p) => canSeeModule(userOf(p), 'EXPLANADA', 'corrida'))).toEqual([]);
    });

    // `gerente_arta` trae el mismo paquete que Leida y Sol; `super_admin` es la plataforma (Nexara).
    it('por rol, nadie fuera de dirección general y adjunta, más la gerencia que es su mismo paquete', () => {
      const top = ['dir_adjunta', 'dir_general', 'gerente_arta', 'super_admin'];
      expect(rolesWhere((u) => canSeeModule(u, 'ARTA', 'corrida'))).toEqual(top);
      expect(rolesWithPermission(PERMISSIONS.CORRIDA_VIEW)).toEqual(top);
      expect(rolesWithPermission(PERMISSIONS.CORRIDA_UPLOAD)).toEqual(top);
    });

    it('modificarla es solo de dirección general', () => {
      expect(rolesWithPermission(PERMISSIONS.CORRIDA_EDIT)).toEqual(['dir_general', 'super_admin']);
    });
  });

  describe('las órdenes de compra', () => {
    it('solo compras las hace (y la plataforma)', () => {
      expect(rolesWithPermission(PERMISSIONS.PO_EDIT)).toEqual(['compras', 'super_admin']);
    });

    it('dirección general solo con el permiso extra', () => {
      expect(hasPermission('dir_general', [], PERMISSIONS.PO_EDIT)).toBe(false);
      expect(hasPermission('dir_general', [PERMISSIONS.PO_EDIT], PERMISSIONS.PO_EDIT)).toBe(true);
    });

    it('autoriza dirección general: ni Leida ni Sol ni la gerencia, ni los roles viejos sin extra', () => {
      expect(rolesWithPermission(PERMISSIONS.PO_AUTHORIZE)).toEqual(['dir_general', 'super_admin']);
      for (const role of ['logistica', 'convenios', 'enlace_gobierno'] as RoleKey[]) {
        expect(hasPermission(role, [PERMISSIONS.PO_AUTHORIZE], PERMISSIONS.PO_AUTHORIZE)).toBe(true);
      }
    });

    it('marcar pagada: contabilidad, enlace de gobierno y dirección general', () => {
      expect(rolesWithPermission(PERMISSIONS.PO_MARK_PAID)).toEqual(['contabilidad', 'dir_general', 'enlace_gobierno', 'super_admin']);
    });

    it('verlas: quien las hace, las autoriza o las paga, y Leida y Sol en Arta', () => {
      expect(rolesWhere((u) => canSeeModule(u, 'ARTA', 'po'))).toEqual([
        'compras',
        'contabilidad',
        'dir_adjunta',
        'dir_general',
        'enlace_gobierno',
        'gerente_arta',
        'super_admin',
      ]);
    });
  });

  describe('el Auditorio no lleva corrida, campaña ni convenios', () => {
    const NOT_THERE: EventModule[] = ['corrida', 'campaign', 'convenios'];

    it('entityHasModule lo dice, y en Arta existe todo', () => {
      for (const m of ALL_MODULES) {
        expect(entityHasModule('ARTA', m)).toBe(true);
        expect(entityHasModule('EXPLANADA', m)).toBe(!NOT_THERE.includes(m));
      }
    });

    it.each(NOT_THERE)('%s no se le muestra a nadie, ni a dirección', (module) => {
      expect(rolesWhere((u) => canSeeModule(u, 'EXPLANADA', module))).toEqual([]);
    });

    it.each(NOT_THERE)('%s tampoco aparece con todos los permisos extra encima', (module) => {
      expect(rolesWhere((u) => canSeeModule(u, 'EXPLANADA', module), ASSIGNABLE_PERMISSIONS)).toEqual([]);
    });

    it('la campaña no se edita en el Auditorio, ni con el permiso', () => {
      expect(rolesWhere((u) => canEditCampaign(u, 'EXPLANADA'), ASSIGNABLE_PERMISSIONS)).toEqual([]);
    });
  });

  describe('Evento General, Artes y Pendones', () => {
    it.each(TOP_FORMATS)('%s en Arta solo lo aprueba dirección general', (key) => {
      expect(rolesWhere((u) => canApproveFormat(u, 'ARTA', key))).toEqual(['dir_general', 'super_admin']);
    });

    it.each(TOP_FORMATS)('%s tampoco se abre con permisos extra', (key) => {
      expect(rolesWhere((u) => canApproveFormat(u, 'ARTA', key), ASSIGNABLE_PERMISSIONS)).toEqual(['dir_general', 'super_admin']);
    });

    // Un evento viejo del Auditorio puede traerlos: los formatos que ya tiene un evento no se borran.
    it.each(TOP_FORMATS)('%s en el Auditorio tampoco lo aprueba Rodrigo', (key) => {
      expect(rolesWhere((u) => canApproveFormat(u, 'EXPLANADA', key))).toEqual(['dir_general', 'super_admin']);
    });

    it('la Distribución de Pendones en Excel (CUSTOM) en Arta va igual', () => {
      expect(rolesWhere((u) => canApproveFormat(u, 'ARTA', 'CUSTOM'))).toEqual(['dir_general', 'super_admin']);
    });

    it('Leida y Sol sí aprueban los demás de Arta', () => {
      const leida = { roleKey: 'dir_adjunta', entities: ONLY_ARTA };
      for (const key of ['PRODUCCION', 'HOSPEDAJE', 'TRANSPORTACION', 'RUEDA_PRENSA', 'CATERING']) {
        expect(canApproveFormat(leida, 'ARTA', key)).toBe(true);
      }
    });
  });

  describe('imágenes en los formatos', () => {
    const imagesOf = (roleKey: RoleKey, entity: EntityKey, formats: string[]) =>
      formats.filter((k) => canAddFormatImages({ roleKey, entities: ALL }, entity, k));

    it('Monse y Kika suben imágenes solo a los generales, y no los editan', () => {
      expect(imagesOf('contenido', 'ARTA', ARTA_FORMATS)).toEqual(['EVENTO_GENERAL']);
      expect(imagesOf('contenido', 'EXPLANADA', AUDITORIO_FORMATS)).toEqual(['CHECKLIST_AUDITORIO']);
      expect(canEditFormat({ roleKey: 'contenido', entities: ALL }, 'ARTA', 'EVENTO_GENERAL')).toBe(false);
      expect(canEditFormat({ roleKey: 'contenido', entities: ALL }, 'EXPLANADA', 'CHECKLIST_AUDITORIO')).toBe(false);
    });

    it('los demás suben a lo que editan', () => {
      expect(imagesOf('catering', 'ARTA', ARTA_FORMATS)).toEqual(['CATERING']);
      expect(imagesOf('catering', 'EXPLANADA', AUDITORIO_FORMATS)).toEqual([]);
      expect(imagesOf('compras', 'ARTA', ARTA_FORMATS)).toEqual([]);
      expect(imagesOf('compras', 'EXPLANADA', AUDITORIO_FORMATS)).toEqual(['BARRA', 'MERCH']);
      expect(imagesOf('contabilidad', 'ARTA', ARTA_FORMATS)).toEqual([]);
    });
  });

  describe('campaña y testigos', () => {
    it('la campaña de Arta la editan dirección, gerencia, Williams, Paula y logística', () => {
      expect(rolesWhere((u) => canEditCampaign(u, 'ARTA'))).toEqual([
        'contabilidad',
        'dir_adjunta',
        'dir_general',
        'gerente_arta',
        'logistica',
        'produccion',
        'super_admin',
      ]);
    });

    it('el practicante ve testigos solo en los negocios que tiene', () => {
      const soloArta = { roleKey: 'practicante', entities: ONLY_ARTA };
      expect(canSeeModule(soloArta, 'ARTA', 'testigos')).toBe(true);
      expect(canSeeModule(soloArta, 'EXPLANADA', 'testigos')).toBe(false);
    });

    it('publicar el sitio le llega al practicante solo como extra de su perfil', () => {
      expect(hasPermission('practicante', [], PERMISSIONS.STUDIO_PUBLISH)).toBe(false);
      expect(hasPermission('practicante', [PERMISSIONS.STUDIO_PUBLISH], PERMISSIONS.STUDIO_PUBLISH)).toBe(true);
    });
  });
});

/**
 * `canAccessEventOps` ya no detiene a Rodrigo en Arta. Lo que antes se apoyaba solo en esa barrera tiene
 * que preguntar por la regla: aquí se prueban los endpoints reales, no las funciones.
 */
describe('los endpoints cumplen la matriz', () => {
  const ORG = 'org_arta_internal';
  const arta = { id: 'ev-1', name: 'Concierto', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG };
  const auditorio = { ...arta, entity: 'EXPLANADA' };
  const person = (roleKey: string, entities: string[] = ALL) => ({
    user: { id: `u-${roleKey}`, roleKey, entities, permissions: [] as string[], organizationId: ORG },
  });

  describe('eventos', () => {
    function events(event: Record<string, unknown>) {
      const update = jest.fn(async ({ data }: any) => ({ ...event, ...data }));
      const create = jest.fn().mockRejectedValue(new Error('creó el evento'));
      const prisma = {
        event: { findUnique: async () => event, update, create, count: async () => 0 },
        organization: { findUnique: async () => ({ id: ORG, active: true, plan: 'OPS' }) },
        checklistTemplate: { findMany: async () => [] },
        auditLog: { create: async ({ data }: any) => data },
      };
      const notifications = { notifyEventTeam: async () => [], notifyMany: async () => [] };
      return { controller: new EventsController(prisma as never, {} as never, notifications as never), update, create };
    }

    const ACTIONS = [
      ['close', 'cerrar'],
      ['cancel', 'cancelar'],
    ] as const;

    it.each(ACTIONS)('Rodrigo no puede %s (%s) un evento de Arta', async (action) => {
      const { controller, update } = events(arta);
      await expect(controller[action](person('dir_auditorio') as never, 'ev-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it.each(ACTIONS)('Rodrigo sí puede %s (%s) un evento del Auditorio', async (action) => {
      const { controller, update } = events(auditorio);
      await controller[action](person('dir_auditorio') as never, 'ev-1');
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('Rodrigo no crea eventos en Arta', async () => {
      const { controller, create } = events(arta);
      await expect(
        controller.create(person('dir_auditorio') as never, { entity: 'ARTA', name: 'Otro' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
    });

    it.each([
      ['dir_auditorio', 'Rodrigo'],
      ['produccion', 'Williams'],
    ])('%s (%s) no edita los datos del show en Arta y sí en el Auditorio', async (role) => {
      const inArta = events(arta);
      await expect(inArta.controller.update(person(role) as never, 'ev-1', { name: 'Otro' } as never)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(inArta.update).not.toHaveBeenCalled();

      const inAuditorio = events(auditorio);
      await inAuditorio.controller.update(person(role) as never, 'ev-1', { name: 'Otro' } as never);
      expect(inAuditorio.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('boletera', () => {
    function ticketing(event: Record<string, unknown>) {
      const create = jest.fn(async ({ data }: any) => ({ id: 't-1', event, ...data }));
      const update = jest.fn(async ({ data }: any) => ({ id: 't-1', event, ...data }));
      const prisma = {
        event: { findUnique: async () => event },
        ticketingSetup: { create, update, findUnique: async () => ({ id: 't-1', eventId: 'ev-1', event }) },
        auditLog: { create: async ({ data }: any) => data },
      };
      return {
        controller: new TicketingController(
          prisma as never,
          {} as never,
          { regenerateForEvent: async () => undefined } as never,
          {} as never,
        ),
        create,
        update,
      };
    }
    const dto = { boletera: 'Superboletos' };

    it.each([
      ['produccion', 'Williams'],
      ['dir_auditorio', 'Rodrigo'],
    ])('%s (%s) no la toca en Arta', async (role) => {
      const { controller, create, update } = ticketing(arta);
      await expect(controller.create(person(role) as never, 'ev-1', dto as never)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.update(person(role) as never, 't-1', dto as never)).rejects.toBeInstanceOf(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it.each(['produccion', 'dir_auditorio', 'contabilidad'])('%s la edita en el Auditorio', async (role) => {
      const { controller, update } = ticketing(auditorio);
      await controller.update(person(role) as never, 't-1', dto as never);
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('Juan Pablo la ve, pero no la edita en ningún negocio', async () => {
      for (const event of [arta, auditorio]) {
        const { controller, update } = ticketing(event);
        await expect(controller.update(person('compras') as never, 't-1', dto as never)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        expect(update).not.toHaveBeenCalled();
      }
    });
  });

  describe('reemplazar un documento por uno externo', () => {
    function slots(event: Record<string, unknown>, templateKey = 'EVENTO_GENERAL', fileName = 'externo.xlsx') {
      const upsert = jest.fn(async ({ create }: any) => ({ id: 'slot-1', ...create }));
      const prisma = {
        event: { findUnique: async () => event },
        checklistTemplate: { findUnique: async () => ({ key: templateKey }) },
        eventFile: { findUnique: async () => ({ id: 'f-1', eventId: 'ev-1', fileName }) },
        eventDocumentSlot: { upsert, findFirst: async () => null },
        auditLog: { create: async ({ data }: any) => data },
      };
      return { controller: new SlotsController(prisma as never, {} as never), upsert };
    }
    const replacing = (kind: string, checklistTemplateId?: string) => ({ kind, fileId: 'f-1', checklistTemplateId }) as never;

    it.each([
      ['compras', 'CAMPAIGN'],
      ['compras', 'BOLETERA'],
      ['compras', 'PENDONES'],
      ['catering', 'CAMPAIGN'],
      ['catering', 'BOLETERA'],
      ['catering', 'PENDONES'],
      ['dir_auditorio', 'CAMPAIGN'],
      ['dir_auditorio', 'BOLETERA'],
      ['dir_auditorio', 'PENDONES'],
      ['produccion', 'BOLETERA'],
      ['produccion', 'PENDONES'],
    ])('%s no reemplaza %s en Arta', async (role, kind) => {
      const { controller, upsert } = slots(arta);
      await expect(controller.replace(person(role) as never, 'ev-1', replacing(kind))).rejects.toBeInstanceOf(ForbiddenException);
      expect(upsert).not.toHaveBeenCalled();
    });

    it.each(['compras', 'catering', 'dir_auditorio'])('%s no reemplaza Evento General en Arta', async (role) => {
      const { controller, upsert } = slots(arta, 'EVENTO_GENERAL');
      await expect(controller.replace(person(role) as never, 'ev-1', replacing('CHECKLIST', 'tpl-1'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(upsert).not.toHaveBeenCalled();
    });

    it('cada quien sí reemplaza lo suyo', async () => {
      const iliana = slots(arta, 'CATERING', 'externo.pdf');
      await iliana.controller.replace(person('catering') as never, 'ev-1', replacing('CHECKLIST', 'tpl-1'));
      expect(iliana.upsert).toHaveBeenCalledTimes(1);

      const paula = slots(arta);
      await paula.controller.replace(person('contabilidad') as never, 'ev-1', replacing('CAMPAIGN'));
      expect(paula.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
