// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MovedNotice } from './MovedNotice';
import { resetMovedNoticeForTests } from '../oldHost';
import { Home } from '../screens/Home';
import { saveRound, listRounds } from '../storage';
import { makeRound } from '../games/testFixtures';
import * as backup from '../backup';

/**
 * The notice the old pressgolf.netlify.app address shows. Where it shows is
 * `oldHost.test.ts`'s; what is pinned here is what it says, that the backup it
 * offers is the app's own, and that "Not now" lasts the visit and no longer.
 */

beforeEach(() => {
  localStorage.clear();
  resetMovedNoticeForTests();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const title = () => screen.queryByText('Trunk has moved to trunk.golf.');

describe('MovedNotice', () => {
  it('says where Trunk went and how to bring the rounds along', () => {
    saveRound({ ...makeRound(), id: 'r1' });
    render(<MovedNotice show />);
    expect(screen.getByRole('region', { name: 'Trunk has moved to trunk.golf.' })).toBeTruthy();
    expect(screen.getByText(/don’t follow Trunk/)).toBeTruthy();
    expect(screen.getByText('Save a backup here.')).toBeTruthy();
    expect(screen.getByText(/Restore from a backup/)).toBeTruthy();
    expect(screen.getByText(/nothing here is deleted/)).toBeTruthy();

    const open = screen.getByRole('link', { name: 'Open trunk.golf' });
    expect(open.getAttribute('href')).toBe('https://trunk.golf/');
    expect(screen.getByRole('button', { name: 'Save a backup' })).toBeTruthy();
  });

  it('skips the backup when nothing is saved here', () => {
    render(<MovedNotice show />);
    expect(title()).toBeTruthy();
    expect(screen.getByText(/Nothing is saved at this address yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save a backup' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open trunk.golf' })).toBeTruthy();
  });

  it('saves with the app’s own backup, and then says what is next', async () => {
    saveRound({ ...makeRound(), id: 'r1' });
    const offer = vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: true });
    render(<MovedNotice show />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Backup saved/));
    expect(offer).toHaveBeenCalledOnce();
    // The notice stays: the rounds have not reached trunk.golf yet.
    expect(title()).toBeTruthy();
  });

  it('says so when the backup could not be saved, and says nothing when it was cancelled', async () => {
    saveRound({ ...makeRound(), id: 'r1' });
    const offer = vi.spyOn(backup, 'offerBackup').mockResolvedValue({ ok: false, aborted: true });
    render(<MovedNotice show />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
    await waitFor(() => expect(offer).toHaveBeenCalledOnce());
    expect(screen.queryByRole('status')).toBeNull();

    offer.mockResolvedValue({ ok: false, aborted: false });
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe("That backup couldn't be saved."));
  });

  it('"Not now" hides it for this visit, stores nothing, and touches no round', () => {
    saveRound({ ...makeRound(), id: 'r1' });
    const before = { ...localStorage };
    const first = render(<MovedNotice show />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(title()).toBeNull();
    first.unmount();

    // Back to Home later in the same visit: still hidden.
    render(<MovedNotice show />);
    expect(title()).toBeNull();
    expect({ ...localStorage }).toEqual(before);
    expect(listRounds()).toHaveLength(1);

    // The next launch is a fresh module; it asks again.
    cleanup();
    resetMovedNoticeForTests();
    render(<MovedNotice show />);
    expect(title()).toBeTruthy();
  });

  it('renders nothing when not on the old address', () => {
    const { container } = render(<MovedNotice show={false} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('Home', () => {
  const home = () => (
    <Home
      onNew={() => {}}
      onNewLeague={() => {}}
      onResume={() => {}}
      onViewResults={() => {}}
      onStats={() => {}}
      onHistory={() => {}}
    />
  );

  it('carries the notice on the old address', () => {
    vi.stubGlobal('location', { ...window.location, hostname: 'pressgolf.netlify.app' });
    render(home());
    expect(title()).toBeTruthy();
  });

  it('does not carry it anywhere else', () => {
    for (const hostname of ['trunk.golf', 'localhost', 'notpressgolf.netlify.app']) {
      vi.stubGlobal('location', { ...window.location, hostname });
      render(home());
      expect(title(), hostname).toBeNull();
      cleanup();
    }
  });
});
