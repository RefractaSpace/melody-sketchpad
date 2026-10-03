// 개발자 페이지용 — 접속 통계·사용량·오류, 그리고 곡·사용자 관리
//   POST /api/stats?action=hit        (누구나) 오늘 방문 한 번 세기
//   POST /api/stats?action=err        (누구나) 앱에서 터진 오류 보내기
//   GET  /api/stats?action=overview   (관리자) 한눈에 보기
//   GET  /api/stats?action=users      (관리자) 사용자 목록
//   GET  /api/stats?action=songs      (관리자) 곡(공유 링크) 목록
//   GET  /api/stats?action=errors     (관리자) 오류 목록
//   POST /api/stats?action=hide-song  (관리자) 공유 링크 숨기기
//   POST /api/stats?action=del-user   (관리자) 사용자 지우기
import { cors, readToken, isAdmin } from './_lib.js';
import { hasDB, q, ensureDB } from './_db.js';

const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
const body = req => { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } return (b && typeof b === 'object') ? b : {}; };
const bump = (kind, key, n = 1) =>
  q(`insert into daily (day, kind, key, n) values (current_date, $1, $2, $3)
     on conflict (day, kind, key) do update set n = daily.n + $3`, [kind, String(key).slice(0, 60), n]);

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!hasDB()) return send(res, 503, {error:'db-off'});
  await ensureDB();
  const Q = req.query || {}, action = String(Q.action || ''), user = who(req);

  try {
    // ── 누구나 ──────────────────────────────────────────────
    if (req.method === 'POST' && action === 'hit') {
      const b = body(req);
      await bump('visit', '');
      if (b.lang) await bump('lang', b.lang);
      if (b.device) await bump('device', b.device);
      if (user) await bump('signed', '');
      return send(res, 200, {ok:true});
    }
    if (req.method === 'POST' && action === 'err') {
      const b = body(req);
      const msg = String(b.msg || '').slice(0, 300);
      if (!msg) return send(res, 400, {error:'no-msg'});
      // 같은 오류는 한 줄에 모아 센다 (최근 1일 안)
      const [hit] = await q(`select id from errlog where msg = $1 and at > now() - interval '1 day' limit 1`, [msg]);
      if (hit) await q(`update errlog set n = n + 1, at = now() where id = $1`, [hit.id]);
      else await q(`insert into errlog (msg, where_, ua) values ($1,$2,$3)`,
                   [msg, String(b.where || '').slice(0, 200), String(b.ua || '').slice(0, 200)]);
      await bump('error', '');
      return send(res, 200, {ok:true});
    }

    // ── 여기부터 관리자만 ───────────────────────────────────
    if (!isAdmin(user)) return send(res, 403, {error:'forbidden', message:'관리자만 볼 수 있어요'});

    if (action === 'overview') {
      const days = Math.min(90, Math.max(7, +Q.days || 30));
      const [rows, tot, top, latest] = await Promise.all([
        q(`select day, kind, key, n from daily
           where day > current_date - $1::int order by day`, [days]),
        q(`select (select count(*)::int from users)                    as users,
                  (select count(*)::int from shares where hidden=false) as shares,
                  (select count(*)::int from messages)                  as messages,
                  (select coalesce(sum(plays),0)::int from shares)      as plays,
                  (select count(*)::int from errlog
                     where at > now() - interval '7 days')              as errors7`),
        q(`select name, plays, created from shares where hidden=false order by plays desc limit 5`),
        q(`select username, created from users order by created desc limit 5`),
      ]);
      return send(res, 200, {days, rows, total:tot[0], topSongs:top, newUsers:latest});
    }
    if (action === 'users') {
      const rows = await q(`select u.username, u.created,
               (select count(*)::int from shares s where s.username = u.username) as songs,
               (select count(*)::int from messages m where m.username = u.username) as msgs
             from users u order by u.created desc limit 200`);
      return send(res, 200, {users:rows});
    }
    if (action === 'songs') {
      const rows = await q(`select id, username, name, bars, bpm, plays, created, hidden
                            from shares order by created desc limit 200`);
      return send(res, 200, {songs:rows});
    }
    if (action === 'errors') {
      const rows = await q(`select id, at, msg, where_, ua, n from errlog order by at desc limit 100`);
      return send(res, 200, {errors:rows});
    }
    if (req.method === 'POST' && action === 'hide-song') {
      const id = String(body(req).id || '');
      await q(`update shares set hidden = not hidden where id = $1`, [id]);
      const [row] = await q(`select hidden from shares where id = $1`, [id]);
      return send(res, 200, {ok:true, hidden:row && row.hidden});
    }
    if (req.method === 'POST' && action === 'del-user') {
      const u = String(body(req).username || '');
      if (!u || isAdmin(u)) return send(res, 400, {error:'bad-user'});
      await q(`delete from users where username = $1`, [u]);
      return send(res, 200, {ok:true});
    }
    return send(res, 400, {error:'bad-action'});
  } catch (e) {
    return send(res, 500, {error:'server', message:String(e && e.message || e).slice(0, 200)});
  }
}
