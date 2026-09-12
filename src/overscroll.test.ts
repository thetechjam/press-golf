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

/**
 * The sheet is a <dialog>, and `display` is the one declaration on it that
 * cannot be written the obvious way. A user-agent rule hides a closed dialog
 * (`dialog:not([open]) { display: none }`), but author origin beats UA origin
 * whatever the specificity — so hoisting `display: flex` onto the bare
 * .sheet-backdrop rule, which is exactly the tidy-up the split invites, paints
 * every sheet the app has ever rendered over the screen and leaves it there.
 * The app still builds, the sheet still opens, and the failure only shows on
 * the frame after the first dismissal.
 *
 * `.closing` shares the scoped rule deliberately: Sheet.tsx closes the dialog
 * when the exit starts, to end the document's inertness, so the exit animation
 * runs on a dialog that is already closed and would otherwise be display: none.
 */
/**
 * The sheet's enter and exit are transforms that travel the panel's own height
 * through the region just outside the dialog's box — it is the viewport with
 * the panel flush at its bottom edge, so translateY(100%) puts the panel
 * entirely below it. Any clipping on the dialog therefore clips the whole
 * animation and nothing else: the sheet stops rising and fades into place
 * instead, with the page showing through it on the way.
 *
 * `overflow: hidden` shipped here for a real reason — the UA gives a dialog
 * `overflow: auto`, and the overflow the animation creates would otherwise make
 * the scrim itself draggable. It is the wrong half of the fix, and the failure
 * it causes is silent: no error, the sheet still opens, closes and drags, and
 * every test still passes. Only the animation is gone. `visible` is neither a
 * scroll container nor a clip, which is what this needs.
 */
describe('sheet dialog does not clip its own animation', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const rule = /(?:^|\})\s*\.sheet-backdrop\s*\{([^}]*)\}/m.exec(bare)?.[1] ?? '';

  it('locates the rule', () => {
    expect(rule).toMatch(/position\s*:\s*fixed/);
  });

  it('declares overflow: visible, overriding the UA dialog default', () => {
    // Not merely "no overflow declaration": the UA's own `auto` is a scroll
    // container, so leaving it unsaid is its own bug.
    expect(rule).toMatch(/overflow\s*:\s*visible/);
  });

  it('never clips, by any spelling', () => {
    expect(rule).not.toMatch(/overflow(-[xy])?\s*:\s*(hidden|clip|auto|scroll)/);
  });
});

describe('sheet dialog display scoping', () => {
  // Stripped, because the rule's own comment discusses `display: none`.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const unscoped = /(?:^|\})\s*\.sheet-backdrop\s*\{([^}]*)\}/m.exec(bare)?.[1] ?? '';
  const scopedSelector =
    /(?:^|\})\s*((?:\.sheet-backdrop(?:\[open\]|\.closing)\s*,?\s*)+)\{([^}]*)\}/m.exec(bare);

  it('locates both halves of the split', () => {
    expect(unscoped).toMatch(/position\s*:\s*fixed/);
    expect(scopedSelector).not.toBeNull();
  });

  it('never declares display on the unscoped rule', () => {
    expect(unscoped).not.toMatch(/display\s*:/);
  });

  it('declares it only for a dialog that is open or on its way out', () => {
    const selector = scopedSelector?.[1] ?? '';
    const body = scopedSelector?.[2] ?? '';
    expect(body).toMatch(/display\s*:\s*flex/);
    expect(selector).toMatch(/\.sheet-backdrop\[open\]/);
    expect(selector).toMatch(/\.sheet-backdrop\.closing/);
  });
});

