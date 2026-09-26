/* 05-play.js — 재생 (소리 예약 · 반복 · 미터) */
let startAt = 0, nextTick = 0, timer = 0, raf = 0, st0 = 0, metroOn = false;
const tickSec = () => 60 / S.bpm / PPQ;
function click(EE, t, acc) {
  const o = EE.ac.createOscillator(), g = EE.ac.createGain(); o.type = 'sine'; o.frequency.value = acc ? 1760 : 1180;
  g.gain.setValueAtTime(acc ? 0.3 : 0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(g); g.connect(EE.out); o.start(t); o.stop(t + 0.06);
}
// 코드 구간: 코드가 나온 박부터 다음 코드(또는 멈춤)까지
function chordSegments() {
  const out = []; let cur = null, start = 0;
  for (let i = 0; i <= S.bars * 4; i++) {
    const c = i < S.bars * 4 ? S.chords[i] : {x:1};
    if (c) { if (cur) out.push({c:cur, s:start * PPQ, l:(i - start) * PPQ}); cur = c.x ? null : c; start = i; }
  }
  return out;
}
function scheduleRange(EE, t0, t1, base, metro) {
  const ts = tickSec();
  for (const tr of S.tracks) for (const n of tr.notes) if (n.s >= t0 && n.s < t1) playTrackNote(EE, tr, n.p, base + n.s * ts, n.l * ts * 0.98, n.v);
  for (const seg of chordSegments()) if (seg.s >= t0 && seg.s < t1) chordPlay(EE, S.chordInst, chordVoices(seg.c), base + seg.s * ts, seg.l * ts * 0.98);
  if (S.bassMode !== 'off') {
    for (let i = Math.floor(t0 / PPQ); i < Math.min(S.bars * 4, Math.ceil(t1 / PPQ)); i++) {
      const c = chordAtBeat(i); if (!c) continue;
      const root = 36 + c.r, bt = i * PPQ, prev = i > 0 ? chordAtBeat(i - 1) : null, changed = !prev || prev.r !== c.r || prev.q !== c.q;
      let hits;
      if (S.bassMode === 'sustain') { if (!(changed || i % 4 === 0)) continue; let j = i + 1; while (j < S.bars * 4 && j % 4 !== 0 && chordAtBeat(j) === c) j++; hits = [[0, (j - i) * PPQ]]; }
      else if (S.bassMode === '8th') hits = [[0, 22], [24, 22]];
      else hits = [[24, 20]];
      for (const [o, l] of hits) { const tt = bt + o; if (tt >= t0 && tt < t1) bassPlay(EE, S.bassInst, root, base + tt * ts, l * ts * 0.95); }
    }
  }
  for (let i = Math.floor(t0 / 12); i < Math.min(S.bars * 16, Math.ceil(t1 / 12)); i++) {
    const tt = i * 12; if (tt < t0 || tt >= t1) continue;
    for (const d of DRUMS) { const v = S.drums[d][i]; if (v) drumHit(d, base + tt * ts, EE, v); }
  }
  if (metro) for (let tt = Math.ceil(t0 / PPQ) * PPQ; tt < t1; tt += PPQ) click(EE, base + tt * ts, tt % (4 * PPQ) === 0);
}
const loopOn = () => $('loop').getAttribute('aria-pressed') === 'true';
function pump() {
  const ahead = 0.15, now = ctx.currentTime, tot = totalTicks(), span = tot - st0;
  while (true) {
    const k = Math.floor(nextTick / span), local = st0 + (nextTick - k * span), base = startAt + (k * span - st0) * tickSec();
    if (startAt + nextTick * tickSec() > now + ahead) break;
    if (!loopOn() && nextTick >= span) break;
    scheduleRange(E, local, Math.min(tot, local + 12), base, metroOn); nextTick += 12;
  }
}
function updatePos(t) { const bar = Math.floor(t / (4 * PPQ)) + 1, beat = Math.floor((t % (4 * PPQ)) / PPQ) + 1; $('posOut').textContent = bar + ' : ' + beat; }
let meterBuf = null;
function drawMeter() {
  const el = $('meterFill'); if (!el || !E || !E.meter) return;
  if (!meterBuf) meterBuf = new Float32Array(E.meter.fftSize); E.meter.getFloatTimeDomainData(meterBuf);
  let pk = 0; for (const v of meterBuf) pk = Math.max(pk, Math.abs(v));
  const db = 20 * Math.log10(pk + 1e-6); el.style.width = clamp((db + 48) / 48 * 100, 0, 100) + '%'; $('meterDb').textContent = pk > 0.0005 ? db.toFixed(1) + ' dB' : '-∞';
}
function frame() {
  if (!playing) return;
  const tot = totalTicks(), span = tot - st0, el = (ctx.currentTime - startAt) / tickSec();
  drawMeter();
  if (el < 0) { raf = requestAnimationFrame(frame); return; }
  if (!loopOn() && el >= span) { stop(); return; }
  playTick = st0 + (el % span); updatePos(playTick);
  const X = playTick * TICKPX, v = view();
  if (X < v.sl || X > v.sl + v.vw - 40) wrap.scrollLeft = Math.max(0, X - 40);   // 스크롤되면 scroll 이벤트가 다시 그림
  drawRuler(); drawRoll(); drawLanes();
  raf = requestAnimationFrame(frame);
}
const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>', STOP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>';
function play() {
  ensureCtx(); applyMix(E, S.mix); playing = true; st0 = startTick; startAt = ctx.currentTime + 0.08; nextTick = 0; pump(); timer = setInterval(pump, 40);
  const b = $('play'); b.classList.add('on'); b.setAttribute('aria-label', '정지'); b.innerHTML = STOP_SVG; raf = requestAnimationFrame(frame);
}
function stop() {
  playing = false; clearInterval(timer); cancelAnimationFrame(raf); playTick = -1; updatePos(startTick);
  const b = $('play'); b.classList.remove('on'); b.setAttribute('aria-label', '재생'); b.innerHTML = PLAY_SVG;
  if (E) {   // 예약된 소리를 끊기: 출력을 줄이고 새 엔진으로 교체
    const old = E, t = ctx.currentTime; old.out.gain.cancelScheduledValues(t); old.out.gain.setValueAtTime(old.out.gain.value, t); old.out.gain.linearRampToValueAtTime(0, t + 0.05);
    setTimeout(() => { try { old.out.disconnect(); } catch (e) {} }, 150); E = makeEngine(ctx, true); applyMix(E, S.mix);
  }
  const mf = $('meterFill'); if (mf) { mf.style.width = '0%'; $('meterDb').textContent = '-∞'; }
  drawRuler(); drawRoll(); drawLanes();
}
$('play').onclick = () => playing ? stop() : play();
$('loop').onclick = () => $('loop').setAttribute('aria-pressed', !loopOn());
$('metro').onclick = () => { metroOn = !metroOn; $('metro').setAttribute('aria-pressed', metroOn); };
