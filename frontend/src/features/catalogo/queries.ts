import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/endpoints';
import type {
  CanastaQuery,
  CatalogEstado,
  ComerciosQuery,
  CreateComercioInput,
  CreateProductoInput,
  CreateVariedadInput,
  ProductosQuery,
  UpdateComercioInput,
  UpdateProductoInput,
} from '@/shared/api/types';

/** Everything lives under ['gestion', ...]: never persisted, never offline, never the surveyor snapshot. */
export const ckeys = {
  comercios: ['gestion', 'comercios'] as const,
  comerciosList: (q: ComerciosQuery) => ['gestion', 'comercios', 'list', q] as const,
  comercio: (id: string) => ['gestion', 'comercios', 'detail', id] as const,
  productos: ['gestion', 'productos'] as const,
  productosList: (q: ProductosQuery) => ['gestion', 'productos', 'list', q] as const,
  producto: (id: string) => ['gestion', 'productos', 'detail', id] as const,
  canasta: ['gestion', 'canasta'] as const,
  canastaList: (q: CanastaQuery) => ['gestion', 'canasta', 'list', q] as const,
  nodo: (codigo: string) => ['gestion', 'canasta', 'detail', codigo] as const,
};

export const useComerciosList = (q: ComerciosQuery) =>
  useQuery({ queryKey: ckeys.comerciosList(q), queryFn: () => api.listComercios(q), placeholderData: (p) => p });
export const useProductosList = (q: ProductosQuery) =>
  useQuery({ queryKey: ckeys.productosList(q), queryFn: () => api.listProductosGestion(q), placeholderData: (p) => p });

export const useCanastaList = (q: CanastaQuery) =>
  useQuery({ queryKey: ckeys.canastaList(q), queryFn: () => api.listCanasta(q), placeholderData: (p) => p });

/** Productos that point at one variedad (the backend filter `codigoVariedad`). */
export const useProductosOfVariedad = (codigo: string, enabled = true) =>
  useQuery({ queryKey: ckeys.productosList({ codigoVariedad: codigo }), queryFn: () => api.listProductosGestion({ codigoVariedad: codigo }), enabled });

export function useCreateComercio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CreateComercioInput) => api.createComercio(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ckeys.comercios }),
  });
}
export function useUpdateComercio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; changes: UpdateComercioInput }) => api.updateComercio(v.id, v.changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ckeys.comercios }),
  });
}
export function useSetComercioEstado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; estado: CatalogEstado }) => api.setComercioEstado(v.id, v.estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ckeys.comercios }),
  });
}

export function useCreateProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CreateProductoInput) => api.createProducto(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ckeys.productos }),
  });
}
export function useUpdateProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; changes: UpdateProductoInput }) => api.updateProducto(v.id, v.changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ckeys.productos }),
  });
}
export function useSetProductoEstado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; estado: CatalogEstado }) => api.setProductoEstado(v.id, v.estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ckeys.productos }),
  });
}

function useCanastaInvalidation() {
  const qc = useQueryClient();
  // A variedad name is shown in the productos list too.
  return () => Promise.all([qc.invalidateQueries({ queryKey: ckeys.canasta }), qc.invalidateQueries({ queryKey: ckeys.productos })]);
}
export function useCreateVariedad() {
  const invalidate = useCanastaInvalidation();
  return useMutation({ mutationFn: (v: CreateVariedadInput) => api.createVariedad(v), onSuccess: invalidate });
}
export function useSetVariedadEstado() {
  const invalidate = useCanastaInvalidation();
  return useMutation({
    mutationFn: (v: { codigo: string; estado: CatalogEstado }) => api.setVariedadEstado(v.codigo, v.estado),
    onSuccess: invalidate,
  });
}
