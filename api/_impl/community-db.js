// 커뮤니티 API — DB 버전. 좋아요·댓글·신고가 한 줄씩 저장돼서 동시에 눌러도 사라지지 않음.
import crypto from 'node:crypto';
import { cors, readToken, readJson, isAdmin } from '../_lib.js';
import { q, ensureDB } from '../_db.js';
import { putFile, readFile, delFiles } from '../_store.js';

const MAX = 4 * 1024 * 1024, AUTO_HIDE = 3, clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
async function rawBody(req) { if (Buffer.isBuffer(req.body)) return req.body; const c = []; let n = 0; for await (const x of req) { n += x.length; if (n > MAX) throw Object.assign(new Error('big'), {status:413}); c.push(x); } return Buffer.concat(c); }
// 글 요약: 좋아요·댓글·신고 수는 표에서 세어 옴
const SUMMARY = `select p.id, p.title, left(p.descr, 140) as "desc", p.tags, p.author, p.created, p.bpm, p.bars, p.size, p.hidden,
  (select count(*) from likes l where l.post_id = p.id)::int as likes,
  (select count(*) from comments c where c.post_id = p.id and not c.hidden)::int as comments,
  (select count(*) from reports r where r.post_id = p.id and r.comment_id is null)::int as reports from posts p`;
