// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { startApp } from './startup';
import { StartupError } from './components/StartupError';
import { makeRound } from './games/testFixtures';

/**
 * Everything `main.tsx` does before the first render runs outside the error
 * boundary, so a throw there used to be a blank page with no way out.
 */

let container: HTMLElement;
let root: Root | undefined;
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  cleanup();
  container.remove();
  vi.restoreAllMocks();
});

describe('startApp', () => {
  it('starts on a full phone, where every write is refused', async () => {
    // A phone with finished rounds and no stored prompt flag: the launch
    // migration wants to write, and storage says no.
    localStorage.setItem('press.rounds.v1', JSON.stringify([makeRound({ status: 'finished' })]));
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      await act(async () => {
        root = await startApp(container, async () => false);
      });
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Press' })).toBeTruthy());
      expect(screen.queryByRole('heading', { name: /couldn’t start/ })).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('shows an error screen, not a blank page, when storage cannot be opened', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      root = await startApp(container, () =>
        Promise.reject(new Error('Preferences bridge unavailable'))
      );
    });
    expect(screen.getByRole('heading', { name: 'Press couldn’t start' })).toBeTruthy();
    expect(screen.getByText('Preferences bridge unavailable')).toBeTruthy();
    // The app itself is not rendered over storage it could not open.
    expect(screen.queryByRole('heading', { name: 'Press' })).toBeNull();
  });
});

describe('StartupError', () => {
  it('offers a reload', async () => {
    const reload = vi.fn();
    const user = userEvent.setup();
    render(<StartupError error={new Error('nope')} onReload={reload} />);
    await user.click(screen.getByRole('button', { name: 'Reload Press' }));
    expect(reload).toHaveBeenCalledOnce();
  });
  it('does not blame storage for a failure that may be something else', () => {
    render(<StartupError error={new Error('matchMedia is not a function')} />);
    const copy = document.querySelector('.arriving-note')?.textContent ?? '';
    expect(copy).toMatch(/hit a problem while starting/);
    expect(copy).not.toMatch(/storage/);
  });
});
