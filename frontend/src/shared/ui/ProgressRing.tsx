interface Props {
  value: number;
  total: number;
  size?: number;
  /** Accessible description, for example "12 de 40 precios cargados". */
  label: string;
  tone?: 'on-brand' | 'brand';
  showPercent?: boolean;
}

/** Circular progress. The arc animates only when the value changes. */
export function ProgressRing({ value, total, size = 96, label, tone = 'brand', showPercent = true }: Props) {
  const stroke = Math.max(5, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  const onBrand = tone === 'on-brand';
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      style={{ flex: 'none' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={onBrand ? 'rgba(255,255,255,0.22)' : 'var(--fill)'}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={onBrand ? '#fff' : 'var(--brand)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 320ms cubic-bezier(0.2, 0.7, 0.2, 1)' }}
      />
      {showPercent && (
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fill={onBrand ? '#fff' : 'var(--ink)'}
          style={{ fontSize: size * 0.24, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(frac * 100)}%
        </text>
      )}
    </svg>
  );
}
