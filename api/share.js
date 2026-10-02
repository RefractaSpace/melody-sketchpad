// 곡 공유 링크 — /s/<id> 로 누구나 곡을 듣게 한다
//   POST /api/share?action=create  {name, url, bars, bpm, size}  → {id, link}
//   GET  /api/share?id=<id>                                       → 곡 정보 (들을 때마다 셈)
//   GET  /api/share?action=mine                                   → 내가 만든 링크
//   POST /api/share?action=delete  {id}                           → 내 것 또는 관리자
import { cors, readToken, isAdmin } from './_lib.js';
import { hasDB, q, ensureDB } from './_db.js';
import crypto from 'crypto';

const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
const body = req => { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } return (b && typeof b === 'object') ? b : {}; };
// 헷갈리는 글자(0·O·1·l·I)를 뺀 6글자
const AB = '23456789abcdefghjkmnpqrstuvwxyz';
const newId = () => Array.from(crypto.randomBytes(6)).map(b => AB[b % AB.length]).join('');

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!hasDB()) return send(res, 503, {error:'db-off', message:'서버 준비 중이에요'});
  await ensureDB();
  const Q = req.query || {}, action = String(Q.action || ''), user = who(req);

  try {
    if (req.method === 'GET') {
      if (action === 'mine') {
        if (!user) return send(res, 401, {error:'auth'});
        const rows = await q(`select id, name, bars, bpm, plays, created from shares
                              where username = $1 and hidden = false order by created desc limit 50`, [user]);
        return send(res, 200, {shares:rows});
      }
      const id = String(Q.id || '');
      if (!/^[a-z0-9]{4,12}$/.test(id)) return send(res, 400, {error:'bad-id'});
      const [row] = await q(`select id, username, name, url, bars, bpm, plays, created, hidden from shares where id = $1`, [id]);
      if (!row || row.hidden) return send(res, 404, {error:'not-found', message:'없는 링크예요'});
      await q(`update shares set plays = plays + 1 where id = $1`, [id]);
      return send(res, 200, {share:{...row, plays:row.plays + 1}});
    }

    if (req.method !== 'POST') return send(res, 405, {error:'method'});
    if (!user) return send(res, 401, {error:'auth', message:'로그인이 필요해요'});

    if (action === 'create') {
      const b = body(req);
      const url = String(b.url || '');
      if (!/^https:\/\//.test(url)) return send(res, 400, {error:'bad-url'});
      // 도배 막기: 1분에 3개까지
      const [{n}] = await q(`select count(*)::int n from shares where username = $1 and created > now() - interval '1 minute'`, [user]);
      if (n >= 3) return send(res, 429, {error:'too-fast', message:'잠깐 쉬었다 만들어 주세요'});
      let id;
      for (let i = 0; i < 5; i++) {                       // 아주 드물게 겹치면 다시
        id = newId();
        const ins = await q(`insert into shares (id, username, name, url, bars, bpm, size)
                             values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning id`,
          [id, user, String(b.name || '').slice(0, 80), url, b.bars || null, b.bpm || null, b.size || null]);
        if (ins.length) return send(res, 200, {id, link:'/s/' + id});
      }
      return send(res, 500, {error:'id-collision'});
    }

    if (action === 'delete') {
      const id = String(body(req).id || '');
      const [row] = await q(`select username from shares where id = $1`, [id]);
      if (!row) return send(res, 404, {error:'not-found'});
      if (row.username !== user && !isAdmin(user)) return send(res, 403, {error:'forbidden'});
      await q(`update shares set hidden = true where id = $1`, [id]);
      return send(res, 200, {ok:true});
    }
    return send(res, 400, {error:'bad-action'});
  } catch (e) {
    return send(res, 500, {error:'server', message:String(e && e.message || e).slice(0, 200)});
  }
}
