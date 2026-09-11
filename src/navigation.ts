/**
 * Screen navigation over the browser history stack.
 *
 * Press is one page with no router, but it is installed as a PWA, so the
 * hardware back gesture has to mean "previous screen" and not "quit the app
 * mid-round". That takes a real history entry per screen, and a count of how
 * many entries the app has pushed so going Home can collapse exactly those and
 * no more.
 *
 * This lives outside the component because it is the most subtle code in the
 * app and a component cannot be asked the questions that matter: does a
 * double-tap issue one jump or two, while the first traversal is still in
 * flight? A DOM test environment answers that wrongly — happy-dom dispatches
 * popstate synchronously inside `go()`, so the race simply cannot occur there,
 * and a test written against it passes whether the guard exists or not. With
 * the logic here, `navigation.test.ts` drives a history double that models the
 * real thing: traversal is asynchronous, and a second tap can land first.
 */

export interface HistoryLike {
  go(delta: number): void;
  pushState(state: unknown, unused: string): void;
  replaceState(state: unknown, unused: string): void;
}

/** What each history entry carries, so a pop can restore the screen exactly. */
export interface NavEntry {
  view: string;
  depth: number;
}

export interface NavigatorOptions<V extends string> {
  history: HistoryLike;
  /** The view to fall back to for an entry this build doesn't recognise. */
  home: V;
  isView: (v: unknown) => v is V;
  /** Called whenever the visible screen should change. */
  onView: (view: V) => void;
}

export interface Navigator<V extends string> {
  /** Seeds the bottom entry so it carries a view. Call once, on mount. */
  start(): void;
  goTo(view: V): void;
  /** Feed it `event.state` from a popstate listener. */
  handlePop(state: unknown): void;
}

export function createNavigator<V extends string>({
  history,
  home,
  isView,
  onView,
}: NavigatorOptions<V>): Navigator<V> {
  // Mirrors the visible view synchronously. React state is batched, so a rapid
  // repeat call in the same tick would still see the pre-update value if the
  // guard below read the component's state — this cannot lag.
  let view: V = home;
  // How many entries have been pushed above the seeded bottom entry (home,
  // depth 0). Every pushed entry carries its own depth, so a pop can resync
  // exactly — including when goTo(home) collapses several entries in a single
  // go() jump, which fires exactly one popstate landing directly on the target
  // rather than one per skipped entry. A blind decrement would undercount.
  let depth = 0;
  // True while a collapse is in flight: the go() call is issued, its popstate
  // not yet observed. Without this, a rapid double-tap on an exit or cancel
  // control issues a second, overshooting go() before the first one lands —
  // carrying the user off the bottom of the app's own stack and, in an
  // installed PWA, out of the app entirely.
  let collapsePending = false;

  const start = () => {
    history.replaceState({ view: home, depth: 0 } satisfies NavEntry, '');
    view = home;
    depth = 0;
    collapsePending = false;
  };

  const handlePop = (state: unknown) => {
    const entry = state as Partial<NavEntry> | null;
    const next = isView(entry?.view) ? entry.view : home;
    view = next;
    depth = typeof entry?.depth === 'number' ? entry.depth : 0;
    collapsePending = false;
    onView(next);
  };

  const goTo = (next: V) => {
    // Guard against a double-push (or double-pop) on a repeated transition to
    // the same view — a fast double-tap firing the handler twice.
    if (next === view) return;

    if (next === home) {
      if (collapsePending) return;
      if (depth > 0) {
        collapsePending = true;
        // Deliberately not setting the view here: let the pop handler land us
        // on the seeded bottom entry and change the screen from there. Setting
        // it directly leaves the view and history.state disagreeing, which is
        // exactly what let a stale entry be resurrected by the back button.
        history.go(-depth);
      } else {
        // Nothing pushed above us, or the state was corrupted — already home.
        // Resync directly so nothing is left stale.
        history.replaceState({ view: home, depth: 0 } satisfies NavEntry, '');
        view = home;
        onView(home);
      }
      return;
    }

    view = next;
    depth += 1;
    onView(next);
    history.pushState({ view: next, depth } satisfies NavEntry, '');
  };

  return { start, goTo, handlePop };
}
