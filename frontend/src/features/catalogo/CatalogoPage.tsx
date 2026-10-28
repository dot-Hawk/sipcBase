import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { sectionPath } from '@/app/roles';
import { CanastaPage } from './CanastaPage';
import { ComerciosPage } from './ComerciosPage';
import { ProductosPage } from './ProductosPage';
import './catalogo.css';

const BASE = sectionPath('catalogo');
const TABS = [
  { to: `${BASE}/comercios`, label: 'Comercios' },
  { to: `${BASE}/productos`, label: 'Productos' },
  { to: `${BASE}/canasta`, label: 'Canasta' },
] as const;

/** Catalogue area: one tab per entity, each a route so reload, back and shared links keep the view. */
export function CatalogoPage() {
  return (
    <>
      <nav className="catalogo-tabs" aria-label="Catálogo">
        <ul>
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to} className="catalogo-tabs__link">
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Routes>
        <Route path="comercios" element={<ComerciosPage />} />
        <Route path="productos" element={<ProductosPage />} />
        <Route path="canasta" element={<CanastaPage />} />
        <Route path="*" element={<Navigate to="comercios" replace />} />
        <Route index element={<Navigate to="comercios" replace />} />
      </Routes>
    </>
  );
}
