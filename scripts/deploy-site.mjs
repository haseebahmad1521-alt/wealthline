// Uploads site/ (landing, privacy, terms) to the DirectAdmin subdomain folder over SSH.
// Reads SITE_SSH_HOST, SITE_SSH_USER, SITE_SSH_PRIVATE_KEY and SITE_PATH from .env at run time and never prints them.
// SITE_SSH_PRIVATE_KEY is the key text itself (quoted multi-line, or one line with \n); optional SITE_SSH_PORT.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const root = join(import.meta.dirname, '..');
const site = join(root, 'site');
const envFile = join(root, '.env');
if (!existsSync(envFile)) fail('No .env file in the project folder.');
const env = { ...parseEnv(readFileSync(envFile, 'utf8')), ...pick(process.env) };
const missing = ['SITE_SSH_HOST', 'SITE_SSH_USER', 'SITE_SSH_PRIVATE_KEY', 'SITE_PATH'].filter((k) => !env[k]?.trim());
if (missing.length) fail(`Missing in .env: ${missing.join(', ')}`);

let key = env.SITE_SSH_PRIVATE_KEY.trim().replace(/\\n/g, '\n');
if (!key.endsWith('\n')) key += '\n';
const path = env.SITE_PATH.trim().replace(/\/+$/, '');
const target = `${env.SITE_SSH_USER.trim()}@${env.SITE_SSH_HOST.trim()}`;

const dir = mkdtempSync(join(tmpdir(), 'site-deploy-'));
const keyFile = join(dir, 'key');
let code = 1;
try {
  writeFileSync(keyFile, key, { mode: 0o600 });
  const opts = ['-i', keyFile, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=accept-new'];
  const port = env.SITE_SSH_PORT?.trim();
  const q = `'${path.replace(/'/g, `'\\''`)}'`;
  run('ssh', [...opts, ...(port ? ['-p', port] : []), target, `mkdir -p ${q}`], 'Creating the folder');
  // shortcut: scp only adds and overwrites; files removed from site/ stay on the server until deleted there.
  const entries = readdirSync(site).map((f) => join(site, f));
  run('scp', [...opts, ...(port ? ['-P', port] : []), '-r', ...entries, `${target}:${path}/`], 'Uploading site/');
  console.log(`Deployed ${entries.length} entries from site/.`);
  code = 0;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);

function run(cmd, args, label) {
  console.log(`${label}...`);
  // stdio inherited so ssh errors show; the arguments (which hold the host and path) are never echoed.
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    fail(`${label} failed (${cmd} exited with ${r.status ?? r.error?.message}).`);
  }
}

function pick(e) {
  return Object.fromEntries(Object.entries(e).filter(([k, v]) => k.startsWith('SITE_') && v));
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
