/* 06-mixer.js — 믹서 화면 (트랙마다 채널 · 코드 · 베이스 · 드럼 · 마스터) */
function mixSlider(label, val, min, max, step, on, fmt) {
  const w = document.createElement('label'); w.className = 'knob';
  const s = document.createElement('input'); s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = val; s.setAttribute('aria-label', label);
  const v = document.createElement('span'); v.className = 'kv'; v.textContent = fmt(val);
  const l = document.createElement('span'); l.className = 'kl'; l.textContent = label;
  s.oninput = () => { on(+s.value); v.textContent = fmt(+s.value); }; s.onchange = () => save();
  w.append(l, s, v); return w;
}
const pct = v => Math.round(v * 100), eqf = v => (v > 0 ? '+' : '') + v.toFixed(0) + 'dB';
const remix = () => { if (E) applyMix(E, S.mix); };
function subTitle(st, t) { const h = document.createElement('div'); h.className = 'sub'; h.textContent = t; st.appendChild(h); }
function toneKnobs(st, T) {
  subTitle(st, '음색');
  st.appendChild(mixSlider('밝기', T.br, 0.3, 2, 0.05, v => { T.br = v; }, v => pct(v) + '%'));
  st.appendChild(mixSlider('어택', T.atk, 0, 0.8, 0.01, v => { T.atk = v; }, v => (v * 1000).toFixed(0) + 'ms'));
  st.appendChild(mixSlider('릴리즈', T.rel, 0.05, 2, 0.01, v => { T.rel = v; }, v => v < 1 ? (v * 1000).toFixed(0) + 'ms' : v.toFixed(1) + 's'));
}
function channelStrip(key, label) {
  const m = S.mix[key], st = document.createElement('div'); st.className = 'strip'; st.setAttribute('role', 'group'); st.setAttribute('aria-label', label + ' 채널');
  const hd = document.createElement('div'); hd.className = 'sh'; const b = document.createElement('b'); b.textContent = label; hd.appendChild(b);
  const ms = document.createElement('div'); ms.className = 'ms';
  const btn = (txt, title, get, set) => { const x = document.createElement('button'); x.className = 'tbtn xs'; x.textContent = txt; x.title = title; x.setAttribute('aria-label', label + ' ' + title); x.setAttribute('aria-pressed', !!get()); x.onclick = () => { set(!get()); x.setAttribute('aria-pressed', !!get()); remix(); save(); }; ms.appendChild(x); };
  btn('M', '뮤트', () => m.mute, v => m.mute = v ? 1 : 0);
  btn('S', '솔로', () => m.solo, v => m.solo = v ? 1 : 0);
  if (key !== 'kick') btn('SC', '사이드체인 받기', () => m.sc, v => m.sc = v);
  hd.appendChild(ms); st.appendChild(hd);
  st.appendChild(mixSlider('볼륨', m.v, 0, 1.2, 0.01, v => { m.v = v; remix(); }, pct));
  st.appendChild(mixSlider('팬', m.pan, -1, 1, 0.05, v => { m.pan = v; remix(); }, v => v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + pct(Math.abs(v))));
  st.appendChild(mixSlider('리버브', m.rev, 0, 1, 0.01, v => { m.rev = v; remix(); }, pct));
  st.appendChild(mixSlider('딜레이', m.dly, 0, 1, 0.01, v => { m.dly = v; remix(); }, pct));
  subTitle(st, 'EQ');
  st.appendChild(mixSlider('저음', m.lo, -12, 12, 1, v => { m.lo = v; remix(); }, eqf));
  st.appendChild(mixSlider('중음', m.mid, -12, 12, 1, v => { m.mid = v; remix(); }, eqf));
  st.appendChild(mixSlider('고음', m.hi, -12, 12, 1, v => { m.hi = v; remix(); }, eqf));
  return st;
}
function selectEl(label, opts, val, on) {
  const s = document.createElement('select'); s.setAttribute('aria-label', label);
  for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); }
  s.value = val; s.onchange = () => { on(s.value); save(); }; return s;
}
function buildMixer() {
  const box = $('mixerStrips'); box.innerHTML = '';
  S.tracks.forEach((t, i) => {
    const st = channelStrip(trackKey(t), `${i + 1}. ${t.name}`); st.classList.add('trk');
    toneKnobs(st, t.tone);
    const ex = document.createElement('div'); ex.className = 'sx';
    ex.appendChild(selectEl(t.name + ' 악기', Object.entries(INSTS), t.inst, v => { t.inst = v; refreshTracks(); }));
    ex.appendChild(sampleCtl(trackKey(t), t.name));
    st.appendChild(ex); box.appendChild(st);
  });
  { const st = channelStrip('chords', CH_NAME.chords); toneKnobs(st, S.chordTone); const ex = document.createElement('div'); ex.className = 'sx';
    ex.appendChild(selectEl('코드 소리', [['pad','패드'],['supersaw','슈퍼소 코드'],['piano','피아노'],['epiano','일렉트릭 피아노'],['pluck','플럭']], S.chordInst, v => S.chordInst = v)); st.appendChild(ex); box.appendChild(st); }
  { const st = channelStrip('bass', CH_NAME.bass), ex = document.createElement('div'); ex.className = 'sx';
    ex.appendChild(selectEl('베이스 패턴', [['off','끔'],['sustain','길게'],['8th','8분'],['offbeat','오프비트']], S.bassMode, v => S.bassMode = v));
    ex.appendChild(selectEl('베이스 소리', [['reese','리스'],['sub','서브'],['saw','톱니']], S.bassInst, v => S.bassInst = v)); st.appendChild(ex); box.appendChild(st); }
  for (const d of DRUMS) {
    const st = channelStrip(d, CH_NAME[d]), ex = document.createElement('div'); ex.className = 'sx';
    if (d === 'kick') ex.appendChild(selectEl('드럼 키트', [['edm','키트: EDM'],['808','키트: 808'],['hard','키트: 하드'],['acoustic','키트: 어쿠스틱풍']], S.kit, v => {
      S.kit = v; ensureCtx(); applyMix(E, S.mix); const t = ctx.currentTime + 0.02; drumHit('kick', t); drumHit('hat', t + 0.15); drumHit('snare', t + 0.3); drumHit('hat', t + 0.45); }));
    ex.appendChild(sampleCtl(d, CH_NAME[d])); st.appendChild(ex); box.appendChild(st);
  }
  const ma = S.mix.master, st = document.createElement('div'); st.className = 'strip master'; st.setAttribute('role', 'group'); st.setAttribute('aria-label', '마스터');
  st.innerHTML = '<div class="sh"><b>마스터</b></div>';
  st.appendChild(mixSlider('볼륨', ma.v, 0, 1.2, 0.01, v => { ma.v = v; remix(); }, pct));
  st.appendChild(mixSlider('사이드체인', ma.sc, 0, 0.9, 0.01, v => { ma.sc = v; }, pct));
  st.appendChild(mixSlider('리버브 길이', ma.size, 0, 3, 1, v => { ma.size = v; remix(); }, v => ['짧게','보통','길게','아주 길게'][v]));
  const mt = document.createElement('div'); mt.className = 'meter'; mt.innerHTML = '<div class="mbar"><i id="meterFill"></i></div><span id="meterDb">-∞</span>'; st.appendChild(mt);
  box.appendChild(st);
}
$('mixReset').onclick = () => {
  pushUndo(); S.mix = {}; S.tracks.forEach(t => t.tone = toneDefault()); S.chordTone = {br:1, atk:0.15, rel:0.5}; S.kit = 'edm';
  fillMix(S); buildMixer(); remix(); save(); status('믹서를 기본값으로 되돌렸어요.');
};
