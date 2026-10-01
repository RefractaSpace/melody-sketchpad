/* 27-community.js — 커뮤니티 (디스코드식 옆 패널)
   채널 4개 · 메시지 · 이모지 반응 · 곡 붙이기 · 메시지 안에서 바로 재생
   새 메시지는 4초마다 서버에 물어본다 (열려 있을 때만). */
const CHAT_API = (window.MSK_SERVER || '') + '/api/chat';
const CM_DEFAULT_CH = [{id:'songs',name:'공개곡',desc:'만든 곡을 올려요'},{id:'help',name:'질문',desc:'막히는 것을 물어봐요'},
  {id:'show',name:'자랑',desc:'잘된 것을 보여줘요'},{id:'talk',name:'잡담',desc:'아무 이야기나'}];
const CM_DEFAULT_EMOJI = ['\u2764','\uD83D\uDD25','\uD83D\uDC4F','\uD83C\uDFB5','\uD83D\uDE2E','\uD83D\uDE02'];
const CM = {ch:'songs', last:0, timer:null, open:false, chans:[], emoji:[], me:null,
            attach:null, audio:new Map(), playing:null, busy:false};

async function cmCall(path, opt = {}) {
  const a = typeof authInfo === 'function' && authInfo();
  const h = {...(opt.headers || {})};
  if (a && a.token) h.authorization = 'Bearer ' + a.token;
  if (opt.body) h['content-type'] = 'application/json';
  const r = await fetch(CHAT_API + path, {...opt, headers:h, body:opt.body ? JSON.stringify(opt.body) : undefined});
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error((j && j.message) || '잠시 뒤에 다시 해 주세요'), {status:r.status, data:j});
  return j;
}
const cmEsc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cmTime = d => { const x = new Date(d), n = new Date();
  const hm = `${x.getHours() < 12 ? '오전' : '오후'} ${x.getHours() % 12 || 12}:${String(x.getMinutes()).padStart(2,'0')}`;
  return x.toDateString() === n.toDateString() ? hm : `${x.getMonth()+1}/${x.getDate()} ${hm}`; };

/* ── 열고 닫기 ── */
async function openCommunity() {
  const p = $('commPanel'); if (!p) return;
  p.hidden = false; document.body.classList.add('has-cmp'); CM.open = true;
  if (!CM.chans.length) {
    CM.chans = CM_DEFAULT_CH; CM.emoji = CM_DEFAULT_EMOJI;      // 서버를 못 만나도 채널은 보이게
    cmTabs();
    try { const j = await cmCall('?action=channels'); if (j.channels?.length) { CM.chans = j.channels; CM.emoji = j.emoji; cmTabs(); } } catch (e) {}
  }
  cmLoginHint();
  await cmLoad(true);
  if (CM.timer) clearInterval(CM.timer);
  CM.timer = setInterval(() => { if (CM.open && !document.hidden) cmLoad(false); }, 4000);
}
function closeCommunity() {
  const p = $('commPanel'); if (p) p.hidden = true;
  document.body.classList.remove('has-cmp'); CM.open = false;
  if (CM.timer) { clearInterval(CM.timer); CM.timer = null; }
  cmStop();
}
const cmLoginHint = () => { const a = typeof authInfo === 'function' && authInfo();
  $('cmHint').hidden = !!a; $('cmText').disabled = !a; $('cmSend').disabled = !a; $('cmSong').disabled = !a; };

/* ── 채널 ── */
function cmTabs() {
  const n = $('cmTabs'); if (!n) return;
  n.innerHTML = CM.chans.map(c => `<button class="tbtn xs${c.id === CM.ch ? ' solid' : ''}" role="tab" data-ch="${c.id}" title="${cmEsc(c.desc)}">${cmEsc(c.name)}</button>`).join('');
  for (const b of n.querySelectorAll('button')) b.onclick = () => {
    CM.ch = b.dataset.ch; CM.last = 0; $('cmFeed').innerHTML = ''; cmTabs(); cmLoad(true);
    $('cmText').placeholder = (CM.chans.find(c => c.id === CM.ch) || {}).desc || '메시지 보내기';
  };
}

