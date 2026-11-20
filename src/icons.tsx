/**
 * Inline SVG icon set. One stroke weight (2), 24px grid, currentColor —
 * icons inherit text color so they follow the theme, dark mode, and
 * glare mode automatically. No icon library dependency.
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

/**
 * The Trunk brand mark ("Open Trunk"): a car seen from behind with the trunk
 * lid raised and a gold pin flag standing in it. Path data is the delivered
 * trunk-mark.svg, kept identical to the splash in index.html and the OG card
 * script. Body and ball follow currentColor so the mark tracks theme and
 * glare modes; the flag stays brand gold and the taillights stay red.
 */
export const TrunkMark = ({ size = 18, className }: IconProps) => (
  <svg
    width={(size * 744) / 754}
    height={size}
    viewBox="140 130 744 754"
    className={className}
    aria-hidden
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M296 162Q512 141 728 162C793 169 832 203 845 246Q855 279 821 276L739 400L792 516C849 523 870 604 870 722Q870 798 811 802V844Q811 870 784 870H718Q690 870 690 842V802H334V842Q334 870 306 870H240Q213 870 213 844V802C170 800 154 774 154 722C154 604 175 523 232 516L285 400L203 276Q169 279 179 246C192 203 231 169 296 162ZM243 246Q232 252 240 264L300 354Q302 358 311 354C431 315 593 315 713 354Q722 358 724 354L784 264Q792 252 781 246C688 207 336 207 243 246ZM329 391L275 520Q288 531 285 560V679Q285 721 326 721H698Q739 721 739 679V560Q736 531 749 520L695 391C583 354 441 354 329 391Z"
    />
    <path
      fill="#e7b53c"
      d="M443 658V417A20 20 0 1 1 474 408C544 395 562 458 644 452Q661 451 650 466C580 536 551 485 469 535V658C501 661 523 669 523 680C523 692 489 702 448 702S373 692 373 680C373 669 403 660 443 658Z"
    />
    <circle cx="587" cy="639" r="54" fill="currentColor" />
    <path
      fill="#d2483b"
      d="M201 568H241Q256 568 256 583V669Q256 683 242 683H180Q164 683 167 667Q171 619 183 583Q188 568 201 568Z"
    />
    <path
      fill="#d2483b"
      d="M783 568H823Q836 568 841 583Q853 619 857 667Q860 683 844 683H782Q768 683 768 669V583Q768 568 783 568Z"
    />
  </svg>
);

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

/**
 * Two players over one ball — a scramble: a team playing a single ball.
 *
 * Two people and not three or four: at the 13px a round card draws it, three
 * heads and their shoulders came out as a cluster of dots. Five bold marks
 * (two heads, two shoulders meeting in the middle, one ball) keep their gaps
 * at 13px, and the shoulders touching is what says "team" rather than "two".
 */
export const ScrambleIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="7" cy="5" r="3" />
    <circle cx="17" cy="5" r="3" />
    <path d="M2 13.5a5 5 0 0 1 10 0M12 13.5a5 5 0 0 1 10 0" />
    <circle cx="12" cy="19.5" r="3" fill="currentColor" strokeWidth={0} />
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

/** Half-filled circle — contrast, not brightness. Glare mode's mark. */
export const ContrastIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
  </svg>
);

export const GearIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const PencilIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
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

/** Rising bars — the Stats screen's mark. */
export const ChartIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 20V13" />
    <path d="M12 20V7" />
    <path d="M19 20v-4" />
    <path d="M3 20h18" />
  </svg>
);

/** A QR code's three finder squares — the mark for sending a round to a phone. */
export const QrIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
    <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
    <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
    <path d="M14.5 14.5h2M20.5 14.5v2M14.5 20.5h6M18 18h.01" />
  </svg>
);
