// WEB PREVIEW QR: encodes a http(s) URL that opens in a browser.
// Not Expo's native dev QR (shown by `npx expo start`, opens Expo Go / a dev client).
// Usage: npm run preview:qr -- --url <http(s) url> [--out <path, extension ignored>] [--open]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import QRCode from 'qrcode';

const { values } = parseArgs({
  options: { url: { type: 'string' }, out: { type: 'string' }, open: { type: 'boolean', default: false } },
});

let url;
try {
  url = new URL(values.url ?? '');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
} catch {
  console.error('Usage: npm run preview:qr -- --url <http(s) url> [--out <file>] [--open]\nA valid http:// or https:// URL is required.');
  process.exit(1);
}

if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')) {
  console.warn("WARNING: a phone can't reach localhost. Use your LAN IP or a tunnel instead.");
}

const base = resolve((values.out ?? 'preview-artifacts/wealthline-preview-qr').replace(/\.(svg|png)$/i, ''));
mkdirSync(dirname(base), { recursive: true });
const opts = { errorCorrectionLevel: 'M', margin: 2, width: 512, color: { dark: '#1D1D1F', light: '#FFFFFF' } };
await QRCode.toFile(`${base}.svg`, url.href, { ...opts, type: 'svg' });
await QRCode.toFile(`${base}.png`, url.href, { ...opts, type: 'png' });

console.log(`WEB PREVIEW QR (opens a browser; not Expo's native dev QR)\nEncoded URL: ${url.href}\nSVG: ${base}.svg\nPNG: ${base}.png`);

if (values.open) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [`${base}.png`]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', `${base}.png`]]
    : ['xdg-open', [`${base}.png`]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.warn(`Could not open the image automatically (${cmd} unavailable); open the PNG manually.`));
  child.unref();
}
