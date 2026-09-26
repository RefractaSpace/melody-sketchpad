/* 13-browser.js — 브라우저 (F8): 소리를 미리 듣고 채널로 더해요 · 패턴 목록 */
const browserBody = $('browserBody');
function bSection(title) { const s = document.createElement('div'); s.className = 'bsec'; const h = document.createElement('h3'); h.textContent = title; s.appendChild(h); browserBody.appendChild(s); return s; }
function bItem(sec, label, btns, cur) {
  const d = document.createElement('div'); d.className = 'bitem' + (cur ? ' cur' : ''); const sp = document.createElement('span'); sp.textContent = label; d.appendChild(sp);
  for (const [t, f, aria] of btns) { const b = document.createElement('button'); b.textContent = t; b.setAttribute('aria-label', aria || (label + ' ' + t)); b.onclick = f; d.appendChild(b); }
  sec.appendChild(d); return d;
}
function hearSynth(inst) { ensureCtx(); applyMix(E, S.mix); const t = ctx.currentTime + 0.02, dest = E.in; [60, 64, 67, 72].forEach((p, i) => voice(E, inst, p, t + i * 0.18, 0.3, 0.85, dest, toneDefault())); }
function hearDrum(d) { ensureCtx(); applyMix(E, S.mix); const t = ctx.currentTime + 0.02; drumHit(d, t, E, 1, '__preview'); }
function buildBrowser() {
  browserBody.innerHTML = '';
  let s = bSection('악기');
  for (const [k, n] of Object.entries(INSTS)) if (k !== 'sample') bItem(s, n, [['▶', () => hearSynth(k), n + ' 미리 듣기'], ['채널로', () => addChannel('synth', k), n + ' 채널로 더하기']]);
  s = bSection('드럼');
  const kit = selectEl('드럼 키트', [['edm','키트: EDM'],['808','키트: 808'],['hard','키트: 하드'],['acoustic','키트: 어쿠스틱풍']], S.kit, v => { S.kit = v; buildMixer(); hearDrum('kick'); }); s.appendChild(kit);
  for (const d of DRUMS) bItem(s, DRUM_NAME[d], [['▶', () => hearDrum(d), DRUM_NAME[d] + ' 미리 듣기'], ['채널로', () => addChannel('drum', d), DRUM_NAME[d] + ' 채널로 더하기']]);
  s = bSection('코드 소리 (코드 줄에 쓰는 소리)');
  for (const [k, n] of [['pad','패드'],['supersaw','슈퍼소 코드'],['piano','피아노'],['epiano','일렉트릭 피아노'],['pluck','플럭']])
    bItem(s, n, [['▶', () => { ensureCtx(); applyMix(E, S.mix); chordPlay(E, k, chordVoices({r:S.root, q:S.mode === 'minor' ? 'm' : ''}), ctx.currentTime + 0.02, 1.2); }, n + ' 미리 듣기'],
      ['쓰기', () => { S.chordInst = k; save(); buildBrowser(); buildMixer(); status(`코드 소리를 ${n}(으)로 바꿨어요.`); }, n + ' 코드 소리로 쓰기']], S.chordInst === k);
  s = bSection('자동 베이스 (코드를 따라가요)');
  s.appendChild(selectEl('베이스 패턴', [['off','베이스: 끔'],['sustain','베이스: 길게'],['8th','베이스: 8분'],['offbeat','베이스: 오프비트']], S.bassMode, v => { S.bassMode = v; buildMixer(); }));
  for (const [k, n] of [['reese','리스'],['sub','서브'],['saw','톱니']])
    bItem(s, n, [['▶', () => { ensureCtx(); applyMix(E, S.mix); bassPlay(E, k, 36 + S.root, ctx.currentTime + 0.02, 0.6); }, n + ' 베이스 미리 듣기'],
      ['쓰기', () => { S.bassInst = k; if (S.bassMode === 'off') S.bassMode = '8th'; save(); buildBrowser(); buildMixer(); }, n + ' 베이스로 쓰기']], S.bassInst === k && S.bassMode !== 'off');
  s = bSection('패턴');
  S.patterns.forEach((P, i) => { const it = bItem(s, `${P.name} · ${P.bars}마디`, [['색', () => { pushUndo(); P.color = (P.color + 1) % PAT_COLORS.length; save(); buildBrowser(); drawPlaylist(); }, `${P.name} 색 바꾸기 (지금 ${P.color ? P.color + '번' : '없음'})`], ['열기', () => { selectPattern(i); openWin('roll'); }], ['이름', () => renamePattern(i)], ['삭제', () => deletePattern(i)]], i === S.pat);
    if (P.color) it.style.boxShadow = `inset 4px 0 ${PAT_COLORS[P.color]}`; });
  const names = Object.entries(SAMPLES);
  if (names.length) { s = bSection('내 샘플'); for (const [k, v] of names) bItem(s, v.name, [['▶', () => { ensureCtx(); playSample(E, k, null, ctx.currentTime + 0.02, null, 0.9, E.in); }, v.name + ' 미리 듣기']]); }
}
