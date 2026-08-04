import { useState, useEffect } from 'react';
import type { Round } from './types';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { LeagueSetup } from './screens/LeagueSetup';
import { Play } from './screens/Play';
import { Results } from './screens/Results';
import { saveRound } from './storage';

type View = 'home' | 'setup' | 'leagueSetup' | 'play' | 'results';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [round, setRound] = useState<Round | null>(null);

  // Without this, the Android back gesture exits an installed PWA mid-round.
  useEffect(() => {
    // Seed the initial entry so the bottom-of-stack entry carries a view.
    window.history.replaceState({ view: 'home' }, '');

    const onPop = (e: PopStateEvent) => {
      const v = (e.state as { view?: View } | null)?.view;
      setView(v ?? 'home');
    };
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
