import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pagination } from './Pagination';

const base = { page: 1, pageSize: 10, count: 10, total: 30, onPage: () => undefined };

describe('Pagination', () => {
  it('is a navigation landmark named "Paginación" by default', () => {
    render(<Pagination {...base} />);
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument();
  });

  it('accepts a distinct name so two pagers on one screen stay distinguishable', () => {
    render(
      <>
        <Pagination {...base} label="Paginación de relativos" />
        <Pagination {...base} label="Paginación de imputaciones" />
      </>,
    );
    expect(screen.getByRole('navigation', { name: 'Paginación de relativos' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Paginación de imputaciones' })).toBeInTheDocument();
  });
});
