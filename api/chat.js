// 채팅 커뮤니티 (디스코드식) — 채널 안의 메시지·이모지 반응·접속 중인 사람
//   GET  /api/chat?channel=songs&after=<id>       새 메시지만 (몇 초마다 물어봄)
//   GET  /api/chat?channel=songs&before=<id>      더 옛날 메시지 (위로 스크롤)
//   POST /api/chat?action=send    {channel, text, song?}
//   POST /api/chat?action=react   {id, emoji}     누르면 켜지고 다시 누르면 꺼짐
//   POST /api/chat?action=delete  {id}            내 것 또는 관리자
//   POST /api/chat?action=hide    {id}            관리자만
import { cors, readToken, isAdmin } from './_lib.js';
import { hasDB, q, ensureDB } from './_db.js';

export const CHANNELS = [
  {id:'songs', name:'공개곡', desc:'만든 곡을 올려요'},
  {id:'help',  name:'질문',   desc:'막히는 것을 물어봐요'},
  {id:'show',  name:'자랑',   desc:'잘된 것을 보여줘요'},
  {id:'talk',  name:'잡담',   desc:'아무 이야기나'},
];
const CH = new Set(CHANNELS.map(c => c.id));
const EMOJI = ['\u2764', '\uD83D\uDD25', '\uD83D\uDC4F', '\uD83C\uDFB5', '\uD83D\uDE2E', '\uD83D\uDE02'];   // 쓸 수 있는 반응 6가지
const LIMIT = 50, TEXT_MAX = 2000;

const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
const body = req => { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } return (b && typeof b === 'object') ? b : {}; };

// 메시지에 반응을 붙여서 돌려준다
async function withReactions(rows) {
  if (!rows.length) return rows;
  const ids = rows.map(r => Number(r.id));
  const rx = await q(`select message_id, emoji, count(*)::int n, array_agg(username) who
                      from reactions where message_id = any($1) group by message_id, emoji`, [ids]);
  const by = new Map();
  for (const r of rx) { const k = String(r.message_id); if (!by.has(k)) by.set(k, []); by.get(k).push({emoji:r.emoji, n:r.n, who:r.who}); }
  return rows.map(r => ({...r, id:String(r.id), reactions:by.get(String(r.id)) || []}));
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const Q = req.query || {};
  if (String(Q.action || '') === 'channels') return send(res, 200, {channels:CHANNELS, emoji:EMOJI});
  if (!hasDB()) return send(res, 503, {error:'db-off', message:'서버 준비 중이에요'});
  await ensureDB();
  const user = who(req);

  try {
    if (req.method === 'GET') {
      const channel = String(Q.channel || 'songs');
      if (!CH.has(channel)) return send(res, 400, {error:'bad-channel'});
      const after = Q.after ? Number(Q.after) : null, before = Q.before ? Number(Q.before) : null;
      let rows;
      if (after) {                                    // 새 메시지만 (아래에 붙임)
        rows = await q(`select id, channel, username, text, song_url, song_name, song_bars, song_bpm, created, edited, deleted, hidden
                        from messages where channel = $1 and id > $2 and hidden = false order by id asc limit $3`, [channel, after, LIMIT]);
      } else {                                        // 최근 또는 더 옛날 (위에 붙임)
        rows = await q(`select id, channel, username, text, song_url, song_name, song_bars, song_bpm, created, edited, deleted, hidden
                        from messages where channel = $1 and hidden = false ${before ? 'and id < $3' : ''} order by id desc limit $2`,
                       before ? [channel, LIMIT, before] : [channel, LIMIT]);
        rows.reverse();
      }
      // 접속 표시 (로그인한 사람만)
      if (user) await q(`insert into presence (username, channel, at) values ($1, $2, now())
                         on conflict (username) do update set channel = excluded.channel, at = now()`, [user, channel]);
      const online = await q(`select username, channel from presence where at > now() - interval '70 seconds' order by username limit 50`);
      return send(res, 200, {messages:await withReactions(rows), online, me:user || null});
    }

    if (req.method !== 'POST') return send(res, 405, {error:'method'});
    if (!user) return send(res, 401, {error:'auth', message:'로그인이 필요해요'});
    const action = String(Q.action || ''), b = body(req);

    if (action === 'send') {
      const channel = String(b.channel || 'songs');
      if (!CH.has(channel)) return send(res, 400, {error:'bad-channel'});
      const text = String(b.text || '').slice(0, TEXT_MAX).trim();
      const song = b.song && typeof b.song === 'object' ? b.song : null;
      if (!text && !song) return send(res, 400, {error:'empty', message:'내용이나 곡이 있어야 해요'});
      // 도배 막기: 5초에 1개
      const [last] = await q(`select created from messages where username = $1 order by id desc limit 1`, [user]);
      if (last && Date.now() - new Date(last.created).getTime() < 5000) return send(res, 429, {error:'too-fast', message:'잠깐 쉬었다 보내 주세요'});
      const [row] = await q(`insert into messages (channel, username, text, song_url, song_name, song_bars, song_bpm, song_size)
                             values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, created`,
        [channel, user, text, song?.url || null, song ? String(song.name || '').slice(0, 80) : null,
         song?.bars || null, song?.bpm || null, song?.size || null]);
      return send(res, 200, {ok:true, id:String(row.id), created:row.created});
    }

    if (action === 'react') {
      const id = Number(b.id), emoji = String(b.emoji || '');
      if (!id || !EMOJI.includes(emoji)) return send(res, 400, {error:'bad-react'});
      const del = await q(`delete from reactions where message_id = $1 and username = $2 and emoji = $3 returning 1`, [id, user, emoji]);
      if (!del.length) await q(`insert into reactions (message_id, username, emoji) values ($1,$2,$3) on conflict do nothing`, [id, user, emoji]);
      const [n] = await q(`select count(*)::int n from reactions where message_id = $1 and emoji = $2`, [id, emoji]);
      return send(res, 200, {ok:true, on:!del.length, n:n.n});
    }

    if (action === 'delete') {
      const id = Number(b.id); if (!id) return send(res, 400, {error:'bad-id'});
      const [m] = await q(`select username from messages where id = $1`, [id]);
      if (!m) return send(res, 404, {error:'no-message'});
      if (m.username !== user && !isAdmin(user)) return send(res, 403, {error:'forbidden'});
      await q(`update messages set deleted = true, text = '', song_url = null where id = $1`, [id]);
      return send(res, 200, {ok:true});
    }

    if (action === 'hide') {
      if (!isAdmin(user)) return send(res, 403, {error:'forbidden'});
      const id = Number(b.id); if (!id) return send(res, 400, {error:'bad-id'});
      await q(`update messages set hidden = true, hidden_by = $2 where id = $1`, [id, user]);
      return send(res, 200, {ok:true});
    }
    return send(res, 400, {error:'bad-action'});
  } catch (e) {
    return send(res, 500, {error:'server', message:String(e && e.message || e).slice(0, 200)});
  }
}
