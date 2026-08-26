import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8');

/**
 * The pull-to-refresh guard is a single CSS declaration whose two failure
 * modes are both silent: put it on the wrong element, or pick the wrong
 * keyword, and every computed-style check still passes while the gesture keeps
 * reloading the app mid-round. It shipped once with both mistakes at the same
 * time. There is no unit-testable behaviour here — only the declaration — so
 * these assert the declaration is on the element that governs the viewport,
 * with the keyword that actually suppresses the default.
 */
/**
 * The Settings switches are `<input type=checkbox>`, so they inherit the
 * global `input, select` rule — which sets `padding: 12px` and
 * `min-height: var(--tap)`. min-height beats height, so the 52×32 track
 * rendered 52×48: a circle at `border-radius: 999px`, with the knob stranded
 * near the top. Nothing errored and every theme looked equally wrong.
 */
describe('settings switch sizing', () => {
  const rule = /\.switch\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

  it('neutralises the global input rule it would otherwise inherit', () => {
    expect(rule).toMatch(/min-height\s*:\s*0/);
    expect(rule).toMatch(/padding\s*:\s*0/);
  });

  it('still declares the track size the knob geometry assumes', () => {
    expect(rule).toMatch(/width\s*:\s*52px/);
    expect(rule).toMatch(/height\s*:\s*32px/);
  });

  it('centres the knob on the midline rather than a fixed top offset', () => {
    // A hard-coded `top` is what turned a sizing bug into a visibly
    // off-centre control; both transforms must carry the -50% with them.
    const knob = /\.switch::after\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(knob).toMatch(/top\s*:\s*50%/);
    expect(knob).toMatch(/translateY\(-50%\)/);
    const checked = /\.switch:checked::after\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(checked).toMatch(/-50%/);
  });
});

describe('pull-to-refresh guard', () => {
  const rootRule = /(?:^|\})\s*html\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';

  it('sets overscroll-behavior-y on the root element', () => {
    // Not `body`: unlike `overflow`, overscroll-behavior does not propagate
    // from body to the viewport, so a rule there leaves html computing `auto`.
    expect(rootRule).toMatch(/overscroll-behavior-y\s*:/);
  });

  it('uses `none`, which suppresses refresh, not `contain`, which preserves it', () => {
    // `contain` only prevents scroll chaining to ancestors; the spec keeps the
    // element's own default overscroll behaviours, refresh included.
    expect(rootRule).toMatch(/overscroll-behavior-y\s*:\s*none/);
    expect(rootRule).not.toMatch(/overscroll-behavior-y\s*:\s*(contain|auto)/);
  });

  it('leaves the declaration off body, where it would be inert', () => {
    const bodyRule = /(?:^|\})\s*body\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
    expect(bodyRule).not.toMatch(/overscroll-behavior/);
  });
});

/**
 * The reduced-motion suppression block is the last rule in this stylesheet and
 * that position is load-bearing, not tidiness. Media queries add no
 * specificity, so where two rules tie the later one wins — and three of the
 * block's targets (`.hole-dot::before`, `.bar .btn-ghost`, `.saved-course-load`)
 * are declared at equal specificity further up the file. Move the block above
 * them and their press transforms quietly start animating again for people who
 * asked them not to. Nothing errors, no computed-style check in the app fails,
 * and the only symptom is motion on someone else's phone.
 *
 * Appending a rule at the end of a 3,000-line stylesheet is the most natural
 * edit anyone will ever make to it, so the guard cannot be a comment.
 *
 * The first draft of this suite passed against a deliberately broken file. It
 * derived the target list from everything after the block and compared each
 * selector only against the text *preceding* the block, so relocating the block
 * produced a garbage target list, no prior matches, and 423 green assertions.
 * Hence the two rules below: the block's extent is brace-matched rather than
 * assumed to run to EOF, and every selector is searched across the whole file
 * with the block blanked out — never against a prefix.
 */
