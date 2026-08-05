import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveTheme, applyTheme, watchSystemTheme } from './theme';

// Vitest runs in node — back the DOM bits this module touches with fakes.
const classes = new Set<string>();
const style: Record<string, string> = {};
let systemDark = false;
let changeCallback: (() => void) | null = null;

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
  addEventListener: (_event: string, callback: () => void) => {
    changeCallback = callback;
  },
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

describe('watchSystemTheme', () => {
  beforeEach(() => {
    classes.clear();
    systemDark = false;
    changeCallback = null;
  });

  it('re-resolves system preference when OS appearance changes', () => {
    // User chose 'system' theme, OS is light initially
    applyTheme('system', false);
    expect(classes.has('dark')).toBe(false);
    expect(style.colorScheme).toBe('light');

    // Register the listener
    watchSystemTheme();
    expect(changeCallback).not.toBeNull();

    // OS preference changes to dark
    systemDark = true;
    changeCallback?.();

    // Classes should reflect the new system preference
    expect(classes.has('dark')).toBe(true);
    expect(style.colorScheme).toBe('dark');
  });

  it('maintains explicit theme choice across system preference changes', () => {
    // User explicitly chose dark, OS is light
    applyTheme('dark', false);
    expect(classes.has('dark')).toBe(true);
    expect(style.colorScheme).toBe('dark');

    // Register the listener
    watchSystemTheme();

    // OS preference changes to dark (irrelevant to explicit choice)
    systemDark = true;
    changeCallback?.();

    // Should remain dark (still respecting the explicit choice)
    expect(classes.has('dark')).toBe(true);
    expect(style.colorScheme).toBe('dark');
  });

  it('does not snapshot theme at registration time — re-applies current state', () => {
    // User chose 'system' with light OS initially
    applyTheme('system', false);
    watchSystemTheme();

    // OS changes to dark
    systemDark = true;
    changeCallback?.();
    expect(classes.has('dark')).toBe(true);

    // OS changes back to light
    systemDark = false;
    changeCallback?.();
    expect(classes.has('dark')).toBe(false);
  });

  it('picks up theme changes after listener registration', () => {
    // User starts with 'light' theme, OS is light
    applyTheme('light', false);
    expect(classes.has('dark')).toBe(false);

    // Register the listener
    watchSystemTheme();

    // User changes their choice to 'system'
    applyTheme('system', false);

    // OS is still light, so should stay light
    expect(classes.has('dark')).toBe(false);

    // OS changes to dark
    systemDark = true;
    changeCallback?.();

    // Should now be dark because the current choice is 'system'
    // (broken rewrite would stay light because it captured 'light' at registration time)
    expect(classes.has('dark')).toBe(true);
    expect(style.colorScheme).toBe('dark');
  });

  it('glare override persists through system changes, then correctly lands on theme when glare turns off', () => {
    // User chose 'dark' theme, OS is dark
    systemDark = true;
    applyTheme('dark', false);
    expect(classes.has('dark')).toBe(true);
    expect(classes.has('glare')).toBe(false);
    expect(style.colorScheme).toBe('dark');

    // Turn on glare (forces light regardless of choice)
    applyTheme('dark', true);
    expect(classes.has('glare')).toBe(true);
    expect(classes.has('dark')).toBe(false);
    expect(style.colorScheme).toBe('light');

    // Register listener while glare is active
    watchSystemTheme();

    // OS appearance changes to light
    systemDark = false;
    changeCallback?.();
    // Glare is still on, so it should still force light
    expect(classes.has('glare')).toBe(true);
    expect(classes.has('dark')).toBe(false);
    expect(style.colorScheme).toBe('light');

    // Turn off glare
    applyTheme('dark', false);
    // Should now reflect the stored 'dark' choice against current (light) OS
    expect(classes.has('glare')).toBe(false);
    expect(classes.has('dark')).toBe(true); // Explicit dark choice
    expect(style.colorScheme).toBe('dark');
  });
});
