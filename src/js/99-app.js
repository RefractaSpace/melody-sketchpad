/* 99-app.js — 패턴 · 설정 · 단축키 · 확대 · 시작 (가장 마지막에 실행) */

// ---- 설정 ----
const rootSel = $('root'), barsSel = $('bars');
for (let i = 0; i < 12; i++) { const o = document.createElement('option'); o.value = i; o.textContent = NAMES_F[i] === NAMES_S[i] ? NAMES_S[i] : NAMES_F[i] + ' / ' + NAMES_S[i]; rootSel.appendChild(o); }
for (const b of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32]) { const o = document.createElement('option'); o.value = b; o.textContent = b; barsSel.appendChild(o); }
function fillBarSelects() {
  const n = curPat().bars;
  for (const id of ['cpFrom', 'cpTo', 'cpDest']) {
    const el = $(id), v = el.value; el.innerHTML = '';
    for (let b = 1; b <= n; b++) { const o = document.createElement('option'); o.value = b; o.textContent = b; el.appendChild(o); }
    el.value = Math.min(+v || (id === 'cpTo' ? Math.min(2, n) : id === 'cpDest' ? Math.min(3, n) : 1), n);
  }
}
function fillPatSel() {
  const s = $('patSel'); s.innerHTML = '';
  S.patterns.forEach((P, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${nameOf(P.name)} (${P.bars}${typeof t === 'function' ? t('마디단위') : '마디'})`; s.appendChild(o); });
  s.value = S.pat;
}
function refreshTitles() {
  const P = curPat(), c = curCh();
  $('rollTitle').textContent = `${P.name} · ${c.name} (${c.kind === 'drum' ? '드럼' : INSTS[c.inst]})`;
  fillPatSel();
}
function syncControls() {
  fillBarSelects(); fillPatSel();
  $('bpm').value = S.bpm; rootSel.value = S.root; $('mode').value = S.mode; $('snap').value = S.snap; $('len').value = S.len;
  const n = curPat().bars; if (![...barsSel.options].some(o => +o.value === n)) { const o = document.createElement('option'); o.value = n; o.textContent = n; barsSel.appendChild(o); }
  barsSel.value = n;
  $('modePat').setAttribute('aria-checked', S.playMode === 'pat'); $('modeSong').setAttribute('aria-checked', S.playMode === 'song');
}
// 화면 전체를 곡 데이터에 맞춰 다시 그림
// ---- 박자표 · 스윙 ----
$('meterSel').innerHTML = METERS.map(m => `<option value="${m.join('/')}">${m.join('/')}박자</option>`).join('');
function syncMeterUI() { $('meterSel').value = meterOf(S).join('/'); $('swingSel').value = String(Math.round((S.swing || 0) * 5) / 5); }
// 박자를 바꿔도 음·자동화·템포 위치(틱)는 그대로. 패턴 마디 수와 조각 위치만 새 마디 길이로 다시 계산
function setMeter(m) {
  const old = BAR_T, nb = barTicksOf(m); if (meterOf(S).join('/') === m.join('/')) return; pushUndo();
  for (const P of S.patterns) P.bars = clamp(Math.ceil(P.bars * old / nb), 1, MAX_BARS);
  for (const c of S.playlist.clips) { c.bar = clamp(Math.round(c.bar * old / nb), 0, MAX_BARS - 1); if (c.len) c.len = Math.max(1, Math.round(c.len * old / nb)); if (c.off) c.off = Math.round(c.off * old / nb); }
  S.meter = m.slice(); S = normalize(S); save(); refreshAll(); status(`${m.join('/')}박자로 바꿨어요. 음 위치는 그대로이고 마디 수만 다시 셌어요.`);
}
$('meterSel').onchange = () => setMeter($('meterSel').value.split('/').map(Number));
$('swingSel').onchange = () => { pushUndo(); S.swing = +$('swingSel').value; save(); announce('스윙 ' + Math.round(S.swing * 100) + '%'); };
function refreshAll() {
  syncMeterUI();
  const ns = new Set(curNotes()); for (const n of [...sel]) if (!ns.has(n)) sel.delete(n);
  $('selBar').hidden = sel.size === 0;
  syncControls(); refreshTitles(); drawAll(); buildRack(); buildMixer(); drawPlaylist(); buildBrowser();
  if (typeof applyTier === 'function') applyTier();   // 6: 등급에 맞는 악기만 목록에
}
$('bpm').onchange = () => { S.bpm = clamp(Math.round((+$('bpm').value || 150) * 100) / 100, 60, 300); $('bpm').value = S.bpm; save(); if (E) applyMix(E, S.mix); };
rootSel.onchange = () => { S.root = +rootSel.value; save(); drawAll(); };
$('mode').onchange = () => { S.mode = $('mode').value; save(); drawAll(); };
$('snap').onchange = () => { S.snap = +$('snap').value; save(); drawRoll(); drawRuler(); };
$('len').onchange = () => { S.len = +$('len').value; save(); };
barsSel.onchange = () => {
  pushUndo(); const P = curPat(), nb = +barsSel.value, lim = nb * BAR_T; P.bars = nb;
  P.chords = Array.from({length:nb * 4}, (_, i) => P.chords[i] || null);
  for (const cid of Object.keys(P.notes)) P.notes[cid] = P.notes[cid].filter(n => n.s < lim).map(n => ({...n, l:Math.min(n.l, lim - n.s)}));
  for (const cl of S.playlist.clips) if (cl.pat === P.id) cl.bar = Math.min(cl.bar, MAX_BARS - nb);
  startTick = Math.min(startTick, (nb - 1) * BAR_T); save(); refreshAll();
};
$('undo').onclick = () => {
  const s = undoStack.pop(); if (!s) return;
  S = normalize(JSON.parse(s)); sel.clear(); save(); refreshAll(); if (E) applyMix(E, S.mix);
};

// ---- 패턴 ----
function selectPattern(i) {
  if (i < 0 || i >= S.patterns.length) return;
  S.pat = i; sel.clear(); startTick = 0; if (playing && S.playMode === 'pat') { stop(); play(); }
  save(); refreshAll(); announce(`${curPat().name}을 편집해요.`);
}
function renamePattern(i) { const P = S.patterns[i], v = prompt('패턴 이름', P.name); if (v == null) return; pushUndo(); P.name = (v.trim() || P.name).slice(0, 24); save(); refreshAll(); }
function deletePattern(i) {
  if (S.patterns.length < 2) { status('패턴은 적어도 하나 있어야 해요.'); return; }
  const P = S.patterns[i], uses = S.playlist.clips.filter(c => c.pat === P.id).length;
  if (!confirm(`"${P.name}"을 지울까요?` + (uses ? ` 플레이리스트의 조각 ${uses}개도 함께 지워져요.` : '') + ' (되돌리기로 되살릴 수 있어요)')) return;
  pushUndo(); S.patterns.splice(i, 1); S.playlist.clips = S.playlist.clips.filter(c => c.pat !== P.id); S.pat = clamp(S.pat >= i ? S.pat - 1 : S.pat, 0, S.patterns.length - 1);
  save(); refreshAll(); status(`"${P.name}"을 지웠어요.`);
}
function nextPatName() { let k = S.patterns.length + 1; while (S.patterns.some(p => p.name === 'Pattern ' + k)) k++; return 'Pattern ' + k; }
$('patSel').onchange = () => selectPattern(+$('patSel').value);
$('patNew').onclick = () => { if (S.patterns.length >= 64) return; pushUndo(); S.patterns.push(newPattern(nextPatName(), curPat().bars)); selectPattern(S.patterns.length - 1); status(`${curPat().name}을 만들었어요. 플레이리스트 빈칸을 누르면 놓여요.`); };
$('patClone').onclick = () => {
  if (S.patterns.length >= 64) return; pushUndo(); const P = curPat(), n = JSON.parse(JSON.stringify(P)); n.id = newId(); n.name = (P.name + ' 복사').slice(0, 24);
  S.patterns.splice(S.pat + 1, 0, n); selectPattern(S.pat + 1); status(`${P.name}을 복제했어요.`);
};

// ---- 확대 / 축소 ----
function zoom(ax, dir) {
  const v = view();
  if (ax === 'x') { const ni = clamp(zxi + dir, 0, ZX_LEVELS.length - 1); if (ni === zxi) return; const ct = (v.sl + v.vw / 2) / TICKPX; zxi = ni; TICKPX = ZX_LEVELS[zxi]; drawAll(); wrap.scrollLeft = Math.max(0, ct * TICKPX - v.vw / 2); }
  else { const ni = clamp(rhi + dir, 0, RH_LEVELS.length - 1); if (ni === rhi) return; const cr = (v.st + v.vh / 2) / ROWH; rhi = ni; ROWH = RH_LEVELS[rhi]; drawAll(); wrap.scrollTop = Math.max(0, cr * ROWH - v.vh / 2); }
  $('zxOut').disabled = zxi === 0; $('zxIn').disabled = zxi === ZX_LEVELS.length - 1; $('zyOut').disabled = rhi === 0; $('zyIn').disabled = rhi === RH_LEVELS.length - 1;
  drawAll();
}
$('zxIn').onclick = () => zoom('x', 1); $('zxOut').onclick = () => zoom('x', -1); $('zyIn').onclick = () => zoom('y', 1); $('zyOut').onclick = () => zoom('y', -1);
wrap.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom('x', e.deltaY < 0 ? 1 : -1); } }, {passive:false});
$('moreBtn').onclick = () => { const o = $('more').classList.toggle('open'); $('moreBtn').setAttribute('aria-expanded', o); $('moreBtn').setAttribute('aria-label', o ? '설정 접기' : '설정 펼치기'); };

// ---- 전체 단축키 ----
const FKEYS = {F5:'playlist', F6:'rack', F7:'roll', F8:'browser', F9:'mixer'};
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;   // 창(대화상자)이 열려 있으면 단축키 쉬기
  if (FKEYS[e.key]) { e.preventDefault(); toggleWin(FKEYS[e.key]); return; }
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const k = e.key, mod = e.ctrlKey || e.metaKey, inRoll = !e.target.closest || !e.target.closest('#win-rack,#win-playlist,#win-browser,#win-mixer,dialog');
  if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); playing ? stop() : play(); }
  else if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); }
  else if (!mod && (k === 'l' || k === 'L')) setPlayMode(S.playMode === 'pat' ? 'song' : 'pat');
  else if (!mod && (k === 'r' || k === 'R')) setRec(!recOn);
  else if (!mod && (k === 'q' || k === 'Q')) quantizeNotes();
  else if (mod && k.toLowerCase() === 'z') { e.preventDefault(); $('undo').click(); }
  else if (!inRoll) return;
  else if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setTool('select'); sel = new Set(curNotes()); selChanged(); }
  else if (mod && k.toLowerCase() === 'c') { const ns = selNotes(); if (ns.length) { const m = Math.min(...ns.map(n => n.s)); clip = ns.map(n => ({p:n.p, s:n.s - m, l:n.l, v:n.v})); status(ns.length + '개를 복사했어요. 눈금자의 시작 위치에 붙여요.'); } }
  else if (mod && k.toLowerCase() === 'v') { if (clip) { e.preventDefault(); setTool('select'); const c = pasteNotes(clip, startTick); if (c) status(c + '개를 붙였어요.'); } }
  else if (mod && k.toLowerCase() === 'd') { e.preventDefault(); dupSel(); }
  else if ((k === 'Delete' || k === 'Backspace') && sel.size) { e.preventDefault(); delSel(); }
  else if (k === 'ArrowUp' && sel.size) { e.preventDefault(); transpose(e.shiftKey ? 12 : 1); }
  else if (k === 'ArrowDown' && sel.size) { e.preventDefault(); transpose(e.shiftKey ? -12 : -1); }
  else if (k === 'ArrowLeft' && sel.size) { e.preventDefault(); shiftSel(-S.snap); }
  else if (k === 'ArrowRight' && sel.size) { e.preventDefault(); shiftSel(S.snap); }
  else if (k === 'Escape' && sel.size) { sel.clear(); selChanged(); }
  else if (!mod && (k === 'p' || k === 'P')) setTool('draw');
  else if (!mod && (k === 'd' || k === 'D')) setTool('erase');
  else if (!mod && (k === 'e' || k === 'E')) setTool('select');
  else if (!mod && (k === 'h' || k === 'H')) setTool('hand');
});

// ---- 시작 ----
setTool('draw');
$('projName').value = lib.list[lib.current].name;
readCss(); initWindows(); initAudioClips(); initSongAuto(); refreshAll(); updatePos(0); loadSamples().then(buildBrowser); watchPiano();
wrap.scrollTop = (HIGH - 79) * ROWH - 40;
const boot = $('boot'); if (boot) boot.remove();
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { DPR = clamp(window.devicePixelRatio || 1, 1, 3); drawAll(); drawPlaylist(); }, 80); });
const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)'); if (mq && mq.addEventListener) mq.addEventListener('change', () => { drawAll(); buildRack(); drawPlaylist(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawAll(); drawPlaylist(); });


/* 공유 페이지(/s/<id>)가 곡을 들려줄 때 쓰는 창구.
   ?render=1 로 열렸을 때만 켜지고, 곡 주소를 받아 소리를 만들어 Blob 주소로 돌려준다. */
(() => {
  if (!/[?&]render=1/.test(location.search)) return;
  window.addEventListener('message', async ev => {
    const d = ev.data;
    if (!d || d.type !== 'msk-render' || typeof d.url !== 'string') return;
    const reply = o => ev.source && ev.source.postMessage({type:'msk-rendered', id:d.id, ...o}, '*');
    try {
      const u = new Uint8Array(await (await fetch(d.url)).arrayBuffer());
      const got = await decodeMSK(u);
      S = normalize(got.song); S.playMode = 'song';
      const buf = await renderWav();
      const blob = new Blob([buf instanceof Uint8Array ? buf : new Uint8Array(buf)], {type:'audio/wav'});
      reply({ok:true, audio:URL.createObjectURL(blob), name:got.name || ''});
    } catch (e) { reply({ok:false, error:String(e && e.message || e).slice(0, 120)}); }
  });
  try { parent.postMessage({type:'msk-render-ready'}, '*'); } catch (e) {}
})();
