// Regenerates qr.svg with Press's own QR encoder (src/qr.ts).
//   node docs/league/make-qr.mjs
// Node 24 runs the TypeScript source directly. Check the result scans before
// printing — the flyer's was decoded with jsqr to https://pressgolf.netlify.app/.
import { writeFileSync } from 'node:fs';
import { encodeQR, qrPath } from '../../src/qr.ts';

const URL_ON_FLYER = 'https://pressgolf.netlify.app/';
const code = encodeQR(URL_ON_FLYER);
if (!code) throw new Error('Could not encode ' + URL_ON_FLYER);
const { path, side } = qrPath(code, 4);
writeFileSync(
  new URL('./qr.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#0b3d2e"/></svg>`
);
console.log(`qr.svg: ${URL_ON_FLYER}`);
