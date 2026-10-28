import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/endpoints';
import { configureApiAuth } from '@/shared/api/client';
import { SESSION_ENDED_COPY } from '@/shared/api/errors';
import { clearPersistedQueryCache, startQueryCachePersistence } from '@/shared/api/persist';
import { RoleRejectedError } from './errors';
import {
  ESTADO_REJECTED_COPY,
  ROLE_REJECTED_COPY,
  shouldRevalidate,
  validateSession,
} from './meValidation';
import {
  checkSession,
  clearStoredSession,
  decodeJwtExp,
  isEncuestador,
  isKnownUser,
  loadSession,
  persistSession,
  type Session,
} from './session';

interface AuthValue {
  session: Session | null;
  /** Why the last session was ended by the server check; shown on the login screen. */
  notice: string | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function initialSession(): Session | null {
  const s = loadSession();
  if (checkSession(s, Date.now()) === 'valid') return s;
  if (s) clearStoredSession();
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(initialSession);
  const [notice, setNotice] = useState<string | null>(null);
  const lastCheckRef = useRef<number | null>(null);
  const inflightRef = useRef(false);
  const tokenRef = useRef<string | null>(session?.token ?? null);
  tokenRef.current = session?.token ?? null;

  const logout = useCallback(() => {
    clearStoredSession();
    tokenRef.current = null;
    setSession(null);
    queryClient.clear();
    clearPersistedQueryCache();
  }, [queryClient]);

  // The server ended the session (401 from any request): leave an explanation on the login screen.
  const handleUnauthorized = useCallback(() => {
    if (tokenRef.current === null) return; // already signed out (e.g. a bad-credentials 401 on login)
    logout();
    setNotice(SESSION_ENDED_COPY);
  }, [logout]);

  // Must be wired during render: child queries fire in effects that run before this component's own.
  configureApiAuth({ getToken: () => tokenRef.current, onUnauthorized: handleUnauthorized });

  // Keep an offline snapshot of the visit data while a SURVEYOR is signed in (wiped on logout).
  // Management roles work online only: nothing of theirs is ever written to the device snapshot.
  const snapshotUserId = session && isEncuestador(session.user) ? session.user.id : null;
  useEffect(() => {
    if (snapshotUserId === null) return undefined;
    return startQueryCachePersistence(queryClient, () => (tokenRef.current === null ? null : snapshotUserId));
  }, [queryClient, snapshotUserId]);

  // Auto-logout when the JWT expires.
  useEffect(() => {
    if (!session) return undefined;
    const exp = decodeJwtExp(session.token);
    if (exp === null) return undefined;
    const delay = Math.min(exp * 1000 - Date.now(), 2 ** 31 - 1);
    const timer = window.setTimeout(logout, Math.max(delay, 0));
    return () => window.clearTimeout(timer);
  }, [session, logout]);

  // Validate the stored session against GET /auth/me: on start, and on focus / reconnect (throttled).
  // The UI renders from the stored session meanwhile; only a definite answer ends it.
  const token = session?.token ?? null;
  useEffect(() => {
    if (!token) return undefined;
    lastCheckRef.current = null;

    async function check() {
      if (inflightRef.current || !shouldRevalidate(lastCheckRef.current, Date.now())) return;
      inflightRef.current = true;
      lastCheckRef.current = Date.now();
      const checked = token;
      try {
        const outcome = await validateSession(() => api.me());
        if (tokenRef.current !== checked) return; // signed out or switched meanwhile
        if (outcome.kind === 'valid') {
          setSession((prev) => {
            if (!prev) return prev;
            const next: Session = { token: prev.token, user: outcome.user };
            persistSession(next);
            return next;
          });
        } else if (outcome.kind === 'rejected') {
          const copy = outcome.reason === 'role' ? ROLE_REJECTED_COPY : ESTADO_REJECTED_COPY;
          logout();
          setNotice(copy);
        } else if (outcome.kind === 'unauthorized') {
          handleUnauthorized();
        }
        // 'unreachable' keeps the session.
      } finally {
        inflightRef.current = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onWake = () => void check();
    void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [token, logout, handleUnauthorized]);

  const login = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      const res = await api.login(email, password);
      if (!isKnownUser(res.user)) throw new RoleRejectedError(); // session is never kept
      const next: Session = { token: res.token, user: res.user };
      queryClient.clear();
      clearPersistedQueryCache();
      setNotice(null);
      persistSession(next);
      tokenRef.current = next.token;
      setSession(next);
    },
    [queryClient],
  );

  const value = useMemo(() => ({ session, notice, login, logout }), [session, notice, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
