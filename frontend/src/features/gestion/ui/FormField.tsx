import { useId, type ReactNode } from 'react';

export interface ControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

interface Props {
  label: string;
  hint?: string;
  error?: string;
  children: (control: ControlProps) => ReactNode;
}

/** Label, control, hint and error with the aria links in place. The control comes from a render prop. */
export function FormField({ label, hint, error, children }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-err`;
  const described = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        'aria-describedby': described || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <span id={hintId} className="field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field__error">
          {error}
        </span>
      )}
    </div>
  );
}
