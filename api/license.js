// 6: 라이선스 — 내 등급을 서버에서 확인한다 (브라우저 조작으로는 못 바꿈)
//   GET  /api/license          내 등급
//   POST /api/license  {tier, username}  등급 바꾸기 — 관리자만
//   GET  /api/license?d=piano_max&f=12.opus   유료 악기 파일 받기 — 그 등급 이상인 사람에게만
//        (파일은 public이 아니라 private/samples/ 에 있어서 주소를 알아도 직접 못 받음)
import { cors, readToken, isAdmin } from './_lib.js';
import { hasDB, q, ensureDB } from './_db.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PAID = {piano_pro:'pro', piano_max:'max'};          // 폴더 → 필요한 등급
const RANK = {se:0, six:1, pro:2, max:3};
const FILE_OK = /^(inst\.json|\d{1,3}\.opus)$/;           // 이 모양 말고는 거절 (../ 같은 경로 공격 막기)

const TIERS = ['se', 'six', 'pro', 'max'];
const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = who(req);
  if (!user && req.query && req.query.d) return send(res, 401, {error:'auth', message:'로그인이 필요해요'});   // 유료 악기 파일
  if (!user) return send(res, 200, {tier:'se', signedIn:false});     // 로그인 안 하면 무료
  if (!hasDB()) return req.query && req.query.d ? send(res, 503, {error:'db-off'}) : send(res, 200, {tier:'se', signedIn:true, note:'db-off'});
  try {
    await ensureDB();
    if (req.method === 'GET' && req.query && req.query.d) {
      const d = String(req.query.d), f = String(req.query.f || '');
      if (!PAID[d] || !FILE_OK.test(f)) return send(res, 400, {error:'bad-file'});
      const r = (await q('select tier, expires from licenses where username = $1', [user]))[0];
      const tier = r && (!r.expires || new Date(r.expires) > new Date()) ? r.tier : 'se';
      if (RANK[tier] < RANK[PAID[d]] && !isAdmin(user)) return send(res, 403, {error:'tier', message:'이 악기는 더 높은 등급에서 쓸 수 있어요', need:PAID[d]});
      let buf; try { buf = await readFile(path.join(process.cwd(), 'private', 'samples', d, f)); } catch (e) { return send(res, 404, {error:'no-file'}); }
      res.statusCode = 200;
      res.setHeader('content-type', f.endsWith('.json') ? 'application/json; charset=utf-8' : 'audio/ogg');
      res.setHeader('cache-control', 'private, max-age=86400');   // 그 사람 브라우저에만 저장 (공용 캐시 X)
      return res.end(buf);
    }
    if (req.method === 'GET') {
      const rows = await q('select tier, expires from licenses where username = $1', [user]);
      const r = rows[0];
      if (!r) return send(res, 200, {tier:'se', signedIn:true, user});
      const expired = r.expires && new Date(r.expires) < new Date();
      return send(res, 200, {tier:expired ? 'se' : r.tier, signedIn:true, user, expires:r.expires || null, expired:!!expired});
    }
    if (req.method === 'POST') {
      if (!isAdmin(user)) return send(res, 403, {error:'forbidden', message:'관리자만 바꿀 수 있어요'});
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      if (!body || typeof body !== 'object') body = {};
      const tier = String(body.tier || ''), target = String(body.username || user);
      if (!TIERS.includes(tier)) return send(res, 400, {error:'bad-tier', message:'등급은 se·six·pro·max 중 하나예요'});
      await q(`insert into licenses (username, tier, source, note) values ($1, $2, 'admin', $3)
               on conflict (username) do update set tier = excluded.tier, source = 'admin', started = now(), note = excluded.note`,
              [target, tier, String(body.note || '').slice(0, 200)]);
      return send(res, 200, {ok:true, username:target, tier});
    }
    return send(res, 405, {error:'method'});
  } catch (e) {
    return send(res, 500, {error:'server', message:String(e && e.message || e).slice(0, 200)});
  }
}
