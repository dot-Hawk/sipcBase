import { useMemo, useState } from 'react';
import { roleLabel } from '@/app/roles';
import { useAuth } from '@/features/auth/AuthProvider';
import { describeGestionError } from '@/features/gestion/errors';
import { hasNextPage } from '@/shared/api/page';
import { useUsers } from '@/features/gestion/queries';
import { AdminPage, FilterBar } from '@/features/gestion/ui/AdminPage';
import { DataTable, type Column } from '@/features/gestion/ui/DataTable';
import { FormField } from '@/features/gestion/ui/FormField';
import { Pagination } from '@/features/gestion/ui/Pagination';
import { EmptyState, ErrorState, LoadingRows } from '@/features/gestion/ui/states';
import { StatusChip } from '@/features/gestion/ui/StatusChip';
import { useWriteGate } from '@/features/gestion/ui/useWriteGate';
import type { ManagedUser, Role, UserEstado, UsersQuery } from '@/shared/api/types';
import { IconCheck, IconMore, IconOnline, IconPending, IconPlus } from '@/shared/icons';
import { Menu } from '@/shared/ui/Menu';
import { EstadoDialog, ESTADO_LABEL } from './EstadoDialog';
import { PasswordResetDialog } from './PasswordResetDialog';
import { ROLES, UserForm } from './UserForm';

const DATE_FMT = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const PAGE_SIZE = 50;
const OFFLINE_NOTE_ID = 'usuarios-offline';
const ESTADOS: UserEstado[] = ['ACTIVO', 'INACTIVO', 'LICENCIA'];

type Dialogs =
  | { kind: 'create' }
  | { kind: 'edit'; user: ManagedUser }
  | { kind: 'estado'; user: ManagedUser }
  | { kind: 'password'; user: ManagedUser };

function EstadoChip({ estado }: { estado: UserEstado }) {
  if (estado === 'ACTIVO') {
    return (
      <StatusChip tone="ok" icon={<IconCheck size={16} />}>
        {ESTADO_LABEL.ACTIVO}
      </StatusChip>
    );
  }
  if (estado === 'LICENCIA') {
    return (
      <StatusChip tone="attn" icon={<IconPending size={16} />}>
        {ESTADO_LABEL.LICENCIA}
      </StatusChip>
    );
  }
  return (
    <StatusChip tone="neutral" icon={<IconOnline size={16} />}>
      {ESTADO_LABEL.INACTIVO}
    </StatusChip>
  );
}

