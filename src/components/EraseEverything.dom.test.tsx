// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SettingsSheet } from './SettingsSheet';
import { saveRound, saveSettings, listRounds } from '../storage';
import { makeRound } from '../games/testFixtures';

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
