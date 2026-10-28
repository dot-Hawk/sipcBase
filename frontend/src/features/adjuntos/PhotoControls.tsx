import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/endpoints';
import { describeItemError } from '@/features/outbox/labels';
import { useOutbox, useOutboxSnapshot } from '@/features/outbox/OutboxProvider';
import type { PhotoItem } from '@/features/outbox/types';
import { ApiError, describeApiError } from '@/shared/api/errors';
import { keys } from '@/shared/api/queries';
import type { Adjunto } from '@/shared/api/types';
import { IconCamera, IconTrash } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { prepareImage } from './downscale';
import './photos.css';

export const MAX_ATTACHMENTS = 5;

interface Props {
  /** Server id of the precio; null while it does not exist on the server yet. */
  precioId: string | null;
  productoNombre: string;
  readOnly: boolean;
  offline: boolean;
  /** Which (visit, product) a queued photo belongs to. */
  target: { asignacionId: string; relevamiento: string; comercio: string; producto: string };
}

/** Object URLs for the queued blobs, created once per item and released when it leaves the queue. */
function useQueuedPreviews(items: readonly PhotoItem[]): Map<string, string> {
  const urls = useRef(new Map<string, string>());
  const live = new Set(items.map((i) => i.id));
  for (const [id, url] of urls.current) {
    if (!live.has(id)) {
      URL.revokeObjectURL(url);
      urls.current.delete(id);
    }
  }
  for (const item of items) {
    if (!urls.current.has(item.id)) urls.current.set(item.id, URL.createObjectURL(item.blob));
  }
  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current.clear();
    },
    [],
  );
  return urls.current;
}

