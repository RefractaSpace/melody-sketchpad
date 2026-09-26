/* 03-edit.js — 피아노 롤 편집 (도구 · 롤 · 세기 줄 · 키보드 · 선택 · 코드 · 마디 복사) */

// ---- 도구 ----
let tool = 'draw';
function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
  rc.style.cursor = t === 'hand' ? 'grab' : t === 'erase' ? 'not-allowed' : t === 'select' ? 'default' : 'crosshair';
  if (t !== 'select' && sel.size) { sel.clear(); selChanged(); }
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
rc.style.touchAction = 'none';

// ---- 좌표: 화면 → 곡 전체 기준 ----
function pos(e) { const r = rc.getBoundingClientRect(), v = view(); const x = e.clientX - r.left + v.sl, y = e.clientY - r.top + v.st; return {x, y, tick:x / TICKPX, p:HIGH - Math.floor(y / ROWH)}; }
function hit(tick, p) { const ns = curNotes(); for (let i = ns.length - 1; i >= 0; i--) { const n = ns[i]; if (n.p === p && tick >= n.s && tick < n.s + n.l) return i; } return -1; }
function selChanged() { const ns = new Set(curNotes()); for (const n of [...sel]) if (!ns.has(n)) sel.delete(n); $('selBar').hidden = sel.size === 0; $('selCount').textContent = sel.size + '개 선택'; drawRoll(); drawLanes(); drawRack(); }
function bandSelect() {
  const t0 = Math.min(drag.x0, drag.x1) / TICKPX, t1 = Math.max(drag.x0, drag.x1) / TICKPX;
  const p0 = HIGH - Math.floor(Math.max(drag.y0, drag.y1) / ROWH), p1 = HIGH - Math.floor(Math.min(drag.y0, drag.y1) / ROWH);
  sel = new Set(curNotes().filter(n => n.p >= p0 && n.p <= p1 && n.s < t1 && n.s + n.l > t0));
}

