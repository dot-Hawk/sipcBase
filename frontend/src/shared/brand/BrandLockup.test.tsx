import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLockup } from './BrandLockup';

describe('BrandLockup', () => {
  it('shows the official logo image, without a badge', () => {
    const { container } = render(<BrandLockup />);
    const logo = screen.getByRole('img', { name: 'Dirección de Estadística, Censos y Documentación' });
    expect(logo.tagName).toBe('IMG');
    expect(container.querySelector('[class*="badge"]')).toBeNull();
  });

  it('uses the original colours on light surfaces and a recoloured copy on brand surfaces', () => {
    const { rerender } = render(<BrandLockup tone="light" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/brand/logo-full.png');
    rerender(<BrandLockup />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/brand/logo-full-on-brand.png');
  });
});