export function UsuariosPage() {
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const gate = useWriteGate();
  const [role, setRole] = useState<Role | ''>('');
  const [estado, setEstado] = useState<UserEstado | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialogs | null>(null);

  const params: UsersQuery = {
    ...(role ? { role } : {}),
    ...(estado ? { estado } : {}),
    page,
    limit: PAGE_SIZE,
  };
  const query = useUsers(params);
  const hasFilters = Boolean(role || estado);

  function closeDialog(trigger?: string) {
    setDialog(null);
    if (trigger) {
      window.setTimeout(() => document.querySelector<HTMLElement>(`button[aria-label="${CSS.escape(trigger)}"]`)?.focus(), 0);
    }
  }

  const columns = useMemo<Column<ManagedUser>[]>(() => {
    const note = gate.canWrite ? undefined : OFFLINE_NOTE_ID;
    return [
      {
        key: 'persona',
        header: 'Persona',
        primary: true,
        cell: (u) => (
          <>
            <span>
              {u.nombre} {u.apellido}
            </span>
            {u.id === me && <span className="chip chip--info self-chip">Usted</span>}
            <span className="cell-sub">{u.email}</span>
            <span className="cell-sub">
              <span className="nobr">DNI {u.dni}</span> · <span className="nobr">Legajo {u.legajo}</span>
            </span>
          </>
        ),
      },
      { key: 'rol', header: 'Rol', nowrap: true, cell: (u) => roleLabel(u.role) },
      { key: 'estado', header: 'Estado', nowrap: true, cell: (u) => <EstadoChip estado={u.estado} /> },
      {
        key: 'acceso',
        header: 'Último acceso',
        nowrap: true,
        cell: (u) => {
          const at = u.ultimoAcceso ? new Date(u.ultimoAcceso) : null;
          if (!at || Number.isNaN(at.getTime())) return 'Sin registro';
          return (
            <>
              {DATE_FMT.format(at)}
              <span className="cell-sub">{TIME_FMT.format(at)}</span>
            </>
          );
        },
      },
      {
        key: 'acciones',
        header: 'Acciones',
        align: 'end',
        cell: (u) => {
          const name = `${u.nombre} ${u.apellido}`;
          return (
            <span className="row-actions">
              <button
                type="button"
                className="btn"
                disabled={!gate.canWrite}
                aria-describedby={note}
                onClick={() => setDialog({ kind: 'edit', user: u })}
              >
                Editar<span className="visually-hidden"> {name}</span>
              </button>
              <Menu
                label={`Más acciones de ${name}`}
                trigger={<IconMore size={22} />}
                disabled={!gate.canWrite}
                items={[
                  {
                    id: 'estado',
                    label: 'Cambiar estado',
                    detail: u.id === me ? 'No puede cambiar su propio estado.' : undefined,
                    disabled: u.id === me,
                    onSelect: () => setDialog({ kind: 'estado', user: u }),
                  },
                  {
                    id: 'password',
                    label: 'Restablecer contraseña',
                    onSelect: () => setDialog({ kind: 'password', user: u }),
                  },
                ]}
              />
            </span>
          );
        },
      },
    ];
  }, [gate.canWrite, me]);

  const triggerFor = (u: ManagedUser) => `Más acciones de ${u.nombre} ${u.apellido}`;

  return (
    <AdminPage
      title="Usuarios"
      description="Personas que usan el sistema: alta, datos, rol, estado de la cuenta y contraseña."
      action={
        <button
          type="button"
          className="btn btn--primary"
          disabled={!gate.canWrite}
          aria-describedby={gate.canWrite ? undefined : OFFLINE_NOTE_ID}
          onClick={() => setDialog({ kind: 'create' })}
        >
          <IconPlus size={20} />
          Nuevo usuario
        </button>
      }
    >
      {gate.reason && (
        <p id={OFFLINE_NOTE_ID} className="notice notice--attn">
          {gate.reason}
        </p>
      )}

      <FilterBar label="Filtrar usuarios">
        <FormField label="Rol">
          {(p) => (
            <select
              {...p}
              className="select"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role | '');
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Estado">
          {(p) => (
            <select
              {...p}
              className="select"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value as UserEstado | '');
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {ESTADO_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {hasFilters && (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setRole('');
              setEstado('');
              setPage(1);
            }}
          >
            Quitar filtros
          </button>
        )}
      </FilterBar>

      {query.isPending && <LoadingRows label="Cargando usuarios" />}
      {query.isError && <ErrorState message={describeGestionError(query.error)} onRetry={() => void query.refetch()} />}
      {query.isSuccess && query.data.items.length === 0 && (
        <EmptyState
          title={hasFilters || page > 1 ? 'Ningún usuario coincide' : 'Todavía no hay usuarios'}
          text={
            hasFilters || page > 1
              ? 'Pruebe con otros filtros o vuelva a la primera página.'
              : 'Cree el primer usuario para que pueda ingresar al sistema.'
          }
        />
      )}
      {query.isSuccess && query.data.items.length > 0 && (
        <>
          <DataTable caption="Usuarios" columns={columns} rows={query.data.items} rowKey={(u) => u.id} />
          {(page > 1 || hasNextPage({ page, pageSize: PAGE_SIZE, count: query.data.items.length, total: query.data.total })) && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              count={query.data.items.length}
              total={query.data.total}
              busy={query.isFetching}
              onPage={setPage}
            />
          )}
        </>
      )}

      {dialog?.kind === 'create' && <UserForm blockedReason={gate.reason} onClose={() => closeDialog()} />}
      {dialog?.kind === 'edit' && (
        <UserForm
          user={dialog.user}
          isSelf={dialog.user.id === me}
          blockedReason={gate.reason}
          onClose={() => closeDialog()}
        />
      )}
      {dialog?.kind === 'estado' && (
        <EstadoDialog user={dialog.user} blockedReason={gate.reason} onClose={() => closeDialog(triggerFor(dialog.user))} />
      )}
      {dialog?.kind === 'password' && (
        <PasswordResetDialog
          user={dialog.user}
          blockedReason={gate.reason}
          onClose={() => closeDialog(triggerFor(dialog.user))}
        />
      )}
    </AdminPage>
  );
}
