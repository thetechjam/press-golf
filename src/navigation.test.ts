import { describe, it, expect } from 'vitest';
import { createNavigator, type HistoryLike, type NavEntry } from './navigation';

type View = 'home' | 'setup' | 'play' | 'results' | 'stats';
const VIEWS: readonly string[] = ['home', 'setup', 'play', 'results', 'stats'];
const isView = (v: unknown): v is View => typeof v === 'string' && VIEWS.includes(v);

/**
 * A history stack that traverses **asynchronously**, the way a browser does.
 *
 * This is the whole reason the navigation logic was pulled out of the
 * component. A DOM test environment dispatches popstate synchronously inside
 * `go()`, so the first tap has already landed before the second is delivered
 * and the double-tap race cannot happen at all — a test written against it
 * passes whether the guard is there or not, which is worse than no test.
 *
 * Here `go()` only queues the traversal. Nothing moves until `settle()` is
 * called, so a second tap can arrive mid-flight exactly as it does on a phone.
 */
class FakeHistory implements HistoryLike {
  entries: unknown[] = [null];
  index = 0;
  /** Every go() delta, in order — the record the guards are really about. */
  goCalls: number[] = [];
  private pending: number[] = [];
  private onPop: (state: unknown) => void = () => {};

  listen(fn: (state: unknown) => void) {
    this.onPop = fn;
  }

  get state() {
    return this.entries[this.index];
  }

  pushState(state: unknown) {
    // A push truncates anything ahead of the pointer, as a browser does.
    this.entries = [...this.entries.slice(0, this.index + 1), state];
    this.index = this.entries.length - 1;
  }

  replaceState(state: unknown) {
    this.entries[this.index] = state;
  }

  go(delta: number) {
    this.goCalls.push(delta);
    this.pending.push(delta);
  }

  /** Applies every queued traversal, firing one popstate per go() that moved. */
  settle() {
    const queued = this.pending;
    this.pending = [];
    for (const delta of queued) {
      const target = this.index + delta;
      // A browser clamps at the ends of the session stack; going past the
      // bottom is what leaves an installed PWA.
      const clamped = Math.max(0, Math.min(this.entries.length - 1, target));
      this.overshot ||= target < 0;
      if (clamped === this.index) continue;
      this.index = clamped;
      this.onPop(this.state);
    }
  }

  /** True if any traversal tried to go below the bottom of the stack. */
  overshot = false;
}

/** A navigator wired to a fresh fake history, with the view it last painted. */
function setup() {
  const history = new FakeHistory();
  const painted: View[] = [];
  const nav = createNavigator<View>({
    history,
    home: 'home',
    isView,
    onView: (v) => painted.push(v),
  });
  history.listen(nav.handlePop);
  nav.start();
  return { history, nav, painted, view: () => painted[painted.length - 1] ?? 'home' };
}

describe('start', () => {
  it('seeds the bottom entry so it carries a view', () => {
    const { history } = setup();
    expect(history.state).toEqual({ view: 'home', depth: 0 });
  });
});

