/* 27-community.js — 🌐 커뮤니티: 곡 게시 · 목록(최신·인기·검색) · 좋아요 · 댓글 · 열어서 듣기 */
const CM_API = (window.MSK_SERVER || '') + '/api/community';
let cmSort = 'new', cmCur = null, cmT = 0;
const cmAuthH = () => { const a = authInfo(); return a ? {authorization:'Bearer ' + a.token} : {}; };
async function cmCall(q, opt = {}) { const r = await fetch(CM_API + q, {...opt, headers:{...cmAuthH(), ...(opt.headers || {})}}); if (r.status === 401 && authInfo()) setAuth(null); if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (e) {} throw new Error(m || 'HTTP ' + r.status); } return r; }
const cmSongCache = new Map();
const cmSong = id => cmSongCache.get(id) || (cmSongCache.set(id, (async () => { const u = new Uint8Array(await (await cmCall('?id=' + id + '&file=1')).arrayBuffer()); return decodeMSK(u); })()), cmSongCache.get(id));
const ago = iso => { const s = (Date.now() - new Date(iso)) / 1000; return s < 60 ? '방금' : s < 3600 ? Math.floor(s / 60) + '분 전' : s < 86400 ? Math.floor(s / 3600) + '시간 전' : Math.floor(s / 86400) + '일 전'; };
async function openCommunity() { $('commPage').hidden = false; document.body.style.overflow = 'hidden'; $('cmBack').focus(); cmLoad(); }
function closeCommunity() { $('commPage').hidden = true; document.body.style.overflow = ''; }
async function cmLoad() {
  const g = $('cmGrid'); g.innerHTML = '<p class="dsub">불러오는 중…</p>';
  ['cmNew', 'cmTop'].forEach(id => $(id).classList.toggle('solid', (id === 'cmNew') === (cmSort === 'new')));
  let posts; try { posts = (await (await cmCall(`?sort=${cmSort}&q=${encodeURIComponent($('cmSearch').value.trim())}`)).json()).posts; } catch (e) { g.innerHTML = `<p class="dsub">목록을 못 불러왔어요: ${e.message}</p>`; return; }
  g.innerHTML = posts.length ? '' : '<p class="dsub">아직 글이 없어요. 오른쪽 위 "지금 곡 게시하기"로 첫 곡을 올려 보세요.</p>';
  for (const p of posts) {
    const card = document.createElement('button'); card.className = 'mp-song cm-card'; card.setAttribute('aria-label', `${p.title}, ${p.author}, 좋아요 ${p.likes}, 댓글 ${p.comments}`);
    const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
    const info = document.createElement('div'); info.className = 'mp-info'; info.innerHTML = `<b></b><small class="cm-by"></small><small>${p.bpm ? p.bpm + ' BPM · ' : ''}${p.bars ? p.bars + '마디 · ' : ''}${ago(p.created)}</small><small class="cm-counts">♥ ${p.likes} · 💬 ${p.comments}</small>`;
    info.querySelector('b').textContent = p.title; info.querySelector('.cm-by').textContent = '@' + p.author + (p.tags.length ? ' · #' + p.tags.join(' #') : '');
    card.append(cv, info); g.appendChild(card); card.onclick = () => cmOpen(p.id);
    cmSong(p.id).then(r => drawThumb(cv, r.song)).catch(() => {});
  }
}
async function cmOpen(id) {
  let post; try { post = (await (await cmCall('?id=' + id)).json()).post; } catch (e) { status('글을 못 열었어요: ' + e.message); return; }
  cmCur = post; $('cmpTitle').textContent = post.title; $('cmpMeta').textContent = `@${post.author} · ${new Date(post.created).toLocaleString('ko-KR', {dateStyle:'medium', timeStyle:'short'})}${post.bpm ? ' · ' + post.bpm + ' BPM' : ''}${post.bars ? ' · ' + post.bars + '마디' : ''}`;
  $('cmpDesc').textContent = post.desc || '(설명 없음)'; $('cmpTags').textContent = post.tags.map(t => '#' + t).join(' ');
  $('cmpLike').textContent = `${post.liked ? '♥' : '♡'} 좋아요 ${post.likes}`; $('cmpLike').setAttribute('aria-pressed', post.liked);
  const me = (authInfo() || {}).username; $('cmpDel').hidden = me !== post.author;
  $('cmpCmtBox').hidden = !me; $('cmpLoginHint').hidden = !!me;
  cmComments(); openDlg($('cmPost'));
  cmSong(id).then(r => drawThumb($('cmpThumb'), r.song)).catch(() => {});
}
function cmComments() {
  const L = $('cmpComments'), me = (authInfo() || {}).username; L.innerHTML = cmCur.comments.length ? '' : '<p class="dsub">첫 댓글을 남겨 보세요.</p>';
  for (const c of cmCur.comments) { const d = document.createElement('div'); d.className = 'cm-cmt'; d.innerHTML = '<b></b><span></span><small></small>'; d.querySelector('b').textContent = '@' + c.user; d.querySelector('span').textContent = c.text; d.querySelector('small').textContent = ago(c.at);
    if (me && (me === c.user || me === cmCur.author)) { const x = document.createElement('button'); x.className = 'tbtn xs'; x.textContent = '지우기'; x.setAttribute('aria-label', '댓글 지우기'); x.onclick = async () => { try { await cmCall(`?id=${cmCur.id}&comment=${c.id}`, {method:'DELETE'}); cmCur.comments = cmCur.comments.filter(y => y.id !== c.id); cmComments(); } catch (e) { status(e.message); } }; d.appendChild(x); }
    L.appendChild(d); }
}
$('cmpPlay').onclick = async () => { try { const r = await cmSong(cmCur.id); $('cmPost').close(); closeCommunity(); await openLoaded({song:r.song, name:cmCur.title, from:'커뮤니티', samples:r.samples, warnings:[]}); status(`@${cmCur.author}의 "${cmCur.title}"을 새 곡으로 열었어요 (원본은 그대로).`); } catch (e) { status('열지 못했어요: ' + e.message); } };
$('cmpLike').onclick = async () => { if (!authInfo()) { status('좋아요는 로그인하면 누를 수 있어요.'); return; } try { const j = await (await cmCall(`?action=like&id=${cmCur.id}`, {method:'POST'})).json(); cmCur.likes = j.likes; cmCur.liked = j.liked; $('cmpLike').textContent = `${j.liked ? '♥' : '♡'} 좋아요 ${j.likes}`; $('cmpLike').setAttribute('aria-pressed', j.liked); } catch (e) { status(e.message); } };
$('cmpSend').onclick = async () => { const text = $('cmpInput').value.trim(); if (!text) return; try { const j = await (await cmCall(`?action=comment&id=${cmCur.id}`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({text})})).json(); cmCur.comments.push(j.comment); $('cmpInput').value = ''; cmComments(); } catch (e) { status(e.message); } };
$('cmpInput').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) $('cmpSend').click(); };
$('cmpDel').onclick = async () => { if (!confirm(`"${cmCur.title}" 글을 지울까요? 댓글·좋아요도 함께 지워져요.`)) return; try { await cmCall('?id=' + cmCur.id, {method:'DELETE'}); $('cmPost').close(); cmLoad(); status('글을 지웠어요.'); } catch (e) { status(e.message); } };
$('cmpClose').onclick = () => $('cmPost').close();
$('cmPublish').onclick = () => { if (!authInfo()) { status('게시하려면 로그인해 주세요.'); closeCommunity(); cloudRefresh(); openDlg($('cloudDlg')); return; } $('cmPubTitle').value = lib.list[lib.current].name; $('cmPubMsg').textContent = ''; openDlg($('cmPubDlg')); };
$('cmPubGo').onclick = async () => {
  try { $('cmPubMsg').textContent = '올리는 중…'; const u = await encodeMSK(S, lib.list[lib.current].name, await songSamples(S)); if (u.length > 4 * 1024 * 1024) throw new Error('곡이 4MB보다 커요');
    const q = `?action=publish&title=${encodeURIComponent($('cmPubTitle').value)}&desc=${encodeURIComponent($('cmPubDesc').value)}&tags=${encodeURIComponent($('cmPubTags').value)}&bpm=${S.bpm}&bars=${S.playlist.clips.length ? songBars() : curPat().bars}`;
    await cmCall(q, {method:'POST', headers:{'content-type':'application/octet-stream'}, body:u}); $('cmPubDlg').close(); $('cmPubDesc').value = $('cmPubTags').value = ''; status('커뮤니티에 게시했어요.'); cmSort = 'new'; cmLoad();
  } catch (e) { $('cmPubMsg').textContent = '게시 실패: ' + e.message; } };
$('cmPubCancel').onclick = () => $('cmPubDlg').close();
$('cmBack').onclick = closeCommunity; $('commPage').addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeCommunity(); });
$('cmNew').onclick = () => { cmSort = 'new'; cmLoad(); }; $('cmTop').onclick = () => { cmSort = 'top'; cmLoad(); };
$('cmSearch').oninput = () => { clearTimeout(cmT); cmT = setTimeout(cmLoad, 350); };
$('commBtn').onclick = openCommunity;
