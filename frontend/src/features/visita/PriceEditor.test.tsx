import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Precio, Producto } from '@/shared/api/types';
import { PriceEditor, type PriceEditorProps } from './PriceEditor';

const producto: Producto = {
  id: 'p1', nombre: 'Aceite de girasol', categoria: 'Almacén', unidad: 'LT', cantidadReferencia: 1.5,
  marca: 'Cocinero', codigoVariedad: '1152003', estado: 'ACTIVO', createdAt: '', updatedAt: '',
};
const saved: Precio = {
  id: 'pr1', relevamiento: 'r', producto: 'p1', comercio: 'c', encuestador: 'e', valor: 1000, oferta: false,
  fechaRelevamiento: '', observacion: null, alerta: null, createdAt: '', updatedAt: '',
};
const alerta = { media: 18400, desvio: 300, n: 4, limiteInferior: 16560, limiteSuperior: 20240 };

function setup(over: Partial<PriceEditorProps> = {}) {
  const props: PriceEditorProps = {
    producto,
    previous: { valor: 18400, periodo: '2026-08', oferta: false },
    saved: null,
    readOnly: false,
    offline: false,
    onSave: vi.fn().mockResolvedValue({ kind: 'saved', precio: saved }),
    ...over,
  };
  render(<PriceEditor {...props} />);
  return props;
}

const field = () => screen.getByLabelText(/precio actual/i);

