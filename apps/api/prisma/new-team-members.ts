import { EntityKey } from '@prisma/client';
import { ROLES, ROLE_PERMISSIONS, type RoleKey } from '../src/common/rbac/roles';

export type TeamMember = {
  email: string;
  fullName: string;
  title: string;
  roleKey: RoleKey;
  entities: EntityKey[];
  permissions: string[];
  /** Contraseña inicial vía env SEED_PASS_<passAlias> */
  passAlias: string;
  /**
   * Sin SEED_PASS_<passAlias>, el seed le pone una contraseña aleatoria que nadie conoce (no la de
   * SEED_PASSWORD ni la de desarrollo). La de verdad se fija con su script de alta y se entrega aparte.
   */
  randomPasswordUnlessEnv?: boolean;
};

/**
 * Altas pedidas en la junta del 2026-08-28: «AGREGAR USUARIO: MONSE, SOL Y KIKA».
 *
 * «SOL» es **Marisol Pérez Vásquez**, confirmado por Adam el 28-08-2026, y va
 * con el mismo perfil que Leida Osorio: rol `convenios` en ambas entidades
 * (carpetas, patrocinios y checklists; sin usuarios, sin corrida y sin
 * autorizar OC).
 *
 * De Monse y Kika la junta solo dio el nombre de pila: quedan con rol
 * operativo `logistica` — el mínimo con el que pueden trabajar (eventos,
 * checklists, campaña, boletera y carpetas). Ajustar apellidos, correo y rol
 * desde Panel → Usuarios en cuanto Arturo los confirme.
 */
export const NEW_TEAM_MEMBERS: TeamMember[] = [
  {
    email: 'monse@artaproducciones.com',
    fullName: 'Monse',
    title: 'Operación Arta',
    roleKey: ROLES.LOGISTICA,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.LOGISTICA]],
    passAlias: 'MONSE',
  },
  {
    email: 'marisol@artaproducciones.com',
    fullName: 'Marisol Pérez Vásquez',
    title: 'Convenios y patrocinios',
    // 16-09-2026: los mismos permisos que Arturo y José Luis, sin gestionar usuarios.
    roleKey: ROLES.DIR_ADJUNTA,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.DIR_ADJUNTA]],
    passAlias: 'MARISOL',
  },
  {
    email: 'kika@artaproducciones.com',
    fullName: 'Kika',
    title: 'Operación Arta',
    roleKey: ROLES.LOGISTICA,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.LOGISTICA]],
    passAlias: 'KIKA',
  },
  /**
   * Junta 23-10-2026 · «Paula Farfán: Auditorio y Arta en temas contables, que tenga accesos muy
   * puntuales a temas comerciales y contables». Rol `contabilidad` en las dos entidades. En
   * producción se da de alta con scripts/alta-paula-contabilidad-2310.ts (contraseña a un archivo).
   */
  {
    email: 'paula@artaproducciones.com',
    fullName: 'Paula Farfán',
    title: 'Contabilidad y comercial',
    roleKey: ROLES.CONTABILIDAD,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.CONTABILIDAD]],
    passAlias: 'PAULA',
    randomPasswordUnlessEnv: true,
  },
];
