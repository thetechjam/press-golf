import { describeStrokeIndexProblem, type StrokeIndexProblem } from '../games/strokeIndex';

interface Props {
  problem: StrokeIndexProblem | null;
  holeCount: number;
}

/**
 * The line under a pars grid whose stroke indexes cannot rank the holes.
 * Nothing when there is no problem, so the caller need not check.
 */
export function StrokeIndexNote({ problem, holeCount }: Props) {
  if (!problem) return null;
  return (
    <p className="check-note bad" role="status">
      <strong>These stroke indexes can't be used.</strong>{' '}
      {describeStrokeIndexProblem(problem, holeCount)} Until it's fixed, handicap strokes fall in
      hole order instead — everyone still gets the right number of shots, just not on the holes
      the course would pick.
    </p>
  );
}
