// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Round } from './types';
import { refuseStorageKey } from './testQuota';
import { setBackend, snapshotBackend } from './kv';
import { getSettings, skipKeepPromptIfRoundsExist } from './storage';

/**
 * Navigation and the hardware back button.
 *
 * `App.tsx` keeps its own depth counter alongside the history stack so that
 * going Home from three screens deep collapses the entries it pushed instead
 * of leaving them behind for the back gesture to resurrect. It is the most
 * subtle code in the app — heavily commented precisely because it is — and
 * until now the only thing testing it was somebody holding a phone.
 *
 * happy-dom implements pushState, go() and popstate, so the back gesture can
 * be driven here rather than mocked — but it pops synchronously inside go(),
 * where a browser queues the traversal. Anything that turns on that timing
 * (a second tap arriving mid-flight) is tested in navigation.test.ts instead;
 * what these tests cover is that the screens are wired to it correctly.
 */

const hs = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));

const round = (over: Partial<Round> = {}): Round => ({
  id: 'r1',
  course: 'Test Links',
  date: '2026-09-11',
  createdAt: 1,
  updatedAt: 2,
  players: [
    { id: 'p1', name: 'Al' },
    { id: 'p2', name: 'Bo' },
  ],
  holes: hs,
  games: ['skins'],
  options: {
    useNet: false,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: {},
  },
  scores: { 1: { p1: 4, p2: 5 } },
  wolf: {},
  status: 'in_progress',
  ...over,
});

const seed = (rounds: Round[]) =>
  localStorage.setItem('press.rounds.v1', JSON.stringify(rounds));

/** Drives the browser's back gesture and waits for React to settle. */
async function goBack() {
  history.back();
  // happy-dom dispatches popstate asynchronously, as a browser does.
  await waitFor(() => expect(true).toBe(true));
  await new Promise((r) => setTimeout(r, 10));
}

const onHome = () => screen.queryByRole('heading', { name: 'Press' }) !== null;

/**
 * Two clicks in one tick, the way a fast double-tap reaches the handler.
 *
 * Raw dispatch rather than `fireEvent`, deliberately: fireEvent wraps each
 * call in `act()`, which flushes React between the two — the first click then
 * unmounts the screen, the second lands on a detached node, and React never
 * sees it. That makes the repeat a no-op and any test built on it vacuous,
 * which is exactly what happened here before the guards were mutation-tested.
 */
