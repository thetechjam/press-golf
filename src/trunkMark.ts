/**
 * The Trunk mark: the U of TRUNK drawn as a car's trunk. The stems and bowl
 * are the trunk's walls, the counter is the dark well, a gold lid is hinged
 * into the top of the left stem and raised at 24°, and the poker-chip golf
 * ball rests in the bottom of the well.
 *
 * This is the one copy of the geometry. `TrunkMark` in icons.tsx draws it as
 * SVG for the Home header, `drawHeader` in shareCanvas.ts draws it on the
 * share-card canvas, and scripts/brand-icons.mjs and scripts/og-image.mjs
 * write the app icon, the splash copy in index.html and the link-preview
 * card from it (Node runs this file directly, as docs/league/make-qr.mjs
 * runs qr.ts). Change a proportion here and every rendering moves together.
 *
 * Everything is sized from the cap height `h`: the glyph is 0.9h wide with a
 * 0.22h stem, which is Oswald 600's U widened enough for a ball to sit in.
 */

export interface TrunkGlyphOpts {
  /** Left edge of the U. */
  x: number;
  /** Top of the stems (the cap line). The bowl's bottom is at y + h. */
  y: number;
  /** Cap height. */
  h: number;
  /**
   * The bold cut for small sizes: thicker stem and lid, a plain ball with a
   * solid ring. Nothing in it is thinner than 2px at 32px.
   */
  bold?: boolean;
}

export interface TrunkGlyph {
  /** Outer width of the U. */
  w: number;
  /** Stroke width of the stems and bowl. */
  stem: number;
  /** Centre line of the U's stroke: left stem top, bowl, right stem top. */
  stroke: { x0: number; x1: number; top: number; by: number; r: number };
  /** The well inside the stroke, same shape one stem narrower. */
  well: { x0: number; x1: number; top: number; by: number; r: number };
  /**
   * The lid: a rounded slab `w` × `t` whose bottom-left heel sits at (x, y)
   * before the slab is turned `angle` degrees about the hinge pin (hx, hy).
   * The pin is inside the left stem, below its top, so the heel is cut into
   * the stem rather than laid on it.
   */
  lid: { x: number; y: number; w: number; t: number; hx: number; hy: number; angle: number };
  /**
   * The slot the lid comes out of: a sliver of well colour along the lid's
   * underside, inside the stem, turned with the lid. Drawn before the lid.
   */
  slot: { x: number; y: number; w: number; t: number };
  /** The chip ball: body, the ring of edge spots, the dimples. */
  ball: {
    cx: number;
    cy: number;
    r: number;
    ringR: number;
    ringW: number;
    /** `null` when the ring is solid (the bold cut). */
    dash: { on: number; off: number; offset: number } | null;
    dimples: { x: number; y: number }[];
    dimpleR: number;
  };
  /** Bounding box of the whole mark, lid included. */
  box: { x: number; y: number; w: number; h: number };
}

export const LID_ANGLE = -24;

/** Width and lid rise as fractions of cap height — for sizing a box before drawing. */
export const GLYPH_W = 0.9;
export const GLYPH_RISE = 0.28;

