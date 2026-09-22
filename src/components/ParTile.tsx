import { nextPar } from '../courses/parOptions';

interface Props {
  hole: number;
  par: number;
  onChange: (par: number) => void;
}

/**
 * One hole's par, changed by tapping it: 3 → 4 → 5 → 6 → 3.
 *
 * Replaces a dropdown per hole. Setting a card was eighteen pickers, each an
 * open, a scroll and a close, to move most holes by one; a tap is the whole
 * edit. The accessible name carries the value, since a button's text alone
 * would read as a bare number.
 */
export function ParTile({ hole, par, onChange }: Props) {
  return (
    <button type="button" className="par-tile" onClick={() => onChange(nextPar(par))}>
      <span className="sr-only">Par for hole {hole}: </span>
      {par}
    </button>
  );
}
