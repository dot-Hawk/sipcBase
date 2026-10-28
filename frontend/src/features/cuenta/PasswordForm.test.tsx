import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { PasswordForm } from './PasswordForm';

function setup(over: Partial<React.ComponentProps<typeof PasswordForm>> = {}) {
  const props = {
    online: true,
    onChangePassword: vi.fn().mockResolvedValue(undefined),
    onSuccess: vi.fn(),
    ...over,
  };
  render(<PasswordForm {...props} />);
  return props;
}

async function open() {
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
}
async function fill(current = 'old-password', next = 'new-password', repeat = next) {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('Contraseña actual'), current);
  await u.type(screen.getByLabelText('Nueva contraseña'), next);
  await u.type(screen.getByLabelText('Repetir nueva contraseña'), repeat);
}
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

describe('PasswordForm', () => {
  it('is collapsed until opened', async () => {
    setup();
    expect(screen.queryByLabelText('Contraseña actual')).toBeNull();
    await open();
    expect(screen.getByLabelText('Contraseña actual')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Repetir nueva contraseña')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('happy path: submits, calls onSuccess and resets the form', async () => {
    const p = setup();
    await open();
    await fill();
    await submit();
    expect(p.onChangePassword).toHaveBeenCalledWith('old-password', 'new-password');
    await vi.waitFor(() => expect(p.onSuccess).toHaveBeenCalled());
    expect(screen.queryByLabelText('Contraseña actual')).toBeNull();
  });

  it('flags a mismatch without calling the API', async () => {
    const p = setup();
    await open();
    await fill('old-password', 'new-password', 'different-one');
    await submit();
    expect(p.onChangePassword).not.toHaveBeenCalled();
    const field = screen.getByLabelText('Repetir nueva contraseña');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  });

  it('shows the wrong-current error on the current field', async () => {
    const p = setup({
      onChangePassword: vi.fn().mockRejectedValue(new ApiError({ status: 400, message: 'The current password is not correct' })),
    });
    await open();
    await fill();
    await submit();
    const field = await screen.findByLabelText('Contraseña actual');
    await vi.waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('La contraseña actual no es correcta.')).toBeInTheDocument();
    expect(p.onSuccess).not.toHaveBeenCalled();
  });

  it('shows Spanish copy for 429', async () => {
    setup({ onChangePassword: vi.fn().mockRejectedValue(new ApiError({ status: 429, message: '', retryAfter: 30 })) });
    await open();
    await fill();
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/30 segundos/);
  });

  it('toggles visibility with an accessible button', async () => {
    setup();
    await open();
    const toggle = screen.getByRole('button', { name: 'Mostrar contraseñas' });
    expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('type', 'password');
    await userEvent.click(toggle);
    expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('type', 'text');
    expect(within(document.body).getByRole('button', { name: 'Ocultar contraseñas' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables the action offline and explains why', () => {
    setup({ online: false });
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeDisabled();
    expect(screen.getByText(/necesita conexión/i)).toBeInTheDocument();
  });
});