// ---- 롤 조작 (마우스 · 터치 · 두 손가락 이동) ----
const ptrs = new Map(); let pan = null, erased = false;
function avgPtr() { let x = 0, y = 0; for (const v of ptrs.values()) { x += v.x; y += v.y; } return {x:x / ptrs.size, y:y / ptrs.size}; }
function startPan() { const a = avgPtr(); pan = {x:a.x, y:a.y, sl:wrap.scrollLeft, st:wrap.scrollTop}; }
function eraseAt(q) { const i = hit(q.tick, q.p); if (i >= 0) { if (!erased) { pushUndo(); erased = true; } curNotes().splice(i, 1); selChanged(); } }
rc.addEventListener('contextmenu', e => { e.preventDefault(); const q = pos(e), i = hit(q.tick, q.p); if (i >= 0) { pushUndo(); curNotes().splice(i, 1); save(); selChanged(); } });
rc.addEventListener('pointerdown', e => {
  if (e.button === 2) return;
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY}); try { rc.setPointerCapture(e.pointerId); } catch (_) {}
  if (ptrs.size >= 2 || tool === 'hand') {
    if (drag) { const s = undoStack.pop(); if (s) { S = normalize(JSON.parse(s)); sel.clear(); } drag = null; drawRoll(); }
    startPan(); if (tool === 'hand') rc.style.cursor = 'grabbing'; return;
  }
  const q = pos(e); if (q.p < LOW || q.p > HIGH) return; e.preventDefault();
  if (tool === 'erase') { erased = false; eraseAt(q); drag = {mode:'erase'}; return; }
  if (tool === 'select') {
    const i = hit(q.tick, q.p);
    if (i >= 0) { const n = curNotes()[i]; if (!sel.has(n)) sel = new Set([n]); pushUndo(); drag = {mode:'moveSel', x0:q.x, y0:q.y, orig:[...sel].map(m => ({m, s:m.s, p:m.p})), moved:false}; selChanged(); }
    else { sel.clear(); drag = {mode:'band', x0:q.x, y0:q.y, x1:q.x, y1:q.y}; selChanged(); }
    return;
  }
  const i = hit(q.tick, q.p); pushUndo();
  if (i >= 0) { const n = curNotes()[i]; drag = {mode:(n.s + n.l) * TICKPX - q.x < 9 ? 'resize' : 'move', i, x0:q.x, y0:q.y, orig:{...n}, moved:false}; }
  else {
    const s = Math.floor(q.tick / S.snap) * S.snap, l = Math.min(S.len, totalTicks() - s);
    const v0 = curCh().kind === 'drum' ? lastDrumVel : lastVel;
    curNotes().push({p:q.p, s, l, v:v0}); drag = {mode:'new', i:curNotes().length - 1, x0:q.x, y0:q.y, orig:{p:q.p, s, l}, moved:false};
    preview(q.p, v0); drawRoll(); drawLanes();
  }
});
rc.addEventListener('pointermove', e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pan) { const a = avgPtr(); wrap.scrollLeft = pan.sl - (a.x - pan.x); wrap.scrollTop = pan.st - (a.y - pan.y); return; }
  if (!drag) return;
  const q = pos(e);
  if (drag.mode === 'erase') { eraseAt(q); return; }
  if (drag.mode === 'band') { drag.x1 = clamp(q.x, 0, W()); drag.y1 = clamp(q.y, 0, H()); bandSelect(); $('selBar').hidden = sel.size === 0; $('selCount').textContent = sel.size + '개 선택'; drawRoll(); return; }
  if (Math.abs(q.x - drag.x0) > 4 || Math.abs(q.y - drag.y0) > 4) drag.moved = true;
  if (!drag.moved) return;
  if (drag.mode === 'moveSel') {
    let dt = Math.round((q.x - drag.x0) / TICKPX / S.snap) * S.snap, dp = -Math.round((q.y - drag.y0) / ROWH);
    const o = drag.orig, minS = Math.min(...o.map(a => a.s)), maxE = Math.max(...o.map(a => a.s + a.m.l)), minP = Math.min(...o.map(a => a.p)), maxP = Math.max(...o.map(a => a.p));
    dt = clamp(dt, -minS, totalTicks() - maxE); dp = clamp(dp, LOW - minP, HIGH - maxP);
    const firstP = o[0].m.p; for (const a of o) { a.m.s = a.s + dt; a.m.p = a.p + dp; } if (o[0].m.p !== firstP) preview(o[0].m.p);
    drawRoll(); return;
  }
  const n = curNotes()[drag.i]; if (!n) return;
  if (drag.mode === 'move') {
    const dt = Math.round((q.x - drag.x0) / TICKPX / S.snap) * S.snap, dp = -Math.round((q.y - drag.y0) / ROWH);
    const ns = clamp(drag.orig.s + dt, 0, totalTicks() - n.l), np = clamp(drag.orig.p + dp, LOW, HIGH);
    if (np !== n.p) preview(np, n.v); n.s = ns; n.p = np;
  } else { const end = Math.ceil(q.tick / S.snap) * S.snap; n.l = clamp(end - n.s, S.snap, totalTicks() - n.s); }
  drawRoll();
});
function upPtr(e) {
  ptrs.delete(e.pointerId);
  if (pan) { if (ptrs.size === 0) { pan = null; if (tool === 'hand') rc.style.cursor = 'grab'; } return; }
  if (!drag) return;
  if (drag.mode === 'band') { drag = null; selChanged(); return; }
  if (drag.mode === 'moveSel') { if (!drag.moved) undoStack.pop(); drag = null; save(); drawRoll(); drawLanes(); return; }
  if (drag.mode === 'move' && !drag.moved) { sel.delete(curNotes()[drag.i]); curNotes().splice(drag.i, 1); }
  drag = null; save(); selChanged();
}
rc.addEventListener('pointerup', upPtr); rc.addEventListener('pointercancel', upPtr);

// ---- 건반 · 눈금자 ----
kc.addEventListener('pointerdown', e => { const r = kc.getBoundingClientRect(), p = HIGH - Math.floor((e.clientY - r.top) / ROWH); if (p < LOW || p > HIGH) return; keyDown = p; preview(p); drawKeys(); });
kc.addEventListener('pointerup', () => { keyDown = -1; drawKeys(); });
kc.addEventListener('pointerleave', () => { if (keyDown >= 0) { keyDown = -1; drawKeys(); } });
ru.addEventListener('click', e => {
  const r = ru.getBoundingClientRect(), x = e.clientX - r.left + wrap.scrollLeft;
  startTick = clamp(Math.floor(x / TICKPX / PPQ) * PPQ, 0, totalTicks() - PPQ); updatePos(startTick); drawRuler(); drawRoll();
  if (playing) { stop(); play(); }
});
ru.addEventListener('dblclick', () => { startTick = 0; updatePos(0); drawRuler(); drawRoll(); });

