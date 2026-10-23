// Serves pages-dist under PAGES_BASE (default /wealthline) like GitHub Pages: unknown paths get 404.html with status 404.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const base = (process.env.PAGES_BASE ?? '/wealthline').replace(/\/$/, '');
const port = Number(process.env.PORT ?? 4173);
const root = normalize(join(process.cwd(), 'pages-dist'));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};

function send(res, file, status = 200) {
  res.writeHead(status, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, join(root, '404.html'), 404); }
  if (rel === base) { res.writeHead(301, { location: `${base}/` }); return res.end(); }
  if (rel.startsWith(`${base}/`)) {
    let file = normalize(join(root, rel.slice(base.length)));
    if (file.startsWith(root) && existsSync(file) && statSync(file).isDirectory()) {
      if (!rel.endsWith('/')) { res.writeHead(301, { location: `${rel}/` }); return res.end(); }
      file = join(file, 'index.html');
    }
    if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) return send(res, file);
  }
  send(res, join(root, '404.html'), 404);
}).listen(port, () => console.log(`Serving pages-dist at http://localhost:${port}${base}/  (app: ${base}/app/)`));
