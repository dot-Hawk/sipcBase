import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { describeGestionError } from '@/features/gestion/errors';
import { ConfirmDialog } from '@/features/gestion/ui/ConfirmDialog';
import { api } from '@/shared/api/endpoints';
import type { CanastaNodo } from '@/shared/api/types';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { fmtDate } from './ComercioDialogs';
import { CatalogEstadoChip } from './EstadoChip';
import { ckeys, useProductosOfVariedad, useSetVariedadEstado } from './queries';
import { CATEGORIA_LABEL, formatCantidad } from './rules';

export function VariedadEstadoDialog({ nodo, blockedReason, onClose }: { nodo: CanastaNodo; blockedReason: string | null; onClose: () => void }) {
  const removing = nodo.estado === 'ACTIVO';
  const setter = useSetVariedadEstado();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const uses = useProductosOfVariedad(nodo.codigo, removing);
  const count = uses.data?.length ?? 0;

  async function confirm() {
    setError(null);
    try {
      await setter.mutateAsync({ codigo: nodo.codigo, estado: removing ? 'INACTIVO' : 'ACTIVO' });
      toast(removing ? `${nodo.nombre} salió de la canasta.` : `${nodo.nombre} volvió a la canasta.`);
      onClose();
    } catch (err) {
      setError(describeGestionError(err));
    }
  }

  return (
    <ConfirmDialog
      title={`${removing ? 'Quitar' : 'Reincorporar'} ${nodo.nombre}`}
      confirmLabel={removing ? 'Quitar de la canasta' : 'Reincorporar a la canasta'}
      tone={removing ? 'danger' : 'primary'}
      busy={setter.isPending}
      error={error}
      blockedReason={blockedReason}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {removing ? (
        <>
          <p>
            La variedad queda inactiva: no se borra, así que sus precios históricos y los cálculos pasados la siguen
            refiriendo. No podrá elegirse para productos nuevos ni al editar uno.
          </p>
          {uses.isSuccess && count > 0 && (
            <p className="notice notice--attn">
              {count} {count === 1 ? 'producto la usa' : 'productos la usan'} y {count === 1 ? 'seguirá' : 'seguirán'}{' '}
              apuntando a ella: el servidor no los desactiva ni lo impide. Cámbiele la variedad desde Productos si
              corresponde.
            </p>
          )}
          <p className="admin-note">Puede reincorporarla cuando quiera.</p>
        </>
      ) : (
        <p>Volverá a poder elegirse para productos nuevos o editados.</p>
      )}
    </ConfirmDialog>
  );
}

export function VariedadDetailDialog({
  nodo,
  productoNombre,
  onClose,
}: {
  nodo: CanastaNodo;
  productoNombre: string | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ckeys.nodo(nodo.codigo),
    queryFn: () => api.getCanastaNodo(nodo.codigo),
    initialData: nodo,
    staleTime: 0,
  });
  const uses = useProductosOfVariedad(nodo.codigo);
  const n = query.data;
  return (
    <Dialog
      title={n.nombre}
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
          <CatalogEstadoChip estado={n.estado} />
        </dd>
        <dt>Código</dt>
        <dd className="num">{n.codigo}</dd>
        <dt>Producto</dt>
        <dd>
          {productoNombre ?? 'Producto de la canasta'} <span className="num">({n.padre})</span>
        </dd>
        <dt>Categoría</dt>
        <dd>{n.categoria ? CATEGORIA_LABEL[n.categoria] : '—'}</dd>
        <dt>Ponderador</dt>
        <dd className="num">{n.ponderador}</dd>
        <dt>Código de 12 dígitos</dt>
        <dd className="num">{n.codigoVariedad12 ?? 'Sin código'}</dd>
        <dt>Tratamiento especial</dt>
        <dd>{n.tratamientoEspecial ? 'Sí' : 'No'}</dd>
        <dt>Alta</dt>
        <dd>{fmtDate(n.createdAt)}</dd>
        <dt>Última modificación</dt>
        <dd>{fmtDate(n.updatedAt)}</dd>
      </dl>
      <section aria-label="Productos que usan esta variedad">
        <h3 className="detail__h">Productos que la usan</h3>
        {uses.isPending && <p className="admin-note">Cargando…</p>}
        {uses.isError && <p className="admin-note">No se pudieron cargar los productos.</p>}
        {uses.isSuccess && uses.data.length === 0 && <p className="admin-note">Ningún producto usa esta variedad todavía.</p>}
        {uses.isSuccess && uses.data.length > 0 && (
          <ul className="detail__list">
            {uses.data.map((p) => (
              <li key={p.id}>
                <span>{p.nombre}</span>
                <span className="cell-sub">
                  {formatCantidad(Number(p.cantidadReferencia), p.unidad)}
                  {p.estado === 'INACTIVO' ? ' · inactivo' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Dialog>
  );
}
