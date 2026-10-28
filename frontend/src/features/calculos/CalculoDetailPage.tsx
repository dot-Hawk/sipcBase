import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sectionPath } from '@/app/roles';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams } from '@/features/catalogo/useListParams';
import { describeGestionError } from '@/features/gestion/errors';
import { AdminPage } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import { ApiError } from '@/shared/api/errors';
import type { Calculo, FormatoArchivo, SinImputarDetalle } from '@/shared/api/types';
import { IconAlert, IconChevronLeft, IconRefresh } from '@/shared/icons';
import { formatDateTime } from '@/shared/lib/dates';
import { EstadoChip } from './EstadoChip';
import { ImputacionesSection } from './ImputacionesSection';
import { useCalculo, useCalculoDownload } from './queries';
import { RelativosSection } from './RelativosSection';
import { resultadosFilename } from './rules';
import { useCreatorLabel } from './useCreatorLabel';
import { useNameLookups, type NameLookups } from './useNameLookups';
import { VariedadCell } from './VariedadCell';

const backLink = (
  <Link className="btn btn--quiet" to={sectionPath('calculos')}>
    <IconChevronLeft size={20} />
    Volver a cálculos
  </Link>
);

const NF = new Intl.NumberFormat('es-AR');

const pesoText = (n: number) => String(n).replace('.', ',');

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="calc-facts__item">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ResumenSection({ calculo }: { calculo: Calculo }) {
  const r = calculo.resumen;
  if (!r) return null;
  const figures: [string, number][] = [
    ['Observaciones', r.observaciones],
    ['Variedades', r.variedades],
    ['Informantes', r.informantes],
    ['Imputaciones', r.imputaciones],
    ['Sin imputar', r.sinImputar],
  ];
  return (
    <section className="calc-section" aria-labelledby="calc-resumen-h">
      <h2 id="calc-resumen-h">Resumen del cálculo</h2>
      <dl className="calc-figures">
        {figures.map(([label, n]) => (
          <div key={label} className="calc-figures__item">
            <dt>{label}</dt>
            <dd className="num">{NF.format(n)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SinImputarSection({ calculo, names }: { calculo: Calculo; names: NameLookups }) {
  const detail = calculo.resumen?.sinImputarDetalle ?? [];
  const total = calculo.resumen?.sinImputar ?? 0;
  if (detail.length === 0) return null;
  const columns: Column<SinImputarDetalle>[] = [
    { key: 'variedad', header: 'Variedad', primary: true, cell: (d) => <VariedadCell codigo={d.variedad} names={names} /> },
    { key: 'comercio', header: 'Comercio', cell: (d) => names.comercioNombre(d.comercio) },
    { key: 'mes', header: 'Mes', nowrap: true, cell: (d) => <span className="num">{d.mes}</span> },
  ];
  return (
    <section className="calc-section" aria-labelledby="calc-sin-h">
      <h2 id="calc-sin-h">Casos sin imputar</h2>
      <p className="admin-note">
        {detail.length < total
          ? `Se muestran ${detail.length} de ${NF.format(total)} casos sin imputar.`
          : `${NF.format(total)} ${total === 1 ? 'caso' : 'casos'} sin imputar.`}{' '}
        Son combinaciones de variedad, comercio y mes para las que el cálculo no pudo estimar un precio.
      </p>
      <DataTable
        caption="Casos sin imputar"
        columns={columns}
        rows={detail}
        rowKey={(d) => `${d.variedad}-${d.comercio}-${d.mes}`}
      />
    </section>
  );
}

function DetailBody({ calculo }: { calculo: Calculo }) {
  const { session } = useAuth();
  const role = session?.user.role ?? 'DIRECCION';
  const creatorLabel = useCreatorLabel(role, session?.user.id ?? null);
  const gate = useWriteGate();
  const names = useNameLookups();
  const url = useListParams(['variedad', 'mes']);
  const download = useCalculoDownload();
  const p = calculo.parametros;

  function save(formato: FormatoArchivo) {
    download.mutate({ kind: 'resultados', id: calculo.id, formato, filename: resultadosFilename(calculo, formato) });
  }
  const downloadError =
    download.error instanceof ApiError && download.error.status === 409
      ? 'El cálculo todavía no está completado, así que no hay resultados para descargar.'
      : download.error
        ? describeGestionError(download.error)
        : null;

  return (
    <>
      <div className="calc-status">
        <EstadoChip estado={calculo.estado} />
        {calculo.estado === 'EJECUTANDO' && (
          <p role="status" aria-label="Cálculo en ejecución" className="calc-running">
            <IconRefresh size={18} />
            <span>El cálculo está en ejecución. Esta pantalla se actualiza sola cuando termina.</span>
          </p>
        )}
      </div>

      {calculo.estado === 'FALLIDO' && (
        <div className="notice notice--danger calc-error" role="alert">
          <IconAlert size={20} />
          <div>
            <p>El cálculo no terminó correctamente. Revise el rango y los datos, y vuelva a iniciarlo.</p>
            {calculo.error && (
              <p>
                Detalle del motor: <code>{calculo.error}</code>
              </p>
            )}
          </div>
        </div>
      )}

      <dl className="calc-facts" aria-label="Datos del cálculo">
        <Fact term="Rango">
          <span className="num">
            {calculo.mesBase} a {calculo.mesObjetivo}
          </span>
        </Fact>
        <Fact term="Ofertas">{calculo.excluirOfertas ? 'Excluidas' : 'Incluidas'}</Fact>
        <Fact term="Meses de espera">{p.esperarMeses}</Fact>
        <Fact term="Peso supermercados">{pesoText(p.pesoSuper)}</Fact>
        <Fact term="Peso comercios tradicionales">{pesoText(p.pesoTrad)}</Fact>
        <Fact term="Grupos completos">{p.omitirGruposCompletos ? 'Omitidos' : 'Incluidos'}</Fact>
        <Fact term="Iniciado">
          <span className="num">{formatDateTime(calculo.createdAt)}</span> por {creatorLabel(calculo.creadoPor)}
        </Fact>
        <Fact term="Última actualización">
          <span className="num">{formatDateTime(calculo.updatedAt)}</span>
        </Fact>
        <Fact term="Versión del motor">
          <span className="num">{calculo.motorVersion}</span>
        </Fact>
      </dl>

      {calculo.estado === 'COMPLETADO' && (
        <>
          <p className="notice calc-scope">
            Este cálculo entrega relativos de precios por variedad y las imputaciones que se aplicaron. El sistema no calcula un
            índice final.
          </p>
          <ResumenSection calculo={calculo} />
          <section className="calc-section" aria-labelledby="calc-files-h">
            <h2 id="calc-files-h">Archivos</h2>
            <div className="calc-export__actions">
              <button type="button" className="btn btn--primary" disabled={download.isPending || !gate.canWrite} onClick={() => save('xlsx')}>
                Descargar resultados (.xlsx)
              </button>
              <button type="button" className="btn" disabled={download.isPending || !gate.canWrite} onClick={() => save('csv')}>
                Descargar resultados (.csv)
              </button>
            </div>
            {gate.reason && <p className="field__hint">{gate.reason}</p>}
            {downloadError && (
              <div className="notice notice--danger" role="alert">
                <IconAlert size={20} />
                <span>{downloadError}</span>
              </div>
            )}
          </section>
          <SinImputarSection calculo={calculo} names={names} />
          <RelativosSection calculo={calculo} names={names} url={url} />
          <ImputacionesSection calculoId={calculo.id} names={names} url={url} />
        </>
      )}
    </>
  );
}

/** One run: state (polled while it executes), summary, files, unimputed cases, relatives and imputations. */
export function CalculoDetailPage() {
  const { id = '' } = useParams();
  const query = useCalculo(id);
  const missing = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400);
  const calculo = query.data;

  return (
    <AdminPage
      title={calculo ? `Cálculo ${calculo.mesBase} a ${calculo.mesObjetivo}` : 'Cálculo'}
      description="Relativos de precios por variedad e imputaciones de una corrida."
      action={missing ? undefined : backLink}
    >
      {query.isPending && <LoadingRows label="Cargando cálculo" />}
      {missing && (
        <EmptyState
          title="No se encontró el cálculo"
          text="Puede haberse quitado o el enlace no es correcto."
          action={backLink}
        />
      )}
      {query.isError && !missing && <ErrorState message={describeGestionError(query.error)} onRetry={() => void query.refetch()} />}
      {calculo && <DetailBody calculo={calculo} />}
    </AdminPage>
  );
}
