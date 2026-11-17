// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsSheet } from './SettingsSheet';
import { FeedbackForm } from './FeedbackForm';
import { getSettings, saveSettings } from '../storage';
import { buildFeedback, enqueue, listQueue } from '../feedback';
import { setBackend, snapshotBackend } from '../kv';
import { refuseStorageKey } from '../testQuota';

/**
 * Settings and feedback writes the phone refuses. Each used to throw out of
 * its control; on native, a Settings toggle on a settings key Press could not
 * read at startup ended on the crash screen.
 */

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a Settings toggle the phone refuses', () => {
  it('takes effect for now and says it will not be remembered', () => {
    saveSettings({ glare: false });
    const restore = refuseStorageKey('press.settings.v1');
    try {
      render(<SettingsSheet onClose={() => {}} screen="home" />);
      const toggle = screen.getByRole('checkbox', { name: /Glare mode/ }) as HTMLInputElement;
      fireEvent.click(toggle);
      expect(toggle.checked).toBe(true);
      const alert = screen.getByRole('alert').textContent ?? '';
      expect(alert).toMatch(/won’t be remembered/);
      expect(alert).toMatch(/storage is full/);
    } finally {
      restore();
    }
    expect(getSettings().glare).toBe(false);
  });

  it('gives the real reason when settings could not be read at startup', () => {
    const previous = setBackend(snapshotBackend({}, () => {}, () => {}, ['press.settings.v1']));
    try {
      render(<SettingsSheet onClose={() => {}} screen="home" />);
      fireEvent.click(screen.getByRole('checkbox', { name: /Keep screen awake/ }));
      const alert = screen.getByRole('alert').textContent ?? '';
      expect(alert).toMatch(/couldn’t read/);
      expect(alert).not.toMatch(/storage is full/);
    } finally {
      setBackend(previous);
    }
  });
});

describe('a refused Settings change, then one that saves', () => {
  const dark = () => screen.getByRole('button', { name: 'Dark' });
  const awake = () => screen.getByRole('checkbox', { name: /Keep screen awake/ }) as HTMLInputElement;

  it('keeps the refused change on screen, and stores it with the next write that lands', () => {
    saveSettings({ theme: 'light', keepAwake: true });
    render(<SettingsSheet onClose={() => {}} screen="home" />);

    const restore = refuseStorageKey('press.settings.v1');
    try {
      fireEvent.click(dark());
    } finally {
      restore();
    }
    expect(dark().getAttribute('aria-pressed')).toBe('true');
    expect(getSettings().theme).toBe('light');

    // Storage works again; an unrelated toggle saves.
    fireEvent.click(awake());
    expect(awake().checked).toBe(false);
    // The theme did not snap back to what was stored…
    expect(dark().getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    // …and it is now remembered along with the toggle.
    expect(getSettings()).toMatchObject({ theme: 'dark', keepAwake: false });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps every refused change on screen, and the message, while storage still refuses', () => {
    saveSettings({ theme: 'light', keepAwake: true });
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    const restore = refuseStorageKey('press.settings.v1');
    try {
      fireEvent.click(dark());
      fireEvent.click(awake());
      expect(dark().getAttribute('aria-pressed')).toBe('true');
      expect(awake().checked).toBe(false);
      expect(screen.getByRole('alert').textContent).toMatch(/won’t be remembered/);
    } finally {
      restore();
    }
    expect(getSettings()).toMatchObject({ theme: 'light', keepAwake: true });
  });

  it('does not write back a reporter name the feedback view stored meanwhile', () => {
    saveSettings({ theme: 'light' });
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    const restore = refuseStorageKey('press.settings.v1');
    try {
      fireEvent.click(dark());
    } finally {
      restore();
    }
    // What the feedback form does when a report goes out.
    saveSettings({ reporterName: 'Al' });
    fireEvent.click(awake());
    expect(getSettings()).toMatchObject({ theme: 'dark', reporterName: 'Al' });
  });
});

describe('waiting reports the phone will not clear', () => {
  it('says so and keeps the count', () => {
    enqueue(
      buildFeedback(
        { kind: 'bug', reporter: '', message: 'hi', includeRound: false },
        { screen: 'home', version: '0', userAgent: 'ua', viewport: '1x1' }
      )
    );
    const original = Object.getPrototypeOf(localStorage).removeItem as Storage['removeItem'];
    vi.spyOn(localStorage, 'removeItem').mockImplementation((k) => {
      if (k === 'press.feedback.queue.v1') throw new DOMException('refused', 'SecurityError');
      return original.call(localStorage, k);
    });
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear waiting reports' }));
    expect(screen.getByRole('alert').textContent).toMatch(/weren’t cleared/);
    expect(screen.getByText('1 report waiting to send')).toBeTruthy();
  });
});

describe('a report the phone cannot queue', () => {
  const type = async () => {
    const user = userEvent.setup();
    render(<FeedbackForm screen="home" onBack={() => {}} />);
    await user.type(screen.getByRole('textbox', { name: 'What happened?' }), 'The 9th');
    return user;
  };

  it('is sent directly instead', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const restore = refuseStorageKey('press.feedback.queue.v1');
    try {
      const user = await type();
      await user.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Sent — thanks!'));
    } finally {
      restore();
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(listQueue()).toEqual([]);
  });

  it('keeps the message on screen when it cannot be sent either', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    const restore = refuseStorageKey('press.feedback.queue.v1');
    try {
      const user = await type();
      await user.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toMatch(/couldn't keep it/)
      );
    } finally {
      restore();
      vi.unstubAllGlobals();
    }
    expect((screen.getByRole('textbox', { name: 'What happened?' }) as HTMLTextAreaElement).value).toBe(
      'The 9th'
    );
  });
});
