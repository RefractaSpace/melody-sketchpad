// 곡 저장소 API — Vercel Blob에 곡(.msk)을 저장해요.
// 곡 주인 확인: 로그인 토큰(Authorization: Bearer)이면 계정 폴더, 아니면 저장소 키(x-msk-key)의 SHA-256 폴더.
//   GET    /api/songs            → 내 곡 목록 [{id, name, size, uploadedAt}]
//   GET    /api/songs?id=…       → 곡 파일(.msk) 내려받기
//   PUT    /api/songs?id=…&name= → 곡 올리기 (본문 = .msk, 최대 4MB)
//   DELETE /api/songs?id=…       → 곡 지우기
import { put, list, del } from '@vercel/blob';
import { cors, songDir, ipKey } from './_lib.js';
import { allow } from './_db.js';

const MAX = 4 * 1024 * 1024;   // Vercel 함수 본문 한도(4.5MB)보다 조금 작게
const TOTAL = 4 * 1024 * 1024; // 계정(또는 저장소 키) 하나에 저장할 수 있는 곡 전체 크기 — 내 계정 화면의 한도와 같음
const b64u = s => Buffer.from(s, 'utf8').toString('base64url'), unb64u = s => Buffer.from(s, 'base64url').toString('utf8');

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX) throw Object.assign(new Error('too big'), {status:413}); chunks.push(c); }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({error:'no-store', message:'서버 저장소가 아직 연결되지 않았어요'});
  const where = songDir(req); if (where.error) { const [code, error, message] = where.error; return res.status(code).json({error, message}); }
  const dir = where.dir;
  const id = String(req.query.id || '');
  if (id && !/^[A-Za-z0-9_-]{4,40}$/.test(id)) return res.status(400).json({error:'bad-id'});
  try {
    const mine = async prefix => (await list({prefix, limit:1000})).blobs;
    if (req.method === 'GET' && !id) {
      const songs = (await mine(dir)).map(b => { const m = /\/([A-Za-z0-9_-]+)--([A-Za-z0-9_-]*)\.n[^/]*\.msk$/.exec(b.pathname); return m && {id:m[1], name:unb64u(m[2]), size:b.size, uploadedAt:b.uploadedAt}; }).filter(Boolean);
      return res.status(200).json({songs:songs.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))});
    }
    const found = id ? await mine(dir + id + '--') : [];
    if (req.method === 'GET') {
      if (!found.length) return res.status(404).json({error:'not-found'});
      const r = await fetch(found[0].downloadUrl || found[0].url); const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', 'application/octet-stream'); return res.status(200).send(buf);
    }
    if (req.method === 'PUT') {
      // 도배 막기: 한 곳(IP)에서 1시간 60번 — 저장소 키는 아무 값이나 만들 수 있어서 키 대신 접속한 곳으로 센다
      if (!await allow('songput:' + ipKey(req), 60, 3600)) return res.status(429).json({error:'slow-down', message:'너무 자주 올렸어요. 잠시 뒤에 다시 해 주세요'});
      const body = await rawBody(req); if (body.length < 8 || body.subarray(0, 3).toString() !== 'MSK') return res.status(400).json({error:'not-msk', message:'MSK 파일이 아니에요'});
      // 전체 크기 한도 (같은 곡을 고쳐 올리면 예전 판 크기는 빼고 계산)
      const used = (await mine(dir)).filter(b => !found.some(f => f.url === b.url)).reduce((a, b) => a + b.size, 0);
      if (used + body.length > TOTAL) return res.status(413).json({error:'full', message:'저장 공간(4MB)이 가득 찼어요. 안 쓰는 곡을 지워 주세요'});
      const name = String(req.query.name || '곡').slice(0, 60);
      const b = await put(dir + id + '--' + b64u(name) + '.n.msk', body, {access:'public', addRandomSuffix:true, contentType:'application/octet-stream'});
      if (found.length) await del(found.map(x => x.url));   // 예전 판은 지움 (새 판을 먼저 올린 뒤)
      return res.status(200).json({ok:true, id, name, size:body.length, url:b.url, uploadedAt:b.uploadedAt || new Date().toISOString()});   // url: 커뮤니티에 곡을 붙일 때 씀
    }
    if (req.method === 'DELETE') { if (found.length) await del(found.map(x => x.url)); return res.status(200).json({ok:true, deleted:found.length}); }
    return res.status(405).json({error:'method'});
  } catch (e) {
    if (e.status === 413) return res.status(413).json({error:'too-big', message:'곡이 4MB보다 커서 서버에 못 올려요 (내 샘플·오디오 클립이 크면 생겨요)'});
    return res.status(500).json({error:'server', message:String(e.message || e).slice(0, 200)});
  }
}
