import type { ReactNode, SVGProps } from 'react';
import type { ComercioTipo } from '@/shared/api/types';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

/** 24px grid, 1.75 stroke, rounded caps and joins. Every icon is decorative (aria-hidden). */
function Svg({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconVisits = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4.5h6M9.5 3h5a1 1 0 0 1 1 1v1.5h-7V4a1 1 0 0 1 1-1Z" />
    <path d="M8.5 5.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5a2 2 0 0 0-2-2h-1.5" />
    <path d="m9 14 2.2 2.2L15.5 12" />
  </Svg>
);
export const IconPrices = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2a1.5 1.5 0 0 1 1.06.44l7.3 7.3a1.5 1.5 0 0 1 0 2.12l-6.8 6.8a1.5 1.5 0 0 1-2.12 0l-7.3-7.3a1.5 1.5 0 0 1-.44-1.06Z" />
    <circle cx="8.5" cy="8.5" r="1.25" />
  </Svg>
);
export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M4.5 20.5c.6-3.6 3.6-5.5 7.5-5.5s6.9 1.9 7.5 5.5" />
  </Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5A8 8 0 0 0 6 6.8L4 9" />
    <path d="M4 4.5V9h4.5" />
    <path d="M4 12.5A8 8 0 0 0 18 17.2L20 15" />
    <path d="M20 19.5V15h-4.5" />
  </Svg>
);
export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.3-2h6l1.3 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 4.6 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4.2M12 16.8v.2" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const IconCheckCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.8 2.8L16 9.8" />
  </Svg>
);
/** Connection: filled dot when online, hollow ring when offline. Shape carries the state, not colour. */
export const IconOnline = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconOffline = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4.5" />
  </Svg>
);
export const IconPending = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    <path d="m6.5 7 .8 11.5a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    <path d="M10 11v5M14 11v5" />
  </Svg>
);
export const IconNote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5h7.8a1.5 1.5 0 0 1 1.06.44l2.7 2.7a1.5 1.5 0 0 1 .44 1.06V19a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
    <path d="M8.5 12h7M8.5 15.5h5" />
  </Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </Svg>
);
export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
  </Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />
  </Svg>
);
export const IconChevronUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 14.5 6.5-6.5 6.5 6.5" />
  </Svg>
);
export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19.5v-14M6 11.5l6-6 6 6" />
  </Svg>
);
export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12h14M12.5 6l6 6-6 6" />
  </Svg>
);
export const IconArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5v14M6 12.5l6 6 6-6" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
);
export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
  </Svg>
);
export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Svg>
);
export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.2M12 7.8v.2" />
  </Svg>
);
export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconSwap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 8h14M15 4.5 18.5 8 15 11.5" />
    <path d="M19.5 16h-14M9 12.5 5.5 16 9 19.5" />
  </Svg>
);
export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.3A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M4 4l16 16" />
  </Svg>
);
export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10" />
    <path d="M15 8l4 4-4 4M19 12H9.5" />
  </Svg>
);
export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10.5-6.5Z" />
  </Svg>
);
export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 20.5v-17M6 4.5h11l-2 4 2 4H6" />
  </Svg>
);
export const IconBuilding = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 20.5v-15A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5v15M15 10h3.5A1.5 1.5 0 0 1 20 11.5v9" />
    <path d="M3.5 20.5h17M8.5 8h3M8.5 12h3M8.5 16h3" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </Svg>
);
export const IconAssign = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3.5 19.5c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5" />
    <path d="M16.5 7.5h4M18.5 5.5l2 2-2 2" />
  </Svg>
);
export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.25" />
    <path d="M3 19.5c.5-3.2 2.7-5 6-5s5.5 1.8 6 5" />
    <path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.5 14.8c1.7.6 2.9 2.2 3.3 4.7" />
  </Svg>
);
export const IconCatalog = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Svg>
);
export const IconCalculator = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
  </Svg>
);
export const IconAudit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Svg>
);
export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
  </Svg>
);

const TIPO_ICON: Record<ComercioTipo, (p: IconProps) => ReactNode> = {
  SUPERMERCADO: (p) => (
    <Svg {...p}>
      <path d="M3 4.5h2.4l2.1 10h9.6l2-7.5H6.2" />
      <circle cx="9" cy="19" r="1.3" />
      <circle cx="16.5" cy="19" r="1.3" />
    </Svg>
  ),
  ALMACEN: (p) => (
    <Svg {...p}>
      <path d="m4.5 9.5 1.2-5h12.6l1.2 5" />
      <path d="M4.5 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
      <path d="M5.5 12.5v8h13v-8M10 20.5v-5h4v5" />
    </Svg>
  ),
  VERDULERIA: (p) => (
    <Svg {...p}>
      <path d="M5 19C5 10.5 10 5 19 5c0 8.5-5.5 14-14 14Z" />
      <path d="m5 19 8-8" />
    </Svg>
  ),
  CARNICERIA: (p) => (
    <Svg {...p}>
      <path d="M6 10c1-3.3 5-5.5 9-4.5s5.2 5.2 3 8.5-6.2 5.3-9.3 4.2S5 13.3 6 10Z" />
      <circle cx="13" cy="11.5" r="1.7" />
    </Svg>
  ),
  FARMACIA: (p) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  ),
  OTRO: (p) => (
    <Svg {...p}>
      <path d="M6 8.5h12l1 11.5H5Z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </Svg>
  ),
};

/** Glyph for a TipoComercio. */
export function IconTipo({ tipo, ...rest }: IconProps & { tipo: ComercioTipo }) {
  return <>{TIPO_ICON[tipo](rest)}</>;
}