describe('PriceEditor', () => {
  it('shows the previous price and its period', () => {
    setup();
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument();
    expect(screen.getByText(/18\.400,00/)).toBeInTheDocument();
  });

  it('warns visibly and accessibly when the previous price was an offer', () => {
    setup({ previous: { valor: 15000, periodo: '2026-08', oferta: true } });
    const note = screen.getByRole('note', { name: /anterior en oferta/i });
    expect(note).toHaveTextContent(/era una oferta/i);
  });

  it('shows no offer warning for a regular previous price', () => {
    setup();
    expect(screen.queryByRole('note', { name: /anterior en oferta/i })).not.toBeInTheDocument();
  });

  it('says there is no previous price when there is none', () => {
    setup({ previous: null });
    expect(screen.getByText(/sin precio anterior/i)).toBeInTheDocument();
  });

  it('shows the history sparkline only with two or more earlier prices', () => {
    const { unmount } = render(
      <PriceEditor
        {...({
          producto, previous: { valor: 1, periodo: '2026-08', oferta: false }, saved: null, readOnly: false,
          offline: false, onSave: vi.fn(), series: [{ periodo: '2026-08', valor: 1, oferta: false }],
        } as PriceEditorProps)}
      />,
    );
    expect(screen.queryByRole('img', { name: /últimos precios/i })).not.toBeInTheDocument();
    unmount();
    setup({
      series: [
        { periodo: '2026-07', valor: 17000, oferta: false },
        { periodo: '2026-08', valor: 18400, oferta: false },
      ],
    });
    expect(screen.getByRole('img', { name: /últimos precios propios: jul .*ago/i })).toBeInTheDocument();
  });

  it('flags a large variation before saving', async () => {
    setup();
    await userEvent.type(field(), '24500');
    expect(screen.getByText('+33%')).toBeInTheDocument();
    expect(screen.getByText(/Variación atípica \(\+33%\)/)).toBeInTheDocument();
  });

  it('fills the field from the quick chips with rounded values', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '+5%' }));
    expect(field()).toHaveValue('19320');
    await userEvent.click(screen.getByRole('button', { name: '−5%' }));
    expect(field()).toHaveValue('17480');
    await userEvent.click(screen.getByRole('button', { name: 'Igual al anterior' }));
    expect(field()).toHaveValue('18400');
  });

  it('saves a valid price with the parsed value', async () => {
    const props = setup();
    await userEvent.type(field(), '1.234,5');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(props.onSave).toHaveBeenCalledWith({ valor: 1234.5, oferta: false, observacion: '' });
    expect(await screen.findByText('Precio guardado')).toBeInTheDocument();
  });

  it('asks to advance after saving with Guardar y siguiente', async () => {
    const onDone = vi.fn();
    setup({ onDone });
    await userEvent.type(field(), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y siguiente' }));
    expect(onDone).toHaveBeenCalledWith({ advance: true });
  });

  it('saves and advances with Enter', async () => {
    const onDone = vi.fn();
    const props = setup({ onDone });
    await userEvent.type(field(), '100{Enter}');
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({ advance: true });
  });

  it('offers Siguiente without saving when the price is unchanged', async () => {
    const onDone = vi.fn();
    const props = setup({ saved, onDone });
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith({ advance: true });
  });

  it('blocks invalid values with an inline error', async () => {
    const props = setup();
    await userEvent.type(field(), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/mayor que cero/i)).toBeInTheDocument();
  });

  it('shows the usual variation of the variedad and the expected prices for a percentile alert', async () => {
    const percentil = {
      metodo: 'PERCENTIL_VARIACION' as const,
      variedad: '1111101',
      precioAnterior: 20000,
      variacion: 1.5,
      percentilInferior: 5,
      percentilSuperior: 95,
      limiteInferior: 0.9,
      limiteSuperior: 1.1,
      rangoPrecio: { min: 18000, max: 22000 },
      n: 120,
    };
    setup({ onSave: vi.fn().mockResolvedValueOnce({ kind: 'needs-confirmation', alerta: percentil }) });
    await userEvent.type(field(), '30000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y siguiente' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/18\.000,00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/22\.000,00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/lo habitual para esta variedad/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/20\.000,00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/−10% a \+10%/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/promedio/i)).toBeNull();
  });

  it('opens the confirmation sheet with the range bar and resends with confirmarDesvio', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'needs-confirmation', alerta })
      .mockResolvedValueOnce({ kind: 'saved', precio: { ...saved, valor: 30000, alerta } });
    const onDone = vi.fn();
    setup({ onSave, onDone });
    await userEvent.type(field(), '30000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y siguiente' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/16\.560,00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/20\.240,00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/promedio/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/4 relevamientos/)).toBeInTheDocument();
    expect(within(dialog).getByText(/30\.000,00/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: /confirmar precio/i }));
    expect(onSave).toHaveBeenLastCalledWith({ valor: 30000, oferta: false, observacion: '', confirmarDesvio: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledWith({ advance: true });
  });

  it('returns to the field on Corregir without saving', async () => {
    const onSave = vi.fn().mockResolvedValue({ kind: 'needs-confirmation', alerta });
    setup({ onSave });
    await userEvent.type(field(), '30000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /corregir/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
  });

  it('draws the range bar for a stored atypical price', () => {
    setup({ saved: { ...saved, valor: 30000, alerta } });
    expect(screen.getByText(/precio fuera de lo habitual/i)).toBeInTheDocument();
    expect(screen.getByText(/4 relevamientos/)).toBeInTheDocument();
  });

  it('is read-only: no save buttons and the field cannot be edited', () => {
    setup({ readOnly: true, blockReason: 'completed', saved });
    expect(field()).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar y siguiente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+5%' })).not.toBeInTheDocument();
  });

  it('explains and offers to start a visit that has not started', async () => {
    const onStartVisit = vi.fn();
    setup({ readOnly: true, blockReason: 'not-started', onStartVisit });
    expect(screen.getByText(/inicie la visita/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar visita' }));
    expect(onStartVisit).toHaveBeenCalled();
  });

  it('keeps saving enabled offline and says the price will be sent on reconnect', async () => {
    const onSave = vi.fn().mockResolvedValue({ kind: 'queued' });
    setup({ offline: true, onSave });
    await userEvent.type(field(), '100');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Guardar y siguiente' })).toBeEnabled();
    expect(screen.getByText(/se enviará al recuperar la conexión/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ valor: 100 }));
    expect(await screen.findByText(/guardado en este dispositivo/i)).toBeInTheDocument();
  });

  it('advances after a queued save', async () => {
    const onDone = vi.fn();
    setup({ offline: true, onSave: vi.fn().mockResolvedValue({ kind: 'queued' }), onDone });
    await userEvent.type(field(), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y siguiente' }));
    expect(onDone).toHaveBeenCalledWith({ advance: true });
  });

  describe('queued price', () => {
    const pending = (over: Partial<NonNullable<PriceEditorProps['pending']>> = {}) => ({
      price: 'pending' as const, priceItemId: 'price:a:p1', alerta: null, error: null, updatesExisting: false, photos: 0,
      ...over,
    });
    const queued: Precio = { ...saved, id: 'pending:price:a:p1', valor: 21000 };

    it('shows "Pendiente de envío" for a queued price and does not treat it as unsaved changes', () => {
      setup({ saved: queued, pending: pending(), offline: true });
      expect(screen.getByText('Pendiente de envío')).toBeInTheDocument();
      expect(field()).toHaveValue('21000');
      expect(screen.queryByText(/cambios sin guardar/i)).not.toBeInTheDocument();
    });

    it('asks for confirmation when the server judged it atypical, with the range, and confirms by id', async () => {
      const onConfirmPending = vi.fn();
      setup({
        saved: { ...queued, alerta }, pending: pending({ price: 'needs-confirmation', alerta }), onConfirmPending,
      });
      expect(screen.getByText('Requiere confirmación')).toBeInTheDocument();
      expect(screen.getByText(/esperado entre/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar precio' }));
      expect(onConfirmPending).toHaveBeenCalledTimes(1);
    });

    it('lets the surveyor fix a value that needs confirmation by saving a new one', async () => {
      const onSave = vi.fn().mockResolvedValue({ kind: 'queued' });
      setup({ saved: { ...queued, alerta }, pending: pending({ price: 'needs-confirmation', alerta }), onSave });
      await userEvent.clear(field());
      await userEvent.type(field(), '18500');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ valor: 18500 }));
    });

    it('shows a rejected price with a reason, keeps it editable and can discard it', async () => {
      const onDiscardPending = vi.fn();
      setup({
        saved: queued,
        pending: pending({
          price: 'rejected',
          error: { status: 400, message: 'HTTP 400', fields: [{ field: 'valor', message: 'valor is out of the accepted range' }] },
        }),
        onDiscardPending,
      });
      expect(screen.getByText(/valor: valor is out of the accepted range/)).toBeInTheDocument();
      expect(screen.getByText('Rechazado')).toBeInTheDocument();
      expect(screen.getByText(/no aceptó este dato/i)).toBeInTheDocument();
      expect(field()).not.toHaveAttribute('readonly');
      await userEvent.click(screen.getByRole('button', { name: 'Descartar cambio' }));
      expect(onDiscardPending).toHaveBeenCalled();
    });

    it('a failed price offers to retry by hand', async () => {
      const onRetryPending = vi.fn();
      setup({
        saved: queued,
        pending: pending({ price: 'failed', error: { status: 403, message: 'x', fields: [] } }),
        onRetryPending,
      });
      expect(screen.getByText(/no se pudo enviar/i, { selector: 'strong' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(onRetryPending).toHaveBeenCalled();
    });
  });

  it('hides promotional-price judgement hints when oferta is on', async () => {
    setup();
    await userEvent.type(field(), '24500');
    await userEvent.click(screen.getByRole('switch', { name: /oferta/i }));
    expect(screen.queryByText(/Variación atípica/)).not.toBeInTheDocument();
  });

  it('moves delete into the secondary menu and confirms it', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    setup({ saved, onDelete });
    expect(screen.queryByRole('button', { name: /eliminar precio/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /eliminar precio/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /eliminar precio/i }));
    expect(onDelete).toHaveBeenCalled();
  });
});
