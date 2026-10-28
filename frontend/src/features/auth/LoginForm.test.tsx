import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { LoginForm } from './LoginForm';
import { RoleRejectedError } from './errors';

async function fill(email = 'a@b.c', password = 'secret') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/correo/i), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: /ingresar/i }));
}

describe('LoginForm', () => {
  it('reveals and hides the password on demand', async () => {
    render(<LoginForm onLogin={vi.fn()} />);
    const input = screen.getByLabelText('Contraseña');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(input).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('submits trimmed credentials', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onLogin={onLogin} />);
    await fill(' a@b.c ', 'secret');
    expect(onLogin).toHaveBeenCalledWith({ email: 'a@b.c', password: 'secret' });
  });

  it('asks for both fields before calling the API', async () => {
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/correo y su contraseña/i);
  });

  it('shows Spanish copy for 401', async () => {
    const onLogin = vi.fn().mockRejectedValue(new ApiError({ status: 401, message: 'Invalid credentials' }));
    render(<LoginForm onLogin={onLogin} />);
    await fill();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/incorrectos/i);
    expect(alert).not.toHaveTextContent(/Invalid/);
  });

  it('shows the wait time for 429', async () => {
    const onLogin = vi.fn().mockRejectedValue(new ApiError({ status: 429, message: '', retryAfter: 60 }));
    render(<LoginForm onLogin={onLogin} />);
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent(/60 segundos/);
  });

  it('explains network failures', async () => {
    const onLogin = vi.fn().mockRejectedValue(new ApiError({ status: 0, message: 'Failed to fetch' }));
    render(<LoginForm onLogin={onLogin} />);
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexión/i);
  });

  it('rejects unknown roles with a clear message', async () => {
    const onLogin = vi.fn().mockRejectedValue(new RoleRejectedError());
    render(<LoginForm onLogin={onLogin} />);
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent(/rol no está habilitado/i);
  });
});
