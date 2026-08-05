import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveTheme, applyTheme } from './theme';

// Vitest runs in node — back the DOM bits this module touches with fakes.
const classes = new Set<string>();
const style: Record<string, string> = {};
let systemDark = false;

vi.stubGlobal('document', {
  documentElement: {
    classList: {
      toggle: (c: string, on: boolean) => {
        if (on) classes.add(c);
        else classes.delete(c);
      },
    },
    style,
  },
});
vi.stubGlobal('matchMedia', () => ({
  matches: systemDark,
  addEventListener: () => {},
}));

describe('resolveTheme', () => {
  beforeEach(() => {
    systemDark = false;
  });

  it('returns the explicit choice when glare is off', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system appearance on system', () => {
    systemDark = true;
    expect(resolveTheme('system', false)).toBe('dark');
    systemDark = false;
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('forces light whenever glare is on, whatever the theme', () => {
    systemDark = true;
    expect(resolveTheme('dark', true)).toBe('light');
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    classes.clear();
    systemDark = false;
  });

  it('adds .dark for an explicit dark theme', () => {
    applyTheme('dark', false);
    expect(classes.has('dark')).toBe(true);
    expect(classes.has('glare')).toBe(false);
    expect(style.colorScheme).toBe('dark');
  });

  it('never sets .dark and .glare together', () => {
    applyTheme('dark', true);
    expect(classes.has('glare')).toBe(true);
    expect(classes.has('dark')).toBe(false);
    expect(style.colorScheme).toBe('light');
  });

  it('clears .dark when switching back to light', () => {
    applyTheme('dark', false);
    applyTheme('light', false);
    expect(classes.has('dark')).toBe(false);
  });
});
