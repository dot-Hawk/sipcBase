import { formatMoney } from '@/shared/lib/money';
import { IconAlert, IconChevronLeft, IconChevronRight } from '@/shared/icons';
import { describeAlerta } from './alertaView';
import { formatVariation } from './variation';
import { computeRangeBar } from './rangeBar';
import type { Alerta } from '@/shared/api/types';

interface Props {
  alerta: Alerta;
  value: number | null;
  /** Shown above the bar. Defaults to the entered value when it is outside the band. */
  caption?: string;
}

/**
 * Where the entered price sits against the range the server expected. The track is
 * drawn without text so the sentence below carries the information for everyone.
 */
export function RangeBar({ alerta, value, caption }: Props) {
  const view = describeAlerta(alerta);
  const g = computeRangeBar({ limiteInferior: view.min, limiteSuperior: view.max, media: view.reference, value });
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  return (
    <figure className="range">
      {caption && (
        <figcaption className="range__caption">
          <IconAlert size={18} />
          <span>{caption}</span>
        </figcaption>
      )}
      <div className="range__track" aria-hidden="true">
        <span className="range__band" style={{ left: pct(g.bandStart), width: pct(g.bandEnd - g.bandStart) }} />
        <span className="range__media" style={{ left: pct(g.mediaPos) }} />
        {g.valuePos !== null && (
          <span
            className={`range__value${g.outOfRange ? ' range__value--out' : ''}`}
            style={{ left: pct(g.valuePos) }}
          />
        )}
        {g.overflow === 'low' && <IconChevronLeft className="range__over range__over--low" size={18} />}
        {g.overflow === 'high' && <IconChevronRight className="range__over range__over--high" size={18} />}
      </div>
      <p className="range__text">
        Esperado entre <strong className="num">{formatMoney(view.min)}</strong> y{' '}
        <strong className="num">{formatMoney(view.max)}</strong>
        {view.kind === 'variedad' ? (
          <>
            , lo habitual para esta variedad respecto del precio anterior de{' '}
            <strong className="num">{formatMoney(view.reference)}</strong> ({formatVariation(view.usualMin)} a{' '}
            {formatVariation(view.usualMax)}).
          </>
        ) : (
          <>
            , promedio <strong className="num">{formatMoney(view.reference)}</strong> de {view.n}{' '}
            {view.n === 1 ? 'relevamiento' : 'relevamientos'}.
          </>
        )}
      </p>
    </figure>
  );
}
