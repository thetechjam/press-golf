// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SettingsSheet } from './SettingsSheet';
import { saveRound, saveSettings, listRounds } from '../storage';
import { makeRound } from '../games/testFixtures';
import { setBackend, snapshotBackend } from '../kv';
import { PERSISTED_KEYS } from '../native';

/**
 * The wipe button in Settings, from the user's side of the glass.
 *
 * Two things matter and both are about the second tap: the first tap must
 * say what goes and take nothing, and only the second takes it. The relaunch
 * afterwards is a reload, stubbed here because happy-dom has no page to
 * reload — the test checks that it was asked for, after the storage went.
 */

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  reload = vi.fn();
  // happy-dom's Location is its own object; swapping the method on it is the
  // least that makes `window.location.reload()` observable.
  Object.defineProperty(window.location, 'reload', { value: reload, configurable: true });
  saveRound({ ...makeRound(), id: 'r1', course: 'Pebble Beach' });
  saveSettings({ glare: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const armButton = () => screen.getByRole('button', { name: 'Erase everything' });
const confirmButton = () => screen.getByRole('button', { name: 'Erase everything for good' });

describe('Erase everything', () => {
  it('is offered in Settings, idle, with nothing taken', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    expect(armButton()).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Erase everything for good' })).toBeNull();
    expect(listRounds()).toHaveLength(1);
  });

  it('says what goes on the first tap, and still takes nothing', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    fireEvent.click(armButton());

    // The copy names each thing the privacy page lists, so nobody confirms a
    // wipe they thought was narrower.
    const copy = screen.getByRole('alert').textContent ?? '';
    for (const thing of ['round', 'saved course', 'player name', 'feedback waiting to send', 'setting']) {
      expect(copy, thing).toContain(thing);
    }
    expect(copy).toMatch(/no undo/i);

    expect(confirmButton()).toBeTruthy();
    expect(listRounds()).toHaveLength(1);
    expect(localStorage.length).toBe(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('stands down on Cancel', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    fireEvent.click(armButton());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(armButton()).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Erase everything for good' })).toBeNull();
    expect(localStorage.length).toBe(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('erases on the second tap and relaunches', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    fireEvent.click(armButton());
    fireEvent.click(confirmButton());

    expect(localStorage.length).toBe(0);
    expect(listRounds()).toEqual([]);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('Erase everything when a key will not go', () => {
  it('erases a key Press could not read at startup, and every key after it', () => {
    const disk = new Map<string, string>(PERSISTED_KEYS.map((k) => [k, '"x"']));
    const blocked = PERSISTED_KEYS[0];
    const previous = setBackend(
      snapshotBackend(
        Object.fromEntries([...disk].filter(([k]) => k !== blocked)),
        (key, value) => void (value === null ? disk.delete(key) : disk.set(key, value)),
        () => {},
        [blocked]
      )
    );
    try {
      render(<SettingsSheet onClose={() => {}} screen="home" />);
      fireEvent.click(armButton());
      fireEvent.click(confirmButton());
    } finally {
      setBackend(previous);
    }
    expect([...disk.keys()]).toEqual([]);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('says so, and does not reload into a "fresh start", when the store refuses one', () => {
    const original = Object.getPrototypeOf(localStorage).removeItem as Storage['removeItem'];
    vi.spyOn(localStorage, 'removeItem').mockImplementation((k) => {
      if (k === 'press.settings.v1') throw new DOMException('refused', 'SecurityError');
      return original.call(localStorage, k);
    });
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    fireEvent.click(armButton());
    fireEvent.click(confirmButton());
    expect(screen.getByRole('alert').textContent).toMatch(/couldn’t erase everything/);
    expect(reload).not.toHaveBeenCalled();
    // The rest still went.
    expect(listRounds()).toHaveLength(0);
  });
});
