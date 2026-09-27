/* 10-rack.js — 채널 랙 (F6)
   채널마다: 켜기(LED) · 볼륨 · 이름(누르면 피아노 롤) · ⋯ 메뉴 · 스텝 버튼 16개/마디
   음이 스텝(16분 칸 시작·16분 길이)에만 있으면 버튼으로, 멜로디처럼 자유로우면 작은 미리보기 그림으로 보여요 */
const rackBody = $('rackBody');
let rackSteps = [], rackHot = -1;

// 이 채널의 음이 모두 16분 칸에 딱 맞으면 스텝으로 보여 줄 수 있음
const stepFriendly = (c, arr) => arr.every(n => n.s % 12 === 0 && n.l === 12 && (c.kind === 'drum' || n.p === arr[0].p));
function stepLabel(c, k, on, v) { const bar = Math.floor(k / STEPS) + 1, beat = Math.floor((k % STEPS) / 4) + 1, sub = k % 4 + 1; return `${c.name} ${bar}마디 ${beat}박 ${sub}번째 칸 ` + (on ? `켜짐, 세기 ${Math.round(v * 100)}` : '꺼짐'); }

function buildRack() {
  const P = curPat(), nSteps = P.bars * STEPS, keepFocus = document.activeElement && rackBody.contains(document.activeElement) ? document.activeElement.dataset : null;
  rackBody.innerHTML = ''; rackSteps = []; rackHot = -1;
  $('rackTitle').textContent = P.name + ` · ${P.bars}마디 (두 번 누르면 이름 바꾸기)`;
  S.channels.forEach((c, ci) => {
    const m = S.mix[chKey(c)], arr = notesOf(P, c);
    const row = document.createElement('div'); row.className = 'rrow' + (ci === S.ch ? ' sel' : ''); row.setAttribute('role', 'group'); row.setAttribute('aria-label', c.name + ' 채널');
    const led = document.createElement('button'); led.className = 'led'; led.title = '켜기 / 끄기 (뮤트)'; led.setAttribute('aria-label', c.name + ' 켜기'); led.setAttribute('aria-pressed', !m.mute);
    led.onclick = () => { m.mute = m.mute ? 0 : 1; led.setAttribute('aria-pressed', !m.mute); if (E) applyMix(E, S.mix); save(); buildMixer(); };
    const vol = document.createElement('input'); vol.type = 'range'; vol.className = 'rvol'; vol.min = 0; vol.max = 1.2; vol.step = 0.01; vol.value = m.v; vol.title = '볼륨'; vol.setAttribute('aria-label', c.name + ' 볼륨');
    vol.oninput = () => { m.v = +vol.value; if (E) applyMix(E, S.mix); }; vol.onchange = () => { save(); buildMixer(); };
    const nm = document.createElement('button'); nm.className = 'cname'; nm.title = '누르면 이 채널의 피아노 롤'; nm.setAttribute('aria-label', `${c.name}, ${c.kind === 'drum' ? '드럼 ' + DRUM_NAME[c.inst] : INSTS[c.inst]}, 누르면 피아노 롤`);
    nm.textContent = c.name; const sm = document.createElement('small'); sm.textContent = c.kind === 'drum' ? '' : INSTS[c.inst]; if (sm.textContent && sm.textContent !== c.name) nm.appendChild(sm);
    nm.onclick = () => { selectChannel(ci); openWin('roll'); };
    const more = document.createElement('button'); more.className = 'cmore'; more.textContent = '⋯'; more.title = '채널 메뉴'; more.setAttribute('aria-label', c.name + ' 메뉴'); more.setAttribute('aria-haspopup', 'menu');
    more.onclick = e => channelMenu(ci, e.currentTarget);
    row.append(led, vol, nm, more);
    if (arr.length && !stepFriendly(c, arr)) {
      const cv = document.createElement('canvas'), w = Math.min(nSteps * 20 + P.bars * 6, 1400), h = 26; cv.className = 'rprev'; cv.title = '피아노 롤로 찍은 음 — 누르면 피아노 롤'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `${c.name}: 음 ${arr.length}개 (피아노 롤)`);
      const x = sizeCanvas(cv, w, h), lo = Math.min(...arr.map(n => n.p)), hi = Math.max(...arr.map(n => n.p)), span = Math.max(12, hi - lo + 1), T = totalTicks();
      x.fillStyle = CS.note; for (const n of arr) { const X = n.s / T * w, Y = h - 3 - (n.p - lo + 1) / span * (h - 6); x.globalAlpha = 0.4 + 0.6 * n.v; x.fillRect(X, Y, Math.max(2, n.l / T * w - 1), 2.5); } x.globalAlpha = 1;
      cv.onclick = () => { selectChannel(ci); openWin('roll'); };
      row.appendChild(cv); rackSteps.push(null);
    } else {
      const st = document.createElement('div'); st.className = 'steps'; const els = [];
      const on = new Map(arr.map(n => [n.s / 12, n]));
      for (let k = 0; k < nSteps; k++) {
        const n = on.get(k), b = document.createElement('button');
        b.className = 'st' + (Math.floor(k / 4) % 2 ? ' b' : '') + (k % STEPS === 0 && k ? ' bar' : '') + (n ? ' on' : '');
        if (n) b.style.opacity = 0.4 + 0.6 * n.v;
        b.dataset.ci = ci; b.dataset.k = k; b.tabIndex = (ci === S.ch && k === 0) ? 0 : -1;
        b.setAttribute('aria-pressed', !!n); b.setAttribute('aria-label', stepLabel(c, k, !!n, n ? n.v : 0));
        st.appendChild(b); els.push(b);
      }
      row.appendChild(st); rackSteps.push(els);
    }
    rackBody.appendChild(row);
  });
  if (keepFocus && keepFocus.k != null) { const r = rackSteps[+keepFocus.ci]; if (r && r[+keepFocus.k]) { r[+keepFocus.k].tabIndex = 0; r[+keepFocus.k].focus(); } }
}
const drawRack = () => buildRack();
function toggleStep(ci, k) {
  const c = S.channels[ci], arr = notesOf(curPat(), c), i = arr.findIndex(n => n.s === k * 12);
  pushUndo();
  if (i >= 0) arr.splice(i, 1);
  else {
    const p = c.kind === 'drum' ? DRUM_PITCH : (arr[0] ? arr[0].p : 72), v = c.kind === 'drum' ? lastDrumVel : lastVel;
    arr.push({p, s:k * 12, l:12, v}); ensureCtx(); applyMix(E, S.mix); playTrackNote(E, c, p, ctx.currentTime + 0.01, 0.2, v);
  }
  save(); buildRack(); if (ci === S.ch) { drawRoll(); drawLanes(); }
  const now = i < 0; announce(`${c.name} ${now ? '켰어요' : '껐어요'}`);
}
rackBody.addEventListener('click', e => { const b = e.target.closest('.st'); if (b) toggleStep(+b.dataset.ci, +b.dataset.k); });
rackBody.addEventListener('keydown', e => {
  const b = e.target.closest('.st'); if (!b) return;
  let ci = +b.dataset.ci, k = +b.dataset.k; const k0 = k, c0 = ci;
  if (e.key === 'ArrowRight') k++; else if (e.key === 'ArrowLeft') k--;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const d = e.key === 'ArrowDown' ? 1 : -1; do { ci += d; } while (rackSteps[ci] === null); }
  else if (e.key === 'Home') k = 0; else if (e.key === 'End') k = curPat().bars * STEPS - 1;
  else return;
  e.preventDefault();
  const r = rackSteps[ci]; if (!r) return; k = clamp(k, 0, r.length - 1);
  if (ci === c0 && k === k0) return;
  b.tabIndex = -1; r[k].tabIndex = 0; r[k].focus();
});
function drawRackPlayhead() {
  const k = playTick >= 0 ? Math.floor(playTick / 12) : -1; if (k === rackHot) return;
  for (const r of rackSteps) if (r) { if (rackHot >= 0 && r[rackHot]) r[rackHot].classList.remove('hot'); if (k >= 0 && r[k]) r[k].classList.add('hot'); }
  rackHot = k;
}
function selectChannel(i) {
  S.ch = clamp(i, 0, S.channels.length - 1); sel.clear(); $('selBar').hidden = true; save();
  buildRack(); refreshTitles(); drawRoll(); drawLanes(); buildMixer();
  announce(`${curCh().name} 채널의 피아노 롤이에요.`);
}
// ⋯ 메뉴: 이름 바꾸기 · 위로 · 아래로 · 복제 · 삭제
function closeMenu() { const m = document.querySelector('.cmenu'); if (m) m.remove(); document.removeEventListener('pointerdown', menuOutside, true); }
function menuOutside(e) { if (!e.target.closest('.cmenu')) closeMenu(); }
function channelMenu(ci, anchor) {
  closeMenu(); const c = S.channels[ci], m = document.createElement('div'); m.className = 'cmenu'; m.setAttribute('role', 'menu');
  const item = (t, f, dis) => { const b = document.createElement('button'); b.setAttribute('role', 'menuitem'); b.textContent = t; b.disabled = !!dis; b.onclick = () => { closeMenu(); f(); anchor.focus(); }; m.appendChild(b); };
  item('이름 바꾸기', () => { const v = prompt('채널 이름', c.name); if (v == null) return; pushUndo(); c.name = (v.trim() || c.name).slice(0, 24); save(); refreshAll(); });
  item('위로', () => moveChannel(ci, -1), ci === 0);
  item('아래로', () => moveChannel(ci, 1), ci === S.channels.length - 1);
  item('복제', () => { pushUndo(); const n = {...c, id:newId(), name:(c.name + ' 2').slice(0, 24), tone:{...c.tone}}; S.channels.splice(ci + 1, 0, n); for (const P of S.patterns) if (P.notes[c.id]) P.notes[n.id] = P.notes[c.id].map(x => ({...x})); S.mix[chKey(n)] = {...S.mix[chKey(c)]}; fillMix(S); save(); refreshAll(); });
  item('삭제', () => deleteChannel(ci), S.channels.length < 2);
  document.body.appendChild(m); const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(r.left, innerWidth - 160) + 'px'; m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8) + 'px';
  m.querySelector('button:not(:disabled)').focus();
  m.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); anchor.focus(); } if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const bs = [...m.querySelectorAll('button:not(:disabled)')], i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); } });
  setTimeout(() => document.addEventListener('pointerdown', menuOutside, true), 0);
}
function moveChannel(ci, d) { const j = ci + d; if (j < 0 || j >= S.channels.length) return; pushUndo(); const a = S.channels; [a[ci], a[j]] = [a[j], a[ci]]; if (S.ch === ci) S.ch = j; else if (S.ch === j) S.ch = ci; save(); refreshAll(); }
function deleteChannel(ci) {
  if (S.channels.length < 2) return; const c = S.channels[ci], cnt = S.patterns.reduce((a, P) => a + (P.notes[c.id] || []).length, 0);
  if (!confirm(`"${c.name}" 채널을 지울까요? (모든 패턴에서 음 ${cnt}개, 되돌리기로 되살릴 수 있어요)`)) return;
  pushUndo(); S.channels.splice(ci, 1); for (const P of S.patterns) delete P.notes[c.id]; delete S.mix[chKey(c)];
  S.ch = clamp(S.ch >= ci ? S.ch - 1 : S.ch, 0, S.channels.length - 1); fillMix(S); save(); refreshAll(); if (E) applyMix(E, S.mix); status(`"${c.name}" 채널을 지웠어요.`);
}
function addChannel(kind, inst) {
  if (S.channels.length >= 16) { status('채널은 16개까지 만들 수 있어요.'); return; }
  pushUndo(); const c = newChannel(kind, inst); S.channels.push(c); fillMix(S); if (E) applyMix(E, S.mix);
  S.ch = S.channels.length - 1; save(); refreshAll(); status(`"${c.name}" 채널을 더했어요.`);
  ensureCtx(); playTrackNote(E, c, 72, ctx.currentTime + 0.02, 0.3, 0.9);
}
$('chAdd').onchange = () => { const v = $('chAdd').value; $('chAdd').value = ''; if (!v) return; const [k, i] = v.split(':'); addChannel(k, i); };
$('rackTitle').ondblclick = () => renamePattern(S.pat);