const iso = r => ({...r, created:new Date(r.created).toISOString()});

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const qy = req.query, id = String(qy.id || ''), action = String(qy.action || ''), u = who(req), admin = isAdmin(u);
  if (id && !/^[a-z0-9]{8,24}$/.test(id)) return res.status(400).json({error:'bad-id'});
  try {
    await ensureDB();
    if (req.method === 'GET' && !id) {
      res.setHeader('Cache-Control', 'no-store');
      if (qy.reported) { if (!admin) return res.status(403).json({error:'admin', message:'관리자만 볼 수 있어요'});
        const rows = await q(`select * from (${SUMMARY}) s where s.reports > 0 or s.hidden or exists (select 1 from reports r where r.post_id = s.id) order by s.reports desc, s.created desc limit 100`); return res.status(200).json({posts:rows.map(iso)}); }
      const s = clean(qy.q, 40).toLowerCase();
      const rows = await q(`select * from (${SUMMARY}) s where (not s.hidden or s.author = $1 or $2) and ($3 = '' or position($3 in lower(s.title || ' ' || s."desc" || ' ' || array_to_string(s.tags, ' ') || ' ' || s.author)) > 0)
        order by ${qy.sort === 'top' ? 's.likes desc, s.created desc' : 's.created desc'} limit 100`, [u || '', admin, s]);
      return res.status(200).json({posts:rows.map(r => admin ? iso(r) : {...iso(r), reports:undefined})});
    }
    if (req.method === 'GET') {
      const [s] = await q(`${SUMMARY} where p.id = $1`, [id]);
      if (!s || (s.hidden && s.author !== u && !admin)) return res.status(404).json({error:'not-found', message:'글이 없거나 숨겨졌어요'});
      if (qy.file) { const [f] = await q(`select blob_url from posts where id = $1`, [id]); res.setHeader('Content-Type', 'application/octet-stream'); return res.status(200).send(await readFile(f.blob_url)); }
      const [full] = await q(`select descr from posts where id = $1`, [id]);
      const comments = await q(`select c.id, c.username as "user", c.text, c.at, c.hidden, (select count(*) from reports r where r.comment_id = c.id)::int as reports,
          exists (select 1 from reports r where r.comment_id = c.id and r.username = $2) as reported from comments c where c.post_id = $1 and (not c.hidden or $3 or c.username = $2) order by c.at`, [id, u || '', admin]);
      const liked = u ? (await q(`select 1 from likes where post_id = $1 and username = $2`, [id, u])).length > 0 : false;
      const reported = u ? (await q(`select 1 from reports where post_id = $1 and comment_id is null and username = $2`, [id, u])).length > 0 : false;
      const reps = admin ? await q(`select username as "user", reason, at from reports where post_id = $1 and comment_id is null order by at`, [id]) : undefined;
      return res.status(200).json({post:{...iso(s), desc:full.descr, reports:reps, comments:comments.map(c => ({...c, at:new Date(c.at).toISOString(), reports:admin ? c.reports : undefined})), liked, reported, admin}});
    }
    if (!u) return res.status(401).json({error:'login', message:'로그인해야 해요'});
    if (!(await q(`select 1 from users where username = $1`, [u])).length) return res.status(401).json({error:'login', message:'계정이 없어요. 다시 로그인해 주세요'});
    if (req.method === 'POST' && action === 'reindex') { if (!admin) return res.status(403).json({error:'admin'}); const [c] = await q(`select count(*)::int as n from posts`); return res.status(200).json({ok:true, posts:c.n}); }
    if (req.method === 'POST' && action === 'publish') {
      const body = await rawBody(req); if (body.subarray(0, 3).toString() !== 'MSK') return res.status(400).json({error:'not-msk', message:'MSK 파일이 아니에요'});
      const title = clean(qy.title, 60); if (!title) return res.status(400).json({error:'title', message:'제목을 넣어 주세요'});
      const pid = crypto.randomBytes(6).toString('hex'), url = await putFile(`community/${pid}/song.msk`, body);
      await q(`insert into posts (id, author, title, descr, tags, bpm, bars, size, blob_url) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [pid, u, title, clean(qy.desc, 1000), clean(qy.tags, 80).split(/[,#\s]+/).filter(Boolean).slice(0, 6), +qy.bpm || null, +qy.bars || null, body.length, url]);
      const [s] = await q(`${SUMMARY} where p.id = $1`, [pid]); return res.status(200).json({post:iso(s)});
    }
    const [post] = await q(`select id, author, hidden, blob_url from posts where id = $1`, [id]); if (!post) return res.status(404).json({error:'not-found', message:'글이 없어요'});
    const cm = qy.comment ? (await q(`select id, username, hidden from comments where id = $1 and post_id = $2`, [String(qy.comment), id]))[0] : null;
    if (qy.comment && !cm) return res.status(404).json({error:'no-comment', message:'댓글이 없어요'});
    if (req.method === 'POST' && action === 'like') {
      const removed = await q(`delete from likes where post_id = $1 and username = $2 returning 1`, [id, u]);
      if (!removed.length) await q(`insert into likes (post_id, username) values ($1, $2) on conflict do nothing`, [id, u]);
      const [c] = await q(`select count(*)::int as n from likes where post_id = $1`, [id]); return res.status(200).json({likes:c.n, liked:!removed.length});
    }
    if (req.method === 'POST' && action === 'comment') {
      const text = clean((await readJson(req)).text, 500); if (!text) return res.status(400).json({error:'empty', message:'댓글을 넣어 주세요'});
      const cid = crypto.randomBytes(4).toString('hex');
      const ins = await q(`insert into comments (id, post_id, username, text) select $1, $2, $3, $4 where (select count(*) from comments where post_id = $2) < 300 returning id, username as "user", text, at`, [cid, id, u, text]);
      if (!ins.length) return res.status(400).json({error:'full', message:'댓글이 너무 많아요'});
      return res.status(200).json({comment:{...ins[0], at:new Date(ins[0].at).toISOString()}});
    }
    if (req.method === 'POST' && action === 'report') {
      if ((cm ? cm.username : post.author) === u) return res.status(400).json({error:'own', message:'내 글은 신고할 수 없어요'});
      const ins = await q(`insert into reports (post_id, comment_id, username, reason) values ($1, $2, $3, $4) on conflict do nothing returning id`, [id, cm ? cm.id : null, u, clean((await readJson(req)).reason, 200) || '사유 없음']);
      if (!ins.length) return res.status(409).json({error:'dup', message:'이미 신고했어요'});
      const [c] = await q(cm ? `select count(*)::int as n from reports where comment_id = $1` : `select count(*)::int as n from reports where post_id = $1 and comment_id is null`, [cm ? cm.id : id]);
      let hidden = cm ? cm.hidden : post.hidden;
      if (c.n >= AUTO_HIDE && !hidden) { await q(cm ? `update comments set hidden = true where id = $1` : `update posts set hidden = true, hidden_by = 'auto' where id = $1`, [cm ? cm.id : id]); hidden = true; }
      return res.status(200).json({ok:true, reports:c.n, hidden});
    }
    if (req.method === 'POST' && (action === 'hide' || action === 'unhide')) {
      if (!admin) return res.status(403).json({error:'admin', message:'관리자만 할 수 있어요'});
      const on = action === 'hide';
      if (cm) { await q(`update comments set hidden = $2 where id = $1`, [cm.id, on]); if (!on) await q(`delete from reports where comment_id = $1`, [cm.id]); }
      else { await q(`update posts set hidden = $2, hidden_by = $3 where id = $1`, [id, on, on ? u : null]); if (!on) await q(`delete from reports where post_id = $1 and comment_id is null`, [id]); }
      return res.status(200).json({ok:true, hidden:on});
    }
    if (req.method === 'DELETE' && cm) { if (cm.username !== u && post.author !== u && !admin) return res.status(403).json({error:'not-yours', message:'내 댓글만 지울 수 있어요'}); await q(`delete from comments where id = $1`, [cm.id]); return res.status(200).json({ok:true}); }
    if (req.method === 'DELETE') { if (post.author !== u && !admin) return res.status(403).json({error:'not-yours', message:'내 글만 지울 수 있어요'}); await q(`delete from posts where id = $1`, [id]); await delFiles([post.blob_url]); return res.status(200).json({ok:true}); }
    return res.status(400).json({error:'action'});
  } catch (e) { if (e.status === 413) return res.status(413).json({error:'too-big', message:'곡이 4MB보다 커요'}); return res.status(500).json({error:'server', message:String(e.message || e).slice(0, 200)}); }
}
