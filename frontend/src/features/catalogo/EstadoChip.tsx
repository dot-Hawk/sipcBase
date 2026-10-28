import { StatusChip } from '@/features/gestion/ui/StatusChip';
import type { CatalogEstado } from '@/shared/api/types';
import { IconCheck, IconOnline } from '@/shared/icons';
import { ESTADO_LABEL } from './rules';

/** Estado as icon plus text, like the other management screens. */
export function CatalogEstadoChip({ estado }: { estado: CatalogEstado }) {
  return estado === 'ACTIVO' ? (
    <StatusChip tone="ok" icon={<IconCheck size={16} />}>
      {ESTADO_LABEL.ACTIVO}
    </StatusChip>
  ) : (
    <StatusChip tone="neutral" icon={<IconOnline size={16} />}>
      {ESTADO_LABEL.INACTIVO}
    </StatusChip>
  );
}
