/* 06-mixer.js — 믹서 (채널 랙의 채널마다 한 줄 · 코드 · 베이스 · 마스터) */
function mixSlider(label, val, min, max, step, on, fmt) {
  const w = document.createElement('label'); w.className = 'knob';
  const s = document.createElement('input'); s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = val; s.setAttribute('aria-label', tMsg(label));
  const v = document.createElement('span'); v.className = 'kv'; v.textContent = fmt(val);
  const l = document.createElement('span'); l.className = 'kl'; l.textContent = tMsg(label);
  s.oninput = () => { on(+s.value); v.textContent = fmt(+s.value); }; s.onchange = () => save();
  w.append(l, s, v); return w;
}
const pct = v => Math.round(v * 100), eqf = v => (v > 0 ? '+' : '') + v.toFixed(0) + 'dB';
const hzf = v => { const h = cutHz(v); return h >= 1000 ? (h / 1000).toFixed(1) + 'k' : Math.round(h) + ''; };
function fxFmt(type, j) {
  if (type === 'eq4') return v => ((v - 0.5) * 24 > 0 ? '+' : '') + ((v - 0.5) * 24).toFixed(1) + 'dB';
  if (type === 'gate') return j ? pct : v => ['1/4', '1/8', '1/16', '1/32'][Math.min(3, Math.floor(v * 4))];
  if (type === 'reverb') return j ? pct : v => (0.4 + v * 4).toFixed(1) + '초';
  if (type === 'delay') return j ? pct : v => DELAY_NOTES[Math.min(5, Math.floor(v * 6))][1];
  if (type === 'eq') return j ? v => ((v - 0.5) * 24 > 0 ? '+' : '') + ((v - 0.5) * 24).toFixed(1) + 'dB' : hzf;
  if (type === 'width') return j ? v => Math.round(v * 150) + '%' : v => Math.round(v * 200) + '%';
  if (type === 'comp') return j ? v => (1 + v * 19).toFixed(1) + ':1' : v => Math.round(-60 + v * 60) + 'dB';
  if (type === 'lpf' || type === 'hpf') return j ? v => (0.5 + v * 15).toFixed(1) : hzf;
  return pct;
}
const remix = () => { if (E) applyMix(E, S.mix); };
function subTitle(st, txt) { const h = document.createElement('div'); h.className = 'sub'; h.textContent = tMsg(txt); st.appendChild(h); }
function toneKnobs(st, T) {
  subTitle(st, '음색');
  st.appendChild(mixSlider('밝기', T.br, 0.3, 2, 0.05, v => { T.br = v; }, v => pct(v) + '%'));
  st.appendChild(mixSlider('어택', T.atk, 0, 0.8, 0.01, v => { T.atk = v; }, v => (v * 1000).toFixed(0) + 'ms'));
  st.appendChild(mixSlider('릴리즈', T.rel, 0.05, 2, 0.01, v => { T.rel = v; }, v => v < 1 ? (v * 1000).toFixed(0) + 'ms' : v.toFixed(1) + 's'));
}
function channelStrip(key, label) {
  const m = S.mix[key], st = document.createElement('div'); st.className = 'strip'; st.setAttribute('role', 'group'); st.setAttribute('aria-label', label + ' 채널');
  const hd = document.createElement('div'); hd.className = 'sh'; const b = document.createElement('b'); b.textContent = tMsg(label); hd.appendChild(b);
  const ms = document.createElement('div'); ms.className = 'ms';
  const btn = (txt, title, get, set) => { const x = document.createElement('button'); x.className = 'tbtn xs'; x.textContent = txt; x.title = tMsg(title); x.setAttribute('aria-label', label + ' ' + title); x.setAttribute('aria-pressed', !!get()); x.onclick = () => { set(!get()); x.setAttribute('aria-pressed', !!get()); remix(); save(); }; ms.appendChild(x); };
  btn('M', '뮤트', () => m.mute, v => m.mute = v ? 1 : 0);
  btn('S', '솔로', () => m.solo, v => m.solo = v ? 1 : 0);
  const kc = key.startsWith('ch:') ? chById(key.slice(3)) : null;
  if (!(kc && kc.kind === 'drum' && kc.inst === 'kick')) btn('SC', '사이드체인 받기', () => m.sc, v => m.sc = v);
  hd.appendChild(ms); st.appendChild(hd);
  st.appendChild(mixSlider('볼륨', m.v, 0, 1.2, 0.01, v => { m.v = v; remix(); }, pct));
  st.appendChild(mixSlider('팬', m.pan, -1, 1, 0.05, v => { m.pan = v; remix(); }, v => v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + pct(Math.abs(v))));
  st.appendChild(mixSlider('리버브', m.rev, 0, 1, 0.01, v => { m.rev = v; remix(); }, pct));
  st.appendChild(mixSlider('딜레이', m.dly, 0, 1, 0.01, v => { m.dly = v; remix(); }, pct));
  subTitle(st, 'EQ');
  st.appendChild(mixSlider('저음', m.lo, -12, 12, 1, v => { m.lo = v; remix(); }, eqf));
  st.appendChild(mixSlider('중음', m.mid, -12, 12, 1, v => { m.mid = v; remix(); }, eqf));
  st.appendChild(mixSlider('고음', m.hi, -12, 12, 1, v => { m.hi = v; remix(); }, eqf));
  // 이펙트 칸: 채운 칸 + 빈 칸 하나 (최대 3칸)
  subTitle(st, '이펙트'); m.fx = m.fx || [];
  for (let k = 0; k < FX_SLOTS; k++) {
    const f = m.fx[k];
    st.appendChild(selectEl(`${label} 이펙트 ${k + 1}`, Object.entries(FX_NAME), f ? f.type : '', v => {
      pushUndo(); const a = m.fx.slice(); if (!v) a.splice(k, 1); else a[k] = Object.fromEntries([['type', v], ...FX_DEF[v].map((x, j) => [FX_KEYS[j], x])]); m.fx = a.filter(Boolean); remix(); buildMixer(); }));
    if (!f) break;
    if (k > 0) { const up = document.createElement('button'); up.className = 'tbtn xs'; up.textContent = '↑ 위로'; up.setAttribute('aria-label', `${label} 이펙트 ${k + 1}을 위로`); up.onclick = () => { pushUndo(); const a = m.fx.slice(); [a[k - 1], a[k]] = [a[k], a[k - 1]]; m.fx = a; remix(); buildMixer(); }; st.appendChild(up); }
    FX_KNOBS[f.type].forEach((nm, j) => { const key = FX_KEYS[j]; if (f[key] == null) f[key] = (FX_DEF[f.type] || [])[j] == null ? 0.5 : FX_DEF[f.type][j]; st.appendChild(mixSlider(nm, f[key], 0, 1, 0.01, v => { f[key] = v; m.fx = m.fx.slice(); remix(); }, fxFmt(f.type, j))); });
  }
  if (!BUSES.includes(key)) { subTitle(st, '출력'); st.appendChild(selectEl(`${label} 출력`, [['master', '마스터'], ['bus1', '버스 1'], ['bus2', '버스 2']], m.out || 'master', v => { if (v === 'master') delete m.out; else m.out = v; remix(); buildMixer(); buildSaSelects(); })); }
  return st;
}
// 마스터 이펙트 칸 (채널과 같은 방식)
function fxSection(st, m, label) {
  subTitle(st, '이펙트'); m.fx = m.fx || [];
  for (let k = 0; k < FX_SLOTS; k++) {
    const f = m.fx[k];
    st.appendChild(selectEl(`${label} 이펙트 ${k + 1}`, Object.entries(FX_NAME), f ? f.type : '', v => { pushUndo(); const a = m.fx.slice(); if (!v) a.splice(k, 1); else a[k] = Object.fromEntries([['type', v], ...FX_DEF[v].map((x, j) => [FX_KEYS[j], x])]); m.fx = a.filter(Boolean); remix(); buildMixer(); }));
    if (!f) break;
    if (k > 0) { const up = document.createElement('button'); up.className = 'tbtn xs'; up.textContent = '↑ 위로'; up.setAttribute('aria-label', `${label} 이펙트 ${k + 1}을 위로`); up.onclick = () => { pushUndo(); const a = m.fx.slice(); [a[k - 1], a[k]] = [a[k], a[k - 1]]; m.fx = a; remix(); buildMixer(); }; st.appendChild(up); }
    FX_KNOBS[f.type].forEach((nm, j) => { const key = FX_KEYS[j]; if (f[key] == null) f[key] = (FX_DEF[f.type] || [])[j] == null ? 0.5 : FX_DEF[f.type][j]; st.appendChild(mixSlider(nm, f[key], 0, 1, 0.01, v => { f[key] = v; m.fx = m.fx.slice(); remix(); }, fxFmt(f.type, j))); });
  }
}
function selectEl(label, opts, val, on) {
  const s = document.createElement('select'); s.setAttribute('aria-label', tMsg(label));
  for (const [v, txt] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = tMsg(txt); s.appendChild(o); }
  s.value = val; s.onchange = () => { on(s.value); save(); }; return s;
}
function buildMixer() {
  const box = $('mixerStrips'); box.innerHTML = '';
  S.channels.forEach((c, i) => {
    const st = channelStrip(chKey(c), `${i + 1}. ${nameOf(c.name)}`); st.classList.add('trk'); if (i === S.ch) st.classList.add('cur');
    const ex = document.createElement('div'); ex.className = 'sx';
    if (c.kind === 'synth') {
      toneKnobs(st, c.tone);
      ex.appendChild(selectEl(c.name + ' 악기', Object.entries(INSTS), c.inst, v => { c.inst = v; if (v === 'synth') c.syn = normSyn(c.syn); buildRack(); refreshTitles(); buildMixer(); }));
      if (c.inst === 'synth') synthPanel(ex, c);
    } else ex.appendChild(selectEl(c.name + ' 드럼 소리', Object.entries(DRUM_NAME), c.inst, v => { c.inst = v; buildRack(); ensureCtx(); applyMix(E, S.mix); drumHit(v, ctx.currentTime + 0.02, E, 1, chKey(c)); }));
    ex.appendChild(sampleCtl(chKey(c), c.name));
    st.appendChild(ex); box.appendChild(st);
  });
  { const st = channelStrip('chords', CH_NAME.chords); toneKnobs(st, S.chordTone); const ex = document.createElement('div'); ex.className = 'sx';
    ex.appendChild(selectEl('코드 소리', [['pad','패드'],['supersaw','슈퍼소 코드'],['piano','피아노'],['epiano','일렉트릭 피아노'],['pluck','플럭']], S.chordInst, v => S.chordInst = v)); st.appendChild(ex); box.appendChild(st); }
  if ((S.audio || []).length) box.appendChild(channelStrip('audio', CH_NAME.audio));
  for (const b of BUSES) if (Object.values(S.mix).some(m => m.out === b)) box.appendChild(channelStrip(b, CH_NAME[b]));
  { const st = channelStrip('bass', CH_NAME.bass), ex = document.createElement('div'); ex.className = 'sx';
    ex.appendChild(selectEl('베이스 패턴', [['off','끔'],['sustain','길게'],['8th','8분'],['offbeat','오프비트']], S.bassMode, v => S.bassMode = v));
    ex.appendChild(selectEl('베이스 소리', [['reese','리스'],['sub','서브'],['saw','톱니']], S.bassInst, v => S.bassInst = v)); st.appendChild(ex); box.appendChild(st); }
  const ma = S.mix.master, st = document.createElement('div'); st.className = 'strip master'; st.setAttribute('role', 'group'); st.setAttribute('aria-label', '마스터');
  st.innerHTML = '<div class="sh"><b>' + tMsg('마스터') + '</b></div>';
  st.appendChild(mixSlider('볼륨', ma.v, 0, 1.2, 0.01, v => { ma.v = v; remix(); }, pct));
  st.appendChild(mixSlider('사이드체인', ma.sc, 0, 0.9, 0.01, v => { ma.sc = v; }, pct));
  st.appendChild(mixSlider('리버브 길이', ma.size, 0, 3, 1, v => { ma.size = v; remix(); }, v => tMsg(['짧게','보통','길게','아주 길게'][v])));
  fxSection(st, ma, '마스터');
  const kx = document.createElement('div'); kx.className = 'sx';
  kx.appendChild(selectEl('드럼 키트', [['edm','키트: EDM'],['808','키트: 808'],['hard','키트: 하드'],['acoustic','키트: 어쿠스틱풍']], S.kit, v => {
    S.kit = v; ensureCtx(); applyMix(E, S.mix); const t = ctx.currentTime + 0.02; drumHit('kick', t); drumHit('hat', t + 0.15); drumHit('snare', t + 0.3); drumHit('hat', t + 0.45); }));
  st.appendChild(kx);
  const mt = document.createElement('div'); mt.className = 'meter'; mt.innerHTML = '<div class="mbar"><i id="meterFill"></i></div><span id="meterDb">-∞</span>'; st.appendChild(mt);
  box.appendChild(st);
}
$('mixReset').onclick = () => {
  pushUndo(); S.mix = {}; S.channels.forEach(c => c.tone = toneDefault()); S.chordTone = {br:1, atk:0.15, rel:0.5}; S.kit = 'edm';
  fillMix(S); buildMixer(); remix(); save(); status('믹서를 기본값으로 되돌렸어요.');
};
