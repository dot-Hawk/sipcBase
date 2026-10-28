import { lazy, Suspense, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { LoginPage } from '@/features/auth/LoginPage';
import { OutboxProvider } from '@/features/outbox/OutboxProvider';
import { checkSession, isEncuestador, loadSession } from '@/features/auth/session';
import { ApiError } from '@/shared/api/errors';
import { restoreQueryCache } from '@/shared/api/persist';
import { syncOnlineManager } from '@/shared/lib/onlineSync';
import { ToastProvider } from '@/shared/ui/Toast';
import { AdminShell } from './AdminShell';
import { RequireRole } from './RequireRole';
import { Shell } from './Shell';
import { GESTION_ROLES, NAV_SECTIONS, landingFor, type NavSection } from './roles';
import { ComingSoonPage } from '@/features/gestion/ComingSoonPage';
import { ForbiddenPage } from '@/features/gestion/ForbiddenPage';

const VisitasPage = lazy(() => import('@/features/asignaciones/VisitasPage').then((m) => ({ default: m.VisitasPage })));
const VisitaPage = lazy(() => import('@/features/visita/VisitaPage').then((m) => ({ default: m.VisitaPage })));
const PreciosPage = lazy(() => import('@/features/precios/PreciosPage').then((m) => ({ default: m.PreciosPage })));
const RelevamientosPage = lazy(() =>
  import('@/features/relevamientos/RelevamientosPage').then((m) => ({ default: m.RelevamientosPage })),
);
const AsignacionesGestionPage = lazy(() =>
  import('@/features/asignaciones-gestion/AsignacionesGestionPage').then((m) => ({ default: m.AsignacionesGestionPage })),
);
const UsuariosPage = lazy(() => import('@/features/usuarios/UsuariosPage').then((m) => ({ default: m.UsuariosPage })));
const CatalogoPage = lazy(() => import('@/features/catalogo/CatalogoPage').then((m) => ({ default: m.CatalogoPage })));
const PreciosGestionPage = lazy(() =>
  import('@/features/precios-gestion/PreciosGestionPage').then((m) => ({ default: m.PreciosGestionPage })),
);
const CalculosPage = lazy(() => import('@/features/calculos/CalculosPage').then((m) => ({ default: m.CalculosPage })));
const AuditoriaPage = lazy(() => import('@/features/auditoria/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })));
const CuentaPage = lazy(() => import('@/features/cuenta/CuentaPage').then((m) => ({ default: m.CuentaPage })));

/** Management sections that are built; the others render the "Próximamente" placeholder. */
const GESTION_SCREENS: Partial<Record<NavSection, ReactElement>> = {
  relevamientos: <RelevamientosPage />,
  asignaciones: <AsignacionesGestionPage />,
  usuarios: <UsuariosPage />,
  catalogo: <CatalogoPage />,
  precios: <PreciosGestionPage />,
  calculos: <CalculosPage />,
  auditoria: <AuditoriaPage />,
};

/** Sections whose screen declares its own sub-routes. */
const NESTED_SECTIONS: readonly NavSection[] = ['catalogo', 'calculos'];

function ScreenFallback() {
  return (
    <div className="page" aria-hidden="true">
      <span className="skeleton" style={{ height: 40, width: 220, marginTop: 24 }} />
      <span className="skeleton" style={{ height: 160, borderRadius: 20 }} />
      <span className="skeleton" style={{ height: 88, borderRadius: 20 }} />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
    mutations: { networkMode: 'always' },
  },
});

syncOnlineManager();

// Cold start (possibly offline): seed the cache with the last snapshot of the signed-in user.
// Online, stale entries are refetched on mount; offline, they are what the surveyor works from.
{
  const stored = loadSession();
  // Offline snapshot is a surveyor-only concern; management roles never read or write it.
  if (stored && checkSession(stored, Date.now()) === 'valid' && isEncuestador(stored.user)) {
    restoreQueryCache(queryClient, stored.user.id, Date.now());
  }
}

function LandingRedirect() {
  const { session } = useAuth();
  return <Navigate to={session ? landingFor(session.user.role) : '/'} replace />;
}

function RequireAuth() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OutboxProvider>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<ScreenFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route element={<RequireRole roles={['ENCUESTADOR']} />}>
                    <Route element={<Shell />}>
                      <Route index element={<VisitasPage />} />
                      <Route path="visita/:asignacionId" element={<VisitaPage />} />
                      <Route path="precios" element={<PreciosPage />} />
                      <Route path="cuenta" element={<CuentaPage />} />
                    </Route>
                  </Route>
                  <Route path="gestion" element={<RequireRole roles={GESTION_ROLES} />}>
                    <Route element={<AdminShell />}>
                      <Route index element={<LandingRedirect />} />
                      <Route path="403" element={<ForbiddenPage />} />
                      <Route path="cuenta" element={<CuentaPage />} />
                      {NAV_SECTIONS.map((section) => (
                        <Route
                          key={section}
                          // The catalogue (tabs) and the calculations (one route per run) own nested routes.
                          path={NESTED_SECTIONS.includes(section) ? `${section}/*` : section}
                          element={
                            <RequireRole section={section}>
                              {GESTION_SCREENS[section] ?? <ComingSoonPage section={section} />}
                            </RequireRole>
                          }
                        />
                      ))}
                      <Route path="*" element={<LandingRedirect />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
        </OutboxProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
