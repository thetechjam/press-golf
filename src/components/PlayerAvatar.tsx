import { initials } from '../player';

interface Props {
  name: string;
  color: string;
  /** Diameter in px. Defaults to the 28px badge used in lists. */
  size?: number;
}

/** Colored monogram badge giving each player a consistent visual identity. */
export function PlayerAvatar({ name, color, size }: Props) {
  const style = {
    background: color,
    ...(size ? { width: size, height: size, fontSize: size * 0.4 } : {}),
  };
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
