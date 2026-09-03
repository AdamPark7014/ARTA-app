import { ForbiddenException } from '@nestjs/common';
import { DocStatus } from '@prisma/client';
import {
  assertCanReopen,
  assertCanTransition,
  assertDocWritable,
  assertTransitionAllowed,
  docWriteBlock,
} from './doc-guards';

const openEvent = { status: 'ACTIVE' };

describe('docWriteBlock', () => {
  it('un borrador en evento abierto se escribe', () => {
    expect(docWriteBlock({ status: DocStatus.DRAFT }, openEvent)).toBeNull();
  });

  it('REVIEW NO bloquea — es una bandera, no un candado', () => {
    // Si bloqueara, nadie podría cerrar su formato de noche porque quien
    // aprueba está dormido, y el atajo acabaría siendo tocar la base.
    expect(docWriteBlock({ status: DocStatus.REVIEW }, openEvent)).toBeNull();
  });

  it('APPROVED bloquea, y dice cómo desbloquearlo', () => {
    const block = docWriteBlock({ status: DocStatus.APPROVED }, openEvent);
    expect(block?.reason).toBe('approved');
    expect(block?.message).toContain('borrador');
  });

  it('SEALED bloquea', () => {
    expect(docWriteBlock({ status: DocStatus.SEALED }, openEvent)?.reason).toBe('sealed');
  });

  it('el `locked` de la corrida sigue bloqueando mientras exista', () => {
    expect(docWriteBlock({ status: DocStatus.DRAFT, locked: true }, openEvent)?.reason).toBe('sealed');
  });

  it('el evento cerrado manda sobre todo lo demás', () => {
    for (const status of Object.values(DocStatus)) {
      expect(docWriteBlock({ status }, { status: 'CLOSED' })?.reason).toBe('event_closed');
      expect(docWriteBlock({ status }, { status: 'CANCELLED' })?.reason).toBe('event_closed');
    }
  });

  it('assertDocWritable lanza solo cuando hay bloqueo', () => {
    expect(() => assertDocWritable({ status: DocStatus.DRAFT }, openEvent)).not.toThrow();
    expect(() => assertDocWritable({ status: DocStatus.SEALED }, openEvent)).toThrow(ForbiddenException);
  });
});

describe('assertTransitionAllowed', () => {
  it('el camino normal es válido', () => {
    expect(() => assertTransitionAllowed(DocStatus.DRAFT, DocStatus.REVIEW)).not.toThrow();
    expect(() => assertTransitionAllowed(DocStatus.REVIEW, DocStatus.APPROVED)).not.toThrow();
    expect(() => assertTransitionAllowed(DocStatus.APPROVED, DocStatus.SEALED)).not.toThrow();
  });

  it('se puede devolver a borrador desde revisión y desde aprobado', () => {
    expect(() => assertTransitionAllowed(DocStatus.REVIEW, DocStatus.DRAFT)).not.toThrow();
    expect(() => assertTransitionAllowed(DocStatus.APPROVED, DocStatus.DRAFT)).not.toThrow();
  });

  it('SELLADO es de un solo sentido: solo se sale reabriendo', () => {
    expect(() => assertTransitionAllowed(DocStatus.SEALED, DocStatus.DRAFT)).not.toThrow();
    expect(() => assertTransitionAllowed(DocStatus.SEALED, DocStatus.APPROVED)).toThrow();
    expect(() => assertTransitionAllowed(DocStatus.SEALED, DocStatus.REVIEW)).toThrow();
  });

  it('no se puede saltar de revisión a sellado sin aprobar', () => {
    expect(() => assertTransitionAllowed(DocStatus.REVIEW, DocStatus.SEALED)).toThrow();
  });

  it('quedarse en el mismo estado no es una transición', () => {
    expect(() => assertTransitionAllowed(DocStatus.DRAFT, DocStatus.DRAFT)).toThrow(/ya está/);
  });
});

describe('assertCanTransition', () => {
  it('pedir revisión es autoservicio: no hay que pedir permiso para pedir permiso', () => {
    expect(() => assertCanTransition('logistica', DocStatus.REVIEW)).not.toThrow();
    expect(() => assertCanTransition('enlace_gobierno', DocStatus.REVIEW)).not.toThrow();
  });

  it('aprobar es de gerencia y dirección', () => {
    expect(() => assertCanTransition('dir_general', DocStatus.APPROVED)).not.toThrow();
    expect(() => assertCanTransition('gerente_arta', DocStatus.APPROVED)).not.toThrow();
    expect(() => assertCanTransition('dir_auditorio', DocStatus.APPROVED)).not.toThrow();
    expect(() => assertCanTransition('logistica', DocStatus.APPROVED)).toThrow(/aprobar/);
    expect(() => assertCanTransition('convenios', DocStatus.APPROVED)).toThrow();
  });

  it('sellar también', () => {
    expect(() => assertCanTransition('super_admin', DocStatus.SEALED)).not.toThrow();
    expect(() => assertCanTransition('logistica', DocStatus.SEALED)).toThrow(/sellar/);
  });
});

describe('assertCanReopen', () => {
  it('solo dirección general y super admin', () => {
    expect(() => assertCanReopen('dir_general', 'Faltó el aforo real')).not.toThrow();
    expect(() => assertCanReopen('super_admin', 'Corrección de cifras')).not.toThrow();
    expect(() => assertCanReopen('gerente_arta', 'Quiero cambiarlo')).toThrow(/dirección general/);
    expect(() => assertCanReopen('logistica', 'Quiero cambiarlo')).toThrow();
  });

  it('exige un motivo de verdad, no un espacio', () => {
    expect(() => assertCanReopen('dir_general', '')).toThrow(/motivo/);
    expect(() => assertCanReopen('dir_general', '   ')).toThrow(/motivo/);
    expect(() => assertCanReopen('dir_general', 'ok')).toThrow(/motivo/);
  });
});
