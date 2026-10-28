import { StatusChip } from '@/features/gestion/ui/StatusChip';
import type { EstadoCalculo } from '@/shared/api/types';
import { IconAlert, IconCheckCircle, IconRefresh } from '@/shared/icons';
import { ESTADO_LABEL } from './rules';

/** State of a run: icon plus text, never colour alone. */
export function EstadoChip({ estado }: { estado: EstadoCalculo }) {
  switch (estado) {
    case 'EJECUTANDO':
      return (
        <StatusChip tone="info" icon={<IconRefresh size={16} />}>
          {ESTADO_LABEL.EJECUTANDO}
        </StatusChip>
      );
    case 'COMPLETADO':
      return (
        <StatusChip tone="ok" icon={<IconCheckCircle size={16} />}>
          {ESTADO_LABEL.COMPLETADO}
        </StatusChip>
      );
    case 'FALLIDO':
      return (
        <StatusChip tone="danger" icon={<IconAlert size={16} />}>
          {ESTADO_LABEL.FALLIDO}
        </StatusChip>
      );
  }
}
