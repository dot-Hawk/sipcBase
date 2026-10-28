import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable } from './DataTable';
import { FormField } from './FormField';
import { Pagination } from './Pagination';
import { AdminPage } from './AdminPage';
import { EmptyState, ErrorState, LoadingRows } from './states';

describe('DataTable', () => {
  const rows = [
    { id: '1', name: 'Ana', age: 30 },
    { id: '2', name: 'Beto', age: 41 },
  ];
  const columns = [
    { key: 'name', header: 'Nombre', cell: (r: (typeof rows)[number]) => r.name },
    { key: 'age', header: 'Edad', cell: (r: (typeof rows)[number]) => r.age },
  ];

  it('is a real table with a caption, column headers and labelled cells', () => {
    render(<DataTable caption="Personas" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole('table', { name: 'Personas' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Nombre', 'Edad']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    // The stacked layout labels each cell through data-label.
    expect(within(table).getByText('Beto').closest('td')).toHaveAttribute('data-label', 'Nombre');
  });
});

describe('FormField', () => {
  it('links the label, hint and error to the control', () => {
    render(
      <FormField label="Correo" hint="Use su correo institucional." error="Correo no válido.">
        {(p) => <input {...p} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby') ?? '';
    expect(described.split(' ').map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Use su correo institucional.',
      'Correo no válido.',
    ]);
  });
  it('has no aria-invalid without an error', () => {
    render(<FormField label="Nombre">{(p) => <input {...p} />}</FormField>);
    expect(screen.getByLabelText('Nombre')).not.toHaveAttribute('aria-invalid');
  });
});

describe('ConfirmDialog', () => {
  it('states the consequences and confirms or cancels', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="Cerrar relevamiento" confirmLabel="Cerrar relevamiento" tone="danger" onConfirm={onConfirm} onCancel={onCancel}>
        <p>No se podrá reabrir.</p>
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Cerrar relevamiento' });
    expect(within(dialog).getByText('No se podrá reabrir.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar relevamiento' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it('shows an error in an alert and disables the buttons while busy', () => {
    render(
      <ConfirmDialog title="T" confirmLabel="Si" busy error="No se pudo." onConfirm={vi.fn()} onCancel={vi.fn()}>
        <p>x</p>
      </ConfirmDialog>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo.');
    expect(screen.getByRole('button', { name: /Si|Guardando/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });
  it('can be blocked with a stated reason', () => {
    render(
      <ConfirmDialog title="T" confirmLabel="Si" blockedReason="Sin conexión." onConfirm={vi.fn()} onCancel={vi.fn()}>
        <p>x</p>
      </ConfirmDialog>,
    );
    expect(screen.getByRole('button', { name: 'Si' })).toBeDisabled();
    expect(screen.getByText('Sin conexión.')).toBeInTheDocument();
  });
});

describe('Pagination', () => {
  it('without a total: "Página N", next only after a full page (old behaviour)', async () => {
    const onPage = vi.fn();
    const { rerender } = render(<Pagination page={1} pageSize={50} count={50} total={null} onPage={onPage} />);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPage).toHaveBeenCalledWith(2);
    rerender(<Pagination page={3} pageSize={50} count={20} total={null} onPage={onPage} />);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByText('Página 3')).toBeInTheDocument();
  });
  it('with a total: "Mostrando X–Y de N" and next disabled at the end, even on an exact multiple', () => {
    const { rerender } = render(<Pagination page={2} pageSize={50} count={50} total={120} onPage={vi.fn()} />);
    expect(screen.getByText('Mostrando 51–100 de 120')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    rerender(<Pagination page={2} pageSize={50} count={50} total={100} onPage={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});

describe('states', () => {
  it('announces loading, shows empty with an action and an error with retry', async () => {
    const retry = vi.fn();
    render(
      <>
        <LoadingRows label="Cargando relevamientos" />
        <EmptyState title="Sin datos" text="Nada para mostrar." />
        <ErrorState message="Falló." onRetry={retry} />
      </>,
    );
    expect(screen.getByRole('status', { name: 'Cargando relevamientos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sin datos' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Falló.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('AdminPage', () => {
  it('shows an eyebrow above the title, the description and the action', () => {
    render(
      <AdminPage title="Usuarios" description="Personas del sistema." action={<button type="button">Nuevo</button>}>
        <p>contenido</p>
      </AdminPage>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: 'Usuarios' });
    expect(heading.parentElement?.querySelector('.eyebrow')).toHaveTextContent('Gestión');
    expect(screen.getByRole('button', { name: 'Nuevo' })).toBeInTheDocument();
  });
});

describe('state illustrations', () => {
  it('EmptyState shows a decorative illustration hidden from assistive tech', () => {
    const { container } = render(<EmptyState title="Sin datos" text="No hay nada." />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
  });

  it('ErrorState keeps its alert and has no unlabeled image for assistive tech', () => {
    render(<ErrorState message="Falló." onRetry={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falló.');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