export function trunkGlyph({ x, y, h, bold = false }: TrunkGlyphOpts): TrunkGlyph {
  const w = h * GLYPH_W;
  const stem = h * (bold ? 0.27 : 0.22);
  const x0 = x + stem / 2;
  const x1 = x + w - stem / 2;
  const r = (x1 - x0) / 2;
  const by = y + h - r - stem / 2;
  const innerR = r - stem / 2;
  const cx = (x0 + x1) / 2;

  // The lid, hinged inside the stem.
  const t = stem * (bold ? 0.72 : 0.46);
  const lw = (w - stem) * 1.12;
  const hx = x + stem * 0.5;
  const hy = y + t * 0.9;
  const heel = stem * 0.36;

  // The chip ball, scaled from the P Flag's r=58 construction.
  const br = innerR * (bold ? 0.86 : 0.8);
  const k = br / 58;
  const spots = [
    [0, -33], [-11, -17], [11, -17], [-22, 0], [0, 0], [22, 0], [-11, 17], [11, 17], [0, 33],
  ];
  const bcy = by - (bold ? 0 : innerR * 0.06);

  return {
    w,
    stem,
    stroke: { x0, x1, top: y, by, r },
    well: { x0: x0 + stem / 2, x1: x1 - stem / 2, top: y, by, r: innerR },
    lid: { x: hx - heel, y: hy - t, w: lw, t, hx, hy, angle: LID_ANGLE },
    slot: { x: hx - heel + t / 2, y: hy, w: stem * 0.55 + heel - t / 2, t: t * 0.3 },
    ball: {
      cx,
      cy: bcy,
      r: br,
      ringR: 49 * k,
      ringW: (bold ? 22 : 16) * k,
      dash: bold ? null : { on: 18 * k, off: 20.5 * k, offset: 9 * k },
      dimples: bold ? [] : spots.map(([dx, dy]) => ({ x: cx + dx * k, y: bcy + dy * k })),
      dimpleR: 5.5 * k,
    },
    box: { x, y: y - h * GLYPH_RISE, w, h: h * (1 + GLYPH_RISE) },
  };
}

/** SVG path data for a U outline from its left top, round the bowl, to its right top. */
export const uPath = (s: { x0: number; x1: number; top: number; by: number; r: number }, close = false) =>
  `M${f(s.x0)} ${f(s.top)} V${f(s.by)} A${f(s.r)} ${f(s.r)} 0 0 0 ${f(s.x1)} ${f(s.by)} V${f(s.top)}${close ? ' Z' : ''}`;

const f = (n: number) => (Math.round(n * 100) / 100).toString();

export interface TrunkSvgColors {
  /** Stems and bowl. */
  ink: string;
  /** The well. */
  well: string;
  lid: string;
  ball: string;
  ring: string;
  dimple: string;
}

/**
 * The mark as SVG elements (no outer <svg>), for the generators and the
 * splash. The React component in icons.tsx renders the same geometry as JSX.
 */
export function trunkSvg(g: TrunkGlyph, c: TrunkSvgColors, { dimples = true } = {}): string {
  const { lid, slot, ball } = g;
  const rot = `rotate(${lid.angle} ${f(lid.hx)} ${f(lid.hy)})`;
  let s = `<path d="${uPath(g.well, true)}" fill="${c.well}"/>`;
  s += `<path d="${uPath(g.stroke)}" fill="none" stroke="${c.ink}" stroke-width="${f(g.stem)}"/>`;
  s += `<g transform="${rot}">`;
  s += `<rect x="${f(slot.x)}" y="${f(slot.y)}" width="${f(slot.w)}" height="${f(slot.t)}" rx="${f(slot.t / 2)}" fill="${c.well}"/>`;
  s += `<rect x="${f(lid.x)}" y="${f(lid.y)}" width="${f(lid.w)}" height="${f(lid.t)}" rx="${f(lid.t / 2)}" fill="${c.lid}"/>`;
  s += `</g>`;
  s += `<circle cx="${f(ball.cx)}" cy="${f(ball.cy)}" r="${f(ball.r)}" fill="${c.ball}"/>`;
  const dash = ball.dash
    ? ` stroke-dasharray="${f(ball.dash.on)} ${f(ball.dash.off)}" stroke-dashoffset="${f(ball.dash.offset)}"`
    : '';
  s += `<circle cx="${f(ball.cx)}" cy="${f(ball.cy)}" r="${f(ball.ringR)}" fill="none" stroke="${c.ring}" stroke-width="${f(ball.ringW)}"${dash} transform="rotate(-90 ${f(ball.cx)} ${f(ball.cy)})"/>`;
  if (dimples && ball.dimples.length) {
    s += `<g fill="${c.dimple}">`;
    for (const d of ball.dimples) s += `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${f(ball.dimpleR)}"/>`;
    s += `</g>`;
  }
  return s;
}
