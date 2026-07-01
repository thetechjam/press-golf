import { useState } from 'react';
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

  const update = (next: Round) => {
    setRound(next);
    saveRound(next);
  };

  const finish = () => {
    if (!round) return;
    update({ ...round, status: 'finished' });
    setView('results');
  };

  return (
    <div className="app">
      {view === 'home' && (
        <Home
          onNew={() => {
            setRound(null);
            setView('setup');
          }}
          onNewLeague={() => {
            setRound(null);
            setView('leagueSetup');
          }}
          onResume={(r) => {
            setRound(r);
            setView('play');
          }}
          onViewResults={(r) => {
            setRound(r);
            setView('results');
          }}
        />
      )}

      {view === 'setup' && (
        <Setup
          onCancel={() => setView('home')}
          onStart={(r) => {
            update(r);
            setView('play');
          }}
        />
      )}

      {view === 'leagueSetup' && (
        <LeagueSetup
          onCancel={() => setView('home')}
          onStart={(r) => {
            update(r);
            setView('play');
          }}
        />
      )}

      {view === 'play' && round && (
        <Play round={round} onChange={update} onFinish={finish} onExit={() => setView('home')} />
      )}

      {view === 'results' && round && (
        <Results
          round={round}
          onChange={update}
          onHome={() => setView('home')}
          onBackToPlay={() => setView('play')}
        />
      )}
    </div>
  );
}
