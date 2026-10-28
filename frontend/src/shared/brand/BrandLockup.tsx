import './brand-lockup.css';

interface Props {
  /** `brand` for blue surfaces (recoloured copy: light-blue stars, white text), `light` for white surfaces (original colours). */
  tone?: 'brand' | 'light';
  className?: string;
}

const SOURCES = {
  light: '/brand/logo-full.png',
  // Same artwork as logo-full.png with only the colours swapped so it reads on brand blue.
  brand: '/brand/logo-full-on-brand.png',
} as const;

/** The official institutional logo, shown as the original artwork. Set its width where it is used. */
export function BrandLockup({ tone = 'brand', className }: Props) {
  return (
    <img
      className={['lockup', className].filter(Boolean).join(' ')}
      src={SOURCES[tone]}
      alt="Dirección de Estadística, Censos y Documentación"
      width={1248}
      height={1235}
    />
  );
}
