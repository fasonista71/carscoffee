import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
/* BUNDLE points at a built cars-and-coffee-web directory. */
const GAME = path.resolve(process.env.BUNDLE || 'cars-and-coffee-web');
const ROOT = path.resolve(process.env.HARNESS || path.dirname(new URL(import.meta.url).pathname));
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.png':'image/png',
  '.atlas':'text/plain', '.txt':'text/plain', '.json':'application/json' };
const FAIL = new Set((process.env.FAIL_PATHS || '').split(',').filter(Boolean));
const STALL = new Set((process.env.STALL_PATHS || '').split(',').filter(Boolean));
const srv = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (FAIL.has(url)) { res.writeHead(500); res.end('injected failure'); return; }
  if (STALL.has(url)) { return; /* never respond */ }
  let file;
  if (url === '/' || url === '/host.html') file = path.join(ROOT, 'host', 'host.html');
  else if (url.startsWith('/game/')) file = path.join(GAME, url.slice('/game/'.length));
  else file = path.join(ROOT, url.slice(1));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
srv.listen(Number(process.env.PORT || 8099), () => console.log('up on', srv.address().port));
