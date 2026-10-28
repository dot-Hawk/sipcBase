import { describeAlerta } from '@/features/visita/alertaView';
import { computeRangeBar } from '@/features/visita/rangeBar';
import { computeVariation, formatVariation } from '@/features/visita/variation';
import type { Alerta } from '@/shared/api/types';
import { IconAlert, IconChevronLeft, IconChevronRight } from '@/shared/icons';
import { formatMoney } from '@/shared/lib/money';

/**
 * Where a price sits against the range the server expected (from the history or from its variedad). The bar is decoration:
 * the sentence and the variation carry the information, so colour is never the only signal.
 */
export function AlertRange({ alerta, value, caption }: { alerta: Alerta; value: number; caption?: string }) {
  const view = describeAlerta(alerta);
  const g = computeRangeBar({ limiteInferior: view.min, limiteSuperior: view.max, media: view.reference, value });
  const variation = computeVariation(view.reference, value);
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  return (
    <figure className="pg-range">
      {caption && (
        <figcaption className="pg-range__caption">
          <IconAlert size={18} />
          <span>{caption}</span>
        </figcaption>
      )}
      <div className="pg-range__track" aria-hidden="true">
        <span className="pg-range__band" style={{ left: pct(g.bandStart), width: pct(g.bandEnd - g.bandStart) }} />
        <span className="pg-range__media" style={{ left: pct(g.mediaPos) }} />
        {g.valuePos !== null && (
          <span className={`pg-range__value${g.outOfRange ? ' pg-range__value--out' : ''}`} style={{ left: pct(g.valuePos) }} />
        )}
        {g.overflow === 'low' && <IconChevronLeft className="pg-range__over pg-range__over--low" size={18} />}
        {g.overflow === 'high' && <IconChevronRight className="pg-range__over pg-range__over--high" size={18} />}
      </div>
      <p className="pg-range__text">
        Esperado entre <strong className="num">{formatMoney(view.min)}</strong> y{' '}
        <strong className="num">{formatMoney(view.max)}</strong>
        {view.kind === 'variedad' ? (
          <>
            , lo habitual para esta variedad respecto del precio anterior de{' '}
            <strong className="num">{formatMoney(view.reference)}</strong> ({formatVariation(view.usualMin)} a{' '}
            {formatVariation(view.usualMax)}, según {view.n} variaciones anteriores).
          </>
        ) : (
          <>
            , promedio <strong className="num">{formatMoney(view.reference)}</strong> de {view.n}{' '}
            {view.n === 1 ? 'relevamiento' : 'relevamientos'} anteriores.
          </>
        )}
        {variation !== null && Math.abs(variation) <= 9.99 && (
          <>
            {' '}
            El valor es <strong className="num">{formatVariation(variation)}</strong> respecto del{' '}
            {view.kind === 'variedad' ? 'precio anterior' : 'promedio'}.
          </>
        )}
      </p>
    </figure>
  );
}
