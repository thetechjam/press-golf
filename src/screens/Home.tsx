import { useState } from 'react';
import type { Round } from '../types';
import { listRounds, deleteRound } from '../storage';
import { InstallPrompt } from '../components/InstallPrompt';

interface Props {
  onNew: () => void;
  onResume: (round: Round) => void;
  onViewResults: (round: Round) => void;
}

export function Home({ onNew, onResume, onViewResults }: Props) {
  const [rounds, setRounds] = useState<Round[]>(listRounds());

  const remove = (id: string) => {
    deleteRound(id);
    setRounds(listRounds());
  };

  return (
    <div className="screen home">
      <header className="hero">
        <div className="logo">⛳ Press</div>
        <p className="tagline">Track golf side games — the fun way.</p>
      </header>

      <button className="btn-primary big" onClick={onNew}>
        Start New Round
      </button>

      <InstallPrompt />

      {rounds.length > 0 && (
        <section className="saved">
          <h2>Your rounds</h2>
          {rounds.map((r) => (
            <div key={r.id} className="round-card">
              <button
                className="round-main"
                onClick={() => (r.status === 'finished' ? onViewResults(r) : onResume(r))}
              >
                <div className="round-title">{r.course || 'Untitled round'}</div>
                <div className="round-sub">
                  {r.date} · {r.players.length} players · {r.holes.length} holes
                  {r.status === 'finished' ? ' · finished' : ' · in progress'}
                </div>
                <div className="round-games">
                  {r.games.map((g) => (
                    <span key={g} className="tag">
                      {g}
                    </span>
                  ))}
                </div>
              </button>
              <button className="round-del" onClick={() => remove(r.id)} aria-label="Delete round">
                ✕
              </button>
            </div>
          ))}
        </section>
      )}

      <p className="hint">Tip: add Press to your home screen for one-tap access on the course.</p>
    </div>
  );
}
