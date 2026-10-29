import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

// Deliberately serve a file allowlist, never the workspace or its environment files.
const root = resolve('.');
const referenceRoot = resolve(root, 'assets/_reference');
const files = new Map([
  ['/', resolve(root, 'docs/design/reference-board.html')],
  ['/references.json', resolve(root, 'docs/design/references.json')],
]);
const captureIndex = await readFile(resolve(referenceRoot, 'capture-index.json'), 'utf8')
  .then(JSON.parse).catch(() => ({ references: [] }));
for (const ref of captureIndex.references) {
  for (const shot of ref.shots ?? []) {
    const path = resolve(root, shot.file);
    const inside = relative(referenceRoot, path);
    if (!inside.startsWith('..') && !isAbsolute(inside) && extname(path) === '.png') {
      files.set('/' + shot.file.replaceAll('\\', '/'), path);
    }
  }
}
const mime = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (pathname === '/capture-index.json') {
    res.writeHead(200, { 'Content-Type': mime['.json'] });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(captureIndex)); return;
  }
  const path = files.get(pathname);
  if (!path) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end(); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4175, '127.0.0.1', () => console.log('틈길 화면 참고 보드: http://127.0.0.1:4175'));
