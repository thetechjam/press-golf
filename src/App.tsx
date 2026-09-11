import { useState, useEffect, useRef } from 'react';
import type { Round } from './types';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { LeagueSetup } from './screens/LeagueSetup';
import { Play } from './screens/Play';
import { Results } from './screens/Results';
import { Stats } from './screens/Stats';
import { saveRound } from './storage';
import { UpdatePrompt } from './components/UpdatePrompt';
import { dismissSplash } from './splash';
import { createNavigator } from './navigation';

const VIEWS = ['home', 'setup', 'leagueSetup', 'play', 'results', 'stats'] as const;
type View = (typeof VIEWS)[number];

const isView = (v: unknown): v is View =>
  typeof v === 'string' && (VIEWS as readonly string[]).includes(v);

export default function App() {
  const [view, setView] = useState<View>('home');
  const [round, setRound] = useState<Round | null>(null);

  // The history/back-gesture logic lives in navigation.ts, where it can be
  // tested against a history double that models asynchronous traversal — a DOM
  // test environment pops synchronously inside go() and so cannot reproduce
  // the double-tap race the collapse guard exists for. Built once and kept in
  // a ref: it owns mutable state that must not be rebuilt on a render.
  const navRef = useRef<ReturnType<typeof createNavigator<View>> | null>(null);
  if (navRef.current === null) {
    navRef.current = createNavigator<View>({
      history: window.history,
      home: 'home',
      isView,
      onView: setView,
    });
  }
  const nav = navRef.current;

  // Fade out index.html's splash now that there is an app painted under it.
  // It runs from here rather than main.tsx so it cannot outrun React's initial
  // commit — see splash.ts.
  useEffect(dismissSplash, []);

  /**
   * Move focus to the new screen's heading on every view change.
   *
   * A view swap unmounts the control that was just activated, so focus falls
   * to <body>: the next Tab starts over from the top of the document, and a
   * screen reader is told nothing at all about the screen that just arrived —
   * the same defect Sheet.tsx fixes when its own contents are replaced around
   * it, one level up. Each screen's <h1> carries tabIndex={-1} to receive this.
   *
   * Deliberately NOT preventScroll, unlike the sheet's: focus() scrolling the
   * heading into view is what puts a new screen at its top, and a screen
   * change is the one moment where inheriting the previous screen's scroll
   * position is wrong.
   */
  const navigated = useRef(false);
  useEffect(() => {
    // Not on first paint — nothing has been navigated away from yet, and
    // taking focus on load only fights whatever the user is already doing.
    if (!navigated.current) {
      navigated.current = true;
      return;
    }
    document.querySelector<HTMLElement>('.screen h1')?.focus();
  }, [view]);

  // Without this, the Android back gesture exits an installed PWA mid-round.
  useEffect(() => {
    nav.start();
    const onPop = (e: PopStateEvent) => nav.handlePop(e.state);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [nav]);

  const goTo = (next: View) => nav.goTo(next);

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
          onStats={() => goTo('stats')}
        />
      )}

      {view === 'stats' && <Stats onBack={() => goTo('home')} />}

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
