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
