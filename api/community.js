// 커뮤니티 API — 곡 게시 · 목록 · 좋아요 · 댓글 · 신고 · 관리자 숨김 (보기는 누구나, 쓰기는 로그인)
//   GET    /api/community?sort=new|top&q=검색     → {posts:[요약]}  (요약 파일 하나만 읽음)
//   GET    /api/community?reported=1              → 신고된 글 (관리자)
//   GET    /api/community?id=…[&file=1]           → 글(댓글 포함) / 곡 파일
//   POST   ?action=publish&title=&desc=&tags=      (본문 = .msk)
//   POST   ?action=like&id=… · ?action=comment&id=… {text}
//   POST   ?action=report&id=…[&comment=…] {reason} → 신고 (한 사람 한 번, 3명이면 자동 숨김)
//   POST   ?action=hide|unhide&id=…[&comment=…]    → 관리자 숨기기/보이기
//   POST   ?action=reindex                         → 관리자: 요약 파일 다시 만들기
//   DELETE ?id=…[&comment=…]                       → 내 글·내 댓글(글쓴이는 자기 글의 댓글도)
import { put, list, del } from '@vercel/blob';
import crypto from 'node:crypto';
import { cors, readToken, readJson, isAdmin } from './_lib.js';

const P = 'community/', IDX = 'community/_index', MAX = 4 * 1024 * 1024, AUTO_HIDE = 3, clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
const getJson = async b => (await fetch(b.downloadUrl || b.url, {cache:'no-store'})).json();
async function getPost(id) { const b = (await list({prefix:P + id + '/post', limit:5})).blobs; if (!b.length) return null; return {post:await getJson(b[0]), blobs:b}; }
const summary = p => ({id:p.id, title:p.title, desc:p.desc.slice(0, 140), tags:p.tags, author:p.author, created:p.created, likes:p.likes.length, comments:p.comments.filter(c => !c.hidden).length, bpm:p.bpm, bars:p.bars, size:p.size, hidden:!!p.hidden, reports:(p.reports || []).length});
// 요약 파일: 글마다 파일을 읽지 않도록 모든 글의 요약을 한 파일에 (없거나 깨지면 글 파일들로 다시 만듦)
async function loadIndex() {
  const b = (await list({prefix:IDX, limit:10})).blobs;
  if (b.length) { try { return {items:(await getJson(b[0])).items, blobs:b}; } catch (e) {} }
  return rebuildIndex(b);
}
async function rebuildIndex(old = []) {
  const blobs = (await list({prefix:P, limit:1000})).blobs.filter(b => /\/post[^/]*\.json$/.test(b.pathname));
  const posts = (await Promise.all(blobs.map(b => getJson(b).catch(() => null)))).filter(Boolean);
  const items = posts.map(summary); await writeIndex(items, old); return {items, blobs:(await list({prefix:IDX, limit:10})).blobs};
}
async function writeIndex(items, old) { await put(IDX + '.json', JSON.stringify({items, at:new Date().toISOString()}), {access:'public', addRandomSuffix:true, contentType:'application/json'}); if (old && old.length) await del(old.map(b => b.url)); }
async function indexSet(post, remove) { const {items, blobs} = await loadIndex(); const rest = items.filter(x => x.id !== post.id); if (!remove) rest.push(summary(post)); await writeIndex(rest, blobs); }
async function savePost(post, old) { await put(P + post.id + '/post.json', JSON.stringify(post), {access:'public', addRandomSuffix:true, contentType:'application/json'}); if (old && old.length) await del(old.map(b => b.url)); await indexSet(post); }
async function rawBody(req) { if (Buffer.isBuffer(req.body)) return req.body; const c = []; let n = 0; for await (const x of req) { n += x.length; if (n > MAX) throw Object.assign(new Error('big'), {status:413}); c.push(x); } return Buffer.concat(c); }

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({error:'no-store', message:'서버 저장소가 연결되지 않았어요'});
  const q = req.query, id = String(q.id || ''), action = String(q.action || ''), u = who(req), admin = isAdmin(u);
  if (id && !/^[a-z0-9]{8,24}$/.test(id)) return res.status(400).json({error:'bad-id'});
  try {
    if (req.method === 'GET' && !id) {
      res.setHeader('Cache-Control', 'no-store');
      let posts = (await loadIndex()).items;
      if (q.reported) { if (!admin) return res.status(403).json({error:'admin', message:'관리자만 볼 수 있어요'}); posts = posts.filter(p => p.reports > 0 || p.hidden).sort((a, b) => b.reports - a.reports); return res.status(200).json({posts}); }
      posts = posts.filter(p => !p.hidden || p.author === u || admin);
      const s = clean(q.q, 40).toLowerCase(); if (s) posts = posts.filter(p => (p.title + ' ' + p.desc + ' ' + p.tags.join(' ') + ' ' + p.author).toLowerCase().includes(s));
      posts.sort(q.sort === 'top' ? (a, b) => b.likes - a.likes || b.created.localeCompare(a.created) : (a, b) => b.created.localeCompare(a.created));
      return res.status(200).json({posts:posts.slice(0, 100).map(p => admin ? p : {...p, reports:undefined})});
    }
    if (req.method === 'GET') {
      const g = await getPost(id); if (!g || (g.post.hidden && g.post.author !== u && !admin)) return res.status(404).json({error:'not-found', message:'글이 없거나 숨겨졌어요'});
      if (q.file) { const f = (await list({prefix:P + id + '/song', limit:2})).blobs[0]; if (!f) return res.status(404).json({error:'no-file'}); const r = await fetch(f.downloadUrl || f.url); res.setHeader('Content-Type', 'application/octet-stream'); return res.status(200).send(Buffer.from(await r.arrayBuffer())); }
      const p = g.post, comments = p.comments.filter(c => !c.hidden || admin || c.user === u).map(c => ({id:c.id, user:c.user, text:c.text, at:c.at, hidden:!!c.hidden, ...(admin ? {reports:(c.reports || []).length} : {}), reported:!!(u && (c.reports || []).some(r => r.user === u))}));
      return res.status(200).json({post:{...summary(p), reports:admin ? (p.reports || []) : undefined, desc:p.desc, comments, liked:!!(u && p.likes.includes(u)), reported:!!(u && (p.reports || []).some(r => r.user === u)), admin}});
    }
    if (!u) return res.status(401).json({error:'login', message:'로그인해야 해요'});
    if (req.method === 'POST' && action === 'reindex') { if (!admin) return res.status(403).json({error:'admin'}); const {items} = await rebuildIndex((await list({prefix:IDX, limit:10})).blobs); return res.status(200).json({ok:true, posts:items.length}); }
    if (req.method === 'POST' && action === 'publish') {
      const body = await rawBody(req); if (body.subarray(0, 3).toString() !== 'MSK') return res.status(400).json({error:'not-msk', message:'MSK 파일이 아니에요'});
      const title = clean(q.title, 60); if (!title) return res.status(400).json({error:'title', message:'제목을 넣어 주세요'});
      const post = {id:crypto.randomBytes(6).toString('hex'), title, desc:clean(q.desc, 1000), tags:clean(q.tags, 80).split(/[,#\s]+/).filter(Boolean).slice(0, 6), author:u, created:new Date().toISOString(), likes:[], comments:[], reports:[], bpm:+q.bpm || null, bars:+q.bars || null, size:body.length};
      await put(P + post.id + '/song.msk', body, {access:'public', addRandomSuffix:true, contentType:'application/octet-stream'}); await savePost(post);
      return res.status(200).json({post:summary(post)});
    }
    const g = id ? await getPost(id) : null; if (!g) return res.status(404).json({error:'not-found', message:'글이 없어요'});
    const post = g.post; post.reports = post.reports || [];
    const cm = q.comment ? post.comments.find(c => c.id === q.comment) : null; if (q.comment && !cm) return res.status(404).json({error:'no-comment', message:'댓글이 없어요'});
    if (req.method === 'POST' && action === 'like') { const i = post.likes.indexOf(u); if (i >= 0) post.likes.splice(i, 1); else post.likes.push(u); await savePost(post, g.blobs); return res.status(200).json({likes:post.likes.length, liked:i < 0}); }
    if (req.method === 'POST' && action === 'comment') {
      const text = clean((await readJson(req)).text, 500); if (!text) return res.status(400).json({error:'empty', message:'댓글을 넣어 주세요'});
      if (post.comments.length >= 300) return res.status(400).json({error:'full', message:'댓글이 너무 많아요'});
      const c = {id:crypto.randomBytes(4).toString('hex'), user:u, text, at:new Date().toISOString(), reports:[]}; post.comments.push(c); await savePost(post, g.blobs); return res.status(200).json({comment:{id:c.id, user:c.user, text:c.text, at:c.at}});
    }
    if (req.method === 'POST' && action === 'report') {
      const target = cm || post; target.reports = target.reports || [];
      if ((cm ? cm.user : post.author) === u) return res.status(400).json({error:'own', message:'내 글은 신고할 수 없어요'});
      if (target.reports.some(r => r.user === u)) return res.status(409).json({error:'dup', message:'이미 신고했어요'});
      target.reports.push({user:u, reason:clean((await readJson(req)).reason, 200) || '사유 없음', at:new Date().toISOString()});
      const auto = target.reports.length >= AUTO_HIDE && !target.hidden; if (auto) { target.hidden = true; target.hiddenBy = 'auto'; }
      await savePost(post, g.blobs); return res.status(200).json({ok:true, reports:target.reports.length, hidden:!!target.hidden});
    }
    if (req.method === 'POST' && (action === 'hide' || action === 'unhide')) {
      if (!admin) return res.status(403).json({error:'admin', message:'관리자만 할 수 있어요'});
      const target = cm || post; target.hidden = action === 'hide'; target.hiddenBy = action === 'hide' ? u : undefined; if (action === 'unhide') target.reports = [];
      await savePost(post, g.blobs); return res.status(200).json({ok:true, hidden:target.hidden});
    }
    if (req.method === 'DELETE' && cm) { if (cm.user !== u && post.author !== u && !admin) return res.status(403).json({error:'not-yours', message:'내 댓글만 지울 수 있어요'}); post.comments = post.comments.filter(c => c !== cm); await savePost(post, g.blobs); return res.status(200).json({ok:true}); }
    if (req.method === 'DELETE') { if (post.author !== u && !admin) return res.status(403).json({error:'not-yours', message:'내 글만 지울 수 있어요'}); const all = (await list({prefix:P + id + '/', limit:50})).blobs; if (all.length) await del(all.map(b => b.url)); await indexSet(post, true); return res.status(200).json({ok:true}); }
    return res.status(400).json({error:'action'});
  } catch (e) { if (e.status === 413) return res.status(413).json({error:'too-big', message:'곡이 4MB보다 커요'}); return res.status(500).json({error:'server', message:String(e.message || e).slice(0, 200)}); }
}
