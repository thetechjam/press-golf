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
