// WEB PREVIEW QR in the terminal, for a phone on the same Wi-Fi (not Expo's native dev QR, which opens Expo Go).
// Prints a scannable QR for http://<LAN IP>:<port>/ with the phone link and the local link below it.
// Usage: npm run phone:qr [-- --port 8081 --path /world --plain]
// --plain: no colour codes, light modules drawn as blocks (reads as dark-on-light on a dark terminal or chat), so the
// QR survives being pasted into a chat reply.
import { networkInterfaces } from 'node:os';
import { parseArgs } from 'node:util';
import QRCode from 'qrcode';

const { values } = parseArgs({ options: { port: { type: 'string', default: '8081' }, path: { type: 'string', default: '/' }, plain: { type: 'boolean', default: false } } });

// First non-internal, non-link-local IPv4, preferring private ranges (same rule as preview-phone.mjs).
const all = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
  .map((a) => a.address);
const ip = process.env.PREVIEW_HOST ?? all.find((a) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)) ?? all[0];
if (!ip) {
  console.error('No LAN IPv4 address found. Join a Wi-Fi network (or set PREVIEW_HOST) and try again.');
  process.exit(1);
}
const path = values.path.startsWith('/') ? values.path : `/${values.path}`;
const phone = `http://${ip}:${values.port}${path}`;

function plain(text) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  const q = 2; // quiet zone, in modules
  const light = (r, c) => r < q || c < q || r >= n + q || c >= n + q || !modules.get(r - q, c - q);
  const rows = [];
  for (let r = 0; r < n + 2 * q; r += 2) {
    let line = '';
    for (let c = 0; c < n + 2 * q; c++) {
      const top = light(r, c);
      const bottom = r + 1 < n + 2 * q ? light(r + 1, c) : false;
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    rows.push(line);
  }
  return rows.join('\n');
}

console.log(values.plain ? plain(phone) : await QRCode.toString(phone, { type: 'terminal', small: true, errorCorrectionLevel: 'M' }));
console.log(`📱 Phone (same Wi-Fi): ${phone}`);
console.log(`💻 This Mac:           http://localhost:${values.port}${path}`);
console.log('Web preview in the phone browser, not Expo Go. A phone can never open localhost.');
