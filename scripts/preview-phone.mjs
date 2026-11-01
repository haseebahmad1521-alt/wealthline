// Local phone preview: the iPhone-frame shell (preview/index.html) around the live Expo web dev server, plus a
// WEB PREVIEW QR for phones on the same Wi-Fi (not Expo's native dev QR, which `expo start` prints for Expo Go).
// Usage: npm run preview:phone [-- --port 8090 --expo-port 8081]
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { port: { type: 'string', default: '8090' }, 'expo-port': { type: 'string', default: '8081' } },
});
const shellPort = Number(values.port);
const expoPort = Number(values['expo-port']);

// First non-internal, non-link-local IPv4, preferring private ranges.
function lanIp() {
  const all = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map((a) => a.address);
  return all.find((ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) ?? all[0];
}

const ip = process.env.PREVIEW_HOST ?? lanIp();
if (!ip) {
  console.error('No LAN IPv4 address found. Join a Wi-Fi network (or set PREVIEW_HOST) and try again.');
  process.exit(1);
}
const appUrl = `http://${ip}:${expoPort}/`;
// The frame on this Mac loads the app from localhost: it works without Wi-Fi, and browsers that refuse to embed a raw
// LAN address from a localhost page still show it. Only the QR (for the phone) uses the LAN address.
const frameUrl = `http://localhost:${expoPort}/`;

const git = (...args) => {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return ''; }
};
const sha = git('rev-parse', '--short', 'HEAD') || 'unknown';
const dirty = git('status', '--porcelain') ? ' + uncommitted changes' : '';
const note = `Local dev · same Wi-Fi only · ${sha}${dirty}`;

const isOpen = (host, port) =>
  new Promise((done) => {
    const s = createConnection({ host, port, timeout: 800 });
    s.once('connect', () => { s.destroy(); done(true); });
    s.once('error', () => done(false));
    s.once('timeout', () => { s.destroy(); done(false); });
  });

// Reuse a dev server already listening on the LAN; otherwise start one.
let expo;
if (await isOpen(ip, expoPort)) {
  console.log(`Reusing the dev server already on port ${expoPort}.`);
} else if (await isOpen('127.0.0.1', expoPort)) {
  console.error(`Port ${expoPort} is in use but not reachable at ${ip}. Stop that server or pass --expo-port.`);
  process.exit(1);
} else {
  expo = spawn('npx', ['expo', 'start', '--web', '--host', 'lan', '--port', String(expoPort)], {
    stdio: ['ignore', 'inherit', 'inherit'],
    // Own process group so the whole npx → expo tree is stopped with us.
    detached: true,
    env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: ip },
  });
  expo.on('exit', (code) => {
    expo = undefined;
    console.error(`Expo exited (${code ?? 'signal'}).`);
    process.exit(code ?? 1);
  });
}
const stop = () => {
  if (expo) { try { process.kill(-expo.pid, 'SIGTERM'); } catch {} }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);

const qrBase = `preview-artifacts/phone-preview-qr-${expoPort}`;
execFileSync('node', ['scripts/preview-qr.mjs', '--url', appUrl, '--out', qrBase], { stdio: 'inherit' });

const sub = (s, vars) => Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{{${k}}}`, v), s);
const types = { '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (path === '/' || path === '/index.html') {
      // Re-read each request so shell edits show on refresh.
      const html = sub(readFileSync('preview/index.html', 'utf8'), { APP_SRC: frameUrl, APP_URL: appUrl, MODE_NOTE: note });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }
    if (path === '/qr.svg') {
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
      return res.end(readFileSync(`${qrBase}.svg`));
    }
    // The shell's favicon points at app/icons/; serve it from public/.
    if (path.startsWith('/app/icons/')) {
      const file = normalize(join('public', path.slice('/app'.length)));
      if (file.startsWith(join('public', 'icons'))) {
        res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
        return res.end(readFileSync(file));
      }
    }
  } catch {}
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
})
  .on('error', (e) => {
    console.error(`Phone shell could not listen on port ${shellPort}: ${e.message}`);
    stop();
  })
  .listen(shellPort, () => {
    console.log(`
Phone preview  http://localhost:${shellPort}   (iPhone frame around the live dev app)
App on LAN     ${appUrl}
WEB PREVIEW QR ${qrBase}.svg encodes ${appUrl}
  The QR only works on a phone on the same Wi-Fi as this Mac; localhost is never reachable from a phone.
  It opens the web app in the phone's browser. Expo's own terminal QR is for Expo Go / a dev client.
`);
  });
