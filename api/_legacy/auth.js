// 로그인 API — 아이디 + 비밀번호 (비밀번호는 scrypt로 섞어서 저장, 원문은 어디에도 없음)
//   POST /api/auth?action=signup  {username, password} → {token, username}
//   POST /api/auth?action=login   {username, password} → {token, username}
//   GET  /api/auth?action=me      (Authorization: Bearer 토큰) → {username}
//   POST /api/auth?action=password {old, password} + 토큰 → 비밀번호 바꾸기
//   POST /api/auth?action=delete  {password} + 토큰 → 계정과 곡 모두 삭제
import { put, list, del } from '@vercel/blob';
import crypto from 'node:crypto';
import { cors, makeToken, readToken, userDir, readJson, isAdmin } from '../_lib.js';

const scrypt = (pw, salt) => new Promise((ok, bad) => crypto.scrypt(pw, salt, 64, {N:16384, r:8, p:1}, (e, k) => e ? bad(e) : ok(k)));
const tries = new Map();   // 틀린 로그인 횟수 (서버 한 대 안에서만 — 간단한 방어)
async function findUser(u) { const b = (await list({prefix:userDir(u) + 'account', limit:5})).blobs; if (!b.length) return null; const r = await fetch(b[0].downloadUrl || b[0].url); return {rec:await r.json(), blobs:b}; }

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({error:'no-store', message:'서버 저장소가 연결되지 않았어요'});
  const action = String(req.query.action || '');
  try {
    if (action === 'me') {   // 내 정보: 아이디 · 가입일 · 곡 수 · 사용량
      const u = readToken(String(req.headers.authorization || '').replace(/^Bearer /, '')); if (!u) return res.status(401).json({error:'bad-token', message:'로그인이 필요해요'});
      const found = await findUser(u), songs = (await list({prefix:userDir(u) + 'songs/', limit:1000})).blobs;
      return res.status(200).json({username:u, admin:isAdmin(u), created:found ? found.rec.created : null, songs:songs.length, bytes:songs.reduce((a, b) => a + b.size, 0), limitBytes:4 * 1024 * 1024});
    }
    if (req.method !== 'POST') return res.status(405).json({error:'method'});
    const body = await readJson(req);
    if (action === 'signup' || action === 'login') {
      const username = String(body.username || '').trim().toLowerCase(), password = String(body.password || '');
      if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({error:'bad-username', message:'아이디는 영문 소문자·숫자·_ 3~20글자예요'});
      if (password.length < 8 || password.length > 200) return res.status(400).json({error:'bad-password', message:'비밀번호는 8글자 이상이에요'});
      const t = tries.get(username) || {n:0, at:0}; if (t.n >= 8 && Date.now() - t.at < 10 * 60e3) return res.status(429).json({error:'slow-down', message:'로그인을 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요'});
      const found = await findUser(username);
      if (action === 'signup') {
        if (found) return res.status(409).json({error:'taken', message:'이미 있는 아이디예요'});
        const salt = crypto.randomBytes(16), hash = await scrypt(password, salt);
        await put(userDir(username) + 'account.json', JSON.stringify({u:username, salt:salt.toString('base64'), hash:hash.toString('base64'), created:new Date().toISOString()}), {access:'public', addRandomSuffix:true, contentType:'application/json'});
        return res.status(200).json({token:makeToken(username), username});
      }
      const ok = found && crypto.timingSafeEqual(await scrypt(password, Buffer.from(found.rec.salt, 'base64')), Buffer.from(found.rec.hash, 'base64'));
      if (!ok) { tries.set(username, {n:t.n + 1, at:Date.now()}); return res.status(401).json({error:'wrong', message:'아이디나 비밀번호가 틀렸어요'}); }
      tries.delete(username); return res.status(200).json({token:makeToken(username), username});
    }
    if (action === 'password') {   // 비밀번호 바꾸기 {old, password}
      const u = readToken(String(req.headers.authorization || '').replace(/^Bearer /, '')); if (!u) return res.status(401).json({error:'bad-token', message:'로그인이 필요해요'});
      const np = String(body.password || ''); if (np.length < 8 || np.length > 200) return res.status(400).json({error:'bad-password', message:'새 비밀번호는 8글자 이상이에요'});
      const found = await findUser(u); if (!found) return res.status(404).json({error:'not-found'});
      if (!crypto.timingSafeEqual(await scrypt(String(body.old || ''), Buffer.from(found.rec.salt, 'base64')), Buffer.from(found.rec.hash, 'base64'))) return res.status(401).json({error:'wrong', message:'지금 비밀번호가 틀렸어요'});
      const salt = crypto.randomBytes(16), hash = await scrypt(np, salt);
      await put(userDir(u) + 'account.json', JSON.stringify({...found.rec, salt:salt.toString('base64'), hash:hash.toString('base64'), changed:new Date().toISOString()}), {access:'public', addRandomSuffix:true, contentType:'application/json'});
      await del(found.blobs.map(b => b.url));   // 예전 계정 파일은 새 파일을 쓴 뒤 지움
      return res.status(200).json({ok:true, token:makeToken(u)});
    }
    if (action === 'delete') {
      const u = readToken(String(req.headers.authorization || '').replace(/^Bearer /, '')); if (!u) return res.status(401).json({error:'bad-token', message:'로그인이 필요해요'});
      const found = await findUser(u); if (!found) return res.status(404).json({error:'not-found'});
      const ok = crypto.timingSafeEqual(await scrypt(String(body.password || ''), Buffer.from(found.rec.salt, 'base64')), Buffer.from(found.rec.hash, 'base64'));
      if (!ok) return res.status(401).json({error:'wrong', message:'비밀번호가 틀렸어요'});
      const all = (await list({prefix:userDir(u), limit:1000})).blobs; if (all.length) await del(all.map(b => b.url));
      // 그 사람이 커뮤니티에 올린 글도 지움 (글 폴더 통째로)
      const posts = (await list({prefix:'community/', limit:1000})).blobs.filter(b => /\/post[^/]*\.json$/.test(b.pathname)); let gone = 0;
      for (const b of posts) { try { const p = await (await fetch(b.downloadUrl || b.url)).json(); if (p.author === u) { const f2 = (await list({prefix:'community/' + p.id + '/', limit:50})).blobs; if (f2.length) await del(f2.map(x => x.url)); gone++; } } catch (e) {} }
      if (gone) { const ib = (await list({prefix:'community/_index', limit:10})).blobs; if (ib.length) await del(ib.map(b => b.url)); }   // 요약 파일은 다음 목록 요청 때 다시 만들어짐
      return res.status(200).json({ok:true, deleted:all.length, posts:gone});
    }
    return res.status(400).json({error:'action'});
  } catch (e) { return res.status(500).json({error:'server', message:String(e.message || e).slice(0, 200)}); }
}
