import { useOnline } from '@/shared/lib/useOnline';

export const OFFLINE_REASON = 'Sin conexión. Esta acción necesita conexión y no se guarda para más tarde.';

/** Management screens never queue anything: writes are disabled while offline, with the reason. */
export function useWriteGate(): { canWrite: boolean; reason: string | null } {
  const online = useOnline();
  return { canWrite: online, reason: online ? null : OFFLINE_REASON };
}
