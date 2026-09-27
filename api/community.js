// 커뮤니티 API — 곡 게시 · 목록 · 좋아요 · 댓글 (보기는 누구나, 쓰기는 로그인)
//   GET    /api/community?sort=new|top&q=검색     → {posts:[요약]}
//   GET    /api/community?id=…                    → {post} (댓글 포함)
//   GET    /api/community?id=…&file=1             → 곡 파일(.msk)
//   POST   /api/community?action=publish&title=&desc=&tags=  (본문 = .msk) → {post}
//   POST   /api/community?action=like&id=…        → 좋아요 켜기/끄기
//   POST   /api/community?action=comment&id=…     {text} → 댓글
//   DELETE /api/community?id=…[&comment=…]        → 내 글·내 댓글 지우기
import { put, list, del } from '@vercel/blob';
import crypto from 'node:crypto';
import { cors, readToken, readJson } from './_lib.js';

const P = 'community/', MAX = 4 * 1024 * 1024, clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const who = req => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? readToken(a.slice(7)) : null; };
async function getPost(id) { const b = (await list({prefix:P + id + '/post', limit:5})).blobs; if (!b.length) return null; const r = await fetch(b[0].downloadUrl || b[0].url, {cache:'no-store'}); return {post:await r.json(), blobs:b}; }
async function savePost(post, old) { await put(P + post.id + '/post.json', JSON.stringify(post), {access:'public', addRandomSuffix:true, contentType:'application/json'}); if (old && old.length) await del(old.map(b => b.url)); }
const summary = p => ({id:p.id, title:p.title, desc:p.desc.slice(0, 140), tags:p.tags, author:p.author, created:p.created, likes:p.likes.length, comments:p.comments.length, bpm:p.bpm, bars:p.bars, size:p.size});
async function rawBody(req) { if (Buffer.isBuffer(req.body)) return req.body; const c = []; let n = 0; for await (const x of req) { n += x.length; if (n > MAX) throw Object.assign(new Error('big'), {status:413}); c.push(x); } return Buffer.concat(c); }

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({error:'no-store', message:'서버 저장소가 연결되지 않았어요'});
  const q = req.query, id = String(q.id || ''), action = String(q.action || '');
  if (id && !/^[a-z0-9]{8,24}$/.test(id)) return res.status(400).json({error:'bad-id'});
  try {
    if (req.method === 'GET' && !id) {
      const blobs = (await list({prefix:P, limit:1000})).blobs.filter(b => /\/post[^/]*\.json$/.test(b.pathname));
      let posts = (await Promise.all(blobs.slice(0, 200).map(b => fetch(b.downloadUrl || b.url).then(r => r.json()).catch(() => null)))).filter(Boolean);
      const s = clean(q.q, 40).toLowerCase(); if (s) posts = posts.filter(p => (p.title + ' ' + p.desc + ' ' + p.tags.join(' ') + ' ' + p.author).toLowerCase().includes(s));
      posts.sort(q.sort === 'top' ? (a, b) => b.likes.length - a.likes.length || b.created.localeCompare(a.created) : (a, b) => b.created.localeCompare(a.created));
      res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({posts:posts.slice(0, 100).map(summary)});
    }
    if (req.method === 'GET') {
      const g = await getPost(id); if (!g) return res.status(404).json({error:'not-found', message:'글이 없어요'});
      if (q.file) { const f = (await list({prefix:P + id + '/song', limit:2})).blobs[0]; if (!f) return res.status(404).json({error:'no-file'}); const r = await fetch(f.downloadUrl || f.url); res.setHeader('Content-Type', 'application/octet-stream'); return res.status(200).send(Buffer.from(await r.arrayBuffer())); }
      const u = who(req); return res.status(200).json({post:{...summary(g.post), desc:g.post.desc, comments:g.post.comments, liked:!!(u && g.post.likes.includes(u))}});
    }
    const u = who(req); if (!u) return res.status(401).json({error:'login', message:'로그인해야 해요'});
    if (req.method === 'POST' && action === 'publish') {
      const body = await rawBody(req); if (body.subarray(0, 3).toString() !== 'MSK') return res.status(400).json({error:'not-msk', message:'MSK 파일이 아니에요'});
      const title = clean(q.title, 60); if (!title) return res.status(400).json({error:'title', message:'제목을 넣어 주세요'});
      const post = {id:crypto.randomBytes(6).toString('hex'), title, desc:clean(q.desc, 1000), tags:clean(q.tags, 80).split(/[,#\s]+/).filter(Boolean).slice(0, 6), author:u, created:new Date().toISOString(),
        likes:[], comments:[], bpm:+q.bpm || null, bars:+q.bars || null, size:body.length};
      await put(P + post.id + '/song.msk', body, {access:'public', addRandomSuffix:true, contentType:'application/octet-stream'}); await savePost(post);
      return res.status(200).json({post:summary(post)});
    }
    const g = id ? await getPost(id) : null; if (!g) return res.status(404).json({error:'not-found', message:'글이 없어요'});
    const post = g.post;
    if (req.method === 'POST' && action === 'like') { const i = post.likes.indexOf(u); if (i >= 0) post.likes.splice(i, 1); else post.likes.push(u); await savePost(post, g.blobs); return res.status(200).json({likes:post.likes.length, liked:i < 0}); }
    if (req.method === 'POST' && action === 'comment') {
      const text = clean((await readJson(req)).text, 500); if (!text) return res.status(400).json({error:'empty', message:'댓글을 넣어 주세요'});
      if (post.comments.length >= 300) return res.status(400).json({error:'full', message:'댓글이 너무 많아요'});
      const c = {id:crypto.randomBytes(4).toString('hex'), user:u, text, at:new Date().toISOString()}; post.comments.push(c); await savePost(post, g.blobs); return res.status(200).json({comment:c});
    }
    if (req.method === 'DELETE' && q.comment) { const i = post.comments.findIndex(c => c.id === q.comment); if (i < 0) return res.status(404).json({error:'no-comment'}); if (post.comments[i].user !== u && post.author !== u) return res.status(403).json({error:'not-yours', message:'내 댓글만 지울 수 있어요'}); post.comments.splice(i, 1); await savePost(post, g.blobs); return res.status(200).json({ok:true}); }
    if (req.method === 'DELETE') { if (post.author !== u) return res.status(403).json({error:'not-yours', message:'내 글만 지울 수 있어요'}); const all = (await list({prefix:P + id + '/', limit:50})).blobs; if (all.length) await del(all.map(b => b.url)); return res.status(200).json({ok:true}); }
    return res.status(400).json({error:'action'});
  } catch (e) { if (e.status === 413) return res.status(413).json({error:'too-big', message:'곡이 4MB보다 커요'}); return res.status(500).json({error:'server', message:String(e.message || e).slice(0, 200)}); }
}