/* ── 메시지 받아오기 ── */
async function cmLoad(reset) {
  if (CM.busy) return; CM.busy = true;
  try {
    const j = await cmCall(`?channel=${CM.ch}${!reset && CM.last ? '&after=' + CM.last : ''}`);
    CM.me = j.me;
    const f = $('cmFeed'); if (reset) f.innerHTML = '';
    const bottom = f.scrollHeight - f.scrollTop - f.clientHeight < 60;
    for (const m of j.messages) { f.appendChild(cmMsg(m)); CM.last = Math.max(CM.last, Number(m.id)); }
    if (reset && !j.messages.length) f.innerHTML = `<p class="cmp-empty">아직 메시지가 없어요.<br>첫 메시지를 남겨 보세요.</p>`;
    if (reset || bottom) f.scrollTop = f.scrollHeight;
    const on = (j.online || []).length;
    $('cmWho').textContent = on ? `접속 중 ${on}명` : '';
  } catch (e) {
    if (reset) $('cmFeed').innerHTML = `<p class="cmp-empty">${cmEsc(e.message)}</p>`;
  } finally { CM.busy = false; }
}

/* ── 메시지 한 개 그리기 ── */
function cmMsg(m) {
  const el = document.createElement('div'); el.className = 'cmm'; el.dataset.id = m.id;
  if (m.deleted) { el.innerHTML = `<div class="cmm-bd"><p class="cmm-del">지워진 메시지</p></div>`; return el; }
  const mine = CM.me && m.username === CM.me;
  const rx = (m.reactions || []).map(r =>
    `<button class="cmm-rx${CM.me && r.who.includes(CM.me) ? ' on' : ''}" data-e="${cmEsc(r.emoji)}">${cmEsc(r.emoji)} ${r.n}</button>`).join('');
  el.innerHTML = `
    <div class="cmm-av">${cmEsc(m.username.slice(0, 1))}</div>
    <div class="cmm-bd">
      <div class="cmm-who">${cmEsc(m.username)}<em>${cmTime(m.created)}</em>${mine ? '<button class="cmm-x" title="지우기">✕</button>' : ''}</div>
      ${m.text ? `<p class="cmm-tx">${cmEsc(m.text)}</p>` : ''}
      ${m.song_url ? `<div class="cmm-song">
          <button class="cmm-play" title="듣기">▶</button>
          <div class="cmm-si"><b>${cmEsc(m.song_name || '곡')}</b><span>${m.song_bars ? m.song_bars + '마디 · ' : ''}${m.song_bpm || ''}${m.song_bpm ? ' BPM' : ''}</span>
            <div class="cmm-bar"><i></i></div></div>
          <button class="tbtn xs cmm-open" title="이 곡을 열기">열기</button></div>` : ''}
      <div class="cmm-rxs">${rx}<button class="cmm-rx add" title="반응 더하기">＋</button></div>
    </div>`;
  el.querySelector('.cmm-x')?.addEventListener('click', () => cmDelete(m.id));
  for (const b of el.querySelectorAll('.cmm-rx:not(.add)')) b.onclick = () => cmReact(m.id, b.dataset.e);
  el.querySelector('.cmm-rx.add')?.addEventListener('click', e => cmPickEmoji(e.target, m.id));
  el.querySelector('.cmm-play')?.addEventListener('click', () => cmPlay(m, el));
  el.querySelector('.cmm-open')?.addEventListener('click', () => cmOpenSong(m));
  return el;
}

/* ── 반응 ── */
function cmPickEmoji(anchor, id) {
  document.querySelector('.cmp-pick')?.remove();
  const box = document.createElement('div'); box.className = 'cmp-pick';
  box.innerHTML = CM.emoji.map(e => `<button data-e="${cmEsc(e)}">${cmEsc(e)}</button>`).join('');
  anchor.parentNode.appendChild(box);
  for (const b of box.querySelectorAll('button')) b.onclick = () => { box.remove(); cmReact(id, b.dataset.e); };
  setTimeout(() => document.addEventListener('click', function h(ev) {
    if (!box.contains(ev.target)) { box.remove(); document.removeEventListener('click', h); } }), 0);
}
async function cmReact(id, emoji) {
  if (!authInfo()) return status('반응하려면 로그인해 주세요.');
  try { await cmCall('?action=react', {method:'POST', body:{id:Number(id), emoji}}); CM.last = 0; await cmLoad(true); }
  catch (e) { status(e.message); }
}
async function cmDelete(id) {
  if (!confirm('이 메시지를 지울까요?')) return;
  try { await cmCall('?action=delete', {method:'POST', body:{id:Number(id)}}); CM.last = 0; await cmLoad(true); }
  catch (e) { status(e.message); }
}

