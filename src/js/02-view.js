/* 02-view.js — 피아노 롤 그리기 (지금 패턴 · 지금 채널)
   곡 전체 크기의 캔버스 대신, 화면에 보이는 크기의 캔버스만 두고 스크롤 위치만큼 옮겨서 그려요.
   (128마디면 가로가 수만 px라 전체를 그리면 느리고, 브라우저 캔버스 한계도 넘어요) */
const wrap = $('rollWrap'), rc = $('rollCanvas'), kc = $('keys'), ru = $('ruler'), lc = $('laneCanvas'), lanes = $('lanes');
const gridBox = $('gridBox'), rulerBox = $('rulerBox'), laneBox = $('laneBox');
let DPR = clamp(window.devicePixelRatio || 1, 1, 3);
const rows = () => HIGH - LOW + 1;
const W = () => Math.ceil(totalTicks() * TICKPX), H = () => rows() * ROWH;
let CS = {};
function readCss() {
  const g = getComputedStyle(document.documentElement);
  for (const k of ['bg','panel','panel2','line','line2','ink','mute','row-in','row-out','row-root','note','note-ink','key-w','key-b','key-line','key-text','key-dot','step-a','step-b']) CS[k] = g.getPropertyValue('--' + k).trim();
}
function sizeCanvas(c, w, h) {
  const pw = Math.round(w * DPR), ph = Math.round(h * DPR);
  if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; c.style.width = w + 'px'; c.style.height = h + 'px'; }
  const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); return x;
}
function rr(x, a, b, w, h, r) { r = Math.min(r, w / 2, h / 2); x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
const isBlack = pc => [1, 3, 6, 8, 10].includes(pc);

// 보이는 영역 (world 좌표 = 곡 전체 기준 px)
function view() {
  const vw = Math.max(50, Math.min(W(), wrap.clientWidth - KEYW)), vh = Math.max(50, Math.min(H(), wrap.clientHeight - RULER));
  return {sl:wrap.scrollLeft, st:wrap.scrollTop, vw, vh};
}
function laneView() { return {sl:lanes.scrollLeft, vw:Math.max(50, Math.min(W(), lanes.clientWidth - KEYW))}; }
function layoutBoxes() {
  gridBox.style.width = W() + 'px'; gridBox.style.height = H() + 'px';
  rulerBox.style.width = W() + 'px'; laneBox.style.width = W() + 'px';
}

function drawKeys() {
  const x = sizeCanvas(kc, KEYW, H());
  x.fillStyle = CS['key-w']; x.fillRect(0, 0, KEYW, H());
  for (let p = HIGH; p >= LOW; p--) {
    const y = (HIGH - p) * ROWH, pc = p % 12;
    if (p === keyDown && !isBlack(pc)) { x.fillStyle = CS['key-line']; x.fillRect(0, y, KEYW, ROWH); }
    if (!isBlack(pc)) { x.fillStyle = CS['key-line']; x.fillRect(0, y + ROWH - 0.5, KEYW, 1); }
  }
  for (let p = HIGH; p >= LOW; p--) {
    const y = (HIGH - p) * ROWH;
    if (isBlack(p % 12)) { x.fillStyle = p === keyDown ? CS['key-line'] : CS['key-b']; rr(x, 0, y + 1, KEYW * 0.62, ROWH - 2, 3); x.fill(); }
  }
  x.font = '600 10px "IBM Plex Sans KR",sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'right';
  for (let p = HIGH; p >= LOW; p--) {
    const y = (HIGH - p) * ROWH, pc = p % 12;
    if (pc === 0 && ROWH >= 14) { x.fillStyle = CS['key-text']; x.fillText('C' + (Math.floor(p / 12) - 1), KEYW - 14, y + ROWH / 2); }
    if (inKey(pc)) { x.fillStyle = isBlack(pc) ? CS['key-line'] : CS['key-dot']; x.beginPath(); x.arc(KEYW - 6, y + ROWH / 2, pc === S.root ? 3.2 : 1.8, 0, 7); x.fill(); }
  }
  x.fillStyle = CS.line; x.fillRect(KEYW - 1, 0, 1, H());
}

function drawRuler() {
  const v = view(), x = sizeCanvas(ru, v.vw, RULER);
  ru.style.transform = `translateX(${v.sl}px)`;
  x.fillStyle = CS.panel2; x.fillRect(0, 0, v.vw, RULER); x.fillStyle = CS.line; x.fillRect(0, RULER - 1, v.vw, 1);
  x.save(); x.translate(-v.sl, 0);
  x.font = '600 11px "IBM Plex Mono",monospace'; x.textBaseline = 'middle';
  const t0 = Math.floor(v.sl / TICKPX / PPQ) * PPQ, t1 = Math.min(totalTicks(), (v.sl + v.vw) / TICKPX + PPQ);
  const labelEvery = TICKPX < 1 ? 2 : 1;
  for (let t = t0; t <= t1; t += PPQ) {
    const X = Math.round(t * TICKPX) + .5, bar = t % (4 * PPQ) === 0, b = t / (4 * PPQ);
    x.fillStyle = bar ? CS.ink : CS.line2; x.fillRect(X, bar ? 4 : 14, 1, bar ? RULER - 5 : RULER - 15);
    if (bar && t < totalTicks() && b % labelEvery === 0) { x.fillStyle = CS.ink; x.fillText(String(b + 1), X + 5, 9); }
  }
  const sx = startTick * TICKPX; x.fillStyle = CS.ink; x.beginPath(); x.moveTo(sx, RULER - 1); x.lineTo(sx + 7, RULER - 8); x.lineTo(sx, RULER - 8); x.closePath(); x.fill();
  if (playTick >= 0) { x.fillStyle = CS.ink; x.fillRect(playTick * TICKPX - 1, 0, 2, RULER); }
  x.restore();
}

function drawRoll() {
  const v = view(), x = sizeCanvas(rc, v.vw, v.vh);
  rc.style.transform = `translate(${v.sl}px,${v.st}px)`;
  x.save(); x.translate(-v.sl, -v.st);
  const x0 = v.sl, x1 = v.sl + v.vw, pTop = clamp(HIGH - Math.floor(v.st / ROWH), LOW, HIGH), pBot = clamp(HIGH - Math.floor((v.st + v.vh) / ROWH), LOW, HIGH);
  for (let p = pTop; p >= pBot; p--) {
    const y = (HIGH - p) * ROWH, pc = p % 12;
    x.fillStyle = pc === S.root ? CS['row-root'] : inKey(pc) ? CS['row-in'] : CS['row-out']; x.fillRect(x0, y, v.vw, ROWH);
    x.fillStyle = pc === 0 ? CS.line2 : CS.line; x.fillRect(x0, y + ROWH - 1, v.vw, 1);
  }
  const t0 = Math.floor(x0 / TICKPX / S.snap) * S.snap, t1 = Math.min(totalTicks(), x1 / TICKPX + S.snap);
  for (let t = t0; t <= t1; t += S.snap) {
    const X = Math.round(t * TICKPX) + .5, bar = t % (4 * PPQ) === 0, beat = t % PPQ === 0;
    x.fillStyle = bar ? CS.mute : (beat ? CS.line2 : CS.line); x.globalAlpha = bar ? .8 : 1; x.fillRect(X - .5, v.st, bar ? 1.5 : 1, v.vh);
  }
  x.globalAlpha = 1;
  const visible = n => n.s * TICKPX < x1 && (n.s + n.l) * TICKPX > x0 && n.p <= pTop && n.p >= pBot;
  x.lineWidth = 1; x.strokeStyle = CS.mute;
  // 다른 채널의 음: 흐린 테두리 (고스트 노트) — 멜로디 편집 중엔 멜로디 채널만, 드럼 편집 중엔 드럼 채널만
  const kind = curCh().kind;
  S.channels.forEach((c, ci) => { if (ci === S.ch || c.kind !== kind) return; for (const n of notesOf(curPat(), c)) if (visible(n)) { rr(x, n.s * TICKPX + 1.5, (HIGH - n.p) * ROWH + 2, Math.max(4, n.l * TICKPX - 2), ROWH - 4, 3); x.stroke(); } });
  x.font = '600 10px "IBM Plex Sans KR",sans-serif'; x.textBaseline = 'middle';
  for (const n of curNotes()) {
    if (!visible(n)) continue;
    const X = n.s * TICKPX, Y = (HIGH - n.p) * ROWH, Wn = Math.max(4, n.l * TICKPX - 1), hot = playTick >= n.s && playTick < n.s + n.l;
    rr(x, X + 1, Y + 1.5, Wn - 1, ROWH - 3, 3);
    if (hot) { x.fillStyle = CS.bg; x.fill(); x.lineWidth = 2; x.strokeStyle = CS.note; x.stroke(); }
    else { x.globalAlpha = 0.4 + 0.6 * n.v; x.fillStyle = CS.note; x.fill(); x.globalAlpha = 1; }
    if (sel.has(n)) { rr(x, X + 3, Y + 3.5, Wn - 5, ROWH - 7, 2); x.lineWidth = 1.5; x.strokeStyle = hot ? CS.note : CS['note-ink']; x.setLineDash([3, 2]); x.stroke(); x.setLineDash([]); }
    if (Wn > 30 && ROWH >= 16) { x.fillStyle = hot ? CS.note : CS['note-ink']; x.fillText(nn(n.p), X + 6, Y + ROWH / 2); }
    x.fillStyle = hot ? CS.note : CS['note-ink']; x.globalAlpha = .5; x.fillRect(X + Wn - 4, Y + 5, 1.5, ROWH - 10); x.globalAlpha = 1;
  }
  if (drag && drag.mode === 'band') {
    const a = Math.min(drag.x0, drag.x1), b = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    x.strokeStyle = CS.ink; x.lineWidth = 1; x.setLineDash([4, 3]); x.strokeRect(a + .5, b + .5, w, h); x.setLineDash([]); x.fillStyle = CS.ink; x.globalAlpha = .08; x.fillRect(a, b, w, h); x.globalAlpha = 1;
  }
  if (document.activeElement === rc) { x.strokeStyle = CS.ink; x.lineWidth = 2; x.setLineDash([4, 3]); x.strokeRect(kb.t * TICKPX + 1, (HIGH - kb.p) * ROWH + 1, Math.max(8, S.snap * TICKPX) - 2, ROWH - 2); x.setLineDash([]); }
  if (startTick > 0) { x.fillStyle = CS.ink; x.globalAlpha = .35; x.fillRect(startTick * TICKPX - .5, v.st, 1, v.vh); x.globalAlpha = 1; }
  if (playTick >= 0) { x.fillStyle = CS.ink; x.fillRect(playTick * TICKPX - 1, v.st, 2, v.vh); }
  x.restore();
  $('empty').style.display = Object.values(curPat().notes).some(a => a.length) ? 'none' : 'block';
}

function drawLanes() {
  const v = laneView(), x = sizeCanvas(lc, v.vw, LANES_H);
  lc.style.transform = `translateX(${v.sl}px)`;
  x.fillStyle = CS.panel; x.fillRect(0, 0, v.vw, LANES_H);
  x.save(); x.translate(-v.sl, 0);
  const vy = CHORD_H, bw = 4 * PPQ * TICKPX;
  x.fillStyle = CS.panel2; x.fillRect(v.sl, vy, v.vw, VEL_H); x.fillStyle = CS.line; x.fillRect(v.sl, vy, v.vw, 1);
  for (let b = Math.floor(v.sl / bw); b <= Math.ceil((v.sl + v.vw) / bw); b++) { x.fillStyle = CS.mute; x.globalAlpha = .6; x.fillRect(b * bw, CHORD_H, 1, VEL_H); x.globalAlpha = 1; }
  for (const n of [...curNotes()].sort((a, b) => a.v - b.v)) {
    const X = n.s * TICKPX; if (X < v.sl - 8 || X > v.sl + v.vw) continue;
    const hh = (VEL_H - 10) * n.v; x.fillStyle = CS.note; x.globalAlpha = sel.has(n) || !sel.size ? 1 : 0.35;
    x.fillRect(X + 1, vy + VEL_H - 4 - hh, 3, hh); x.beginPath(); x.arc(X + 2.5, vy + VEL_H - 4 - hh, 3.2, 0, 7); x.fill(); x.globalAlpha = 1;
  }
  if (playTick >= 0) { x.fillStyle = CS.ink; x.fillRect(playTick * TICKPX - 1, CHORD_H, 2, VEL_H); }
  drawLaneCursor(x);
  x.restore();
  drawChordRow();
}
function drawLaneCursor(x) {
  if (document.activeElement !== lc) return;
  const step = 12 * TICKPX, y = CHORD_H, h = VEL_H;
  x.strokeStyle = CS.ink; x.lineWidth = 2; x.setLineDash([4, 3]); x.strokeRect(kbStep * step + 1, y + 1, step - 2, h - 2); x.setLineDash([]);
}

// 코드 줄: 박마다 칸 (내용이 바뀔 때만 다시 만듦)
let chordSig = '';
function drawChordRow() {
  const row = $('chordRow'), bw = PPQ * TICKPX;
  const P = curPat(), sig = JSON.stringify([P.id, P.chords, bw, names()[1], S.root, S.mode]);
  if (sig === chordSig && row.childElementCount === P.bars * 4) return;
  chordSig = sig; row.innerHTML = '';
  let cur = null;
  for (let i = 0; i < P.bars * 4; i++) {
    const c = P.chords[i], bar = Math.floor(i / 4) + 1, beat = i % 4 + 1;
    if (c) cur = c.x ? null : c;
    const el = document.createElement('button');
    el.className = 'cell' + (c && !c.x ? '' : cur ? ' cont' : ' none') + (beat === 1 ? '' : ' beat');
    el.style.width = bw + 'px';
    el.textContent = c ? (c.x ? '■' : chordName(c)) : (beat === 1 ? (cur ? '·' : '+ ' + bar) : (cur ? '·' : ''));
    el.setAttribute('aria-label', `${bar}마디 ${beat}박 코드 ` + (c ? (c.x ? '멈춤' : chordName(c)) : cur ? `${chordName(cur)} 이어짐` : '없음') + ', 눌러서 고르기');
    el.onclick = () => openChord(i);
    row.appendChild(el);
  }
}

function drawAll() {
  readCss(); layoutBoxes();
  $('corner').textContent = names()[S.root] + (S.mode === 'minor' ? ' 단조' : ' 장조');
  drawKeys(); drawRuler(); drawRoll(); drawLanes();
}
// 여러 번 요청돼도 한 프레임에 한 번만 그림
let drawReq = 0;
function requestDraw() { if (drawReq) return; drawReq = requestAnimationFrame(() => { drawReq = 0; drawRuler(); drawRoll(); drawLanes(); }); }
let syncing = false;
wrap.addEventListener('scroll', () => { if (!syncing) { syncing = true; lanes.scrollLeft = wrap.scrollLeft; syncing = false; } requestDraw(); }, {passive:true});
lanes.addEventListener('scroll', () => { if (!syncing) { syncing = true; wrap.scrollLeft = lanes.scrollLeft; syncing = false; } requestDraw(); }, {passive:true});