describe('reduced-motion suppression block position', () => {
  // Comments are stripped first: the block's own prose names several of the
  // selectors it targets, and a scan over raw text would match those.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const MARKER = 'Reduced motion: every press transform in the app';
  const markerAt = css.indexOf(MARKER);
  const blockStart = bare.indexOf('@media', markerAt);

  /** Brace-match to the block's real end. Assuming EOF is what made the first
   *  draft's "nothing follows the block" check a tautology. -1 means the block
   *  never closes — a real merge-resolution shape, not a hypothetical. */
  const rawBlockEnd = (() => {
    let depth = 0;
    for (let i = bare.indexOf('{', blockStart); i < bare.length; i++) {
      if (bare[i] === '{') depth++;
      else if (bare[i] === '}' && --depth === 0) return i + 1;
    }
    return -1;
  })();

  /** The honest value is asserted below; this one only keeps the derived
   *  constants from throwing during collection, so an unclosed block reports
   *  as a failed assertion rather than a RangeError from `.repeat(-88993)`
   *  that takes the whole file down with it. */
  const blockEnd = rawBlockEnd > blockStart ? rawBlockEnd : bare.length;

  const blockBody = bare.slice(blockStart, blockEnd);
  /** The whole file with the block blanked, offsets preserved. Searching this
   *  rather than a prefix is what makes a relocated block fail instead of
   *  silently matching nothing. */
  const outsideBlock =
    bare.slice(0, blockStart) + ' '.repeat(blockEnd - blockStart) + bare.slice(blockEnd);

  /** Unclosed `{` before the block. Non-zero means the block is nested inside
   *  some other rule rather than sitting at the top level. */
  const blockNestingDepth = (() => {
    let depth = 0;
    for (let i = 0; i < blockStart; i++) {
      if (bare[i] === '{') depth++;
      else if (bare[i] === '}') depth--;
    }
    return depth;
  })();

  const braceBalance = [...bare].reduce(
    (n, ch) => (ch === '{' ? n + 1 : ch === '}' ? n - 1 : n),
    0
  );

  /** Every selector the block suppresses, read out of the block's own rules, so
   *  adding a selector to the block automatically extends the check. */
  const targets = [
    ...new Set(
      [...blockBody.matchAll(/([^{}]+)\{[^{}]*\}/g)]
        .flatMap((m) => m[1].split(','))
        .map((sel) => sel.trim())
        .filter((sel) => sel.startsWith('.'))
    ),
  ];

  /** Last declaration of `sel` anywhere outside the block, or -1. Requiring a
   *  `,` or `{` to follow stops `.hole-dot` matching inside `.hole-dot::before`
   *  or `.hole-dot.done`. */
  const lastDeclarationOf = (sel: string) => {
    const head = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[,{]';
    const all = [...outsideBlock.matchAll(new RegExp(head, 'g'))];
    return all.length ? (all[all.length - 1].index ?? -1) : -1;
  };

  it('locates the block and the selectors it covers', () => {
    // Guards the guard: a reworded marker or a deleted block would otherwise
    // make every check below pass on an empty list.
    expect(markerAt).toBeGreaterThan(-1);
    expect(blockStart).toBeGreaterThan(-1);
    // rawBlockEnd, not the clamped blockEnd: this is the honest value, and a
    // -1 here is the "block never closes" shape rather than a parse quirk.
    expect(rawBlockEnd).toBeGreaterThan(blockStart);
    expect(targets.length).toBeGreaterThanOrEqual(15);
  });

  /**
   * Everything above reasons about byte offsets in text. That catches a block
   * that moved. It does not catch a block that is still textually last but is
   * no longer a top-level rule — and that case both builds and ships.
   *
   * Measured, not assumed. Two unbalanced merge resolutions (block left
   * unclosed; an incoming rule left unclosed so it swallows the block) are
   * already stopped by `npm run build`: postcss rejects both with
   * `CssSyntaxError: Unclosed block`. They cannot deploy, so brace balance
   * here is an earlier and far more legible signal than that error, not a
   * unique gate.
   *
   * The case that genuinely gets through is balanced and valid: someone tucks
   * this block inside another rule using CSS nesting, because that is where
   * the motion lives. Brace balance 0, `npm run build` succeeds, and every
   * ordering assertion passes — the `@media` text really does still follow
   * every target.
   *
   * It compiles to `.wrapper .awake-toggle, .wrapper .nav-arrow, …`: every
   * selector descendant-scoped to a container that is an ancestor of none of
   * them, so the block matches nothing at all. Measured against the built
   * artifact on disk, ALL SIX targets lose suppression and compute
   * `transform / 0.14s` under reduce — `.btn-primary`, `.btn-secondary`,
   * `.hole-dot`, `.hole-dot::before`, `.saved-course-load` and
   * `.bar .btn-ghost`. A correct merge loses none.
   *
   * That is the variant blockNestingDepth exists for, and the only assertion
   * here that names the defect: `is the last rule` also fires on it, but only
   * as a side effect of the wrapper's closing brace, which points at file
   * position rather than at the nesting that actually broke it.
   */
  it('is brace-balanced, so no rule is left hanging open', () => {
    expect(braceBalance).toBe(0);
  });

  it('sits at the top level, not nested inside a rule that swallowed it', () => {
    // The assertion that specifically separates resolution B from a correct
    // merge: both are textually last, only one is a top-level rule.
    expect(blockNestingDepth).toBe(0);
  });

  /**
   * If this file ever adopts @layer, this whole suite is asking the wrong
   * question — layer order supersedes source order, and a correct migration
   * produces the same single red assertion as a botched one, so the suite can
   * gate the change but cannot validate it. Fail loudly with directions rather
   * than leaving someone an ambiguous red they are tempted to delete.
   */
  it('has not been superseded by @layer', () => {
    expect(
      css.includes('@layer'),
      'index.css now uses @layer. EXPECTED: a correct migration fails this ' +
        'assertion too. It is a prompt to re-derive the suite, not evidence ' +
        'you did something wrong. This suite asserts source-order precedence, ' +
        'which @layer supersedes — re-derive the ordering checks against ' +
        'layer order instead of byte offsets. Then confirm the migration is ' +
        'the correct one, because a naive one fails this same single ' +
        'assertion and nothing else: unlayered declarations beat layered ' +
        'ones, so layering only the suppression while leaving the base press ' +
        'rules unlayered silently inverts it. The tell is at runtime, not in ' +
        'the source — do not settle for confirming the @media block is still ' +
        'present, it is present in the broken case too. With reduce active, ' +
        'getComputedStyle(el).transitionProperty must read `none` and ' +
        'transitionDuration `0s` for this block\'s targets; if it reads ' +
        '`transform` / `0.14s`, the base rules were not layered and the ' +
        'migration is the broken one. Do not delete this suite to go green.'
    ).toBe(false);
  });

  it('covers the three selectors that provably leak when the block moves up', () => {
    // Reconstructing the file with the block at its old position leaks exactly
    // these three and no others. Each must be declared outside the block, or
    // the ordering assertion below has nothing to compare and passes vacuously.
    for (const sel of ['.hole-dot::before', '.bar .btn-ghost', '.saved-course-load']) {
      expect(targets).toContain(sel);
      expect(lastDeclarationOf(sel)).toBeGreaterThan(-1);
    }
  });

  it.each(targets.map((sel) => [sel, lastDeclarationOf(sel)] as const))(
    '%s is declared above the block, so the block still wins the tie',
    (_sel, lastAt) => {
      // -1 means the selector appears only inside the block: nothing to lose to.
      expect(lastAt).toBeLessThan(blockStart);
    }
  );

  it('is the last rule in the file, with nothing appended below it', () => {
    expect(bare.slice(blockEnd).trim()).toBe('');
  });
});
