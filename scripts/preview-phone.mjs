// Build the preview with its QR pointing at this computer's LAN address, then serve it, so a phone on the
// same Wi-Fi can scan the QR. Usage: npm run preview:phone
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const lan = Object.values(networkInterfaces())
  .flat()
  .find((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))?.address;
if (!lan) {
  console.error('No LAN address found: connect this computer to Wi-Fi first.');
  process.exit(1);
}
const port = process.env.PORT ?? '4173';
const url = `http://${lan}:${port}/wealthline/`;
const env = { ...process.env, PAGES_URL: url, PORT: port };

execFileSync('npm', ['run', '-s', 'build:pages'], { stdio: 'inherit', env });
console.log(`\nPhone preview: ${url}\nScan the QR on that page (or open the URL) from a phone on the same Wi-Fi.\n`);
execFileSync('npm', ['run', '-s', 'preview:pages'], { stdio: 'inherit', env });