/* ── 곡 듣기: 누를 때 그 자리에서 소리로 바꾸고, 한 번 만든 건 기억해 둔다 ── */
function cmStop() {
  if (CM.playing) { try { CM.playing.el.pause(); } catch (e) {} CM.playing.row?.classList.remove('on'); CM.playing = null; }
  document.querySelectorAll('.cmm-play').forEach(b => b.textContent = '▶');
}
async function cmPlay(m, row) {
  const btn = row.querySelector('.cmm-play'), bar = row.querySelector('.cmm-bar i');
  if (CM.playing && CM.playing.id === m.id) { cmStop(); return; }
  cmStop();
  let url = CM.audio.get(m.id);
  if (!url) {
    btn.textContent = '…'; btn.disabled = true;
    try {
      const u = new Uint8Array(await (await fetch(m.song_url)).arrayBuffer());
      const got = await decodeMSK(u);                      // 곡 파일은 바이너리 (MSK)
      const snap = JSON.stringify(S), mode = S.playMode;
      S = normalize(got.song); S.playMode = 'song';
      const buf = await renderWav();
      S = normalize(JSON.parse(snap)); S.playMode = mode;
      url = URL.createObjectURL(new Blob([buf instanceof Uint8Array ? buf : new Uint8Array(buf)], {type:'audio/wav'}));
      CM.audio.set(m.id, url);
    } catch (e) { btn.textContent = '▶'; btn.disabled = false; return status('이 곡을 들을 수 없어요: ' + (e.message || e)); }
    btn.disabled = false;
  }
  const a = new Audio(url); btn.textContent = '■'; row.classList.add('on');
  CM.playing = {id:m.id, el:a, row};
  a.ontimeupdate = () => { if (bar && a.duration) bar.style.width = (a.currentTime / a.duration * 100) + '%'; };
  a.onended = () => { if (bar) bar.style.width = '0%'; cmStop(); };
  a.play().catch(() => { btn.textContent = '▶'; cmStop(); });
}
async function cmOpenSong(m) {
  if (!confirm('지금 곡을 두고 이 곡을 열까요?')) return;
  try {
    const u = new Uint8Array(await (await fetch(m.song_url)).arrayBuffer());
    const got = await decodeMSK(u);
    if (typeof openLoaded === 'function') { await openLoaded({song:got.song, name:got.name || m.song_name}); }
    else { S = normalize(got.song); save(); refreshAll(); }
    closeCommunity(); status(`"${m.song_name || '곡'}"을 열었어요`);
  } catch (e) { status('이 곡을 열 수 없어요'); }
}

/* ── 보내기 ── */
async function cmSend() {
  const t = $('cmText').value.trim();
  if (!t && !CM.attach) return;
  try {
    await cmCall('?action=send', {method:'POST', body:{channel:CM.ch, text:t, song:CM.attach}});
    $('cmText').value = ''; CM.attach = null; $('cmAttach').hidden = true;
    await cmLoad(false); $('cmFeed').scrollTop = $('cmFeed').scrollHeight;
  } catch (e) { status(e.message); }
}

/* ── 지금 곡 붙이기: 서버에 올리고 그 주소를 메시지에 붙인다 ── */
async function cmAttachSong() {
  if (!authInfo()) return status('곡을 올리려면 로그인해 주세요.');
  const b = $('cmSong'); const old = b.textContent;
  b.textContent = '…'; b.disabled = true;
  try {
    const r = await cloudUpload(true);                       // 지금 곡을 서버에 저장
    const url = r && r.url;
    if (!url) throw new Error('서버가 곡 주소를 주지 않았어요');
    const name = (lib.list[lib.current] || {}).name || '내 곡';
    const bars = Math.max(1, Math.ceil((curPat()?.len || 48) / 48));
    CM.attach = {url, name, bars, bpm:S.bpm};
    $('cmAttachName').textContent = `♪ ${name} · ${bars}마디 · ${S.bpm} BPM`;
    $('cmAttach').hidden = false; $('cmText').focus();
  } catch (e) { status('곡을 붙이지 못했어요: ' + e.message); }
  finally { b.textContent = old; b.disabled = false; }
}

/* ── 버튼 연결 ── */
(() => {
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
  on('commBtn', 'click', () => CM.open ? closeCommunity() : openCommunity());
  on('cmClose', 'click', closeCommunity);
  on('cmSend', 'click', cmSend);
  on('cmSong', 'click', cmAttachSong);
  on('cmAttachX', 'click', () => { CM.attach = null; $('cmAttach').hidden = true; });
  on('cmText', 'keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cmSend(); } });
  on('cmWide', 'click', () => { document.body.classList.toggle('cmp-wide'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CM.open) cmLoad(false); });
})();
