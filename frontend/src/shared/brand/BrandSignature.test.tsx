import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandSignature } from './BrandSignature';

const FULL_NAME = 'Sistema Integral para la Gestión del Índice de Precios al Consumidor';

describe('BrandSignature', () => {
  it('pairs the official logo with the product acronym and its full name', () => {
    const { container } = render(<BrandSignature />);
    expect(screen.getByRole('img', { name: 'Dirección de Estadística, Censos y Documentación' })).toBeInTheDocument();
    expect(screen.getByText('SIPC')).toBeInTheDocument();
    expect(container.querySelector('.signature__desc')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(FULL_NAME);
  });

  it('comes in fixed proportional sizes and a stacked layout for narrow spaces', () => {
    const { container, rerender } = render(<BrandSignature size="lg" />);
    expect(container.firstElementChild).toHaveClass('signature', 'signature--lg');
    rerender(<BrandSignature layout="stacked" />);
    expect(container.firstElementChild).toHaveClass('signature--stacked');
  });

  it('has a compact layout for app chrome: logo and acronym only, full name as tooltip', () => {
    const { container } = render(<BrandSignature layout="compact" />);
    expect(container.firstElementChild).toHaveClass('signature--compact');
    expect(container.firstElementChild).toHaveAttribute('title', `SIPC · ${FULL_NAME}`);
    expect(container.querySelector('.signature__desc')).toBeNull();
    expect(screen.getByText('SIPC')).toBeInTheDocument();
  });
});
