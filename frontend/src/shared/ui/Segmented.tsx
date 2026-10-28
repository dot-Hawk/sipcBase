import '@/shared/styles/ui.css';

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (id: T) => void;
  onBrand?: boolean;
}

/** Single-choice filter. Buttons with aria-pressed inside a labelled group. */
export function Segmented<T extends string>({ label, value, options, onChange, onBrand }: Props<T>) {
  return (
    <div className={`segmented${onBrand ? ' segmented--on-brand' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="segmented__btn"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          <span>{o.label}</span>
          {o.count !== undefined && <span className="segmented__count num">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