describe('text inflation guard', () => {
  it('tells Safari not to resize text on its own', () => {
    // Safari inflates text in some layouts unless told not to, which moves
    // every width this stylesheet reasons about — and installed to a home
    // screen there is no browser chrome to notice it against. The first sign
    // is a row that no longer fits.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
    const root = /html\s*\{([^}]*)\}/.exec(bare)?.[1] ?? '';
    expect(root).toMatch(/-webkit-text-size-adjust\s*:\s*100%/);
    expect(root).toMatch(/[^-]text-size-adjust\s*:\s*100%/);
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
   * question — layer order supersedes source order. Measured against three
   * reconstructed migrations (base rules unlayered, partially layered, fully
   * layered): every one fails the same three assertions, and the failure sets
   * are byte-identical, while at runtime they lose 6, 5 and 0 of this block's
   * six targets respectively. So the suite can gate the change and cannot
   * validate it. Fail loudly with directions rather than leaving someone an
   * ambiguous red they are tempted to delete.
   */
  it('has not been superseded by @layer', () => {
    expect(
      css.includes('@layer'),
      'index.css now uses @layer. EXPECTED: a correct migration fails this ' +
        'assertion too, and two others with it. That is a prompt to re-derive ' +
        'the suite, not evidence you did something wrong. A naive migration ' +
        'fails exactly the same three — this one, `sits at the top level`, ' +
        'and `is the last rule in the file` — and nothing else. The failure ' +
        'sets are byte-identical, so this suite gates the migration but ' +
        'cannot tell you which one you performed. All three are artifacts of ' +
        'the layer wrapper\'s braces, not three separate defects: do not fix ' +
        'them individually, and above all do not un-nest the block from its ' +
        'layer to clear `sits at the top level` — that reverts the migration ' +
        'into the state this suite exists to prevent. Re-derive the ordering ' +
        'checks against layer order instead of byte offsets. Then check ' +
        'correctness at RUNTIME, not in the source: the @media block is ' +
        'present in the broken case too. With reduce active, ' +
        'getComputedStyle(el).transitionProperty must read `none` and ' +
        'transitionDuration `0s` for this block\'s targets; `transform` / ' +
        '`0.14s` means base press rules were left unlayered, and unlayered ' +
        'declarations beat layered ones. Layering the pressables section ' +
        'alone is NOT enough — base press transitions are declared at eight ' +
        'separate places in this file, and a migration that catches only two ' +
        'of them still loses five of six targets. Do not delete this suite ' +
        'to go green.'
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

/**
 * The pinned CTA bar on Setup and Golf League is four declarations doing four
 * different jobs, and three of them fail silently.
 *
 * It replaced a sticky button, which is why the bar exists at all: a button's
 * own containing block is only as tall as the button, so it has nowhere to
 * move, and Play hit the same wall before it (see `.play-foot`).
 *
 * Drop the background and the bar turns back into a transparent slab with the
 * page sliding visibly under it. Drop the fade and a course-search list ends
 * mid-row against a hard edge, saying "this is the end" where four more
 * results are waiting. Let the fade keep pointer events and it silently eats
 * taps on the row it is drawn over. Drop the scroll-padding and every field
 * the browser scrolls into view of its own accord lands behind the button —
 * measured at 31px under it before the rule existed.
 *
 * All four render perfectly in a screenshot of the top of the screen.
 */
describe('pinned CTA bar', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const rule = (selector: string) =>
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
      bare
    )?.[1] ?? '';

  it('is the sticky thing, pinned to the bottom of the scrollport', () => {
    const foot = rule('.screen-foot');
    expect(foot).toMatch(/position\s*:\s*sticky/);
    expect(foot).toMatch(/bottom\s*:\s*0/);
    // Above the content it is meant to cover, or it covers nothing.
    expect(foot).toMatch(/z-index\s*:\s*[1-9]/);
  });

  it('is opaque, so content scrolls behind a bar and not behind a button', () => {
    expect(rule('.screen-foot')).toMatch(/background\s*:\s*var\(--bg\)/);
  });

  it('fades the content into the bar from outside the bar', () => {
    const fade = rule('.screen-foot::before');
    // bottom: 100% puts it above the bar: inside, it would tint the button.
    expect(fade).toMatch(/bottom\s*:\s*100%/);
    expect(fade).toMatch(/linear-gradient\(\s*to top\s*,\s*var\(--bg\)/);
    expect(fade).toMatch(/pointer-events\s*:\s*none/);
  });

  it('reserves its own height for scrolls the browser starts', () => {
    expect(rule('html:has(.screen-foot)')).toMatch(/scroll-padding-bottom\s*:/);
  });

  it('takes over the screen padding it now sits below', () => {
    expect(rule('.screen:has(> .screen-foot)')).toMatch(/padding-bottom\s*:\s*0/);
  });
});

/**
 * Two declarations that keep New Round from scrolling with everything
 * collapsed, both of which look like tidying-up candidates.
 *
 * `.add-row` puts "+ Add player" and the recall chips on one line instead of
 * two. Without `flex-wrap` that line cannot break, so a long roster runs
 * sideways out of the card instead of stacking — the failure is invisible
 * until someone has five remembered players.
 *
 * `.card > .hint:last-child` drops the trailing paragraph margin no card ever
 * wanted: 13px of space under the last line of text, inside padding that was
 * already the gap. It is worth the most on the Players card, which is the
 * tallest in the app and the one that has to fit above a pinned button.
 */
describe('players card trim', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const rule = (selector: string) =>
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
      bare
    )?.[1] ?? '';

  it('lets the shared row break rather than run out of the card', () => {
    const row = rule('.add-row');
    expect(row).toMatch(/display\s*:\s*flex/);
    expect(row).toMatch(/flex-wrap\s*:\s*wrap/);
  });

  it('takes the dead margin off a card-closing hint', () => {
    expect(rule('.card > .hint:last-child')).toMatch(/margin-bottom\s*:\s*0/);
  });
});

/**
 * The pinned bar reaching the floor is a three-rule chain, and breaking any
 * link leaves the bar sitting wherever the content happened to stop — which is
 * what it did before: "Next Hole" floating 180px above the bottom of an
 * otherwise empty phone, reading as a page that failed to finish loading.
 *
 * `.app` must be a flex column, `.screen` must be told to fill it, and the bar
 * must claim the leftover with `margin-top: auto`. None of the three looks
 * like it is doing anything on its own, and on a screen long enough to scroll
 * none of them changes a pixel — so the failure only shows on a short one.
 */
describe('pinned bar reaches the bottom', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const rule = (selector: string) =>
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
      bare
    )?.[1] ?? '';

  it('gives the app a column to distribute', () => {
    const app = rule('.app');
    expect(app).toMatch(/display\s*:\s*flex/);
    expect(app).toMatch(/flex-direction\s*:\s*column/);
    expect(app).toMatch(/min-height\s*:\s*100%/);
  });

  it('hands the height to the screen', () => {
    expect(rule('.app > .screen')).toMatch(/flex\s*:\s*1/);
  });

  it('states the screen\u2019s width rather than leaving it to be inferred', () => {
    // A flex item only stretches to the line when the container's cross size
    // is definite; where it is not, the item can size to its own max-content
    // and grow past the phone. An iPhone screenshot showed exactly that: the
    // toolbar and the money ticker \u2014 the two children whose content can be
    // wider than the screen \u2014 laid out past the right edge, while the header
    // and the scoring card sat correctly inside it.
    const screenRule = rule('.app > .screen');
    expect(screenRule).toMatch(/width\s*:\s*100%/);
    expect(screenRule).toMatch(/min-width\s*:\s*0/);
  });

  it('lets the bar take what the content did not', () => {
    expect(rule('.screen-foot')).toMatch(/margin-top\s*:\s*auto/);
  });
});

/**
 * Two rows that have to survive a narrow phone.
 *
 * Play's toolbar is three tabs and three icon toggles. Grouped, the icons wrap
 * together; ungrouped, whichever one fell off the line was stranded alone —
 * and the tabs then expanded into the space it left, so it could never wrap
 * back. The 6px gap is what keeps all six on one line at 360px at all.
 *
 * A settlement line is four flex items across, and a flex item will not shrink
 * below its own longest word: "Bartholomew pays Christopher $55" pushed the
 * amount past the right edge at 320px and took the whole page sideways.
 */
describe('rows that have to fit a narrow phone', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const rule = (selector: string) =>
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
      bare
    )?.[1] ?? '';

  it('lays the toolbar out as grid tracks, which cannot overflow', () => {
    // Three attempts at this row failed through flex: the tabs would not go
    // under "BOARD", the line never broke, and the last control ended up off
    // the side of the phone. `max-width: 100%` clamped the row's box and the
    // buttons overflowed the box instead. Two grid columns always sum to the
    // element's width, whatever that width turns out to be.
    const row = rule('.seg.view-toggle');
    expect(row).toMatch(/display\s*:\s*grid/);
    expect(row).toMatch(/grid-template-columns\s*:\s*minmax\(0, 1fr\) auto/);
  });

  it('lets both the tab group and each tab go under their own content', () => {
    // A bare `1fr` is `minmax(auto, 1fr)`, which will not: that floor is the
    // same one that kept the row from fitting, one level down.
    expect(rule('.view-tabs')).toMatch(/grid-template-columns\s*:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(rule('.view-tabs')).toMatch(/min-width\s*:\s*0/);
  });

  it('states the narrow-phone breakpoint instead of inferring it', () => {
    // Under 360px the six controls genuinely do not fit a line. Said as a
    // breakpoint, because leaving it to be inferred is what went wrong.
    const media = /@media \(max-width: 359\.98px\) \{([\s\S]*?)\n\}/.exec(bare)?.[1] ?? '';
    expect(media).toMatch(/\.seg\.view-toggle/);
    expect(media).toMatch(/grid-template-columns\s*:\s*minmax\(0, 1fr\)/);
  });

  it('caps the tab group rather than each tab', () => {
    // Capped individually, each button is stranded at the left of a grid column
    // wider than itself — three scattered buttons instead of one control.
    expect(rule('.view-tabs')).toMatch(/max-width\s*:\s*432px/);
    expect(rule('.view-toggle .seg-btn')).not.toMatch(/max-width/);
  });

  it('keeps Play’s icon toggles together, at their natural width', () => {
    // The `auto` column: never squeezed, because these are 44px tap targets
    // and the tabs are what gives way.
    const tools = rule('.view-tools');
    expect(tools).toMatch(/display\s*:\s*flex/);
    expect(tools).not.toMatch(/flex-shrink\s*:\s*[1-9]/);
  });

  it('tightens the toolbar gap that buys the sixth control its place', () => {
    expect(rule('.seg.view-toggle')).toMatch(/gap\s*:\s*6px/);
  });

  it('will not let the toolbar be wider than the screen it sits in', () => {
    // Measured off the phone this was reported from: every other child of the
    // screen was the right width and this row alone was 34pt wider, so its
    // tabs shared the extra out evenly and the Settings gear went off the
    // side. It cannot exceed its parent, whatever hands it that width.
    const row = rule('.seg.view-toggle');
    expect(row).toMatch(/max-width\s*:\s*100%/);
    expect(row).toMatch(/min-width\s*:\s*0/);
  });

  it('lets a settlement line wrap instead of running off the page', () => {
    expect(rule('.payment')).toMatch(/flex-wrap\s*:\s*wrap/);
    expect(rule('.payment strong')).toMatch(/min-width\s*:\s*0/);
  });
});

