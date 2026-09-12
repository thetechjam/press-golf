interface Props {
  path: string;
  side: number;
}

/**
 * The QR code, drawn as one SVG path on its own light ground.
 *
 * The white rectangle is drawn rather than inherited: Press has a dark theme,
 * and a QR code on a dark background is one no camera will read.
 */
export function ShareQr({ path, side }: Props) {
  return (
    <div className="send-qr">
      <svg
        viewBox={`0 0 ${side} ${side}`}
        role="img"
        aria-label="QR code"
        shapeRendering="crispEdges"
      >
        <rect width={side} height={side} fill="#fff" />
        <path d={path} fill="#000" />
      </svg>
    </div>
  );
}
