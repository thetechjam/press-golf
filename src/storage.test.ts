import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from './storage';

// Vitest runs in node — back localStorage with a Map.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

describe('settings', () => {
  beforeEach(() => store.clear());

  it('defaults keepAwake on when nothing is stored', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getSettings().keepAwake).toBe(true);
  });

  it('persists a patch and reads it back', () => {
    saveSettings({ keepAwake: false });
    expect(getSettings().keepAwake).toBe(false);
    saveSettings({ keepAwake: true });
    expect(getSettings().keepAwake).toBe(true);
  });

  it('returns the merged settings from saveSettings', () => {
    expect(saveSettings({ keepAwake: false })).toEqual({ keepAwake: false });
  });

  it('merges stored partials over defaults (forward-compatible)', () => {
    store.set('press.settings.v1', '{}');
    expect(getSettings().keepAwake).toBe(true);
  });

  it('falls back to defaults on corrupt JSON', () => {
    store.set('press.settings.v1', 'not-json{');
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