// ---- 세기 줄 (지금 채널의 음) ----
let velDrag = false;
function laneHit(e) { const r = lc.getBoundingClientRect(); return {x:e.clientX - r.left + lanes.scrollLeft, y:e.clientY - r.top}; }
const velValue = y => clamp((CHORD_H + VEL_H - 4 - y) / (VEL_H - 10), 0.05, 1);
function velAt(x, y) {
  const v = velValue(y); let best = null, bd = 9;
  for (const n of curNotes()) { const d = Math.abs(n.s * TICKPX + 2.5 - x); if (d < bd) { bd = d; best = n.s; } }
  if (best == null) return 0;
  let targets = curNotes().filter(n => n.s === best); if (targets.some(n => sel.has(n))) targets = targets.filter(n => sel.has(n));
  targets.forEach(n => n.v = v); if (curCh().kind === 'drum') lastDrumVel = v; else lastVel = v; return targets.length;
}
lc.addEventListener('pointerdown', e => { const q = laneHit(e); if (q.y < CHORD_H) return; pushUndo(); try { lc.setPointerCapture(e.pointerId); } catch (_) {} velDrag = true; if (!velAt(q.x, q.y)) undoStack.pop(); drawLanes(); drawRoll(); });
lc.addEventListener('pointermove', e => { if (!velDrag) return; const q = laneHit(e); velAt(q.x, q.y); drawLanes(); drawRoll(); });
lc.addEventListener('pointerup', () => { if (velDrag) { velDrag = false; save(); drawRack(); announce('세기를 바꿨어요.'); } });
lc.addEventListener('pointercancel', () => { velDrag = false; });

