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
import { decodeRound, payloadFromHash } from './shareLink';

const VIEWS = ['home', 'setup', 'leagueSetup', 'play', 'results', 'stats'] as const;
type View = (typeof VIEWS)[number];

const isView = (v: unknown): v is View =>
  typeof v === 'string' && (VIEWS as readonly string[]).includes(v);

/** What is happening with a round arriving in the address bar, if one is. */
type Incoming = { state: 'opening' } | { state: 'failed'; message: string } | null;

export default function App() {
  const [view, setView] = useState<View>('home');
  const [round, setRound] = useState<Round | null>(null);
  // Read synchronously so the first paint is the shared round opening rather
  // than the Home screen flashing up and being replaced a frame later.
  const [incoming, setIncoming] = useState<Incoming>(() =>
    payloadFromHash(window.location.hash) ? { state: 'opening' } : null
  );
  /**
   * True while the round on screen came from a link and has not been kept.
   *
   * Somebody else's round is not written to this device until it is asked for.
   * Saving it silently would put rounds the user never played into their
   * history and their stats, and there is no undo for that short of finding
   * the round and deleting it.
   */
  const [unkept, setUnkept] = useState(false);

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

  /**
   * A round arriving in the address bar.
   *
   * The payload is taken out of the URL before anything else happens: it is
   * hundreds of characters long, a refresh would re-open it over whatever the
   * user had moved on to, and it would otherwise be carried into the next link
   * shared from this page. Decoding is asynchronous, so the navigation below
   * lands after the effect above has seeded the history stack.
   */
  useEffect(() => {
    const payload = payloadFromHash(window.location.hash);
    if (!payload) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    let live = true;
    void decodeRound(payload).then((result) => {
      if (!live) return;
      if (!result.ok) return setIncoming({ state: 'failed', message: result.error });
      setRound(result.round);
      setUnkept(true);
      setIncoming(null);
      nav.goTo('results');
    });
    return () => {
      live = false;
    };
  }, [nav]);

  const goTo = (next: View) => nav.goTo(next);

  /**
   * Puts a different round on screen.
   *
   * Clearing `unkept` here rather than at each call site is what stops the
   * flag outliving the round it describes — left set, it would go on
   * suppressing the save for the next round the user actually played.
   */
  const load = (next: Round | null) => {
    setRound(next);
    setUnkept(false);
  };

  const update = (next: Round) => {
    setRound(next);
    // An unkept round is edited on screen but not written down — correcting a
    // score before deciding whether to keep it is reasonable; being given a
    // round in the history because you fixed somebody's typo is not.
    if (!unkept) saveRound(next);
  };

  /** Writes a round that arrived by link onto this device, once asked. */
  const keep = () => {
    if (!round) return;
    saveRound(round);
    setUnkept(false);
  };

  const finish = () => {
    if (!round) return;
    update({ ...round, status: 'finished' });
    goTo('results');
  };

  if (incoming) {
    return (
      <div className="app">
        <div className="screen arriving">
          <h1 tabIndex={-1}>{incoming.state === 'opening' ? 'Opening round…' : 'Can’t open that link'}</h1>
          {incoming.state === 'failed' && (
            <>
              <p className="arriving-note">{incoming.message}</p>
              <button className="btn-primary big" onClick={() => setIncoming(null)}>
                Go to Press
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Mounted on every view so the service worker registers on every load;
          the prompt itself stays hidden while a round is being scored. */}
      <UpdatePrompt suppressed={view === 'play'} />

      {view === 'home' && (
        <Home
          onNew={() => {
            load(null);
            goTo('setup');
          }}
          onNewLeague={() => {
            load(null);
            goTo('leagueSetup');
          }}
          onResume={(r) => {
            load(r);
            goTo('play');
          }}
          onViewResults={(r) => {
            load(r);
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
            load(r);
            saveRound(r);
            goTo('play');
          }}
        />
      )}

      {view === 'leagueSetup' && (
        <LeagueSetup
          onCancel={() => goTo('home')}
          onStart={(r) => {
            load(r);
            saveRound(r);
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
          unkept={unkept}
          onKeep={keep}
        />
      )}
    </div>
  );
}
