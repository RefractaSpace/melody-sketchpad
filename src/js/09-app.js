/* 09-app.js — 설정 · 단축키 · 확대 · 시작 */

// ---- 설정 ----
const rootSel = $('root'), barsSel = $('bars');
for (let i = 0; i < 12; i++) { const o = document.createElement('option'); o.value = i; o.textContent = NAMES_F[i] === NAMES_S[i] ? NAMES_S[i] : NAMES_F[i] + ' / ' + NAMES_S[i]; rootSel.appendChild(o); }
for (const b of [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128]) { const o = document.createElement('option'); o.value = b; o.textContent = b; barsSel.appendChild(o); }
function fillBarSelects() {
  for (const id of ['cpFrom', 'cpTo', 'cpDest']) {
    const el = $(id), v = el.value; el.innerHTML = '';
    for (let b = 1; b <= S.bars; b++) { const o = document.createElement('option'); o.value = b; o.textContent = b; el.appendChild(o); }
    el.value = Math.min(+v || (id === 'cpTo' ? Math.min(4, S.bars) : id === 'cpDest' ? Math.min(5, S.bars) : 1), S.bars);
  }
}
function syncControls() {
  fillBarSelects(); refreshTracks();
  $('bpm').value = S.bpm; rootSel.value = S.root; $('mode').value = S.mode; $('snap').value = S.snap; $('len').value = S.len;
  if (![...barsSel.options].some(o => +o.value === S.bars)) { const o = document.createElement('option'); o.value = S.bars; o.textContent = S.bars; barsSel.appendChild(o); }
  barsSel.value = S.bars;
}
$('bpm').onchange = () => { S.bpm = clamp(+$('bpm').value || 150, 60, 300); $('bpm').value = S.bpm; save(); if (E) applyMix(E, S.mix); };
rootSel.onchange = () => { S.root = +rootSel.value; save(); drawAll(); };
$('mode').onchange = () => { S.mode = $('mode').value; save(); drawAll(); };
$('inst').onchange = () => { curTrack().inst = $('inst').value; save(); refreshTracks(); buildMixer(); };
$('snap').onchange = () => { S.snap = +$('snap').value; save(); drawRoll(); drawRuler(); };
$('len').onchange = () => { S.len = +$('len').value; save(); };
barsSel.onchange = () => {
  pushUndo(); const nb = +barsSel.value, lim = nb * 4 * PPQ; S.bars = nb;
  S.chords = Array.from({length:nb * 4}, (_, i) => S.chords[i] || null);
  for (const d of DRUMS) S.drums[d] = Array.from({length:nb * 16}, (_, i) => S.drums[d][i] || 0);
  for (const t of S.tracks) t.notes = t.notes.filter(n => n.s < lim).map(n => ({...n, l:Math.min(n.l, lim - n.s)}));
  startTick = Math.min(startTick, (nb - 1) * 4 * PPQ); sel.clear(); save(); fillBarSelects(); drawAll(); refreshTracks();
};
$('undo').onclick = () => {
  const s = undoStack.pop(); if (!s) return;
  S = normalize(JSON.parse(s)); sel.clear(); syncControls(); save(); drawAll(); selChanged(); buildMixer(); if (E) applyMix(E, S.mix);
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
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); }
  else if (mod && k.toLowerCase() === 'z') { e.preventDefault(); $('undo').click(); }
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
syncControls(); drawAll(); updatePos(0); buildMixer(); loadSamples(); watchPiano();
wrap.scrollTop = (HIGH - 79) * ROWH - 40;
const boot = $('boot'); if (boot) boot.remove();
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { DPR = clamp(window.devicePixelRatio || 1, 1, 3); drawAll(); }, 80); });
const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)'); if (mq && mq.addEventListener) mq.addEventListener('change', () => drawAll());
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawAll());
