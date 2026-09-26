/* 11-playlist.js — 플레이리스트 (F5): 패턴 조각을 시간 위에 놓아 곡을 만들어요 */
const plWrap = $('plWrap'), plc = $('plCanvas'), plr = $('plRuler'), plHead = $('plHead');
const PL_BAR = 30, PL_ROW = 34, PL_RULER = 22;
let plDrag = null, plCur = {bar:0, t:0}, plPress = 0;
const clipLen = cl => { const P = patById(cl.pat); return P ? P.bars : 1; };
function clipAt(bar, t) { const cs = S.playlist.clips; for (let i = cs.length - 1; i >= 0; i--) { const c = cs[i]; if (c.t === t && bar >= c.bar && bar < c.bar + clipLen(c)) return c; } return null; }

function drawPlaylist() {
  if (!plc) return;
  const tracks = S.playlist.tracks, w = MAX_BARS * PL_BAR, h = tracks * PL_ROW;
  if (plHead.childElementCount !== tracks) { plHead.innerHTML = ''; for (let i = 0; i < tracks; i++) { const d = document.createElement('div'); d.textContent = '트랙 ' + (i + 1); plHead.appendChild(d); } }
  // 눈금자
  let x = sizeCanvas(plr, w, PL_RULER); x.fillStyle = CS.panel2; x.fillRect(0, 0, w, PL_RULER); x.fillStyle = CS.line; x.fillRect(0, PL_RULER - 1, w, 1);
  x.font = '600 10px "IBM Plex Mono",monospace'; x.textBaseline = 'middle';
  const endBar = songBars();
  for (let b = 0; b <= MAX_BARS; b++) { const X = b * PL_BAR + .5, big = b % 4 === 0; x.fillStyle = big ? CS.ink : CS.line2; x.fillRect(X, big ? 3 : 13, 1, big ? PL_RULER - 4 : PL_RULER - 14); if (big && b < MAX_BARS) { x.fillStyle = CS.ink; x.fillText(String(b + 1), X + 4, 8); } }
  const ss = songStart / (4 * PPQ) * PL_BAR; x.fillStyle = CS.ink; x.beginPath(); x.moveTo(ss, PL_RULER - 1); x.lineTo(ss + 7, PL_RULER - 8); x.lineTo(ss, PL_RULER - 8); x.closePath(); x.fill();
  if (songTick >= 0) { x.fillStyle = CS.ink; x.fillRect(songTick / (4 * PPQ) * PL_BAR - 1, 0, 2, PL_RULER); }
  // 격자
  x = sizeCanvas(plc, w, h);
  for (let t = 0; t < tracks; t++) { x.fillStyle = t % 2 ? CS['row-out'] : CS['row-in']; x.fillRect(0, t * PL_ROW, w, PL_ROW); x.fillStyle = CS.line; x.fillRect(0, (t + 1) * PL_ROW - 1, w, 1); }
  for (let b = 0; b <= MAX_BARS; b++) { x.fillStyle = b % 4 === 0 ? CS.line2 : CS.line; x.fillRect(b * PL_BAR, 0, 1, h); }
  x.fillStyle = CS.panel; x.globalAlpha = .55; x.fillRect(endBar * PL_BAR, 0, w - endBar * PL_BAR, h); x.globalAlpha = 1;
  x.fillStyle = CS.mute; x.fillRect(endBar * PL_BAR, 0, 2, h);
  // 패턴 조각
  x.font = '600 11px "IBM Plex Sans KR",sans-serif'; x.textBaseline = 'top';
  for (const cl of S.playlist.clips) {
    const P = patById(cl.pat); if (!P) continue;
    const X = cl.bar * PL_BAR, Y = cl.t * PL_ROW, W = P.bars * PL_BAR, cur = P.id === curPat().id;
    const hot = songTick >= cl.bar * 4 * PPQ && songTick < (cl.bar + P.bars) * 4 * PPQ;
    rr(x, X + 1, Y + 2, W - 2, PL_ROW - 5, 4); x.fillStyle = cur ? CS.note : CS.line2; x.globalAlpha = cur ? 0.95 : 0.9; x.fill(); x.globalAlpha = 1;
    if (hot) { x.lineWidth = 2; x.strokeStyle = CS.ink; x.stroke(); }
    // 음 미리보기
    const all = Object.values(P.notes).flat(), T = patTicks(P);
    if (all.length) { const lo = Math.min(...all.map(n => n.p)), hi = Math.max(...all.map(n => n.p)), sp = Math.max(12, hi - lo + 1); x.fillStyle = cur ? CS.bg : CS.ink; x.globalAlpha = .55;
      for (const n of all) x.fillRect(X + 2 + n.s / T * (W - 4), Y + PL_ROW - 6 - (n.p - lo + 1) / sp * (PL_ROW - 20), Math.max(1.5, n.l / T * (W - 4)), 1.5); x.globalAlpha = 1; }
    x.save(); x.beginPath(); x.rect(X + 2, Y, W - 4, PL_ROW); x.clip(); x.fillStyle = cur ? CS.bg : CS.ink; x.fillText(P.name, X + 5, Y + 4); x.restore();
  }
  if (document.activeElement === plc) { x.strokeStyle = CS.ink; x.lineWidth = 2; x.setLineDash([4, 3]); x.strokeRect(plCur.bar * PL_BAR + 1, plCur.t * PL_ROW + 1, PL_BAR - 2, PL_ROW - 3); x.setLineDash([]); }
  if (songTick >= 0) { x.fillStyle = CS.ink; x.fillRect(songTick / (4 * PPQ) * PL_BAR - 1, 0, 2, h); }
}
function followPlaylist() {
  if (!winOpen('playlist')) return; const X = songTick / (4 * PPQ) * PL_BAR, vw = plWrap.clientWidth - 78;
  if (X < plWrap.scrollLeft || X > plWrap.scrollLeft + vw - 30) plWrap.scrollLeft = Math.max(0, X - 30);
}
function plPos(e) { const r = plc.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; return {bar:clamp(Math.floor(x / PL_BAR), 0, MAX_BARS - 1), t:clamp(Math.floor(y / PL_ROW), 0, S.playlist.tracks - 1), x}; }
function removeClip(cl) { pushUndo(); S.playlist.clips = S.playlist.clips.filter(c => c !== cl); save(); drawPlaylist(); status(`${patById(cl.pat).name} 조각을 지웠어요.`); }
function placeClip(bar, t) {
  const P = curPat(); bar = clamp(bar, 0, MAX_BARS - P.bars);
  const cl = {id:newId(), pat:P.id, t, bar}; S.playlist.clips.push(cl); return cl;
}
plc.addEventListener('contextmenu', e => { e.preventDefault(); const q = plPos(e), cl = clipAt(q.bar, q.t); if (cl) removeClip(cl); });
plc.addEventListener('pointerdown', e => {
  if (e.button === 2) return; e.preventDefault(); plc.focus({preventScroll:true});
  const q = plPos(e); plCur = {bar:q.bar, t:q.t}; let cl = clipAt(q.bar, q.t); pushUndo(); let created = false;
  if (!cl) { cl = placeClip(q.bar, q.t); created = true; }
  plDrag = {cl, off:q.bar - cl.bar, moved:false, created, x0:e.clientX, y0:e.clientY};
  try { plc.setPointerCapture(e.pointerId); } catch (_) {}
  clearTimeout(plPress);
  if (!created && e.pointerType !== 'mouse') plPress = setTimeout(() => { if (plDrag && !plDrag.moved) { undoStack.pop(); const c = plDrag.cl; plDrag = null; removeClip(c); } }, 550);
  drawPlaylist();
});
plc.addEventListener('pointermove', e => {
  if (!plDrag) return; const q = plPos(e);
  if (Math.abs(e.clientX - plDrag.x0) > 4 || Math.abs(e.clientY - plDrag.y0) > 4) { plDrag.moved = true; clearTimeout(plPress); }
  if (!plDrag.moved) return;
  plDrag.cl.bar = clamp(q.bar - plDrag.off, 0, MAX_BARS - clipLen(plDrag.cl)); plDrag.cl.t = q.t; drawPlaylist();
});
function plUp() {
  clearTimeout(plPress); if (!plDrag) return; const d = plDrag; plDrag = null;
  if (!d.created && !d.moved) { undoStack.pop(); const i = S.patterns.findIndex(p => p.id === d.cl.pat); if (i !== S.pat) selectPattern(i); }
  else { save(); if (d.created) announce(`${patById(d.cl.pat).name}을 ${d.cl.bar + 1}마디 트랙 ${d.cl.t + 1}에 놓았어요.`); }
  drawPlaylist();
}
plc.addEventListener('pointerup', plUp); plc.addEventListener('pointercancel', plUp);
plc.addEventListener('dblclick', e => { const q = plPos(e), cl = clipAt(q.bar, q.t); if (!cl) return; selectPattern(S.patterns.findIndex(p => p.id === cl.pat)); openWin('roll'); });
plr.addEventListener('click', e => {
  const r = plr.getBoundingClientRect(); songStart = clamp(Math.floor((e.clientX - r.left) / PL_BAR), 0, MAX_BARS - 1) * 4 * PPQ;
  if (S.playMode !== 'song') setPlayMode('song');
  updatePos(songStart); drawPlaylist(); if (playing) { stop(); play(); }
});
plr.addEventListener('dblclick', () => { songStart = 0; updatePos(0); drawPlaylist(); });
// 키보드: 방향키로 칸 이동 · Enter로 지금 패턴 놓기/지우기 · Delete로 지우기
plc.addEventListener('focus', () => { drawPlaylist(); announce(plDesc()); });
plc.addEventListener('blur', () => drawPlaylist());
function plDesc() { const cl = clipAt(plCur.bar, plCur.t); return `플레이리스트, 트랙 ${plCur.t + 1}, ${plCur.bar + 1}마디, ` + (cl ? `${patById(cl.pat).name} 있음` : '비어 있음') + `. 놓을 패턴: ${curPat().name}`; }
plc.addEventListener('keydown', e => {
  const k = e.key; let used = true;
  if (k === 'ArrowLeft' || k === 'ArrowRight') plCur.bar = clamp(plCur.bar + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 4 : 1), 0, MAX_BARS - 1);
  else if (k === 'ArrowUp' || k === 'ArrowDown') plCur.t = clamp(plCur.t + (k === 'ArrowUp' ? -1 : 1), 0, S.playlist.tracks - 1);
  else if (k === 'Enter') { const cl = clipAt(plCur.bar, plCur.t); if (cl) removeClip(cl); else { pushUndo(); placeClip(plCur.bar, plCur.t); save(); } }
  else if (k === 'Delete' || k === 'Backspace') { const cl = clipAt(plCur.bar, plCur.t); if (cl) removeClip(cl); }
  else used = false;
  if (used) {
    e.preventDefault(); e.stopPropagation();
    const X = plCur.bar * PL_BAR; if (X < plWrap.scrollLeft || X > plWrap.scrollLeft + plWrap.clientWidth - 140) plWrap.scrollLeft = Math.max(0, X - 60);
    drawPlaylist(); announce(plDesc());
  }
});
