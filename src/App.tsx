import { useState, useEffect } from 'react';
import type { Round } from './types';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { LeagueSetup } from './screens/LeagueSetup';
import { Play } from './screens/Play';
import { Results } from './screens/Results';
import { saveRound } from './storage';

type View = 'home' | 'setup' | 'leagueSetup' | 'play' | 'results';

/** Where the back gesture lands from each view. `null` = let the browser leave. */
const BACK_TO: Record<View, View | null> = {
  home: null,
  setup: 'home',
  leagueSetup: 'home',
  play: 'home',
  results: 'play',
};

export default function App() {
  const [view, setView] = useState<View>('home');
  const [round, setRound] = useState<Round | null>(null);

  // Without this, the Android back gesture exits an installed PWA mid-round.
  useEffect(() => {
    const onPop = () => setView((v) => BACK_TO[v] ?? v);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goTo = (next: View) => {
    setView(next);
    if (next !== 'home') window.history.pushState({ view: next }, '');
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
