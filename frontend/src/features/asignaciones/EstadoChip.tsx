import type { AsignacionEstado } from '@/shared/api/types';
import { IconCheck, IconClose, IconOnline, IconPending } from '@/shared/icons';
import { ESTADO_LABEL } from './labels';

const TONE: Record<AsignacionEstado, string> = {
  PENDIENTE: 'chip',
  EN_CURSO: 'chip chip--info',
  COMPLETADA: 'chip chip--ok',
  CANCELADA: 'chip chip--danger',
};

/** Estado as shape plus text: ring (pendiente), dot (en curso), check (completada), cross (cancelada). */
export function EstadoChip({ estado }: { estado: AsignacionEstado }) {
  return (
    <span className={TONE[estado]}>
      {estado === 'COMPLETADA' ? (
        <IconCheck size={16} />
      ) : estado === 'EN_CURSO' ? (
        <IconOnline size={16} />
      ) : estado === 'CANCELADA' ? (
        <IconClose size={16} />
      ) : (
        <IconPending size={16} />
      )}
      {ESTADO_LABEL[estado]}
    </span>
  );
}
