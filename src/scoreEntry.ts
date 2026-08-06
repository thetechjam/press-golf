/** Parses a scorecard cell entry. Returns null to clear, undefined to ignore. */
export function clampScore(raw: string): number | null | undefined {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(15, Math.max(1, Math.round(n)));
}
