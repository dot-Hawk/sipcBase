import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { describeGestionError } from '@/features/gestion/errors';
import { ConfirmDialog } from '@/features/gestion/ui/ConfirmDialog';
import { api } from '@/shared/api/endpoints';
import type { Producto } from '@/shared/api/types';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { fmtDate } from './ComercioDialogs';
import { CatalogEstadoChip } from './EstadoChip';
import { ckeys, useSetProductoEstado } from './queries';
import { CATEGORIA_LABEL, formatCantidad } from './rules';
import { useVariedades } from './variedades';

export function ProductoEstadoDialog({ producto, blockedReason, onClose }: { producto: Producto; blockedReason: string | null; onClose: () => void }) {
  const deactivating = producto.estado === 'ACTIVO';
  const setter = useSetProductoEstado();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await setter.mutateAsync({ id: producto.id, estado: deactivating ? 'INACTIVO' : 'ACTIVO' });
      toast(`${producto.nombre} ahora está ${deactivating ? 'inactivo' : 'activo'}.`);
      onClose();
    } catch (err) {
      setError(describeGestionError(err));
    }
  }

  return (
    <ConfirmDialog
      title={`${deactivating ? 'Desactivar' : 'Reactivar'} ${producto.nombre}`}
      confirmLabel={deactivating ? 'Desactivar producto' : 'Reactivar producto'}
      tone={deactivating ? 'danger' : 'primary'}
      busy={setter.isPending}
      error={error}
      blockedReason={blockedReason}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {deactivating ? (
        <>
          <p>
            Los encuestadores dejan de poder cargar precios de este producto: el servidor rechaza los productos
            inactivos y ya no aparece en su lista de visita.
          </p>
          <p>
            Los precios ya cargados se conservan. Si alguien tiene precios de este producto guardados sin conexión, el
            servidor los rechazará al sincronizar.
          </p>
          <p className="admin-note">Puede reactivarlo cuando quiera.</p>
        </>
      ) : (
        <p>Volverá a aparecer en la lista de visita y se podrán cargar precios de nuevo.</p>
      )}
    </ConfirmDialog>
  );
}

export function ProductoDetailDialog({ producto, onClose }: { producto: Producto; onClose: () => void }) {
  const variedades = useVariedades();
  const query = useQuery({
    queryKey: ckeys.producto(producto.id),
    queryFn: () => api.getProducto(producto.id),
    initialData: producto,
    staleTime: 0,
  });
  const p = query.data;
  const v = variedades.byCodigo.get(p.codigoVariedad);
  return (
    <Dialog
      title={p.nombre}
      onClose={onClose}
      actions={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <dl className="detail">
        <dt>Estado</dt>
        <dd>
          <CatalogEstadoChip estado={p.estado} />
        </dd>
        <dt>Marca</dt>
        <dd>{p.marca ?? 'Sin marca'}</dd>
        <dt>Categoría</dt>
        <dd>{p.categoria}</dd>
        <dt>Presentación</dt>
        <dd>{formatCantidad(Number(p.cantidadReferencia), p.unidad)}</dd>
        <dt>Variedad</dt>
        <dd>
          {v ? `${v.nombre} (${p.codigoVariedad})` : p.codigoVariedad}
          {v?.categoria && <span className="cell-sub">{CATEGORIA_LABEL[v.categoria]}{v.estado === 'INACTIVO' ? ' · variedad inactiva' : ''}</span>}
        </dd>
        <dt>Alta</dt>
        <dd>{fmtDate(p.createdAt)}</dd>
        <dt>Última modificación</dt>
        <dd>{fmtDate(p.updatedAt)}</dd>
      </dl>
    </Dialog>
  );
}