/** Loads a protected attachment through an authenticated fetch and exposes an object URL. */
function useAuthedImage(precioId: string, adjuntoId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    let created: string | null = null;
    api
      .downloadAdjunto(precioId, adjuntoId, ctrl.signal)
      .then((blob) => {
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => undefined);
    return () => {
      ctrl.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [precioId, adjuntoId]);
  return url;
}

function Thumb({ precioId, adjunto, label, onOpen }: { precioId: string; adjunto: Adjunto; label: string; onOpen: () => void }) {
  const url = useAuthedImage(precioId, adjunto.id);
  return (
    <button type="button" className="thumb" onClick={onOpen} aria-label={label}>
      {url ? <img src={url} alt="" /> : <span className="thumb__loading" aria-hidden="true" />}
    </button>
  );
}

function Viewer({
  precioId,
  adjunto,
  title,
  canDelete,
  deleting,
  onDelete,
  onClose,
}: {
  precioId: string;
  adjunto: Adjunto;
  title: string;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  const url = useAuthedImage(precioId, adjunto.id);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          {canDelete && (
            <button type="button" className="btn btn--danger" onClick={onDelete} disabled={deleting}>
              <IconTrash size={20} /> Eliminar foto
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} data-autofocus>
            Cerrar
          </button>
        </>
      }
    >
      <div className="viewer">{url ? <img src={url} alt={title} /> : <p>Cargando foto…</p>}</div>
    </Dialog>
  );
}

export function PhotoControls({ precioId, productoNombre, readOnly, offline, target }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const outbox = useOutbox();
  const snapshot = useOutboxSnapshot();
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<Adjunto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queued = useMemo(
    () =>
      snapshot.items.filter(
        (i): i is PhotoItem =>
          i.kind === 'photo' && i.asignacionId === target.asignacionId && i.producto === target.producto,
      ),
    [snapshot.items, target.asignacionId, target.producto],
  );
  const previews = useQueuedPreviews(queued);

  const list = useQuery({
    queryKey: keys.adjuntos(precioId ?? 'none'),
    queryFn: () => api.listAdjuntos(precioId as string),
    enabled: precioId !== null,
  });
  const attachments = list.data ?? [];
  const total = attachments.length + queued.length;

  const upload = useMutation({
    mutationFn: ({ id, blob }: { id: string; blob: Blob }) => api.uploadAdjunto(id, blob),
    networkMode: 'always',
  });
  const remove = useMutation({
    mutationFn: ({ id, adjuntoId }: { id: string; adjuntoId: string }) => api.deleteAdjunto(id, adjuntoId),
    networkMode: 'always',
  });

  async function enqueue(blob: Blob) {
    if (!outbox) throw new Error('outbox unavailable');
    await outbox.enqueuePhoto({ ...target, blob, precioId });
    void outbox.flush();
  }

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (total >= MAX_ATTACHMENTS) {
      setError(`Cada precio admite hasta ${MAX_ATTACHMENTS} fotos. Elimine una para agregar otra.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const blob = await prepareImage(file);
      if (precioId && !offline) {
        try {
          await upload.mutateAsync({ id: precioId, blob });
          toast('Foto agregada');
          await queryClient.invalidateQueries({ queryKey: keys.adjuntos(precioId) });
        } catch (e) {
          // The connection dropped mid-upload: keep the photo, the outbox will send it.
          if (e instanceof ApiError && e.status === 0) await enqueue(blob);
          else throw e;
        }
      } else {
        await enqueue(blob);
      }
    } catch (e) {
      setError(
        e instanceof Error && !('status' in e)
          ? 'No se pudo preparar la foto. Elija otra imagen.'
          : describeApiError(e, 'adjunto'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteViewing() {
    if (!viewing || !precioId) return;
    try {
      await remove.mutateAsync({ id: precioId, adjuntoId: viewing.id });
      toast('Foto eliminada');
      setViewing(null);
      await queryClient.invalidateQueries({ queryKey: keys.adjuntos(precioId) });
    } catch (e) {
      setViewing(null);
      setError(describeApiError(e, 'adjunto'));
    }
  }

  const canAdd = !readOnly && total < MAX_ATTACHMENTS && outbox !== null;
  const refused = queued.filter((q) => q.status === 'rejected' || q.status === 'failed');
  const waiting = queued.length - refused.length;

  return (
    <div className="photos">
      {!readOnly && (
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-label={`Foto de ${productoNombre}`}
          onChange={(e) => void onFiles(e.target.files)}
        />
      )}
      <ul className="photos__grid">
        {precioId &&
          attachments.map((a, i) => (
            <li key={a.id}>
              <Thumb
                precioId={precioId}
                adjunto={a}
                label={`Ver foto ${i + 1} de ${productoNombre}`}
                onOpen={() => setViewing(a)}
              />
            </li>
          ))}
        {queued.map((p, i) => (
          <li key={p.id}>
            <span className={`thumb thumb--pending${p.status === 'rejected' || p.status === 'failed' ? ' thumb--refused' : ''}`}>
              <img src={previews.get(p.id)} alt={`Foto pendiente ${i + 1}`} />
            </span>
          </li>
        ))}
        {!readOnly && (
          <li>
            <button
              type="button"
              className="thumb thumb--add"
              disabled={!canAdd || busy}
              onClick={() => inputRef.current?.click()}
            >
              <IconCamera size={26} />
              <span>{busy ? 'Preparando…' : 'Adjuntar foto'}</span>
            </button>
          </li>
        )}
      </ul>
      {readOnly && total === 0 && <p className="photos__none">Sin fotos</p>}
      {total > 0 && (
        <p className="photos__hint num">
          {total} de {MAX_ATTACHMENTS} fotos
        </p>
      )}
      {waiting > 0 && (
        <p className="photos__hint">
          {precioId === null
            ? 'La foto se enviará cuando se guarde el precio.'
            : offline
              ? 'Sin conexión: la foto se enviará al recuperar la conexión.'
              : 'Pendiente de envío: la foto se envía en unos segundos.'}
        </p>
      )}
      {refused.map((p) => (
        <div key={p.id} className="photos__refused" role="alert">
          <p>No se pudo enviar esta foto. {describeItemError(p.error, 'adjunto')}</p>
          <button type="button" className="btn" onClick={() => void outbox?.discard(p.id)}>
            <IconTrash size={20} /> Descartar foto
          </button>
        </div>
      ))}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {viewing && precioId && (
        <Viewer
          precioId={precioId}
          adjunto={viewing}
          title={`Foto de ${productoNombre}`}
          canDelete={!readOnly && !offline}
          deleting={remove.isPending}
          onDelete={() => void deleteViewing()}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
