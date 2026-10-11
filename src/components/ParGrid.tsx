import type { Hole } from '../types';
import { ParTile } from './ParTile';

interface Props {
  holes: Hole[];
  /** Whether each cell also carries a stroke-index box, with captions on both. */
  withStrokeIndex: boolean;
  /** The highest rank the stroke-index box accepts: the hole count. */
  maxStrokeIndex: number;
  onPar: (holeNumber: number, par: number) => void;
  onStrokeIndex: (holeNumber: number, si: number | undefined) => void;
}

/**
 * The pars grid, with or without stroke indexes — New Round and Golf League
 * draw the same cells.
 *
 * A div per cell, not a label: with stroke index showing, a cell holds two
 * controls, and a <label> may only name one of them. Each field carries its
 * own accessible name instead, and — once there are two boxes to tell apart —
 * its own visible caption. Without them the cell is a hole number over two
 * bare boxes, and the default stroke indexes make it worse by repeating the
 * hole number underneath itself.
 */
export function ParGrid({ holes, withStrokeIndex, maxStrokeIndex, onPar, onStrokeIndex }: Props) {
  return (
    <div className={`par-grid${withStrokeIndex ? ' with-si' : ''}`}>
      {holes.map((h) => (
        <div key={h.number} className="par-cell">
          <span className="par-hole">{h.number}</span>
          {withStrokeIndex && <span className="par-cap">Par</span>}
          <ParTile hole={h.number} par={h.par} onChange={(v) => onPar(h.number, v)} />
          {withStrokeIndex && (
            <>
              <span className="par-cap">SI</span>
              <input
                className="si-input"
                type="number"
                min={1}
                max={maxStrokeIndex}
                value={h.strokeIndex ?? ''}
                onChange={(e) =>
                  onStrokeIndex(h.number, e.target.value === '' ? undefined : Number(e.target.value))
                }
                aria-label={`Stroke index for hole ${h.number}`}
              />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