/**
 * The Hole tab is a vertical budget: four players, six chips each, a strip per
 * side game, and a button — on a 360x780 phone that came to 57px more than the
 * screen had, so the fourth player's chips sat under the bar on every one of
 * eighteen holes.
 *
 * It was paid for out of spacing, never out of a tap target. That distinction
 * is the whole point, and it is exactly what the next round of "make it fit"
 * will erode: the chips are the most-tapped control in the app, roughly 72
 * presses a round, and 44px is the floor.
 */
describe('Hole tab vertical budget', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const rule = (selector: string) =>
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
      bare
    )?.[1] ?? '';

  it('keeps the score chip at 44px', () => {
    expect(rule('.score-chip')).toMatch(/height\s*:\s*44px/);
  });

  it('keeps the hole dots at their own 24px floor', () => {
    // WCAG 2.5.8 AA asks 24x24, and these are already there — the strip is not
    // somewhere to find more pixels either.
    expect(rule('.hole-dot')).toMatch(/(width|height)\s*:\s*24px/);
  });

  it('spends the stepper’s own space on the row, not around it', () => {
    const stepper = rule('.stepper');
    expect(stepper).toMatch(/padding\s*:\s*6px/);
    expect(stepper).toMatch(/gap\s*:\s*4px/);
  });

  it('keeps the hole head on one line', () => {
    // Stacked, "Hole 18" over "Par 4" made a 52px block beside 44px arrows.
    expect(rule('.hole-head')).toMatch(/display\s*:\s*flex/);
  });
});