function doubleTap(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** Runs `body` while counting the popstate events the browser fires. */
async function countingPops(body: () => Promise<void> | void): Promise<number> {
  let pops = 0;
  const count = () => (pops += 1);
  window.addEventListener('popstate', count);
  await body();
  await new Promise((r) => setTimeout(r, 30));
  window.removeEventListener('popstate', count);
  return pops;
}

beforeEach(() => {
  localStorage.clear();
  // Each test starts from a clean entry so depth counting starts at zero.
  history.replaceState(null, '', '/');
});

afterEach(cleanup);

describe('App navigation', () => {
  it('opens on Home', () => {
    render(<App />);
    expect(onHome()).toBe(true);
  });

  it('pushes an entry on the way in, and the back gesture returns Home', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Start New Round' }));
    expect(await screen.findByRole('heading', { name: 'New Round' })).toBeTruthy();
    expect(history.state).toMatchObject({ view: 'setup', depth: 1 });

    await goBack();
    expect(onHome()).toBe(true);
  });

  it('takes a saved round straight to Play, and back out again', async () => {
    seed([round()]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Test Links'));
    expect(await screen.findByRole('button', { name: 'Finish' })).toBeTruthy();

    await goBack();
    expect(onHome()).toBe(true);
  });

  it('collapses in a single jump, not one pop per entry', async () => {
    // A finished round opens on Results, and Results can go back to Play.
    // That step replaces the Results entry rather than stacking on it (a
    // Finish/Back cycle used to add two entries each time), so the app is one
    // deep when the Home button is used.
    //
    // The depth counter is resynced from the state object each popstate rather
    // than decremented, because one history.go(-2) fires exactly one popstate
    // landing on the target entry. Counting the pops proves that is still what
    // happens: a blind decrement would undercount and leave the app convinced
    // it was shallower than it is.
    seed([round({ status: 'finished' })]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Test Links'));
    expect(await screen.findByRole('heading', { name: 'Results' })).toBeTruthy();
    expect(history.state).toMatchObject({ view: 'results', depth: 1 });

    await user.click(screen.getByRole('button', { name: 'Back to the scorecard' }));
    expect(await screen.findByRole('button', { name: 'Finish' })).toBeTruthy();
    expect(history.state).toMatchObject({ view: 'play', depth: 1 });

    const pops = await countingPops(async () => {
      await user.click(screen.getByRole('button', { name: 'Back to rounds' }));
      await waitFor(() => expect(onHome()).toBe(true));
    });

    expect(pops).toBe(1);
    expect(history.state).toMatchObject({ view: 'home', depth: 0 });

    // And the counter really is back at zero, not merely the history state:
    // the next screen pushed must be depth 1. Decrementing the counter by one
    // per pop instead of reading it back would leave it at 1 here, and every
    // later collapse would then jump one entry too far.
    await user.click(screen.getByRole('button', { name: 'Start New Round' }));
    await screen.findByRole('heading', { name: 'New Round' });
    expect(history.state).toMatchObject({ view: 'setup', depth: 1 });
  });

  it('will not let the back gesture resurrect a screen already left', async () => {
    // The bug the depth counter exists for: painting Home without collapsing
    // the stack left the entries behind, and one press of back put the user
    // back inside a round they had deliberately exited.
    seed([round({ status: 'finished' })]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Test Links'));
    await screen.findByRole('heading', { name: 'Results' });
    await user.click(screen.getByRole('button', { name: 'Back to the scorecard' }));
    await screen.findByRole('button', { name: 'Finish' });
    await user.click(screen.getByRole('button', { name: 'Back to rounds' }));
    await waitFor(() => expect(onHome()).toBe(true));

    await goBack();
    expect(onHome()).toBe(true);
  });

  it('will not overshoot the app when an exit control is double-tapped', async () => {
    // Two go() calls for one collapse would jump past the bottom entry and out
    // of the app entirely — on a phone, straight out of the installed PWA.
    seed([round({ status: 'finished' })]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Test Links'));
    await screen.findByRole('heading', { name: 'Results' });
    await user.click(screen.getByRole('button', { name: 'Back to the scorecard' }));
    const exit = await screen.findByRole('button', { name: 'Back to rounds' });

    // An end-to-end check that the wiring holds, not the guard itself: happy-dom
    // dispatches popstate synchronously inside go(), so the first tap has
    // already landed and unmounted this screen before the second is delivered,
    // and the race cannot occur here at all. The guard is covered properly in
    // navigation.test.ts, against a history double that traverses
    // asynchronously the way a browser does.
    const go = vi.spyOn(history, 'go');
    doubleTap(exit);
    await waitFor(() => expect(onHome()).toBe(true));

    expect(go).toHaveBeenCalledWith(-1);
    go.mockRestore();

    expect(history.state).toMatchObject({ view: 'home', depth: 0 });
  });

  it('ignores a double-tap, so one back press is enough to undo it', async () => {
    render(<App />);

    const start = screen.getByRole('button', { name: 'Start New Round' });
    // Both in one tick, before React unmounts Home — awaiting the first click
    // would flush the re-render and detach the node, and a detached node's
    // click never reaches React at all, which makes the repeat a no-op and the
    // test vacuous.
    doubleTap(start);
    await screen.findByRole('heading', { name: 'New Round' });

    // One entry, not two: a second push would need two back presses to undo.
    expect(history.state).toMatchObject({ view: 'setup', depth: 1 });
    await goBack();
    expect(onHome()).toBe(true);
  });
});

describe('App — Stats route', () => {
  it('is offered once a round counts, and returns Home', async () => {
    seed([round({ status: 'finished', scores: Object.fromEntries(hs.map((h) => [h.number, { p1: 4, p2: 5 }])) })]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Stats/ }));
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeTruthy();

    await goBack();
    expect(onHome()).toBe(true);
  });

  it('is not offered when no round has been finished', () => {
    seed([round()]); // in progress, one hole scored
    render(<App />);
    expect(screen.queryByRole('button', { name: /Stats/ })).toBeNull();
  });
});

/**
 * The Play screen's chrome, which is markup rather than pixels.
 *
 * Its foot was a bare block for as long as it existed, so the CTA sized to its
 * own label — 183px of a 358px row, left-aligned, on the screen whose button
 * gets pressed eighteen times a round — and the Board tab's money rows were
 * sliced through the middle by an opaque edge with text peeking out beside it.
 * Joining `.screen-foot` fixes both, and is why that class is what to assert.
 *
 * The toolbar's three icon toggles are grouped for the same kind of reason:
 * ungrouped, whichever fell off the line at 360px was stranded alone on a
 * second row, and the tabs then expanded into the space it left so it could
 * never wrap back.
 */
describe('Play chrome', () => {
  const openPlay = async (user: ReturnType<typeof userEvent.setup>) => {
    seed([round()]);
    render(<App />);
    await user.click(screen.getByText('Test Links'));
    await waitFor(() => expect(document.querySelector('.screen.play')).not.toBeNull());
  };

  it('puts the CTA in the app’s pinned bar, not loose in the screen', async () => {
    const user = userEvent.setup();
    await openPlay(user);
    const cta = [...document.querySelectorAll<HTMLElement>('.screen.play button')].find((b) =>
      /Next Hole|Finish Round/i.test(b.textContent ?? '')
    )!;
    expect(cta).toBeTruthy();
    const foot = cta.closest('.screen-foot');
    expect(foot).not.toBeNull();
    // And it is the screen's own last child, so it has a floor to reach.
    expect(document.querySelector('.screen.play > .screen-foot')).toBe(foot);
  });

  it('carries three tabs and Settings, and nothing else', async () => {
    // Glare and Keep screen awake used to sit here as well. Both are in the
    // sheet the gear opens, so the row was spending two icons to save a tap on
    // settings that get set once and left alone — on the screen with the least
    // width to spare in the app.
    const user = userEvent.setup();
    await openPlay(user);
    const row = document.querySelector('.view-toggle')!;
    expect([...row.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Hole',
      'Board',
      'Card',
      '',
    ]);
    const gear = screen.getByRole('button', { name: 'Settings' });
    expect(gear.closest('.view-toggle')).toBe(row);
    // And wearing the class that makes it a 44px target rather than shrinking
    // to its glyph — it is the grid's `auto` column, so its own width is the
    // width the row is built around.
    expect(gear.classList.contains('view-tool')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Glare mode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep screen awake' })).toBeNull();
  });
});

/**
 * The Play toolbar's two groups.
 *
 * Ungrouped, the three tabs were `flex: 1` — a flex-basis of 0 — and WebKit
 * decides where to break a flex line from that basis, so three tabs that could
 * not actually shrink below "BOARD" never forced a wrap and the Settings gear
 * hung off the right edge of an iPhone. Grouping them gives the line a real
 * width to break on; the CSS half of that is pinned in `overscroll.test.ts`.
 */
describe('Play toolbar groups', () => {
  it('keeps the view tabs in one group and the toggles in the other', async () => {
    const user = userEvent.setup();
    seed([round()]);
    render(<App />);
    await user.click(screen.getByText('Test Links'));
    await waitFor(() => expect(document.querySelector('.screen.play')).not.toBeNull());

    const tabs = document.querySelector('.view-tabs')!;
    expect(tabs).not.toBeNull();
    for (const name of ['Hole', 'Board', 'Card']) {
      expect(screen.getByRole('button', { name }).closest('.view-tabs')).toBe(tabs);
    }
    // And no tab is loose in the row, which is what made the row unbreakable.
    expect(document.querySelectorAll('.view-toggle > .seg-btn')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Settings' }).closest('.view-tabs')).toBeNull();
  });
});

/**
 * Starting a round writes it. A full phone used to ignore the false return
 * and open the card as if the round were stored.
 */
describe('a round that cannot be saved', () => {
  /** Throws on the rounds key only, the way a full phone refuses one write. */
  function refuseRounds() {
    return refuseStorageKey('press.rounds.v1');
  }

  it('shows the banner when New Round cannot be stored, and keeps the card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Start New Round' }));
    const names = document.querySelectorAll<HTMLInputElement>('input[placeholder^="Player"]');
    await user.type(names[0], 'Al');
    await user.type(names[1], 'Bo');

    const restore = refuseRounds();
    try {
      await user.click(screen.getByRole('button', { name: /Start Round/i }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/Not saved/);
      // The round is on screen, not discarded with the failed write.
      expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();
      expect(screen.getByText('Al')).toBeTruthy();
      expect(localStorage.getItem('press.rounds.v1')).toBeNull();
    } finally {
      restore();
    }
  });

  it('gives the real reason when the rounds could not be read at startup', async () => {
    const user = userEvent.setup();
    const previous = setBackend(snapshotBackend({}, () => {}, () => {}, ['press.rounds.v1']));
    try {
      render(<App />);
      await user.click(screen.getByRole('button', { name: 'Start New Round' }));
      const names = document.querySelectorAll<HTMLInputElement>('input[placeholder^="Player"]');
      await user.type(names[0], 'Al');
      await user.type(names[1], 'Bo');
      await user.click(screen.getByRole('button', { name: /Start Round/i }));
      const banner = (await screen.findByRole('alert')).textContent ?? '';
      expect(banner).toMatch(/Not saved/);
      expect(banner).toMatch(/couldn’t read your saved rounds/);
      // Deleting rounds to make room would not help, so it is not suggested.
      expect(banner).not.toMatch(/storage is full|make room/);
    } finally {
      setBackend(previous);
    }
  });

  it('shows the banner when a league night cannot be stored, and keeps the card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Golf League' }));
    await screen.findByRole('heading', { name: 'Golf League' });

    const names = ['Al', 'Bo', 'Cy', 'Di'];
    const fields = document.querySelectorAll<HTMLInputElement>('.player-name');
    for (const [i, field] of [...fields].entries()) await user.type(field, names[i]);
    for (const [i, field] of screen.getAllByPlaceholderText('HCP').entries()) {
      await user.type(field, String([4, 9, 6, 12][i]));
    }

    const restore = refuseRounds();
    try {
      await user.click(screen.getByRole('button', { name: /Start League Round/ }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/Not saved/);
      expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();
      expect(screen.getByText('Al')).toBeTruthy();
      expect(localStorage.getItem('press.rounds.v1')).toBeNull();
    } finally {
      restore();
    }
  });
});

