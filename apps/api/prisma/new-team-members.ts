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
};

/**
 * Altas pedidas en la junta del 2026-08-28: «AGREGAR USUARIO: MONSE, SOL Y KIKA».
 *
 * La junta dio nombre de pila, no correo ni rol. Se les da de alta con el rol
 * operativo `logistica` (eventos de ambas entidades, checklists, campaña,
 * boletera y carpetas — sin usuarios, sin cierre y sin autorizar OC), que es el
 * mínimo con el que pueden trabajar. Ajustar rol, correo y apellidos desde
 * Panel → Usuarios en cuanto Arturo confirme; esta lista solo define el alta.
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
    email: 'sol@artaproducciones.com',
    fullName: 'Sol',
    title: 'Operación Arta',
    roleKey: ROLES.LOGISTICA,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.LOGISTICA]],
    passAlias: 'SOL',
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
];