// ---- 키보드로 작곡 (접근성) ----
function posName(t) { const bar = Math.floor(t / (4 * PPQ)) + 1, beat = Math.floor((t % (4 * PPQ)) / PPQ) + 1, sub = Math.floor((t % PPQ) / S.snap) + 1; return `${bar}마디 ${beat}박` + (sub > 1 ? ` ${sub}번째 칸` : ''); }
function noteAtCursor() { return curNotes().find(n => n.p === kb.p && kb.t >= n.s && kb.t < n.s + n.l); }
function showCursor() {
  const X = kb.t * TICKPX, Y = (HIGH - kb.p) * ROWH, v = view();
  if (X < v.sl || X > v.sl + v.vw - 60) wrap.scrollLeft = Math.max(0, X - v.vw / 3);
  if (Y < v.st || Y > v.st + v.vh - ROWH) wrap.scrollTop = Math.max(0, Y - v.vh / 2);
  drawRoll();
}
function describe() { const n = noteAtCursor(); return `${curCh().name}, ${nn(kb.p)}, ${posName(kb.t)}` + (n ? `, 음 있음 (길이 ${lenText(n.l)}, 세기 ${Math.round(n.v * 100)})` : ''); }
rc.tabIndex = 0; rc.setAttribute('aria-describedby', 'kbHelp');
rc.addEventListener('focus', () => { kb.t = Math.min(kb.t, totalTicks() - S.snap); showCursor(); announce('피아노 롤. ' + describe()); });
rc.addEventListener('blur', () => drawRoll());
rc.addEventListener('keydown', e => {
  const k = e.key; let used = true, msg = null;
  if (k === 'ArrowLeft' || k === 'ArrowRight') { const st = e.shiftKey ? 4 * PPQ : S.snap; kb.t = clamp(kb.t + (k === 'ArrowLeft' ? -st : st), 0, totalTicks() - S.snap); kb.t = Math.floor(kb.t / S.snap) * S.snap; msg = describe(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { kb.p = clamp(kb.p + (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1), LOW, HIGH); preview(kb.p, lastVel); msg = describe(); }
  else if (k === 'Enter') {
    const n = noteAtCursor(); pushUndo();
    if (n) { curNotes().splice(curNotes().indexOf(n), 1); msg = `${nn(kb.p)} 음을 지웠어요`; }
    else { const l = Math.min(S.len, totalTicks() - kb.t); curNotes().push({p:kb.p, s:kb.t, l, v:lastVel}); preview(kb.p, lastVel); msg = `${nn(kb.p)} 음을 찍었어요, 길이 ${lenText(l)}`; }
    save(); selChanged();
  }
  else if (k === 'Delete' || k === 'Backspace') { const n = noteAtCursor(); if (n) { pushUndo(); curNotes().splice(curNotes().indexOf(n), 1); save(); selChanged(); msg = '지웠어요'; } else used = false; }
  else if (k === '+' || k === '=' || k === '-') { const n = noteAtCursor(); if (n) { pushUndo(); n.l = clamp(n.l + (k === '-' ? -S.snap : S.snap), S.snap, totalTicks() - n.s); save(); msg = `길이 ${lenText(n.l)}`; } else msg = '여기에는 음이 없어요'; }
  else if (k === '[' || k === ']') { const n = noteAtCursor(); if (n) { pushUndo(); n.v = clamp(Math.round((n.v + (k === ']' ? .1 : -.1)) * 20) / 20, .05, 1); lastVel = n.v; save(); preview(n.p, n.v); msg = `세기 ${Math.round(n.v * 100)}`; } else msg = '여기에는 음이 없어요'; }
  else used = false;
  if (used) { e.preventDefault(); e.stopPropagation(); showCursor(); drawLanes(); drawRack(); if (msg) announce(msg); }
});
lc.tabIndex = 0; lc.setAttribute('aria-describedby', 'kbHelp');
function laneDesc() {
  const bar = Math.floor(kbStep / 16) + 1, beat = Math.floor((kbStep % 16) / 4) + 1, sub = kbStep % 4 + 1;
  const ns = curNotes().filter(n => Math.floor(n.s / 12) === kbStep);
  return `세기 줄, ${bar}마디 ${beat}박 ${sub}번째 칸, ` + (ns.length ? `음 ${ns.length}개, 세기 ${Math.round(ns[0].v * 100)}` : '음 없음');
}
lc.addEventListener('focus', () => { drawLanes(); announce(laneDesc()); });
lc.addEventListener('blur', () => drawLanes());
lc.addEventListener('keydown', e => {
  const k = e.key; let used = true;
  if (k === 'ArrowLeft' || k === 'ArrowRight') kbStep = clamp(kbStep + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 16 : 1), 0, curPat().bars * 16 - 1);
  else if (k === '[' || k === ']') {
    const ns = curNotes().filter(n => Math.floor(n.s / 12) === kbStep);
    if (ns.length) { pushUndo(); ns.forEach(n => n.v = clamp(Math.round((n.v + (k === ']' ? .1 : -.1)) * 20) / 20, .05, 1)); save(); drawRoll(); }
  } else used = false;
  if (used) {
    e.preventDefault(); e.stopPropagation();
    const X = kbStep * 12 * TICKPX; if (X < lanes.scrollLeft || X > lanes.scrollLeft + lanes.clientWidth - 120) lanes.scrollLeft = Math.max(0, X - lanes.clientWidth / 3);
    drawLanes(); announce(laneDesc());
  }
});

// ---- 선택한 음 작업 ----
const selNotes = () => [...sel].filter(n => curNotes().includes(n));
function transpose(d) { const ns = selNotes(); if (!ns.length) return; if (ns.some(n => n.p + d < LOW || n.p + d > HIGH)) { status('더 이상 올리거나 내릴 수 없어요.'); return; } pushUndo(); ns.forEach(n => n.p += d); preview(ns[0].p); save(); drawRoll(); }
function shiftSel(dt) { const ns = selNotes(); if (!ns.length) return; const minS = Math.min(...ns.map(n => n.s)), maxE = Math.max(...ns.map(n => n.s + n.l)); dt = clamp(dt, -minS, totalTicks() - maxE); if (!dt) return; pushUndo(); ns.forEach(n => n.s += dt); save(); drawRoll(); drawLanes(); }
function delSel() { if (!selNotes().length) return; pushUndo(); curPat().notes[curCh().id] = curNotes().filter(n => !sel.has(n)); sel.clear(); save(); selChanged(); drawRack(); }
function pasteNotes(rel, at) {
  const out = [];
  for (const r of rel) { const s = at + r.s; if (s >= totalTicks()) continue; out.push({p:r.p, s, l:Math.min(r.l, totalTicks() - s), v:r.v == null ? 0.8 : r.v}); }
  if (!out.length) { status('붙일 자리가 곡 밖이에요. 마디 수를 늘리거나 눈금자에서 시작 위치를 앞으로 옮겨 보세요.'); return 0; }
  pushUndo(); curNotes().push(...out); sel = new Set(out); save(); selChanged(); return out.length;
}
function dupSel() {
  const ns = selNotes(); if (!ns.length) return;
  const minS = Math.min(...ns.map(n => n.s)), maxE = Math.max(...ns.map(n => n.s + n.l)), span = Math.ceil((maxE - minS) / PPQ) * PPQ;
  const c = pasteNotes(ns.map(n => ({p:n.p, s:n.s - minS, l:n.l, v:n.v})), minS + span); if (c) status(c + '개를 바로 뒤에 복제했어요.');
}
$('selDup').onclick = dupSel; $('selUp').onclick = () => transpose(1); $('selDown').onclick = () => transpose(-1); $('selDel').onclick = delSel;
$('selNone').onclick = () => { sel.clear(); selChanged(); };

// ---- 코드 고르기 (박 단위) ----
const dlg = $('chordDlg'); let chordSlot = 0, pick = {r:0, q:'m'};
function openChord(i) {
  chordSlot = i; const P = curPat(), c = P.chords[i] && !P.chords[i].x ? P.chords[i] : chordAtBeat(i);
  pick = c ? {r:c.r, q:c.q} : {r:S.root, q:S.mode === 'minor' ? 'm' : ''};
  renderChordDlg(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}
function renderChordDlg() {
  const g = $('rootGrid'), N = names(); g.innerHTML = '';
  for (let i = 0; i < 12; i++) { const r = (S.root + i) % 12, b = document.createElement('button'); b.className = 'tbtn' + (inKey(r) ? ' inkey' : ''); b.textContent = N[r]; b.setAttribute('aria-pressed', pick.r === r); b.onclick = () => { pick.r = r; renderChordDlg(); }; g.appendChild(b); }
  const q = $('qGrid'); q.innerHTML = '';
  for (const k of Object.keys(QUAL)) { const b = document.createElement('button'); b.className = 'tbtn'; b.textContent = QNAME[k]; b.setAttribute('aria-pressed', pick.q === k); b.onclick = () => { pick.q = k; renderChordDlg(); }; q.appendChild(b); }
  $('chordTitle').textContent = `${Math.floor(chordSlot / 4) + 1}마디 ${chordSlot % 4 + 1}박 코드 · ${chordName(pick)}`;
}
$('chordOk').onclick = () => { pushUndo(); curPat().chords[chordSlot] = {...pick}; save(); dlg.close(); drawChordRow(); drawPlaylist(); };
$('chordNone').onclick = () => { pushUndo(); curPat().chords[chordSlot] = null; save(); dlg.close(); drawChordRow(); };
$('chordStop').onclick = () => { pushUndo(); curPat().chords[chordSlot] = {x:1}; save(); dlg.close(); drawChordRow(); };
$('chordHear').onclick = () => { ensureCtx(); applyMix(E, S.mix); chordPlay(E, S.chordInst, chordVoices(pick), ctx.currentTime + 0.02, 1.4); };

// ---- 마디 복사 (지금 패턴의 모든 채널 · 코드) ----
$('cpGo').onclick = () => {
  const P = curPat(); let a = +$('cpFrom').value, b = +$('cpTo').value, c = +$('cpDest').value; if (b < a) [a, b] = [b, a];
  const n = b - a + 1;
  if (c + n - 1 > P.bars) { status(`붙일 자리가 모자라요. ${c}마디부터 ${n}마디를 붙이려면 패턴이 ${c + n - 1}마디 이상이어야 해요.`); return; }
  pushUndo();
  const BT = 4 * PPQ, s0 = (a - 1) * BT, s1 = b * BT, d0 = (c - 1) * BT, d1 = d0 + n * BT, shift = d0 - s0;
  for (const cid of Object.keys(P.notes)) {
    const arr = P.notes[cid], src = arr.filter(x => x.s >= s0 && x.s < s1).map(x => ({p:x.p, s:x.s + shift, l:Math.min(x.l, s1 - x.s), v:x.v}));
    P.notes[cid] = arr.filter(x => !(x.s >= d0 && x.s < d1)).concat(src);
  }
  const ch = P.chords.slice((a - 1) * 4, b * 4); for (let i = 0; i < ch.length; i++) P.chords[(c - 1) * 4 + i] = ch[i] ? {...ch[i]} : null;
  sel.clear(); save(); refreshAll(); status(`${a}~${b}마디를 ${c}~${c + n - 1}마디에 복사했어요 (이 패턴의 모든 채널·코드).`);
};
