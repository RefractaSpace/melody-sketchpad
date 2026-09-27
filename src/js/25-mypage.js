/* 25-mypage.js — 내 페이지: 계정 정보 · 서버의 내 곡(미리보기 그림) · 비밀번호 · 로그아웃 */
const fmtSize = b => b >= 1e6 ? (b / 1e6).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
// 곡의 음 배치를 작은 그림으로 (곡 모드면 플레이리스트 전체, 아니면 첫 패턴)
function drawThumb(cv, song) {
  const r = cv.getBoundingClientRect(), W = Math.max(200, Math.round(r.width || 210)), H = 96, x = cv.getContext('2d'); cv.width = W * DPR; cv.height = H * DPR; x.setTransform(DPR, 0, 0, DPR, 0, 0);
  x.fillStyle = CS.bg; x.fillRect(0, 0, W, H);
  const notes = [], cix = {}; song.channels.forEach((c, i) => cix[c.id] = i);
  withSong(song, () => {
    const parts = song.playlist.clips.length ? song.playlist.clips.flatMap(cl => clipParts(cl, 0, MAX_BARS * BAR_T)) : [{P:song.patterns[0], origin:0, from:0, to:patTicks(song.patterns[0])}];
    for (const q of parts) for (const [cid, arr] of Object.entries(q.P.notes)) for (const n of arr) if (n.s >= q.from && n.s < q.to) notes.push({s:n.s + q.origin, l:n.l, p:n.p, c:cix[cid] || 0, drum:(song.channels[cix[cid]] || {}).kind === 'drum'});
  });
  if (!notes.length) { x.fillStyle = CS.mute; x.font = '12px sans-serif'; x.fillText('빈 곡', 10, 20); return; }
  const end = Math.max(...notes.map(n => n.s + n.l)), mel = notes.filter(n => !n.drum), lo = mel.length ? Math.min(...mel.map(n => n.p)) : 48, hi = mel.length ? Math.max(...mel.map(n => n.p)) : 72, sp = Math.max(12, hi - lo + 1);
  for (const n of notes) { const X = n.s / end * W, w = Math.max(1, n.l / end * W);
    if (n.drum) { x.fillStyle = CS.line2; x.fillRect(X, H - 8, Math.max(1, w * 0.6), 5); continue; }
    x.fillStyle = PAT_COLORS[1 + n.c % 7]; x.fillRect(X, (H - 14) - (n.p - lo + 1) / sp * (H - 20), w, 2.5); }
}
async function openMyPage() {
  const a = authInfo(); if (!a) { cloudRefresh(); openDlg($('cloudDlg')); return; }
  $('myPage').hidden = false; document.body.style.overflow = 'hidden'; $('mpBack').focus();
  $('mpAvatar').textContent = a.username[0].toUpperCase(); $('mpName').textContent = a.username; $('mpAuto').checked = lsGet(CA) === '1';
  $('mpLocal').textContent = Object.keys(lib.list).length; $('mpMsg').textContent = '';
  try {
    const me = await authCall('me', null, a.token);
    $('mpMeta').textContent = me.created ? `${new Date(me.created).toLocaleDateString('ko-KR')}에 가입` : '';
    $('mpSongs').textContent = me.songs; $('mpSize').textContent = fmtSize(me.bytes);
    $('mpUse').textContent = `곡 하나는 ${fmtSize(me.limitBytes)}까지 올릴 수 있어요 · 가장 큰 곡 기준`;
  } catch (e) { if (e.status === 401) { setAuth(null); closeMyPage(); status('로그인이 만료됐어요. 다시 로그인해 주세요.'); return; } $('mpMeta').textContent = '서버에 연결하지 못했어요: ' + e.message; }
  mpLoadSongs();
}
async function mpLoadSongs() {
  const g = $('mpGrid'); g.innerHTML = '<p class="dsub">불러오는 중…</p>';
  let songs = []; try { songs = (await (await cloudFetch('')).json()).songs; } catch (e) { g.innerHTML = `<p class="dsub">곡 목록을 못 불러왔어요: ${e.message}</p>`; return; }
  g.innerHTML = songs.length ? '' : '<p class="dsub">아직 서버에 올린 곡이 없어요. "지금 곡 올리기"를 눌러 보세요.</p>';
  const biggest = songs.reduce((m, s) => Math.max(m, s.size), 0); $('mpBarFill').style.width = Math.min(100, biggest / (4 * 1024 * 1024) * 100) + '%';
  for (const s of songs) {
    const card = document.createElement('div'); card.className = 'mp-song'; card.setAttribute('role', 'group'); card.setAttribute('aria-label', s.name);
    const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
    const info = document.createElement('div'); info.className = 'mp-info'; info.innerHTML = `<b></b><small>${fmtSize(s.size)} · ${new Date(s.uploadedAt).toLocaleString('ko-KR', {dateStyle:'medium', timeStyle:'short'})}</small><small class="mp-sub"></small>`; info.querySelector('b').textContent = s.name;
    const act = document.createElement('div'); act.className = 'mp-act';
    const op = document.createElement('button'); op.className = 'tbtn xs solid'; op.textContent = '열기'; op.setAttribute('aria-label', s.name + ' 열기');
    const dl = document.createElement('button'); dl.className = 'tbtn xs'; dl.textContent = '지우기'; dl.setAttribute('aria-label', s.name + ' 서버에서 지우기');
    act.append(op, dl); card.append(cv, info, act); g.appendChild(card);
    let loaded = null;
    const load = async () => loaded || (loaded = (async () => { const u = new Uint8Array(await (await cloudFetch('?id=' + encodeURIComponent(s.id))).arrayBuffer()); return {u, r:await decodeMSK(u)}; })());
    load().then(({r}) => { drawThumb(cv, r.song); const sg = r.song; info.querySelector('.mp-sub').textContent = `${sg.bpm} BPM · 채널 ${sg.channels.length} · ${sg.playlist.clips.length ? '마디 ' + withSong(sg, () => songBars()) : '패턴 ' + sg.patterns.length}`; }).catch(() => {});
    op.onclick = async () => { try { const {r} = await load(); closeMyPage(); await openLoaded({song:r.song, name:r.name || s.name, from:'서버', samples:r.samples, warnings:[]}); status(`서버에서 "${s.name}"을 열었어요.`); } catch (e) { $('mpMsg').textContent = '열지 못했어요: ' + e.message; } };
    dl.onclick = async () => { if (!confirm(`서버에서 "${s.name}"을 지울까요? 내 컴퓨터의 곡은 그대로예요.`)) return; try { await cloudFetch('?id=' + encodeURIComponent(s.id), {method:'DELETE'}); openMyPage(); } catch (e) { $('mpMsg').textContent = '지우지 못했어요: ' + e.message; } };
  }
}
function closeMyPage() { $('myPage').hidden = true; document.body.style.overflow = ''; }
$('mpBack').onclick = closeMyPage;
$('myPage').addEventListener('keydown', e => { if (e.key === 'Escape') closeMyPage(); });
$('mpAuto').onchange = () => lsSet(CA, $('mpAuto').checked ? '1' : '0');
$('mpUp').onclick = async () => { try { await cloudUpload(false); openMyPage(); } catch (e) { $('mpMsg').textContent = '올리지 못했어요: ' + e.message; } };
$('mpPw').onclick = async () => {
  try { const j = await authCall('password', {old:$('mpOld').value, password:$('mpNew').value}, authInfo().token); setAuth({...authInfo(), token:j.token}); $('mpOld').value = $('mpNew').value = ''; $('mpMsg').textContent = '비밀번호를 바꿨어요.'; }
  catch (e) { $('mpMsg').textContent = '바꾸지 못했어요: ' + e.message; }
};
$('mpKeys').onclick = () => { closeMyPage(); cloudRefresh(); openDlg($('cloudDlg')); };
$('mpLogout').onclick = () => { closeMyPage(); $('authLogout').click(); };
$('mpDelete').onclick = () => { closeMyPage(); $('authDelete').click(); };
$('authPage').onclick = () => { $('cloudDlg').close(); openMyPage(); };
$('cloudBtn').onclick = () => authInfo() ? openMyPage() : (cloudRefresh(), openDlg($('cloudDlg')));
