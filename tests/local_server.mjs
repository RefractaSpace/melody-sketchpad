// 시험용: public/ 파일 + api/ 함수를 PGlite(진짜 PostgreSQL)로 한 서버에서 돌림 — node tests/local_server.mjs 8790  (관리자 페이지·결제 화면을 브라우저로 시험할 때)
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path'; import { PGlite } from '@electric-sql/pglite';
globalThis.__MSK_PG = new PGlite();
const files = new Map(); let seq = 0;
globalThis.__MSK_STORE = { put:(p, b) => { const url = `mem://${p}?${++seq}`; files.set(url, {pathname:p, url, size:b.length, body:Buffer.from(b)}); return url; },
  list:pre => [...files.values()].filter(f => f.pathname.startsWith(pre)).map(({pathname, url, size}) => ({pathname, url, size})),
  read:u => files.get(u).body, del:us => us.forEach(u => files.delete(u)) };
process.env.BLOB_READ_WRITE_TOKEN = 'test'; process.env.RESET_KEY = 'local-reset-key-0123456789'; process.env.SALES_OPEN = '1'; process.env.BANK_ACCOUNT = '테스트은행 000-00-000 예금주';
const root = path.resolve('public'), H = {};
for (const n of ['auth', 'checkout', 'license', 'stats']) H[n] = (await import(`../api/${n}.js`)).default;
const T = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.opus':'audio/ogg'};
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5); if (!H[name]) { res.statusCode = 404; return res.end('{}'); }
    let raw = ''; for await (const c of req) raw += c;
    req.query = Object.fromEntries(u.searchParams); try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
    res.status = c => { res.statusCode = c; return res; }; res.json = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    return H[name](req, res);
  }
  let p = u.pathname === '/dev' ? '/dev.html' : u.pathname; if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try { const b = await readFile(f); res.setHeader('content-type', T[path.extname(f)] || 'application/octet-stream'); res.end(b); } catch (e) { res.statusCode = 404; res.end('no'); }
}).listen(+process.argv[2] || 8790, () => console.log('ready'));
