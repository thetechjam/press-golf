import type { Round } from './types';

const KEY = 'press.rounds.v1';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function listRounds(): Round[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const rounds = JSON.parse(raw) as Round[];
    return rounds.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function getRound(id: string): Round | undefined {
  return listRounds().find((r) => r.id === id);
}

export function saveRound(round: Round): void {
  const rounds = listRounds().filter((r) => r.id !== round.id);
  rounds.push({ ...round, updatedAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(rounds));
}

export function deleteRound(id: string): void {
  const rounds = listRounds().filter((r) => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(rounds));
}