/**
 * Safari drops a site's data after seven days unless the app is on the home
 * screen. The ask waits until a round is actually finished, and it waits once.
 */
describe('the prompt after the first finished round', () => {
  const finished = () =>
    round({
      status: 'in_progress',
      scores: Object.fromEntries(hs.map((h) => [h.number, { p1: 4, p2: 5 }])),
    });

  it('asks to back up and to add Press to the home screen, and only once', async () => {
    seed([finished()]);
    const user = userEvent.setup();
    const view = render(<App />);

    // Home's standing hint mentions the seven days too. The prompt is the one
    // with the backup button, and it waits until a round is finished.
    expect(screen.queryByRole('button', { name: 'Save a backup' })).toBeNull();

    await user.click(screen.getByText('Test Links'));
    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    expect(await screen.findByRole('heading', { name: 'Results' })).toBeTruthy();

    const prompt = screen.getByText('Keep these rounds.').parentElement!;
    expect(prompt.textContent).toMatch(/seven days/);
    expect(prompt.textContent).toMatch(/home screen/);
    expect(screen.getByRole('button', { name: 'Save a backup' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Don.t ask again/ }));
    expect(screen.queryByText('Keep these rounds.')).toBeNull();
    expect(getSettings().firstFinishPromptDismissed).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.queryByRole('button', { name: 'Save a backup' })).toBeNull();

    view.unmount();
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Save a backup' })).toBeNull();
  });

  it('saves a backup from the prompt, then stops asking', async () => {
    seed([round({ status: 'finished' })]);
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Save a backup' }));
    expect(await screen.findByText('Backup saved.')).toBeTruthy();
    // The backup was the answer: it is remembered, and the way out says so.
    expect(getSettings().firstFinishPromptDismissed).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save a backup' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Keep these rounds.')).toBeNull();

    view.unmount();
    render(<App />);
    expect(screen.queryByText('Keep these rounds.')).toBeNull();
  });

  it('still closes when the dismissal cannot be stored', async () => {
    seed([round({ status: 'finished' })]);
    const user = userEvent.setup();
    render(<App />);
    const restore = refuseStorageKey('press.settings.v1');
    try {
      await user.click(screen.getByRole('button', { name: /Don.t ask again/ }));
      expect(screen.queryByText('Keep these rounds.')).toBeNull();
    } finally {
      restore();
    }
    expect(getSettings().firstFinishPromptDismissed).toBe(false);
  });

  it('is still due after relaunch for a new user who never saved a setting', async () => {
    // First launch on a fresh phone: no settings stored at all.
    skipKeepPromptIfRoundsExist();
    seed([finished()]);
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(screen.getByText('Test Links'));
    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('Keep these rounds.')).toBeTruthy();

    // Closed without answering, then opened again.
    view.unmount();
    skipKeepPromptIfRoundsExist();
    render(<App />);
    expect(screen.getByText('Keep these rounds.')).toBeTruthy();
    expect(getSettings().firstFinishPromptDismissed).toBe(false);
  });
});
