import { useId, useRef, useState, type FormEvent } from 'react';
import { FormField } from '@/features/gestion/ui/FormField';
import type { Producto, Unidad } from '@/shared/api/types';
import { IconAlert } from '@/shared/icons';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';
import { useCreateProducto, useUpdateProducto } from './queries';
import {
  CATEGORIA_LABEL,
  UNIDADES,
  UNIDAD_LABEL,
  VARIEDAD_CODIGO,
  mapProductoError,
  parseCantidad,
  productoChanges,
  validateProductoForm,
  type ProductoField,
  type ProductoFormErrors,
  type ProductoFormValues,
} from './rules';
import { useVariedades } from './variedades';

const FORM_ID = 'producto-form';
const ORDER: ProductoField[] = ['nombre', 'marca', 'categoria', 'unidad', 'cantidadReferencia', 'codigoVariedad'];

interface Props {
  producto?: Producto;
  /** Categories already in use, offered as suggestions. */
  categorias: readonly string[];
  blockedReason: string | null;
  onClose: () => void;
}

export function ProductoForm({ producto, categorias, blockedReason, onClose }: Props) {
  const create = useCreateProducto();
  const update = useUpdateProducto();
  const toast = useToast();
  const variedades = useVariedades();
  const listId = useId();
  const varListId = useId();
  const busy = create.isPending || update.isPending;
  const [values, setValues] = useState<ProductoFormValues>({
    nombre: producto?.nombre ?? '',
    categoria: producto?.categoria ?? '',
    unidad: producto?.unidad ?? '',
    cantidadReferencia: producto ? String(producto.cantidadReferencia).replace('.', ',') : '',
    marca: producto?.marca ?? '',
    codigoVariedad: producto?.codigoVariedad ?? '',
  });
  const [errors, setErrors] = useState<ProductoFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<ProductoField, HTMLElement | null>>>({});
  const ref = (k: ProductoField) => (el: HTMLElement | null) => {
    refs.current[k] = el;
  };
  const text = (k: 'nombre' | 'categoria' | 'marca' | 'cantidadReferencia' | 'codigoVariedad') => ({
    value: values[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value })),
  });
  const focusFirst = (found: ProductoFormErrors) => {
    const first = ORDER.find((k) => found[k]);
    if (first) refs.current[first]?.focus();
  };

  const code = values.codigoVariedad.trim();
  const picked = VARIEDAD_CODIGO.test(code) ? variedades.byCodigo.get(code) : undefined;
  let variedadHint: string | undefined;
  if (picked) {
    variedadHint = `${picked.nombre}${picked.categoria ? ` · ${CATEGORIA_LABEL[picked.categoria]}` : ''}${picked.estado === 'INACTIVO' ? ' · Inactiva: el servidor la rechazará' : ''}`;
  } else if (VARIEDAD_CODIGO.test(code) && variedades.query.isSuccess) {
    variedadHint = 'No hay una variedad con ese código en la canasta.';
  } else {
    variedadHint = 'Código de 7 dígitos de una variedad activa. Búsquelo en la pestaña Canasta.';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || blockedReason) return;
    const found = validateProductoForm(values, producto ? 'edit' : 'create', producto);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    try {
      if (producto) {
        const changes = productoChanges(producto, values);
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        await update.mutateAsync({ id: producto.id, changes });
        toast(`Datos de ${values.nombre.trim()} actualizados.`);
      } else {
        await create.mutateAsync({
          nombre: values.nombre.trim(),
          categoria: values.categoria.trim(),
          unidad: values.unidad as Unidad,
          cantidadReferencia: parseCantidad(values.cantidadReferencia) as number,
          ...(values.marca.trim() ? { marca: values.marca.trim() } : {}),
          codigoVariedad: code,
        });
        toast(`Producto ${values.nombre.trim()} creado.`);
      }
      onClose();
    } catch (err) {
      const mapped = mapProductoError(err);
      setErrors(mapped.fields);
      setFormError(mapped.form);
      focusFirst(mapped.fields);
    }
  }

  return (
    <Dialog
      title={producto ? 'Editar producto' : 'Nuevo producto'}
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={busy || Boolean(blockedReason)}>
            {busy ? 'Guardando…' : producto ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="admin-form" onSubmit={submit} noValidate>
        <FormField label="Nombre" error={errors.nombre}>
          {(p) => <input {...p} ref={ref('nombre')} className="input" autoComplete="off" {...text('nombre')} />}
        </FormField>
        <div className="admin-form__row">
          <FormField label="Marca (opcional)" error={errors.marca}>
            {(p) => <input {...p} ref={ref('marca')} className="input" autoComplete="off" {...text('marca')} />}
          </FormField>
          <FormField label="Categoría" error={errors.categoria}>
            {(p) => (
              <>
                <input {...p} ref={ref('categoria')} className="input" autoComplete="off" list={listId} {...text('categoria')} />
                <datalist id={listId}>
                  {categorias.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
          </FormField>
        </div>
        <div className="admin-form__row">
          <FormField label="Unidad" error={errors.unidad}>
            {(p) => (
              <select
                {...p}
                ref={ref('unidad')}
                className="select"
                value={values.unidad}
                onChange={(e) => setValues((v) => ({ ...v, unidad: e.target.value as ProductoFormValues['unidad'] }))}
              >
                <option value="">Elegir…</option>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {UNIDAD_LABEL[u]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Cantidad de referencia" error={errors.cantidadReferencia} hint="Por ejemplo 1, 0,5 o 500.">
            {(p) => <input {...p} ref={ref('cantidadReferencia')} className="input" inputMode="decimal" autoComplete="off" {...text('cantidadReferencia')} />}
          </FormField>
        </div>
        <FormField label="Variedad de la canasta" error={errors.codigoVariedad} hint={variedadHint}>
          {(p) => (
            <>
              <input {...p} ref={ref('codigoVariedad')} className="input" inputMode="numeric" autoComplete="off" list={varListId} {...text('codigoVariedad')} />
              <datalist id={varListId}>
                {variedades.all
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
