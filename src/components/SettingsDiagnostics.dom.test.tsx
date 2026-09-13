// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SettingsSheet } from './SettingsSheet';

/**
 * The two lines at the bottom of Settings that exist for bug reports.
 *
 * A clipped toolbar was reported, fixed, and reported again from a screenshot
 * that turned out to be byte-identical to the first — so there was no way to
 * tell whether the fix had reached the phone or had reached it and not worked.
 * The build stamp answers the first question and the layout number answers the
 * second, both from a single screenshot of this sheet.
 */

/** A screen with one row in it, `over` pixels wider than the content box. */
function stage(over: number, extra?: { position: string; right: number }) {
  const app = document.createElement('div');
  app.className = 'app';
  const scr = document.createElement('div');
  scr.className = 'screen';
  const row = document.createElement('div');
  row.className = 'row';
  scr.appendChild(row);
  app.appendChild(scr);
  document.body.appendChild(app);

  vi.spyOn(app, 'getBoundingClientRect').mockReturnValue({ width: 393, right: 393 } as DOMRect);
  vi.spyOn(scr, 'getBoundingClientRect').mockReturnValue({ width: 393, right: 393 } as DOMRect);
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
    width: 393 - 16 + over,
    right: 393 - 16 + over,
  } as DOMRect);
  // Boxes agree with themselves unless a test says otherwise.
  Object.defineProperty(row, 'scrollWidth', { value: 0, configurable: true });
  Object.defineProperty(row, 'clientWidth', { value: 0, configurable: true });
  let overlay: HTMLElement | null = null;
  if (extra) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    scr.appendChild(overlay);
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      width: extra.right,
      right: extra.right,
    } as DOMRect);
  }
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (el) =>
      ({
        paddingRight: '16px',
        position: overlay && el === overlay ? extra!.position : 'static',
      }) as CSSStyleDeclaration
  );
  Object.defineProperty(window, 'innerWidth', { value: 393, configurable: true });
}

const line = (label: string) =>
  [...document.querySelectorAll('.about-line')].find((el) => el.textContent?.startsWith(label))
    ?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the diagnostics in Settings', () => {
  it('names the build, so "did the update land" has an answer', () => {
    stage(0);
    render(<SettingsSheet onClose={() => {}} screen="play" />);
    // A date and a time, not a version: the version only moves when someone
    // bumps package.json, which a bug report cannot rely on.
    expect(line('Build')).toMatch(/^Build \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('says nothing extra when every row fits its screen', () => {
    stage(0);
    render(<SettingsSheet onClose={() => {}} screen="play" />);
    expect(line('Layout')).toBe('Layout 393 · 393 · 393');
  });

  it('reports how far the widest row runs past the screen', () => {
    // The shape of the reported bug: one row 30px wider than the content box,
    // invisible in a screenshot unless you know the device width and count.
    stage(30);
    render(<SettingsSheet onClose={() => {}} screen="play" />);
    expect(line('Layout')).toBe('Layout 393 · 393 · 393 · +30');
  });

  it('measures against the content edge, not the border edge', () => {
    // A row filling the padding is already wrong and must not read as 0.
    stage(8);
    render(<SettingsSheet onClose={() => {}} screen="play" />);
    expect(line('Layout')).toBe('Layout 393 · 393 · 393 · +8');
  });
});

describe('what the layout number ignores', () => {
  it('skips a fixed overlay, which is full-bleed by design', () => {
    // The settings sheet is itself a child of the screen it measures, and it
    // is a fixed dialog covering the viewport. Counted, it would report 16px
    // of overflow on every healthy screen in the app.
    stage(0, { position: 'fixed', right: 393 });
    render(<SettingsSheet onClose={() => {}} screen="play" />);
    expect(line('Layout')).toBe('Layout 393 · 393 · 393');
  });

  it('skips an absolutely positioned child for the same reason', () => {
    stage(0, { position: 'absolute', right: 420 });
    render(<SettingsSheet onClose={() => {}} screen="play" />);
    expect(line('Layout')).toBe('Layout 393 · 393 · 393');
  });

  it('still reports an in-flow row that overflows', () => {
    stage(30, { position: 'fixed', right: 393 });
    render(<SettingsSheet onClose={() => {}} screen="play" />);
    expect(line('Layout')).toBe('Layout 393 · 393 · 393 · +30');
  });
});

describe('a row whose box hides its overflow', () => {
  it('counts what was painted, not only what the rectangle promised', () => {
    // The failure this exists for: `max-width: 100%` clamps a row's own box,
    // and its buttons carry on overflowing that box. The rectangle then reads
    // as a perfect fit while the last control sits off the side of the phone.
    stage(0);
    const row = document.querySelector('.row')!;
    Object.defineProperty(row, 'scrollWidth', { value: 403, configurable: true });
    Object.defineProperty(row, 'clientWidth', { value: 377, configurable: true });
    render(<SettingsSheet onClose={() => {}} screen="play" />);
    expect(line('Layout')).toBe('Layout 393 · 393 · 393 · +26');
  });

  it('reports whichever overflow is worse', () => {
    stage(30);
    const row = document.querySelector('.row')!;
    Object.defineProperty(row, 'scrollWidth', { value: 387, configurable: true });
    Object.defineProperty(row, 'clientWidth', { value: 377, configurable: true });
    render(<SettingsSheet onClose={() => {}} screen="play" />);
    expect(line('Layout')).toBe('Layout 393 · 393 · 393 · +30');
  });
});
