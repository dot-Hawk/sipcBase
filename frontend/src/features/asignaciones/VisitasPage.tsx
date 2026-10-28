import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/app/PageHeader';
import { describeApiError } from '@/shared/api/errors';
import { useOnline } from '@/shared/lib/useOnline';
import { OfflineNoData } from '@/shared/ui/OfflineNoData';
import type { AsignacionEstado } from '@/shared/api/types';
import { IconChevronRight, IconTipo, IconVisits } from '@/shared/icons';
import { formatDate } from '@/shared/lib/dates';
import { humanizePeriodo } from '@/shared/lib/periodo';
import { plazoLabel } from '@/shared/lib/plazo';
import { ProgressRing } from '@/shared/ui/ProgressRing';
import { Segmented } from '@/shared/ui/Segmented';
import { EstadoChip } from './EstadoChip';
import { FRECUENCIA_LABEL } from './labels';
import { aggregateProgress, countByEstado, groupVisitas, pickPrimaryRelevamiento, sortVisitas } from './summary';
import { useVisitas, type Visita } from './useVisitas';
import './visitas.css';

type Filter = 'TODAS' | AsignacionEstado;

function VisitaRow({ v }: { v: Visita }) {
  const { asignacion, comercio, relevamiento, priced, total } = v;
  const done = Math.min(priced, total);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const readOnly = relevamiento?.estado === 'CERRADO';
  const active = !readOnly && asignacion.estado === 'EN_CURSO';
  const cta = readOnly || asignacion.estado === 'COMPLETADA' ? null : active ? 'Continuar' : 'Iniciar';
  return (
    <li>
      <Link
        className={`visit${active ? ' visit--active' : ''}${readOnly ? ' visit--muted' : ''}`}
        to={`/visita/${asignacion.id}`}
      >
        <span className="visit__tile">
          <IconTipo tipo={comercio?.tipo ?? 'OTRO'} size={26} />
        </span>
        <span className="visit__main">
          <span className="visit__name">{comercio?.nombre ?? 'Comercio sin datos'}</span>
          <span className="visit__addr">
            {comercio ? `${comercio.direccion}, ${comercio.zona}` : 'No se pudo leer el comercio.'}
          </span>
        </span>
        <span className="visit__progress">
          <span className="visit__count num">
            {done} de {total}
          </span>
          <span className="bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span className="visit__state">
          <EstadoChip estado={asignacion.estado} />
        </span>
        {cta ? (
          <span className={`visit__cta${active ? ' visit__cta--primary' : ''}`}>{cta}</span>
        ) : (
          <IconChevronRight className="visit__go" size={22} />
        )}
      </Link>
    </li>
  );
}

function Loading() {
  return (
    <div aria-hidden="true" className="vs-loading">
      <span className="skeleton" style={{ height: 188, borderRadius: 20 }} />
      {[0, 1, 2].map((i) => (
        <span key={i} className="skeleton" style={{ height: 88, borderRadius: 20 }} />
      ))}
    </div>
  );
}

