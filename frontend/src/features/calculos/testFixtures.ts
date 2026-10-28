import type { Calculo, CalculoImputacion, CalculoRelativo, CanastaNodo, Comercio } from '@/shared/api/types';

export const run = (over: Partial<Calculo> = {}): Calculo => ({
  id: 'c1',
  mesBase: '2026-01',
  mesObjetivo: '2026-03',
  excluirOfertas: false,
  parametros: { esperarMeses: 2, pesoSuper: 0.25, pesoTrad: 0.75, omitirGruposCompletos: true },
  motorVersion: 'motor-1.4.0',
  entradaHash: 'abcdef0123456789',
  estado: 'COMPLETADO',
  error: null,
  creadoPor: 'u-ana',
  createdAt: '2026-10-09T10:00:00.000Z',
  updatedAt: '2026-10-09T10:01:00.000Z',
  resumen: { observaciones: 1200, variedades: 80, informantes: 40, imputaciones: 15, sinImputar: 0, sinImputarDetalle: [] },
  ...over,
});

export const relativo = (variedad: string, mes: string, valor: number | null, over: Partial<CalculoRelativo> = {}): CalculoRelativo => ({
  calculo: 'c1', variedad, mes, valor, nSuper: 3, nTrad: 5, ...over,
});

export const imputacion = (id: string, over: Partial<CalculoImputacion> = {}): CalculoImputacion => ({
  id, calculo: 'c1', variedad: '1111101', comercio: 'com-1', mes: '2026-02', precio: 1250.5, nivel: 'VARIEDAD', grupo: 'G1', factor: 1.02, ...over,
});

export const variedad = (codigo: string, nombre: string): CanastaNodo => ({
  codigo, nombre, nivel: 6, padre: codigo.slice(0, 5), ponderador: 0.01, derivado: false, estado: 'ACTIVO', categoria: 'NUCLEO',
  codigoVariedad12: null, tratamientoEspecial: false, createdAt: '', updatedAt: '',
});

export const comercio = (id: string, nombre: string): Comercio => ({
  id, nombre, direccion: 'x', zona: 'Centro', tipo: 'ALMACEN', estado: 'ACTIVO', createdAt: '', updatedAt: '',
});
