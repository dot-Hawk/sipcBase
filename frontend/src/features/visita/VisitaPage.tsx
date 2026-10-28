import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PhotoControls } from '@/features/adjuntos/PhotoControls';
import { useOutbox, useOutboxSnapshot } from '@/features/outbox/OutboxProvider';
import { countItems } from '@/features/outbox/types';
import { pendingByProducto, withOptimisticPrices } from '@/features/outbox/view';
import { EstadoChip } from '@/features/asignaciones/EstadoChip';
import { ESTADO_LABEL } from '@/features/asignaciones/labels';
import { canEditPrices, canFinish, canStart, editBlockReason } from '@/features/asignaciones/rules';
import { api } from '@/shared/api/endpoints';
import { ApiError, describeApiError } from '@/shared/api/errors';
import {
  keys,
  upsertPrecioInCache,
  useAllPrecios,
  useAsignaciones,
  useComercios,
  useProductos,
  useRelevamientos,
} from '@/shared/api/queries';
import type { Asignacion, AsignacionEstado, Precio } from '@/shared/api/types';
import { IconChevronLeft, IconFlag, IconLock, IconPlay, IconSwap } from '@/shared/icons';
import { humanizePeriodo } from '@/shared/lib/periodo';
import { useMediaQuery } from '@/shared/lib/useMediaQuery';
import { useOnline } from '@/shared/lib/useOnline';
import { Dialog } from '@/shared/ui/Dialog';
import { Menu } from '@/shared/ui/Menu';
import { OfflineNoData } from '@/shared/ui/OfflineNoData';
import { useToast } from '@/shared/ui/Toast';
import { clearDraft, loadDrafts, saveDraft } from './drafts';
import { buildPriceSeries } from './history';
import type { PriceSubmit } from './PriceEditor';
import { findPrevious } from './previous';
import { savePrice, type SavePriceResult } from './savePrice';
import { VisitaWorkspace } from './VisitaWorkspace';
import './visita.css';

