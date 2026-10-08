/** "1 player", "4 players" — a count with its noun, for the lines that list them. */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}
