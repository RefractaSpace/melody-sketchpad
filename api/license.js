// 6: 라이선스 — 내 등급을 서버에서 확인한다 (브라우저 조작으로는 못 바꿈)
//   GET  /api/license          내 등급
//   POST /api/license  {tier}  등급 바꾸기 — 관리자만 (결제가 붙기 전까지의 임시 통로)
import { cors, readToken, isAdmin } from './_lib.js';
import { hasDB, q, ensureDB } from './_db.js';

const TIERS = ['se', 'six', 'pro', 'max'];
const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = who(req);
  if (!user) return send(res, 200, {tier:'se', signedIn:false});     // 로그인 안 하면 무료
  if (!hasDB()) return send(res, 200, {tier:'se', signedIn:true, note:'db-off'});
  try {
    await ensureDB();
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
