// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
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

  it('erases on the second tap and relaunches', async () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    fireEvent.click(armButton());
    fireEvent.click(confirmButton());

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(localStorage.length).toBe(0);
    expect(listRounds()).toEqual([]);
  });
});

describe('Erase everything when a key will not go', () => {
  it('erases a key Press could not read at startup, and every key after it', async () => {
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
      await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    } finally {
      setBackend(previous);
    }
    expect([...disk.keys()]).toEqual([]);
  });

  it('says so, and does not reload into a "fresh start", when the store refuses one', async () => {
    const original = Object.getPrototypeOf(localStorage).removeItem as Storage['removeItem'];
    vi.spyOn(localStorage, 'removeItem').mockImplementation((k) => {
      if (k === 'press.settings.v1') throw new DOMException('refused', 'SecurityError');
      return original.call(localStorage, k);
    });
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    fireEvent.click(armButton());
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/couldn’t erase everything/)
    );
    expect(reload).not.toHaveBeenCalled();
    // The rest still went.
    expect(listRounds()).toHaveLength(0);
  });

  it('says so on native too, where the refusal only arrives later as a rejected promise', async () => {
    const disk = new Map<string, string>(PERSISTED_KEYS.map((k) => [k, '"x"']));
    let refuse!: (err: Error) => void;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const previous = setBackend(
      snapshotBackend(Object.fromEntries(disk), (key, value) => {
        if (key === 'press.settings.v1' && value === null) {
          // Capacitor's shape: the call returns at once, the answer comes later.
          return new Promise<void>((_, reject) => (refuse = reject));
        }
        if (value === null) disk.delete(key);
        else disk.set(key, value);
      })
    );
    try {
      render(<SettingsSheet onClose={() => {}} screen="home" />);
      fireEvent.click(armButton());
      fireEvent.click(confirmButton());
      // Still in flight: no reload, and no second wipe from a second tap.
      await Promise.resolve();
      expect(reload).not.toHaveBeenCalled();
      expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);
      refuse(new Error('refused'));
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toMatch(/couldn’t erase everything/)
      );
    } finally {
      setBackend(previous);
    }
    expect(reload).not.toHaveBeenCalled();
    expect([...disk.keys()]).toEqual(['press.settings.v1']);
  });

  it('cannot be dismissed while the deletes are in flight, so a late refusal is still shown', async () => {
    const disk = new Map<string, string>(PERSISTED_KEYS.map((k) => [k, '"x"']));
    let refuse!: (err: Error) => void;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const previous = setBackend(
      snapshotBackend(Object.fromEntries(disk), (key, value) => {
        if (key === 'press.settings.v1' && value === null) {
          return new Promise<void>((_, reject) => (refuse = reject));
        }
        if (value === null) disk.delete(key);
        else disk.set(key, value);
      })
    );
    const onClose = vi.fn();
    try {
      render(<SettingsSheet onClose={onClose} screen="home" />);
      fireEvent.click(armButton());
      fireEvent.click(confirmButton());
      await Promise.resolve();

      // Every way out: the X, Escape (which reaches a dialog as `cancel`),
      // and a tap on the scrim, which lands on the dialog itself.
      const close = screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement;
      expect(close.disabled).toBe(true);
      fireEvent.click(close);
      const dialog = document.querySelector('dialog')!;
      fireEvent(dialog, new Event('cancel', { cancelable: true }));
      fireEvent.click(dialog);
      // Longer than the sheet's exit, so a close that had started would land.
      await new Promise((r) => setTimeout(r, 250));
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog.classList.contains('closing')).toBe(false);

      refuse(new Error('refused'));
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toMatch(/couldn’t erase everything/)
      );

      // Once it has answered, the sheet closes as usual.
      expect(close.disabled).toBe(false);
      fireEvent.click(close);
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    } finally {
      setBackend(previous);
    }
    expect(reload).not.toHaveBeenCalled();
  });
});
