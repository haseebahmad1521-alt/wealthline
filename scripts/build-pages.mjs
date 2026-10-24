// Builds the GitHub Pages artifact: pages-dist/{index.html (shell), app/** (Expo web export), 404.html, qr.*}.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pagesBase = (process.env.PAGES_BASE ?? '/wealthline').replace(/\/$/, '');
const appBase = `${pagesBase}/app`;
const pagesUrl = process.env.PAGES_URL ?? 'https://haseebahmad1521-alt.github.io/wealthline/';
// The QR opens the app itself, not this preview page.
const appUrl = `${pagesUrl.replace(/\/$/, '')}/app/`;
const repo = process.env.GITHUB_REPOSITORY ?? 'haseebahmad1521-alt/wealthline';
const sha =
  process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });

rmSync('dist', { recursive: true, force: true });
rmSync('pages-dist', { recursive: true, force: true });

run('npx', ['expo', 'export', '-p', 'web'], { EXPO_BASE_URL: appBase, EXPO_PUBLIC_BASE_URL: appBase });

// Prefix the template's root-relative URLs with the app base and register the service worker (production only).
const sw = `<script>
      if ('serviceWorker' in navigator) {
        // A new deploy's worker takes over (skipWaiting/clientsClaim); reload once so nobody keeps the old build.
        var hadController = !!navigator.serviceWorker.controller, reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (hadController && !reloaded) { reloaded = true; location.reload(); }
        });
        addEventListener('load', function () {
          navigator.serviceWorker.register('${appBase}/sw.js', { scope: '${appBase}/' }).catch(function () {});
        });
      }
    </script>`;
let html = readFileSync('dist/index.html', 'utf8');
for (const p of ['/manifest.json', '/icons/wealthline.svg', '/icons/apple-touch-icon.png']) {
  html = html.replace(`href="${p}"`, `href="${appBase}${p}"`);
}
html = html.replace('<!--SW-->', sw);
if (!html.includes(`${appBase}/manifest.json`) || !html.includes('serviceWorker')) throw new Error('index.html template rewrite failed');
writeFileSync('dist/index.html', html);

run('npx', ['workbox', 'generateSW', 'workbox-config.cjs'], { EXPO_BASE_URL: appBase });

mkdirSync('pages-dist');
cpSync('dist', 'pages-dist/app', { recursive: true, filter: (s) => !s.endsWith('.DS_Store') });
writeFileSync('pages-dist/.nojekyll', '');

// Shell + 404 recovery.
const sub = (file, vars) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), readFileSync(file, 'utf8'));
writeFileSync(
  'pages-dist/index.html',
  sub('preview/index.html', { COMMIT: sha.slice(0, 7), COMMIT_URL: `https://github.com/${repo}/commit/${sha}`, PAGES_URL: pagesUrl, APP_URL: appUrl }),
);
writeFileSync('pages-dist/404.html', sub('preview/404.html', { APP_PREFIX: `${appBase}/`, SHELL_URL: `${pagesBase}/` }));

run('node', ['scripts/preview-qr.mjs', '--url', appUrl, '--out', 'pages-dist/qr']);
console.log(`\npages-dist ready (commit ${sha.slice(0, 7)}, app base ${appBase})`);
