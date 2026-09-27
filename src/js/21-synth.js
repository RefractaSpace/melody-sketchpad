/* 21-synth.js — 악기 "신스": 발진기 2개 + 서브 → 필터(엔벨로프) → 앰프 ADSR, LFO, 유니즌 */
function synthVoice(E, f, t, d, vel, dest, slot) {
  const ac = E.ac, c = slot && slot.startsWith('ch:') ? chById(slot.slice(3)) : null, P = normSyn(c && c.syn), end = t + d, stopT = end + P.rel * 4 + 0.05;
  const mixG = ac.createGain(), flt = ac.createBiquadFilter(), amp = ac.createGain(), oscs = [];
  flt.type = 'lowpass'; flt.Q.value = 0.5 + P.res * 18; mixG.connect(flt); flt.connect(amp); amp.connect(dest);
  // 필터 엔벨로프: 올라갔다가 fdec초 동안 기본 주파수로
  const base = cutHz(P.cut), top = Math.min(18000, base * Math.pow(2, P.fenv * 6));
  flt.frequency.setValueAtTime(top, t); flt.frequency.setTargetAtTime(base, t + 0.002, Math.max(0.01, P.fdec) / 3);
  const g1 = ac.createGain(); g1.gain.value = (1 - P.mix) / P.uni; g1.connect(mixG);
  for (let u = 0; u < P.uni; u++) oscs.push(osc(ac, P.w1, f, (u - (P.uni - 1) / 2) * P.spread, t, stopT, g1));
  const g2 = ac.createGain(); g2.gain.value = P.mix; g2.connect(mixG); oscs.push(osc(ac, P.w2, f * Math.pow(2, P.oct2), P.det, t, stopT, g2));
  if (P.sub > 0) { const gs = ac.createGain(); gs.gain.value = P.sub * 0.8; gs.connect(mixG); oscs.push(osc(ac, 'sine', f / 2, 0, t, stopT, gs)); }
  // 앰프 ADSR
  const pk = P.vol * vel * 0.45; amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(pk, t + Math.max(0.002, P.atk));
  amp.gain.setTargetAtTime(pk * P.sus + 0.0001, t + Math.max(0.002, P.atk), Math.max(0.01, P.dec) / 3); amp.gain.setTargetAtTime(0.0001, Math.max(end, t + P.atk), Math.max(0.01, P.rel) / 3);
  if (P.lfoAmt > 0) {
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = clamp(P.lfoRate, 0.05, 20); lfo.connect(lg); lfo.start(t); lfo.stop(stopT);
    if (P.lfoTo === 'cut') { lg.gain.value = base * 0.9 * P.lfoAmt; lg.connect(flt.frequency); }
    else if (P.lfoTo === 'pitch') { lg.gain.value = 100 * P.lfoAmt; oscs.forEach(o => lg.connect(o.detune)); }
    else { lg.gain.value = pk * 0.5 * P.lfoAmt; lg.connect(amp.gain); }
  }
}
// 믹서 칸의 신스 조절판
function synthPanel(box, c) {
  c.syn = normSyn(c.syn); const P = c.syn, set = (k, v) => { P[k] = v; save(); }, pc = v => Math.round(v * 100) + '%', ms = v => v >= 1 ? v.toFixed(2) + '초' : Math.round(v * 1000) + 'ms';
  subTitle(box, '신스');
  box.appendChild(selectEl(`${c.name} 신스 프리셋`, [['', '프리셋 고르기'], ...Object.keys(SYN_PRESETS).map(k => [k, k])], '', v => { if (!v) return; pushUndo(); c.syn = normSyn({...SYN_DEF, ...SYN_PRESETS[v]}); save(); buildMixer(); status(`신스 프리셋 "${v}"`); }));
  box.appendChild(selectEl(`${c.name} 발진기 1 파형`, SYN_WAVES, P.w1, v => set('w1', v)));
  box.appendChild(selectEl(`${c.name} 발진기 2 파형`, SYN_WAVES, P.w2, v => set('w2', v)));
  const S2 = (lab, k, a, b, st, fmt) => box.appendChild(mixSlider(lab, P[k], a, b, st, v => set(k, v), fmt));
  S2('발진기2 옥타브', 'oct2', -1, 1, 1, v => (v > 0 ? '+' : '') + v); S2('발진기2 디튠', 'det', 0, 50, 1, v => v + '센트'); S2('발진기2 섞기', 'mix', 0, 1, 0.01, pc); S2('서브', 'sub', 0, 1, 0.01, pc);
  S2('유니즌', 'uni', 1, 3, 1, v => v + '겹'); S2('유니즌 퍼짐', 'spread', 0, 50, 1, v => v + '센트');
  S2('필터 주파수', 'cut', 0, 1, 0.01, v => { const h = cutHz(v); return h >= 1000 ? (h / 1000).toFixed(1) + 'k' : Math.round(h) + ''; }); S2('필터 공명', 'res', 0, 1, 0.01, pc); S2('필터 엔벨로프', 'fenv', 0, 1, 0.01, pc); S2('필터 감쇠', 'fdec', 0.01, 2, 0.01, ms);
  S2('어택', 'atk', 0.002, 2, 0.001, ms); S2('디케이', 'dec', 0.01, 2, 0.01, ms); S2('서스테인', 'sus', 0, 1, 0.01, pc); S2('릴리즈', 'rel', 0.01, 3, 0.01, ms);
  box.appendChild(selectEl(`${c.name} LFO 대상`, [['cut', 'LFO → 필터'], ['pitch', 'LFO → 음높이'], ['vol', 'LFO → 볼륨']], P.lfoTo, v => set('lfoTo', v)));
  S2('LFO 속도', 'lfoRate', 0.05, 12, 0.05, v => v.toFixed(2) + 'Hz'); S2('LFO 양', 'lfoAmt', 0, 1, 0.01, pc); S2('신스 볼륨', 'vol', 0, 1, 0.01, pc);
}
