import type { NameLookups } from './useNameLookups';

/** Name (when known) above the 7-digit code. */
export function VariedadCell({ codigo, names }: { codigo: string; names: NameLookups }) {
  const nombre = names.variedadNombre(codigo);
  return nombre ? (
    <>
      <span>{nombre}</span>
      <span className="cell-sub num">{codigo}</span>
    </>
  ) : (
    <span className="num">{codigo}</span>
  );
}