function Loading() {
  return (
    <div className="visita" aria-hidden="true">
      <div className="vbar">
        <span className="skeleton" style={{ width: 48, height: 48, borderRadius: 24 }} />
        <span className="skeleton" style={{ width: 260, height: 40 }} />
      </div>
      <div className="workspace">
        <div className="list-pane" style={{ padding: 16, gap: 12 }}>
          <span className="skeleton" style={{ height: 56 }} />
          <span className="skeleton" style={{ height: 56 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function VisitaPage() {
  const { asignacionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const wide = useMediaQuery('(min-width: 900px)');
  const queryClient = useQueryClient();
  const outbox = useOutbox();
  const outboxSnapshot = useOutboxSnapshot();

  const asignaciones = useAsignaciones();
  const relevamientos = useRelevamientos();
  const comercios = useComercios();
  const productos = useProductos();

  const asignacion = asignaciones.data?.find((a) => a.id === asignacionId) ?? null;
  const relevamiento = relevamientos.data?.find((r) => r.id === asignacion?.relevamiento) ?? null;
  const comercio = comercios.data?.find((c) => c.id === asignacion?.comercio) ?? null;
  const precios = useAllPrecios(asignacion?.comercio);

  const [finishOpen, setFinishOpen] = useState(false);
  const drafts = useRef({ id: asignacionId, map: loadDrafts(asignacionId) });
  if (drafts.current.id !== asignacionId) drafts.current = { id: asignacionId, map: loadDrafts(asignacionId) };

  const loading = asignaciones.isPending || relevamientos.isPending || comercios.isPending || productos.isPending;

  const currentPrecios = useMemo(
    () =>
      new Map(
        (precios.data ?? [])
          .filter((p) => p.relevamiento === asignacion?.relevamiento && p.comercio === asignacion?.comercio)
          .map((p) => [p.producto, p] as const),
      ),
    [precios.data, asignacion?.relevamiento, asignacion?.comercio],
  );

  // What the surveyor sees: server prices with the queued (not yet sent) values on top.
  const savedView = useMemo(
    () => withOptimisticPrices(currentPrecios, outboxSnapshot.items, asignacionId),
    [currentPrecios, outboxSnapshot.items, asignacionId],
  );
  const pendingMap = useMemo(
    () => pendingByProducto(outboxSnapshot.items, asignacionId),
    [outboxSnapshot.items, asignacionId],
  );
  const visitPending = useMemo(
    () => countItems(outboxSnapshot.items.filter((i) => i.asignacionId === asignacionId)),
    [outboxSnapshot.items, asignacionId],
  );

  const upsertPrecio = useCallback((precio: Precio) => upsertPrecioInCache(queryClient, precio), [queryClient]);

  const estadoMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: AsignacionEstado }) => api.updateAsignacionEstado(id, estado),
    networkMode: 'always',
    onSuccess: (updated: Asignacion) => {
      queryClient.setQueryData<Asignacion[]>(keys.asignaciones, (old) =>
        (old ?? []).map((a) => (a.id === updated.id ? updated : a)),
      );
      toast(updated.estado === 'EN_CURSO' ? 'Visita iniciada' : 'Visita finalizada');
    },
    onError: (e) => {
      toast(describeApiError(e, 'asignacion'), 'error');
      void queryClient.invalidateQueries({ queryKey: keys.asignaciones });
    },
  });

  if (loading && !online) {
    return (
      <div className="page" style={{ paddingTop: 32 }}>
        <OfflineNoData />
      </div>
    );
  }
  if (loading) return <Loading />;

  if (!asignacion || !relevamiento || !comercio) {
    return (
      <div className="page" style={{ paddingTop: 32 }}>
        <div className="state">
          <h1>No se encontró la visita</h1>
          <p>Puede que la visita ya no esté asignada a usted o que los datos no se hayan cargado.</p>
          <Link className="btn btn--primary" to="/">
            Volver a visitas
          </Link>
        </div>
      </div>
    );
  }

  const asig = asignacion;
  const editable = canEditPrices(asig, relevamiento);
  const reason = editBlockReason(asig, relevamiento);
  const total = productos.data?.length ?? 0;
  const priced = [...savedView.keys()].filter((id) => productos.data?.some((p) => p.id === id)).length;
  const pct = total > 0 ? Math.round((priced / total) * 100) : 0;
  const others = (asignaciones.data ?? []).filter((a) => a.id !== asig.id);
  const pendingAction = estadoMutation.isPending;

  function dropDraft(productoId: string) {
    clearDraft(asignacionId, productoId);
    delete drafts.current.map[productoId];
  }

  async function onSave(productoId: string, input: PriceSubmit): Promise<SavePriceResult | { kind: 'queued' }> {
    const existing = currentPrecios.get(productoId) ?? null;

    // Offline, or the connection dropped mid-save: keep the value in the outbox on this device.
    const queue = async (): Promise<{ kind: 'queued' }> => {
      if (!outbox) throw new Error('outbox unavailable');
      await outbox.enqueuePrice({
        asignacionId,
        relevamiento: asig.relevamiento,
        comercio: asig.comercio,
        producto: productoId,
        valor: input.valor,
        oferta: input.oferta,
        observacion: input.observacion,
        precio: existing,
        confirmed: input.confirmarDesvio === true,
      });
      dropDraft(productoId);
      void outbox.flush();
      return { kind: 'queued' };
    };
    if (!online && outbox) return queue();

    let result: SavePriceResult;
    try {
      result = await savePrice(
        {
          createPrecio: api.createPrecio,
          updatePrecio: api.updatePrecio,
          findExisting: async (ctx) => (await api.listPrecios({ ...ctx, limit: 1 }))[0] ?? null,
        },
        {
          relevamiento: asig.relevamiento,
          comercio: asig.comercio,
          producto: productoId,
          existingId: existing?.id ?? null,
          previous: existing,
          valor: input.valor,
          oferta: input.oferta,
          observacion: input.observacion,
          confirmarDesvio: input.confirmarDesvio,
        },
      );
    } catch (e) {
      if (outbox && e instanceof ApiError && e.status === 0) return queue();
      throw e;
    }
    if (result.kind !== 'needs-confirmation') {
      upsertPrecio(result.precio);
      dropDraft(productoId);
      // The value just saved is the newest: a queued older one for this product would undo it.
      if (outbox && pendingMap.get(productoId)?.price) {
        await outbox.supersedePrice(asignacionId, productoId, result.precio.id);
      }
    }
    return result;
  }

  async function onDelete(precio: Precio) {
    await api.deletePrecio(precio.id);
    // Whatever was still queued for this product has nothing left to attach to.
    for (const it of outboxSnapshot.items) {
      if (it.asignacionId === asignacionId && it.producto === precio.producto) await outbox?.discard(it.id);
    }
    queryClient.setQueryData<Precio[]>(keys.preciosAll(precio.comercio), (old) =>
      (old ?? []).filter((p) => p.id !== precio.id),
    );
    void queryClient.invalidateQueries({ queryKey: keys.precios });
    toast('Precio eliminado');
  }

  const start = () => estadoMutation.mutate({ id: asig.id, estado: 'EN_CURSO' });

  return (
    <div className="visita">
      <header className="vbar">
        <Link to="/" className="icon-btn icon-btn--fill vbar__back" aria-label="Volver a visitas">
          <IconChevronLeft size={24} />
        </Link>
        <div className="vbar__title">
          <h1>{comercio.nombre}</h1>
          <p>
            {comercio.direccion}, {comercio.zona}
          </p>
        </div>
        <div className="vbar__status">
          <EstadoChip estado={asig.estado} />
          <div className="vbar__progress">
            <span className="num">
              {priced} de {total}
            </span>
            <span className="bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
          </div>
        </div>
        <div className="vbar__actions">
          {others.length > 0 && (
            <Menu
              label="Cambiar de visita"
              trigger={<IconSwap size={22} />}
              triggerClassName="icon-btn icon-btn--fill"
              items={others.map((a) => {
                const c = comercios.data?.find((x) => x.id === a.comercio);
                const r = relevamientos.data?.find((x) => x.id === a.relevamiento);
                return {
                  id: a.id,
                  label: c?.nombre ?? 'Comercio',
                  detail: `${r ? humanizePeriodo(r.periodo) : 'Sin datos'}, ${ESTADO_LABEL[a.estado].toLowerCase()}`,
                  onSelect: () => navigate(`/visita/${a.id}`),
                };
              })}
            />
          )}
          {canStart(asig, relevamiento) && (
            <button type="button" className="btn btn--primary" disabled={!online || pendingAction} onClick={start}>
              <IconPlay size={20} />
              Iniciar visita
            </button>
          )}
          {canFinish(asig, relevamiento) && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!online || pendingAction}
              onClick={() => setFinishOpen(true)}
            >
              <IconFlag size={20} />
              Finalizar visita
            </button>
          )}
        </div>
      </header>

      {!wide && (reason === 'completed' || reason === 'closed') && (
        <div className="notice notice--attn visita__notice">
          <IconLock size={20} />
          <p>
            {reason === 'completed'
              ? 'La visita está finalizada. Los precios y las fotos quedan solo para consulta.'
              : 'El relevamiento está cerrado. Los precios y las fotos quedan solo para consulta.'}
          </p>
        </div>
      )}

      {productos.error && productos.data === undefined ? (
        <div className="state visita__state" role="alert">
          <h2>No se pudieron cargar los productos</h2>
          <p>{describeApiError(productos.error)}</p>
          <button type="button" className="btn btn--primary" onClick={() => void productos.refetch()}>
            Reintentar
          </button>
        </div>
      ) : (
        <VisitaWorkspace
          visitaId={asig.id}
          productos={productos.data ?? []}
          saved={savedView}
          pending={pendingMap}
          onConfirmPending={(productoId) => {
            const id = pendingMap.get(productoId)?.priceItemId;
            if (!id || !outbox) return;
            void outbox.confirm(id).then(() => outbox.flush());
            toast('Precio confirmado');
          }}
          onRetryPending={() => void outbox?.retry()}
          onDiscardPending={(productoId) => {
            const id = pendingMap.get(productoId)?.priceItemId;
            if (id) void outbox?.discard(id);
          }}
          previousFor={(productoId) =>
            findPrevious({
              precios: precios.data ?? [],
              relevamientos: relevamientos.data ?? [],
              current: relevamiento,
              comercio: asig.comercio,
              producto: productoId,
            })
          }
          previousSource={{ relevamiento: asig.relevamiento, comercio: asig.comercio }}
          seriesFor={(productoId) =>
            buildPriceSeries({
              precios: precios.data ?? [],
              relevamientos: relevamientos.data ?? [],
              current: relevamiento,
              comercio: asig.comercio,
              producto: productoId,
            })
          }
          editable={editable}
          blockReason={reason}
          offline={!online}
          wide={wide}
          initialDrafts={drafts.current.map}
          initialSelectedId={searchParams.get('producto')}
          onDraftChange={(productoId, d) => {
            if (d) saveDraft(asignacionId, productoId, d);
            else clearDraft(asignacionId, productoId);
          }}
          onSave={onSave}
          onDelete={onDelete}
          photoSlotFor={(p) => (
            <PhotoControls
              precioId={currentPrecios.get(p.id)?.id ?? null}
              target={{ asignacionId, relevamiento: asig.relevamiento, comercio: asig.comercio, producto: p.id }}
              productoNombre={p.nombre}
              readOnly={!editable}
              offline={!online}
            />
          )}
          onStartVisit={start}
          onFinishVisit={() => setFinishOpen(true)}
          startingVisit={pendingAction}
        />
      )}

      {finishOpen && (
        <Dialog
          title="Finalizar visita"
          onClose={() => setFinishOpen(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setFinishOpen(false)} data-autofocus>
                Seguir cargando
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={visitPending.total > 0}
                onClick={() => {
                  setFinishOpen(false);
                  estadoMutation.mutate({ id: asig.id, estado: 'COMPLETADA' });
                }}
              >
                Finalizar visita
              </button>
            </>
          }
        >
          <p>
            Tiene <strong className="num">{priced}</strong> de <strong className="num">{total}</strong> productos con
            precio en {comercio.nombre}. Después de finalizar no podrá cambiar precios ni fotos.
          </p>
          {visitPending.total > 0 && (
            <p className="notice notice--attn" role="alert">
              Hay <strong className="num">{visitPending.total}</strong> {visitPending.total === 1 ? 'cambio' : 'cambios'}{' '}
              sin enviar de esta visita. Espere a que se envíen, o confírmelos, corríjalos o descártelos, antes de
              finalizar: después no se podrán enviar.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
