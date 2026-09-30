/* 32-kit.js — 6: 드럼 키트. 드럼을 피아노 롤에서 음처럼 찍음 (줄 = 표준 GM 드럼 번호)
   줄은 36~49 빈틈없이, 저장·MIDI는 GM 번호. 킥·스네어·박수·닫힌 햇·크래시는 기존 드럼 소리, 나머지 9개는 여기서 합성. 뒤에 실제 녹음 샘플로 바꿀 자리. */
// 드럼 키트 줄: 피아노 롤에서는 36~49의 14줄을 빈틈없이 쓰고 (아래부터 킥 → 셰이커), 소리·MIDI에서는 표준 GM 드럼 번호로 바꿈
const KIT = [[36, 36, 'kick', '킥'], [37, 37, 'rim', '림'], [38, 38, 'snare', '스네어'], [39, 39, 'clap', '박수'],
  [40, 42, 'hatC', '닫힌 햇'], [41, 44, 'hatP', '페달 햇'], [42, 46, 'hatO', '열린 햇'],
  [43, 41, 'tomL', '로우 탐'], [44, 45, 'tomM', '미드 탐'], [45, 48, 'tomH', '하이 탐'],
  [46, 49, 'crash', '크래시'], [47, 51, 'ride', '라이드'], [48, 56, 'bell', '카우벨'], [49, 70, 'shaker', '셰이커']];
