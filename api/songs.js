// 곡 저장소 API — Vercel Blob에 곡(.msk)을 저장해요.
// 곡 주인 확인은 "저장소 키"(헤더 x-msk-key)로: 키의 SHA-256 앞 32글자가 폴더 이름이라, 키를 모르면 목록도 못 봐요.
//   GET    /api/songs            → 내 곡 목록 [{id, name, size, uploadedAt}]
//   GET    /api/songs?id=…       → 곡 파일(.msk) 내려받기
//   PUT    /api/songs?id=…&name= → 곡 올리기 (본문 = .msk, 최대 4MB)
//   DELETE /api/songs?id=…       → 곡 지우기
import { put, list, del } from '@vercel/blob';
import crypto from 'node:crypto';

const MAX = 4 * 1024 * 1024;   // Vercel 함수 본문 한도(4.5MB)보다 조금 작게
const b64u = s => Buffer.from(s, 'utf8').toString('base64url'), unb64u = s => Buffer.from(s, 'base64url').toString('utf8');

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX) throw Object.assign(new Error('too big'), {status:413}); chunks.push(c); }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');   // .exe 앱(file://)에서도 부를 수 있게
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-msk-key,content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({error:'no-store', message:'서버 저장소가 아직 연결되지 않았어요'});
  const key = String(req.headers['x-msk-key'] || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return res.status(401).json({error:'bad-key', message:'저장소 키가 없거나 모양이 틀렸어요'});
  const dir = 'songs/' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 32) + '/';
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
      const body = await rawBody(req); if (body.length < 8 || body.subarray(0, 3).toString() !== 'MSK') return res.status(400).json({error:'not-msk', message:'MSK 파일이 아니에요'});
      const name = String(req.query.name || '곡').slice(0, 60);
      const b = await put(dir + id + '--' + b64u(name) + '.n.msk', body, {access:'public', addRandomSuffix:true, contentType:'application/octet-stream'});
      if (found.length) await del(found.map(x => x.url));   // 예전 판은 지움 (새 판을 먼저 올린 뒤)
      return res.status(200).json({ok:true, id, name, size:body.length, uploadedAt:b.uploadedAt || new Date().toISOString()});
    }
    if (req.method === 'DELETE') { if (found.length) await del(found.map(x => x.url)); return res.status(200).json({ok:true, deleted:found.length}); }
    return res.status(405).json({error:'method'});
  } catch (e) {
    if (e.status === 413) return res.status(413).json({error:'too-big', message:'곡이 4MB보다 커서 서버에 못 올려요 (내 샘플·오디오 클립이 크면 생겨요)'});
    return res.status(500).json({error:'server', message:String(e.message || e).slice(0, 200)});
  }
}
