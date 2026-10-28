import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api/endpoints', () => ({ api: { me: vi.fn().mockResolvedValue(null), login: vi.fn() } }));

import { AuthProvider } from '@/features/auth/AuthProvider';
import { PageHeader } from './PageHeader';

function mount(ui: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('PageHeader', () => {
  it('shows the eyebrow above the page title when given', () => {
    mount(<PageHeader eyebrow="Relevamiento" title="Visitas" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Visitas' });
    expect(heading.parentElement?.querySelector('.eyebrow')).toHaveTextContent('Relevamiento');
  });

  it('renders only the title without an eyebrow', () => {
    mount(<PageHeader title="Visitas" />);
    expect(document.querySelector('.eyebrow')).toBeNull();
  });
});