const KIT_ROW = {}, KIT_BY_GM = {}; KIT.forEach(([p, gm, id, nm], i) => { KIT_ROW[p] = {gm, id, nm, i}; KIT_BY_GM[gm] = p; });
// 다른 GM 번호도 비슷한 드럼 줄로 (MIDI 파일·건반에서 들어올 때)
const KIT_ALIAS = {35:36, 40:38, 43:41, 47:45, 50:48, 52:49, 55:49, 57:49, 53:51, 59:51, 54:70, 69:70, 82:70, 31:37, 33:37};
const kitFromGm = gm => KIT_BY_GM[KIT_ALIAS[gm] || gm];
const kitToGm = p => KIT_ROW[p] ? KIT_ROW[p].gm : 36;
const kitSnap = p => Math.max(36, Math.min(49, Math.round(p)));   // 줄이 빈틈없으니 범위 안으로만
function kitNoise(ac) { if (ac._kitNoise) return ac._kitNoise; const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return ac._kitNoise = b; }
function kitHit(p, t, EE, vel, key) {
  EE = EE || E; vel = vel == null ? 1 : vel; const row = KIT_ROW[p]; if (!row) return;
  const id = row.id, ac = EE.ac, dest = getCh(EE, key).inp;
  if (id === 'kick' || id === 'snare' || id === 'clap' || id === 'crash') { drumHit(id, t, EE, vel, key); return; }
  if (id === 'hatC' || id === 'hatP') { chokeOpenHat(EE, t); drumHit('hat', t, EE, vel * (id === 'hatP' ? .6 : 1), key); return; }
  const out = ac.createGain(); out.connect(dest);
  const env = (g, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  const noise = (dec, type, f, q, peak) => { const s = ac.createBufferSource(); s.buffer = kitNoise(ac); const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); env(g, 0.002, peak * vel, dec); s.connect(fl).connect(g).connect(out); s.start(t); s.stop(t + dec + 0.05); return g; };
  const osc = (type, f0, f1, dec, peak, glide) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dec)); const g = ac.createGain(); env(g, 0.002, peak * vel, dec); o.connect(g).connect(out); o.start(t); o.stop(t + dec + 0.05); return g; };
  if (id === 'rim') { osc('square', 1700, 0, 0.025, .35); noise(0.03, 'bandpass', 3200, 2.5, .5); }
  else if (id === 'tomL' || id === 'tomM' || id === 'tomH') { const f = {tomL:105, tomM:145, tomH:195}[id]; osc('sine', f, f * .62, 0.38, .95, .28); noise(0.02, 'lowpass', 2500, .7, .25); }
  else if (id === 'hatO') { chokeOpenHat(EE, t); const g = noise(0.5, 'highpass', 7200, .8, .42); EE._openHat = {g, t}; }
  else if (id === 'ride') { [311, 457, 603, 785, 1041, 1254].forEach(f => osc('square', f * 2.2, 0, 1.1, .035)); noise(1.0, 'bandpass', 8000, 1.2, .16); }
  else if (id === 'bell') { const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 800; fl.Q.value = 3; fl.connect(out);
    [540, 800].forEach(f => { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = ac.createGain(); env(g, 0.002, .5 * vel, 0.32); o.connect(g).connect(fl); o.start(t); o.stop(t + 0.4); }); }
  else if (id === 'shaker') noise(0.09, 'bandpass', 6200, 1.1, .45);
}
function chokeOpenHat(EE, t) { const o = EE._openHat; if (o && t > o.t) { try { o.g.gain.cancelScheduledValues(t); o.g.gain.setTargetAtTime(0.0001, t, 0.012); } catch (e) {} EE._openHat = null; } }   // 닫힌 햇이 열린 햇을 끊음
// 건반 칸: 드럼 키트면 건반 대신 드럼 이름
const kitDrawKeys0 = drawKeys;
drawKeys = function () {
  kitDrawKeys0();
  if (!curCh() || curCh().inst !== 'kit') return;
  const x = kc.getContext('2d'), d = devicePixelRatio || 1; x.save(); x.setTransform(d, 0, 0, d, 0, 0);
  const ink = getComputedStyle(document.body).color; x.fillStyle = CS['row-out']; x.fillRect(0, 0, KEYW, (HIGH - LOW + 1) * ROWH);
  x.font = `600 ${Math.max(9, Math.min(11, ROWH - 3))}px ${getComputedStyle(document.body).fontFamily}`; x.textBaseline = 'middle'; x.textAlign = 'left';
  for (let p = HIGH; p >= LOW; p--) { const y = (HIGH - p) * ROWH, r = KIT_ROW[p];
    if (r) { x.fillStyle = r.i % 2 ? CS['row-in'] : CS['row-root']; x.fillRect(0, y, KEYW, ROWH); x.fillStyle = ink; x.fillText(r.nm, 6, y + ROWH / 2 + .5); }
    x.fillStyle = CS['key-line']; x.fillRect(0, y + ROWH - .5, KEYW, 1); }
  x.restore();
};
// 지금 채널이 드럼 키트로 바뀌면 (고르기·추가·불러오기 어떤 길이든) 드럼 줄(36~70)의 가운데로 스크롤
let kitSeen = null;
const kitDrawRoll0 = drawRoll;
drawRoll = function () {
  const c = curCh();
  if (c && c.inst === 'kit' && kitSeen !== c.id) { kitSeen = c.id; const top = Math.max(0, Math.round((HIGH - 42.5) * ROWH - wrap.clientHeight / 2)); if (Math.abs(wrap.scrollTop - top) > 1) { wrap.scrollTop = top; drawKeys(); } }
  else if (!c || c.inst !== 'kit') kitSeen = null;
  kitDrawRoll0();
};
// 드럼 채널(킥·스네어…)들을 드럼 키트 하나로 합치기 — 모든 패턴의 음을 옮기고 원래 채널은 지움 (되돌리기 가능)
const KIT_FROM = {kick:36, snare:38, hat:40, clap:39, crash:46};
function mergeToKit() {
  const drums = S.channels.filter(c => c.kind === 'drum'); if (!drums.length) { status('합칠 드럼 채널이 없어요.'); return; }
  pushUndo(); let kit = S.channels.find(c => c.inst === 'kit'); if (!kit) { kit = newChannel('synth', 'kit'); S.channels.push(kit); }
  let moved = 0;
  for (const P of S.patterns) { const into = P.notes[kit.id] = P.notes[kit.id] || [];
    for (const c of drums) { for (const n of P.notes[c.id] || []) { into.push({p:KIT_FROM[c.inst] || 36, s:n.s, l:Math.max(6, n.l || 6), v:n.v}); moved++; } delete P.notes[c.id]; if (P.auto) delete P.auto[c.id]; }
    into.sort((a, b) => a.s - b.s || a.p - b.p); }
  for (const c of drums) { S.channels.splice(S.channels.indexOf(c), 1); delete S.mix[chKey(c)]; }
  S.ch = Math.max(0, S.channels.indexOf(kit)); fillMix(S); save(); refreshAll(); if (E) applyMix(E, S.mix);
  status(`드럼 채널 ${drums.length}개를 드럼 키트로 합쳤어요 · 음 ${moved}개 (되돌리기 Ctrl+Z)`);
  return {channels:drums.length, notes:moved};
}
