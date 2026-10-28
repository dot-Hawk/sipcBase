import { describe, expect, it } from 'vitest';
import type { Asignacion } from '@/shared/api/types';
import { assignedComercios, canCancel, canReassign, cancelBlockReason, mapCancelError, pendingFor } from './rules';

const a = (id: string, relevamiento: string, comercio: string, estado: Asignacion['estado'], encuestador = 'e1'): Asignacion => ({
  id, relevamiento, comercio, estado, encuestador, createdAt: '', updatedAt: '',
});

describe('asignacion rules', () => {
  it('only a PENDIENTE asignacion can be reassigned', () => {
    expect(canReassign(a('1', 'r', 'c', 'PENDIENTE'))).toBe(true);
    expect(canReassign(a('1', 'r', 'c', 'EN_CURSO'))).toBe(false);
    expect(canReassign(a('1', 'r', 'c', 'COMPLETADA'))).toBe(false);
  });
  it('lists the comercios already taken in one relevamiento', () => {
    const list = [a('1', 'r1', 'c1', 'PENDIENTE'), a('2', 'r2', 'c2', 'PENDIENTE'), a('3', 'r1', 'c3', 'COMPLETADA')];
    expect([...assignedComercios(list, 'r1')].sort()).toEqual(['c1', 'c3']);
  });
  it('counts the unfinished work of an encuestador', () => {
    const list = [a('1', 'r', 'c1', 'PENDIENTE'), a('2', 'r', 'c2', 'EN_CURSO'), a('3', 'r', 'c3', 'COMPLETADA'), a('4', 'r', 'c4', 'PENDIENTE', 'e2')];
    expect(pendingFor(list, 'e1')).toEqual({ pendiente: 1, enCurso: 1 });
  });
});

import { ApiError } from '@/shared/api/errors';
import { mapAsignacionError } from './rules';

describe('mapAsignacionError', () => {
  const e = (status: number, message: string, errors: { field: string; message: string }[] = []) =>
    new ApiError({ status, message, errors });

  it('409 "not ABIERTO" belongs to the relevamiento, any other 409 is the duplicate comercio', () => {
    expect(mapAsignacionError(e(409, 'Relevamiento is not ABIERTO')).fields.relevamiento).toMatch(/abierto/i);
    expect(mapAsignacionError(e(409, 'This comercio is already assigned in this relevamiento')).fields.comercio).toMatch(/ya está asignado/i);
  });
  it('404 and 400 messages name the field they are about', () => {
    expect(mapAsignacionError(e(404, 'Relevamiento not found')).fields.relevamiento).toBeDefined();
    expect(mapAsignacionError(e(404, 'Encuestador not found')).fields.encuestador).toBeDefined();
    expect(mapAsignacionError(e(404, 'Comercio not found')).fields.comercio).toBeDefined();
    expect(mapAsignacionError(e(400, 'encuestador must be an ACTIVO user with role ENCUESTADOR')).fields.encuestador).toMatch(/activo/i);
    expect(mapAsignacionError(e(400, 'comercio must be ACTIVO')).fields.comercio).toMatch(/activo/i);
  });
  it('400 with errors[] maps by field', () => {
    expect(mapAsignacionError(e(400, 'x', [{ field: 'encuestador', message: 'must be a valid id' }])).fields.encuestador).toBeDefined();
  });
  describe('by stable code', () => {
    const c = (code: string, message = 'whatever the server says') => new ApiError({ status: 409, message, code });

    it('RELEVAMIENTO_NOT_ABIERTO -> relevamiento field', () => {
      expect(mapAsignacionError(c('RELEVAMIENTO_NOT_ABIERTO')).fields.relevamiento).toMatch(/abierto/i);
    });
    it('COMERCIO_ALREADY_ASSIGNED -> comercio field', () => {
      expect(mapAsignacionError(c('COMERCIO_ALREADY_ASSIGNED')).fields.comercio).toMatch(/ya está asignado/i);
    });
    it('ASIGNACION_NOT_PENDIENTE -> form message', () => {
      const out = mapAsignacionError(c('ASIGNACION_NOT_PENDIENTE'));
      expect(out.fields).toEqual({});
      expect(out.form).toMatch(/pendiente/i);
    });
    it('INVALID_ESTADO_TRANSITION and ASIGNACION_CONCURRENT_MODIFICATION -> distinct form messages', () => {
      const a = mapAsignacionError(c('INVALID_ESTADO_TRANSITION')).form;
      const b = mapAsignacionError(c('ASIGNACION_CONCURRENT_MODIFICATION')).form;
      expect(a).toMatch(/estado/i);
      expect(b).toMatch(/otra persona|simultáne|mientras/i);
      expect(a).not.toBe(b);
    });
    it('the code wins over a message that points elsewhere', () => {
      const out = mapAsignacionError(c('COMERCIO_ALREADY_ASSIGNED', 'Relevamiento is not ABIERTO'));
      expect(out.fields.comercio).toBeDefined();
      expect(out.fields.relevamiento).toBeUndefined();
    });
    it('an unknown code degrades to the generic conflict message, never the message heuristic', () => {
      const out = mapAsignacionError(c('SOMETHING_NEW', 'Relevamiento is not ABIERTO'));
      expect(out.fields).toEqual({});
      expect(out.form).toMatch(/conflicto/i);
    });
  });
  it('a 409 without code (older backend) falls back to the message heuristic', () => {
    expect(mapAsignacionError(e(409, 'Only a PENDIENTE asignacion can be reassigned')).form).toMatch(/pendiente/i);
  });
  it('anything else is a form-level message', () => {
    const out = mapAsignacionError(e(500, 'boom'));
    expect(out.fields).toEqual({});
    expect(out.form).toMatch(/servidor/i);
  });
});

