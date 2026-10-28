import { Navigate, Route, Routes } from 'react-router-dom';
import { sectionPath } from '@/app/roles';
import { CalculoDetailPage } from './CalculoDetailPage';
import { CalculosListPage } from './CalculosListPage';
import './calculos.css';

/** Calculations area: the runs list at the section root and one run per id, each a route. */
export function CalculosPage() {
  return (
    <Routes>
      <Route index element={<CalculosListPage />} />
      <Route path=":id" element={<CalculoDetailPage />} />
      <Route path="*" element={<Navigate to={sectionPath('calculos')} replace />} />
    </Routes>
  );
}
