/**
 * Inline SVG icon set. One stroke weight (2), 24px grid, currentColor —
 * icons inherit text color so they follow the theme, dark mode, and
 * sunlight mode automatically. No icon library dependency.
 */

interface IconProps {
  size?: number;
  /** Filled glyph instead of stroked (used by StarIcon). */
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
});

/** Golf flag on its pole. */
export const FlagIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M7 21V4" />
    <path d="M7 4l10 3.5L7 11" fill="currentColor" strokeWidth={1.5} />
    <path d="M4 21h9" />
  </svg>
);

export const TrophyIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M8 4h8v6a4 4 0 0 1-8 0V4z" />
    <path d="M8 5H5v2a3 3 0 0 0 3 3" />
    <path d="M16 5h3v2a3 3 0 0 1-3 3" />
    <path d="M12 14v4" />
    <path d="M8 21h8" />
    <path d="M10 18h4v3h-4z" />
  </svg>
);

/** Arrow rising out of a tray. */
export const ShareIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 15V4" />
    <path d="M8 7.5L12 3.5l4 4" />
    <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
  </svg>
);

/** Open eye — the screen stays awake. */
export const EyeIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const SunIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
  </svg>
);

export const StarIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path
      d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.5l-5.3 2.8 1.1-5.8-4.3-4.1 5.9-.8L12 3.2z"
      fill="currentColor"
      strokeWidth={1.2}
    />
  </svg>
);

/** Coin with a currency notch — settlement money. */
export const CoinIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M14.8 9.2a3 3 0 0 0-2.8-1.4c-1.6 0-2.7.9-2.7 2.1 0 2.8 5.7 1.4 5.7 4.2 0 1.2-1.2 2.1-2.9 2.1a3.2 3.2 0 0 1-3-1.5" />
    <path d="M12 6v1.8M12 16.2V18" />
  </svg>
);

export const XIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** Arrow descending into a tray — install/download. */
export const DownloadIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 4v11" />
    <path d="M8 11.5l4 4 4-4" />
    <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);

/** Paw print — the Wolf's mark. */
export const PawIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} strokeWidth={0} fill="currentColor">
    <ellipse cx="6" cy="9.5" rx="1.9" ry="2.5" />
    <ellipse cx="18" cy="9.5" rx="1.9" ry="2.5" />
    <ellipse cx="9.6" cy="6" rx="2" ry="2.7" />
    <ellipse cx="14.4" cy="6" rx="2" ry="2.7" />
    <path d="M12 11c-2.8 0-5.4 2.7-5.4 5.5 0 1.7 1.3 2.9 3 2.9 1 0 1.6-.4 2.4-.4s1.4.4 2.4.4c1.7 0 3-1.2 3-2.9C17.4 13.7 14.8 11 12 11z" />
  </svg>
);
