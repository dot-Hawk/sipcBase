import { formatMoney } from '@/shared/lib/money';
import { shortPeriodo } from '@/shared/lib/periodo';
import type { SeriesPoint } from './history';

interface Props {
  points: readonly SeriesPoint[];
  /** The value being typed now; drawn as the last, filled dot. */
  current: number | null;
  attention?: boolean;
}

const W = 240;
const H = 64;
const PAD_X = 8;
const PAD_Y = 10;

export function Sparkline({ points, current, attention }: Props) {
  const values = points.map((p) => p.valor);
  const all = current !== null ? [...values, current] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const n = all.length;
  const x = (i: number) => PAD_X + (n === 1 ? 0 : (i * (W - 2 * PAD_X)) / (n - 1));
  const y = (v: number) => H - PAD_Y - ((v - min) / span) * (H - 2 * PAD_Y);
  const line = all.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const summary = points.map((p) => `${shortPeriodo(p.periodo)} ${formatMoney(p.valor)}`).join(', ');
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Últimos precios propios: ${summary}`} className="spark__svg">
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="4" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2.5" />
        ))}
        {current !== null && (
          <circle
            cx={x(n - 1)}
            cy={y(current)}
            r="5.5"
            fill={attention ? 'var(--attn-mark)' : 'var(--brand-deep)'}
            stroke="var(--surface)"
            strokeWidth="2"
          />
        )}
      </svg>
      <div className="spark__axis" aria-hidden="true">
        <span>{first ? shortPeriodo(first.periodo) : ''}</span>
        <span>{current !== null ? 'ahora' : last ? shortPeriodo(last.periodo) : ''}</span>
      </div>
    </div>
  );
}
