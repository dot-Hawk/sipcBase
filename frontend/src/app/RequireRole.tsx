import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Role } from '@/shared/api/types';
import { FORBIDDEN_PATH, canAccess, hasGestion, landingFor, type Section } from './roles';

type Props = { children?: ReactNode } & ({ roles: readonly Role[]; section?: never } | { section: Section; roles?: never });

/**
 * Route guard by role (`roles`) or by management section (`section`). Renders `children`, or an
 * `<Outlet />` when used as a layout route. This only hides screens: the API is the real authority.
 * - Not allowed by `roles`: the user's own landing.
 * - Not allowed by `section`: the 403 page for management roles, home for the surveyor.
 */
export function RequireRole({ roles, section, children }: Props) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const role = session.user.role;
  const allowed = section ? canAccess(role, section) : (roles as readonly Role[]).includes(role);
  if (allowed) return <>{children ?? <Outlet />}</>;
  const target = section && hasGestion(role) ? FORBIDDEN_PATH : landingFor(role);
  return <Navigate to={target} replace />;
}