describe('cancel rules', () => {
  const open = { estado: 'ABIERTO' as const };
  const closed = { estado: 'CERRADO' as const };

  it('CANCELADA can never be reassigned', () => {
    expect(canReassign(a('1', 'r', 'c', 'CANCELADA'))).toBe(false);
  });
  it('only PENDIENTE and EN_CURSO of an ABIERTO relevamiento can be cancelled', () => {
    expect(canCancel(a('1', 'r', 'c', 'PENDIENTE'), open)).toBe(true);
    expect(canCancel(a('1', 'r', 'c', 'EN_CURSO'), open)).toBe(true);
    expect(canCancel(a('1', 'r', 'c', 'COMPLETADA'), open)).toBe(false);
    expect(canCancel(a('1', 'r', 'c', 'CANCELADA'), open)).toBe(false);
    expect(canCancel(a('1', 'r', 'c', 'PENDIENTE'), closed)).toBe(false);
    expect(canCancel(a('1', 'r', 'c', 'PENDIENTE'), null)).toBe(false);
  });
  it('explains why a cancellable-by-estado visit cannot be cancelled', () => {
    expect(cancelBlockReason(a('1', 'r', 'c', 'PENDIENTE'), open)).toBeNull();
    expect(cancelBlockReason(a('1', 'r', 'c', 'EN_CURSO'), closed)).toMatch(/relevamiento.*cerrado/i);
    expect(cancelBlockReason(a('1', 'r', 'c', 'COMPLETADA'), open)).toBeNull();
  });
  it('a cancelled comercio is free to be assigned again', () => {
    const list = [a('1', 'r1', 'c1', 'CANCELADA'), a('2', 'r1', 'c2', 'PENDIENTE')];
    expect([...assignedComercios(list, 'r1')]).toEqual(['c2']);
  });
  it('does not count cancelled visits as unfinished work of an encuestador', () => {
    expect(pendingFor([a('1', 'r', 'c', 'CANCELADA')], 'e1')).toEqual({ pendiente: 0, enCurso: 0 });
  });
});

describe('mapCancelError', () => {
  const e = (status: number, message: string, code?: string) => new ApiError({ status, message, ...(code ? { code } : {}) });

  it('reads the three 409 codes', () => {
    expect(mapCancelError(e(409, 'x', 'ASIGNACION_NOT_CANCELABLE'))).toMatch(/completada o cancelada/i);
    expect(mapCancelError(e(409, 'x', 'RELEVAMIENTO_NOT_ABIERTO'))).toMatch(/ya no está abierto/i);
    expect(mapCancelError(e(409, 'x', 'ASIGNACION_CONCURRENT_MODIFICATION'))).toMatch(/otra persona/i);
  });
  it('falls back to the message when an older backend sends no code', () => {
    expect(mapCancelError(e(409, 'A COMPLETADA asignacion cannot be cancelled'))).toMatch(/completada o cancelada/i);
    expect(mapCancelError(e(409, 'Relevamiento is not ABIERTO'))).toMatch(/ya no está abierto/i);
    expect(mapCancelError(e(409, 'Asignacion was modified concurrently, try again'))).toMatch(/otra persona/i);
  });
  it('an unknown code is a generic conflict, not a guess from the text', () => {
    expect(mapCancelError(e(409, 'Relevamiento is not ABIERTO', 'SOMETHING_NEW'))).toMatch(/conflicto/i);
  });
  it('maps 404 and 400', () => {
    expect(mapCancelError(e(404, 'Asignacion not found'))).toMatch(/ya no existe/i);
    expect(mapCancelError(e(400, 'Invalid asignacion id'))).toMatch(/identificador/i);
  });
});