describe('goTo', () => {
  it('pushes an entry carrying the view and its depth', () => {
    const { history, nav, view } = setup();
    nav.goTo('setup');
    expect(view()).toBe('setup');
    expect(history.state).toEqual({ view: 'setup', depth: 1 });
  });

  it('deepens with each screen', () => {
    const { history, nav } = setup();
    nav.goTo('results');
    nav.goTo('play');
    expect(history.state).toEqual({ view: 'play', depth: 2 });
  });

  it('ignores a repeat of the view already showing', () => {
    const { history, nav, painted } = setup();
    nav.goTo('setup');
    nav.goTo('setup');
    expect(history.state).toEqual({ view: 'setup', depth: 1 });
    expect(painted).toEqual(['setup']);
  });

  it('collapses every pushed entry in one jump when going home', () => {
    const { history, nav, view } = setup();
    nav.goTo('results');
    nav.goTo('play');

    nav.goTo('home');
    expect(history.goCalls).toEqual([-2]);
    // Nothing is painted until the traversal lands: changing the view while
    // history.state still says 'play' is the desync that let the back button
    // resurrect a screen already left.
    expect(view()).toBe('play');

    history.settle();
    expect(view()).toBe('home');
    expect(history.state).toEqual({ view: 'home', depth: 0 });
  });

  it('leaves nothing above the bottom entry to go back into', () => {
    const { history, nav, view } = setup();
    nav.goTo('results');
    nav.goTo('play');
    nav.goTo('home');
    history.settle();

    // The back gesture from here must not re-enter the round.
    history.go(-1);
    history.settle();
    expect(view()).toBe('home');
  });

  it('resyncs the depth from the entry rather than counting pops', () => {
    const { history, nav } = setup();
    nav.goTo('results');
    nav.goTo('play');
    nav.goTo('home');
    history.settle();

    // One popstate landed after a two-entry jump. Had the depth been
    // decremented once per pop it would sit at 1 now, and the next screen
    // would claim depth 2 — making every later collapse overshoot by one.
    nav.goTo('setup');
    expect(history.state).toEqual({ view: 'setup', depth: 1 });
  });

  it('just resyncs when home is requested with nothing pushed', () => {
    const { history, nav, view } = setup();
    nav.goTo('home');
    expect(history.goCalls).toEqual([]);
    expect(view()).toBe('home');
    expect(history.state).toEqual({ view: 'home', depth: 0 });
  });
});

describe('the double-tap on an exit control', () => {
  // The race the DOM cannot stage: on a phone, go() only queues the traversal,
  // so a second tap lands while the first is still in flight.
  it('issues one jump, not two', () => {
    const { history, nav } = setup();
    nav.goTo('results');
    nav.goTo('play');

    nav.goTo('home');
    nav.goTo('home'); // the repeat tap, before anything has moved

    expect(history.goCalls).toEqual([-2]);
  });

  it('does not carry the user off the bottom of the stack', () => {
    const { history, nav, view } = setup();
    nav.goTo('results');
    nav.goTo('play');

    nav.goTo('home');
    nav.goTo('home');
    history.settle();

    expect(history.overshot).toBe(false);
    expect(view()).toBe('home');
    expect(history.state).toEqual({ view: 'home', depth: 0 });
  });

  it('accepts a fresh collapse once the first one has landed', () => {
    const { history, nav } = setup();
    nav.goTo('results');
    nav.goTo('home');
    history.settle();

    nav.goTo('setup');
    nav.goTo('home');
    expect(history.goCalls).toEqual([-1, -1]);
  });
});

describe('handlePop', () => {
  it('restores the view and depth the entry carries', () => {
    const { history, nav, view } = setup();
    nav.goTo('setup');
    nav.goTo('play');

    history.go(-1);
    history.settle();
    expect(view()).toBe('setup');

    // Only what the navigator does from here is of interest — the back gesture
    // above went through the same recorder.
    history.goCalls.length = 0;

    // Depth came back as 1, so going home from here is a single-entry jump.
    nav.goTo('home');
    expect(history.goCalls).toEqual([-1]);
  });

  it('falls back to home for an entry this build does not recognise', () => {
    const { nav, view } = setup();
    nav.goTo('setup');
    // A build that has since dropped a screen, or an entry from another page.
    nav.handlePop({ view: 'seance', depth: 4 } satisfies NavEntry);
    expect(view()).toBe('home');
  });

  it('falls back to home for an entry with no state at all', () => {
    const { nav, view } = setup();
    nav.goTo('setup');
    nav.handlePop(null);
    expect(view()).toBe('home');
  });

  it('treats a recognised view with a missing depth as the bottom entry', () => {
    const { history, nav } = setup();
    nav.goTo('setup');
    nav.handlePop({ view: 'play' });
    // Depth read as 0, so home needs no jump — better than trusting a stale
    // count and jumping somewhere arbitrary.
    nav.goTo('home');
    expect(history.goCalls).toEqual([]);
  });
});
