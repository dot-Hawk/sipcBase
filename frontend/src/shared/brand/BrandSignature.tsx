import { BrandLockup } from './BrandLockup';
import './brand-signature.css';

const FULL_NAME = 'Sistema Integral para la Gestión del Índice de Precios al Consumidor';

interface Props {
  /** Fixed proportional sizes; every measure derives from the logo height. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * `inline`: name and full name beside the logo (login, account).
   * `stacked`: the same, below the logo, for narrow but roomy spaces.
   * `compact`: logo and acronym only, for persistent app chrome; the full name becomes a tooltip.
   */
  layout?: 'inline' | 'stacked' | 'compact';
  tone?: 'brand' | 'light';
  className?: string;
}

/**
 * Endorsed product signature: the institution's official logo, a hairline rule,
 * and the product acronym with its full name.
 */
export function BrandSignature({ size = 'md', layout = 'inline', tone = 'brand', className }: Props) {
  const compact = layout === 'compact';
  const classes = ['signature', `signature--${size}`, `signature--${layout}`, `signature--${tone}`, className];
  return (
    <div className={classes.filter(Boolean).join(' ')} title={compact ? `SIPC · ${FULL_NAME}` : undefined}>
      <BrandLockup tone={tone} className="signature__logo" />
      {!compact && <span className="signature__rule" aria-hidden="true" />}
      <div className="signature__text">
        <p className="signature__name">SIPC</p>
        {!compact && (
          <p className="signature__desc">
            <span>Sistema Integral para la Gestión del</span> <span>Índice de Precios al Consumidor</span>
          </p>
        )}
      </div>
    </div>
  );
}