export function VisitasPage() {
  const { visitas, loading, error, refetchAll } = useVisitas();
  const online = useOnline();
  const [filter, setFilter] = useState<Filter>('TODAS');

  const rows = useMemo(
    () => sortVisitas(visitas.map((v) => ({ ...v, estado: v.asignacion.estado, rel: v.relevamiento }))),
    [visitas],
  );
  const counts = useMemo(() => countByEstado(rows), [rows]);

  const primary = useMemo(() => {
    const rels = new Map<string, NonNullable<Visita['relevamiento']>>();
    for (const v of visitas) if (v.relevamiento) rels.set(v.relevamiento.id, v.relevamiento);
    return pickPrimaryRelevamiento([...rels.values()]);
  }, [visitas]);
  const progress = useMemo(
    () => aggregateProgress(visitas.filter((v) => v.relevamiento?.id === primary?.id)),
    [visitas, primary],
  );

  const groups = useMemo(
    () => groupVisitas(rows.filter((v) => filter === 'TODAS' || v.estado === filter)),
    [rows, filter],
  );

  const plazo = primary ? plazoLabel(primary.fechaLimite) : null;
  const primaryClosed = primary?.estado === 'CERRADO';

  return (
    <div className="page">
      <PageHeader eyebrow="Relevamiento" title="Visitas" />

      {loading && online && <Loading />}
      {loading && !online && <OfflineNoData />}
      <p className="visually-hidden" role="status">
        {loading ? 'Cargando visitas' : ''}
      </p>

      {error && !loading && (
        <div className="state" role="alert">
          <h2>No se pudieron cargar las visitas</h2>
          <p>{describeApiError(error)}</p>
          <button type="button" className="btn btn--primary" onClick={() => void refetchAll()}>
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && visitas.length === 0 && (
        <div className="state">
          <span className="state__icon">
            <IconVisits size={30} />
          </span>
          <h2>Todavía no tiene visitas asignadas</h2>
          <p>Cuando su coordinador le asigne comercios van a aparecer aquí.</p>
          <button type="button" className="btn btn--primary" onClick={() => void refetchAll()}>
            Actualizar visitas
          </button>
        </div>
      )}

      {!loading && !error && visitas.length > 0 && (
        <>
          <section className="band" aria-label="Resumen del relevamiento">
            <div className="band__top">
              <div className="band__text">
                <h2 className="band__title">{primary ? humanizePeriodo(primary.periodo) : 'Sin relevamiento'}</h2>
                {primary && (
                  <p className="band__sub">
                    Relevamiento {FRECUENCIA_LABEL[primary.frecuencia].toLowerCase()}, fecha límite{' '}
                    {formatDate(primary.fechaLimite)}
                  </p>
                )}
                {plazo && (
                  <span className={`chip chip--on-brand band__plazo${primaryClosed ? '' : ''}`}>
                    {primaryClosed ? 'Cerrado' : plazo.text}
                  </span>
                )}
              </div>
              <div className="band__ring">
                <ProgressRing
                  value={progress.priced}
                  total={progress.total}
                  size={104}
                  tone="on-brand"
                  label={`${progress.priced} de ${progress.total} precios cargados`}
                />
                <p className="band__ring-label num">
                  {progress.priced} de {progress.total} precios
                </p>
              </div>
            </div>
            <Segmented<Filter>
              label="Filtrar visitas por estado"
              value={filter}
              onBrand
              onChange={setFilter}
              options={[
                { id: 'TODAS', label: 'Todas', count: rows.length },
                { id: 'PENDIENTE', label: 'Pendientes', count: counts.PENDIENTE },
                { id: 'EN_CURSO', label: 'En curso', count: counts.EN_CURSO },
                { id: 'COMPLETADA', label: 'Completadas', count: counts.COMPLETADA },
              ]}
            />
          </section>

          {groups.length === 0 && (
            <div className="state">
              <h2>No hay visitas con este estado</h2>
              <p>Pruebe con otro filtro para ver el resto de sus visitas.</p>
              <button type="button" className="btn btn--primary" onClick={() => setFilter('TODAS')}>
                Ver todas las visitas
              </button>
            </div>
          )}

          {groups.map((g) => (
            <section
              key={g.id}
              className={`group${g.rel?.estado === 'CERRADO' ? ' group--closed' : ''}`}
              aria-labelledby={`rel-${g.id}`}
            >
              {g.rel && g.rel.id !== primary?.id ? (
                <header className="group__head">
                  <h2 id={`rel-${g.id}`}>{g.rel ? humanizePeriodo(g.rel.periodo) : 'Relevamiento sin datos'}</h2>
                  {g.rel?.estado === 'CERRADO' && <span className="chip">Cerrado, solo consulta</span>}
                </header>
              ) : (
                <h2 id={`rel-${g.id}`} className="visually-hidden">
                  Visitas de {g.rel ? humanizePeriodo(g.rel.periodo) : 'relevamiento sin datos'}
                </h2>
              )}
              <ul className="visits">
                {g.items.map((v) => (
                  <VisitaRow key={v.asignacion.id} v={v} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
