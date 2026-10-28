import type { AsignacionEstado, ComercioTipo, Frecuencia } from '@/shared/api/types';

export const ESTADO_LABEL: Record<AsignacionEstado, string> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

export const TIPO_LABEL: Record<ComercioTipo, string> = {
  SUPERMERCADO: 'Supermercado',
  ALMACEN: 'Almacén',
  VERDULERIA: 'Verdulería',
  CARNICERIA: 'Carnicería',
  FARMACIA: 'Farmacia',
  OTRO: 'Otro',
};

export const FRECUENCIA_LABEL: Record<Frecuencia, string> = {
  QUINCENAL: 'Quincenal',
  MENSUAL: 'Mensual',
};
