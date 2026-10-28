import { useId, useRef, useState, type FormEvent } from 'react';
import { FormField } from '@/features/gestion/ui/FormField';
import { IconAlert } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { useCreateVariedad } from './queries';
import {
  CATEGORIAS,
  CATEGORIA_LABEL,
  PRODUCTO_NODO_CODIGO,
  mapVariedadError,
  validateVariedadForm,
  variedadInput,
  type VariedadField,
  type VariedadFormErrors,
  type VariedadFormValues,
} from './rules';
import { useProductoNodos } from './variedades';

const FORM_ID = 'variedad-form';
const ORDER: VariedadField[] = ['codigo', 'nombre', 'padre', 'categoria', 'ponderador'];

export function VariedadForm({ blockedReason, onClose }: { blockedReason: string | null; onClose: () => void }) {
  const create = useCreateVariedad();
  const toast = useToast();
  const productos = useProductoNodos();
  const listId = useId();
  const busy = create.isPending;
  const [values, setValues] = useState<VariedadFormValues>({ codigo: '', nombre: '', padre: '', categoria: '', ponderador: '' });
  const [errors, setErrors] = useState<VariedadFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<VariedadField, HTMLElement | null>>>({});
  const ref = (k: VariedadField) => (el: HTMLElement | null) => {
    refs.current[k] = el;
  };
  const text = (k: 'codigo' | 'nombre' | 'padre' | 'ponderador') => ({
    value: values[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value })),
  });
  const focusFirst = (found: VariedadFormErrors) => {
    const first = ORDER.find((k) => found[k]);
    if (first) refs.current[first]?.focus();
  };

  const padre = values.padre.trim();
  const picked = PRODUCTO_NODO_CODIGO.test(padre) ? productos.byCodigo.get(padre) : undefined;
  let padreHint = 'Producto de la canasta (5 dígitos) del que cuelga la variedad.';
  if (picked) padreHint = picked.estado === 'ACTIVO' ? picked.nombre : `${picked.nombre} · inactivo: el servidor lo rechazará`;
  else if (PRODUCTO_NODO_CODIGO.test(padre) && productos.query.isSuccess) padreHint = 'No hay un producto con ese código en la canasta.';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || blockedReason) return;
    const found = validateVariedadForm(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    try {
      await create.mutateAsync(variedadInput(values));
      toast(`Variedad ${values.nombre.trim()} agregada a la canasta.`);
      onClose();
    } catch (err) {
      const mapped = mapVariedadError(err);
      setErrors(mapped.fields);
      setFormError(mapped.form);
      focusFirst(mapped.fields);
    }
  }

  return (
    <Dialog
      title="Agregar variedad"
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={busy || Boolean(blockedReason)}>
            {busy ? 'Guardando…' : 'Agregar variedad'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="admin-form" onSubmit={submit} noValidate>
        <div className="admin-form__row">
          <FormField label="Código (7 dígitos)" error={errors.codigo} hint="Por convención empieza con el código del producto.">
            {(p) => <input {...p} ref={ref('codigo')} className="input" inputMode="numeric" autoComplete="off" {...text('codigo')} />}
          </FormField>
          <FormField label="Categoría" error={errors.categoria}>
            {(p) => (
              <select
                {...p}
                ref={ref('categoria')}
                className="select"
                value={values.categoria}
                onChange={(e) => setValues((v) => ({ ...v, categoria: e.target.value as VariedadFormValues['categoria'] }))}
              >
                <option value="">Elegir…</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_LABEL[c]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
        <FormField label="Nombre" error={errors.nombre}>
          {(p) => <input {...p} ref={ref('nombre')} className="input" autoComplete="off" {...text('nombre')} />}
        </FormField>
        <FormField label="Producto (5 dígitos)" error={errors.padre} hint={padreHint}>
          {(p) => (
            <>
              <input {...p} ref={ref('padre')} className="input" inputMode="numeric" autoComplete="off" list={listId} {...text('padre')} />
              <datalist id={listId}>
                {productos.all
                  .filter((n) => n.estado === 'ACTIVO')
                  .map((n) => (
                    <option key={n.codigo} value={n.codigo}>
                      {n.nombre}
                    </option>
                  ))}
              </datalist>
            </>
          )}
        </FormField>
        <FormField label="Ponderador (opcional)" error={errors.ponderador} hint="Si lo deja vacío queda en 0.">
          {(p) => <input {...p} ref={ref('ponderador')} className="input" inputMode="decimal" autoComplete="off" {...text('ponderador')} />}
        </FormField>
        {blockedReason && <p className="field__hint">{blockedReason}</p>}
        {formError && (
          <div className="notice notice--danger" role="alert">
            <IconAlert size={20} />
            <span>{formError}</span>
          </div>
        )}
      </form>
    </Dialog>
  );
}
