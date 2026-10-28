import type { ReactNode } from 'react';

type Tone = 'neutral' | 'info' | 'ok' | 'attn' | 'danger';

const CLASS: Record<Tone, string> = {
  neutral: 'chip',
  info: 'chip chip--info',
  ok: 'chip chip--ok',
  attn: 'chip chip--attn',
  danger: 'chip chip--danger',
};

/** Status mark: always icon plus text, never colour alone. */
export function StatusChip({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={CLASS[tone]}>
      {icon}
      {children}
    </span>
  );
}
