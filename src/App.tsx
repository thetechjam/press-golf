import { useState, useEffect, useRef } from 'react';
import type { Round } from './types';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { LeagueSetup } from './screens/LeagueSetup';
import { Play } from './screens/Play';
import { Results } from './screens/Results';
import { saveRound } from './storage';
import { UpdatePrompt } from './components/UpdatePrompt';

const VIEWS = ['home', 'setup', 'leagueSetup', 'play', 'results'] as const;
type View = (typeof VIEWS)[number];

const isView = (v: unknown): v is View =>
  typeof v === 'string' && (VIEWS as readonly string[]).includes(v);

export default function App() {
  const [view, setView] = useState<View>('home');
  const [round, setRound] = useState<Round | null>(null);
  // Mirrors `view` synchronously for goTo's own guard check. React state is
  // batched, so a rapid repeat call in the same tick would still see the
  // pre-update value if we read `view` itself here — the ref can't lag.
  const viewRef = useRef<View>('home');
  // How many entries we've pushed above the seeded bottom entry (home, depth
  // 0). Every pushed entry carries its own depth in its state object, so
  // onPop can always resync exactly — including when goTo('home') collapses
  // several entries in a single history.go() jump (confirmed empirically:
  // that fires exactly one popstate, landing directly on the target entry,
  // not once per skipped entry — so a blind decrement here would undercount).
  const depthRef = useRef(0);
  // True while a goTo('home') collapse is in flight (go() call issued, its
  // popstate not yet observed) — guards against a rapid double-tap on an
  // exit/cancel control issuing a second, overshooting go() before the first
  // one lands.
  const homeCollapsePendingRef = useRef(false);

  // Without this, the Android back gesture exits an installed PWA mid-round.
  useEffect(() => {
    // Seed the initial entry so the bottom-of-stack entry carries a view.
    window.history.replaceState({ view: 'home', depth: 0 }, '');

    const onPop = (e: PopStateEvent) => {
      const state = e.state as { view?: unknown; depth?: unknown } | null;
      const v = state?.view;
      const d = state?.depth;
      const next = isView(v) ? v : 'home';
      viewRef.current = next;
      setView(next);
      depthRef.current = typeof d === 'number' ? d : 0;
      homeCollapsePendingRef.current = false;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goTo = (next: View) => {
    // Guard against double-push (or double-pop) on a repeated transition to
    // the same view — e.g. a fast double-tap firing the handler twice.
    if (next === viewRef.current) return;

    if (next === 'home') {
      if (homeCollapsePendingRef.current) return; // a collapse is already in flight
      if (depthRef.current > 0) {
        homeCollapsePendingRef.current = true;
        // Let the popstate handler above land us on the seeded bottom entry
        // and update `view` from there, instead of setting it directly here
        // — that desync (view changes, history.state doesn't) is exactly
        // what let a stale entry get resurrected by the back button before.
        window.history.go(-depthRef.current);
      } else {
        // Nothing pushed above us (or state was corrupted) — already home,
        // nothing to pop. Resync directly so state can't be left stale.
        window.history.replaceState({ view: 'home', depth: 0 }, '');
        viewRef.current = 'home';
        setView('home');
      }
      return;
    }

    viewRef.current = next;
    setView(next);
    depthRef.current += 1;
    window.history.pushState({ view: next, depth: depthRef.current }, '');
  };

  const update = (next: Round) => {
    setRound(next);
    saveRound(next);
  };

  const finish = () => {
    if (!round) return;
    update({ ...round, status: 'finished' });
    goTo('results');
  };

  return (
    <div className="app">
      {/* Mounted on every view so the service worker registers on every load;
          the prompt itself stays hidden while a round is being scored. */}
      <UpdatePrompt suppressed={view === 'play'} />

      {view === 'home' && (
        <Home
          onNew={() => {
            setRound(null);
            goTo('setup');
          }}
          onNewLeague={() => {
            setRound(null);
            goTo('leagueSetup');
          }}
          onResume={(r) => {
            setRound(r);
            goTo('play');
          }}
          onViewResults={(r) => {
            setRound(r);
            goTo('results');
          }}
        />
      )}

      {view === 'setup' && (
        <Setup
          onCancel={() => goTo('home')}
          onStart={(r) => {
            update(r);
            goTo('play');
          }}
        />
      )}

      {view === 'leagueSetup' && (
        <LeagueSetup
          onCancel={() => goTo('home')}
          onStart={(r) => {
            update(r);
            goTo('play');
          }}
        />
      )}

      {view === 'play' && round && (
        <Play round={round} onChange={update} onFinish={finish} onExit={() => goTo('home')} />
      )}

      {view === 'results' && round && (
        <Results
          round={round}
          onChange={update}
          onHome={() => goTo('home')}
          onBackToPlay={() => goTo('play')}
        />
      )}
    </div>
  );
}
