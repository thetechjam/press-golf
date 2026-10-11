// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * The last line of defence. A render throw must leave a screen a person can
 * act on, not a blank page — and the backup route must still be on it.
 */

function Broken({ when }: { when: boolean }) {
  if (when) throw new Error('scores[undefined] is not iterable');
  return <p>All fine</p>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children while nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <Broken when={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('All fine')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Press hit a snag' })).toBeNull();
  });

  it('shows the error, a reload, and the backup rows when a child throws', async () => {
    // React reports the caught error on console.error; that is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const reload = vi.fn();
    render(
      <ErrorBoundary onReload={reload}>
        <Broken when={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('heading', { name: 'Press hit a snag' })).toBeTruthy();
    // The message, verbatim, so a bug report can carry it.
    expect(screen.getByText('scores[undefined] is not iterable')).toBeTruthy();

    // The route to a backup is on the screen itself, not behind a sheet that
    // may be what broke.
    expect(screen.getByRole('button', { name: /Back up your rounds/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Restore from a backup/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Reload Press' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('takes the splash down so the screen is not hidden under it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const splash = document.createElement('div');
    splash.id = 'splash';
    document.body.appendChild(splash);
    render(
      <ErrorBoundary onReload={() => {}}>
        <Broken when={true} />
      </ErrorBoundary>
    );
    // dismissSplash either fades it (adds .done) or removes it outright.
    const left = document.getElementById('splash');
    expect(left === null || left.classList.contains('done')).toBe(true);
  });
});
