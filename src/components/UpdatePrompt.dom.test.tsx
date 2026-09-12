// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

/**
 * Whether the app ever finds out there is a new build.
 *
 * The banner itself was never the problem: it appears the moment `needRefresh`
 * turns true. What was missing is anything that turns it true. Registration
 * checks once, on page load — and an installed app is resumed far more often
 * than it is loaded, because iOS suspends it rather than killing it. Tapping
 * the icon returns to the screen that was open, with no navigation and no
 * check, so a fix can sit on the server indefinitely while the phone shows the
 * old build and says nothing about it.
 *
 * That is not hypothetical: it is how a fix for a clipped toolbar came back
 * reported as "still clipped", from a screenshot that turned out to be
 * byte-identical to the one before it apart from the clock.
 */

const update = vi.fn(() => Promise.resolve());
const registration = { update } as unknown as ServiceWorkerRegistration;
let captured: ((url: string, r?: ServiceWorkerRegistration) => void) | undefined;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (opts?: {
    onRegisteredSW?: (url: string, r?: ServiceWorkerRegistration) => void;
  }) => {
    captured = opts?.onRegisteredSW;
    return {
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    };
  },
}));

const { UpdatePrompt } = await import('./UpdatePrompt');

/** Renders, then hands over the registration the way the plugin would. */
const mount = (props: { suppressed?: boolean } = {}) => {
  const out = render(<UpdatePrompt {...props} />);
  captured?.('/sw.js', registration);
  return out;
};

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  update.mockClear();
  captured = undefined;
  setVisibility('visible');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('finding out there is a new build', () => {
  it('asks again whenever the app comes back to the foreground', () => {
    mount();
    expect(update).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('asks on a timer, for the app left open all afternoon', () => {
    vi.useFakeTimers();
    mount();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('does not ask while the app is in the background', () => {
    mount();
    update.mockClear();
    setVisibility('hidden');
    expect(update).not.toHaveBeenCalled();
  });

  it('does not ask with no signal, which is where this app is used', () => {
    mount();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    setVisibility('visible');
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps checking while a round is being scored, even though the banner waits', () => {
    // The prompt is held back mid-round so a reload never costs somebody their
    // place. Finding the update is not the same as offering it: skip the check
    // too and the round ends with nothing found.
    mount({ suppressed: true });
    setVisibility('visible');
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.update-banner')).toBeNull();
  });

  it('stops asking once it is gone', () => {
    vi.useFakeTimers();
    const { unmount } = mount();
    unmount();
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    setVisibility('visible');
    expect(update).not.toHaveBeenCalled();
  });

  it('survives a registration that never arrives', () => {
    render(<UpdatePrompt />);
    // No onRegisteredSW callback fired — nothing to ask, and nothing thrown.
    expect(() => setVisibility('visible')).not.toThrow();
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
