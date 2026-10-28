import { Link } from 'react-router-dom';
import { StatusChip } from '@/features/gestion/ui/StatusChip';
import type { Precio, Relevamiento } from '@/shared/api/types';
import { IconAlert, IconAudit, IconPrices } from '@/shared/icons';
import { formatDate, formatDateTime } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/money';
import { Dialog } from '@/shared/ui/Dialog';
import { AlertRange } from './AlertRange';
import type { PrecioLabels } from './CorrectionDialog';

interface Props {
  precio: Precio;
  labels: PrecioLabels;
  relevamiento: Relevamiento | undefined;
  encuestador: string;
  /** Present only for a role that may correct (SUPERVISOR, ANALISTA). */
  onCorrect: (() => void) | null;
  /** Why the correction is not available right now (closed relevamiento, offline). */
  correctBlockedReason: string | null;
  onClose: () => void;
}

export function PrecioDetailDialog({ precio, labels, relevamiento, encuestador, onCorrect, correctBlockedReason, onClose }: Props) {
  const corrected = Date.parse(precio.updatedAt) - Date.parse(precio.createdAt) > 1000;
  return (
    <Dialog
      title="Detalle del precio"
      onClose={onClose}
      description={
        <p className="field__hint">
          {labels.producto} en {labels.comercio}
        </p>
      }
      actions={
        <>
          <Link className="btn btn--quiet" to={`/gestion/auditoria?precio=${encodeURIComponent(precio.id)}`}>
            <IconAudit size={20} />
            Ver historial de cambios
          </Link>
          <button type="button" className="btn" data-autofocus onClick={onClose}>
            Cerrar
          </button>
          {onCorrect && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={Boolean(correctBlockedReason)}
              aria-describedby={correctBlockedReason ? 'pg-detail-blocked' : undefined}
              onClick={onCorrect}
            >
              Corregir precio
            </button>
          )}
        </>
      }
    >
      <dl className="pg-detail">
        <div>
          <dt>Valor</dt>
          <dd className="num pg-detail__value">{formatMoney(precio.valor)}</dd>
        </div>
        <div>
          <dt>Marcas</dt>
          <dd className="pg-detail__chips">
            {precio.oferta ? (
              <StatusChip tone="info" icon={<IconPrices size={16} />}>
                En oferta
              </StatusChip>
            ) : (
              <span>Sin oferta</span>
            )}
            {precio.alerta && (
              <StatusChip tone="attn" icon={<IconAlert size={16} />}>
                Atípico
              </StatusChip>
            )}
          </dd>
        </div>
        <div>
          <dt>Observación</dt>
          <dd>{precio.observacion ?? 'Sin observación'}</dd>
        </div>
        <div>
          <dt>Relevamiento</dt>
          <dd>
            {labels.periodo}
            {relevamiento?.estado === 'CERRADO' ? ' (cerrado)' : ''}
          </dd>
        </div>
        <div>
          <dt>Relevado</dt>
          <dd>
            {formatDate(precio.fechaRelevamiento)} por {encuestador}
          </dd>
        </div>
        <div>
          <dt>Última actualización</dt>
          <dd>{corrected ? formatDateTime(precio.updatedAt) : 'Sin correcciones'}</dd>
        </div>
      </dl>
      {precio.alerta && (
        <AlertRange
          alerta={precio.alerta}
          value={precio.valor}
          caption="El encuestador confirmó este valor aunque se aleja de lo habitual."
        />
      )}
      {correctBlockedReason && (
        <p id="pg-detail-blocked" className="field__hint">
          {correctBlockedReason}
        </p>
      )}
    </Dialog>
  );
}
