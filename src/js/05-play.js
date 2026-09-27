/* 05-play.js — 재생 (PAT: 지금 패턴 반복 · SONG: 플레이리스트 곡 전체, 템포 지도 적용) */
let startAt = 0, nextTick = 0, timer = 0, raf = 0, st0 = 0, metroOn = false;
const tickSec = () => 60 / S.bpm / PPQ;
// ---- 템포 지도 ----
// S.tempo = [{t:곡 틱, bpm}] — SONG 모드에서만 적용 (PAT 모드는 기본 BPM으로 반복)
// 바뀌는 곳마다 "거기까지 흐른 초"를 미리 더해 두고, 틱 ↔ 초를 이진 탐색으로 바꿔요
let tmCache = null;
function tempoPts() {
  if (tmCache && tmCache.bpm === S.bpm && tmCache.arr === S.tempo) return tmCache.pts;
  const pts = [{t:0, sec:0, spt:60 / S.bpm / PPQ}];
  for (const x of S.tempo || []) { const L = pts[pts.length - 1], spt = 60 / x.bpm / PPQ; if (x.t <= L.t) { L.spt = spt; continue; } pts.push({t:x.t, sec:L.sec + (x.t - L.t) * L.spt, spt}); }
  tmCache = {bpm:S.bpm, arr:S.tempo, pts}; return pts;
}
function tempoIdx(pts, key, v) { let lo = 0, hi = pts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pts[m][key] <= v) lo = m; else hi = m - 1; } return lo; }
function songSec(t) { const pts = tempoPts(), p = pts[tempoIdx(pts, 't', t)]; return p.sec + (t - p.t) * p.spt; }
function songTickAt(sec) { const pts = tempoPts(), p = pts[tempoIdx(pts, 'sec', sec)]; return p.t + (sec - p.sec) / p.spt; }
function bpmAt(t) { const pts = tempoPts(); return 60 / PPQ / pts[tempoIdx(pts, 't', t)].spt; }
const useMap = () => S.playMode === 'song';
const tSec = t => useMap() ? songSec(t) : t * tickSec();       // 시간축 틱 → 초
const tTick = sec => useMap() ? songTickAt(sec) : sec / tickSec();   // 초 → 시간축 틱
function click(EE, t, acc) {
  const o = EE.ac.createOscillator(), g = EE.ac.createGain(); o.type = 'sine'; o.frequency.value = acc ? 1760 : 1180;
  g.gain.setValueAtTime(acc ? 0.3 : 0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(g); g.connect(EE.out); o.start(t); o.stop(t + 0.06);
}
// 코드 구간: 코드가 나온 박부터 다음 코드(또는 멈춤·패턴 끝)까지
function chordSegments(P) {
  P = P || curPat(); const out = [], n = P.bars * 4; let cur = null, start = 0;
  for (let i = 0; i <= n; i++) {
    const c = i < n ? P.chords[i] : {x:1};
    if (c) { if (cur) out.push({c:cur, s:start * PPQ, l:(i - start) * PPQ}); cur = c.x ? null : c; start = i; }
  }
  return out;
}
// 패턴 하나의 [t0, t1) 구간 소리 예약 — at(패턴 틱) = 그 틱이 울릴 시각(초)
// 자동화 선에서 틱 t의 값 (점 사이는 직선, 첫 점 앞·끝 점 뒤는 그 값 그대로)
function autoAt(pts, t) { if (t <= pts[0].s) return pts[0].v; for (let i = 1; i < pts.length; i++) if (t <= pts[i].s) { const a = pts[i - 1], b = pts[i]; return a.v + (b.v - a.v) * (t - a.s) / (b.s - a.s); } return pts[pts.length - 1].v; }
function scheduleAuto(EE, P, t0, t1, at) {
  for (const c of S.channels) {
    const A = P.auto && P.auto[c.id]; if (!A && !(P.notes[c.id] || []).length) continue;   // 이 패턴이 안 쓰는 채널은 건드리지 않음
    const ch = getCh(EE, chKey(c)), T0 = at(t0); ch.atDef = ch.atDef || {vol:true, cut:true};
    for (const [k, param, map, def] of [['vol', ch.aVol.gain, v => v, 1], ['cut', ch.aCut.frequency, cutHz, AUTO_CUT_MAX]]) {
      const pts = A && A[k];
      if (!pts || !pts.length) { if (!ch.atDef[k]) { param.setValueAtTime(def, T0); ch.atDef[k] = true; } continue; }   // 이미 기본값이면 명령을 더 쌓지 않음
      ch.atDef[k] = false;
      // 예약 구간이 길어도(WAV는 2초씩) 6틱마다 중간 점을 넣어서, 필터처럼 귀에 곱셈으로 들리는 값도 선을 따라가게
      param.setValueAtTime(map(autoAt(pts, t0)), T0);
      const cuts = new Set(pts.filter(q => q.s > t0 && q.s < t1).map(q => q.s)); for (let t = Math.floor(t0 / 6) * 6 + 6; t < t1; t += 6) cuts.add(t);
      for (const t of [...cuts].sort((a, b) => a - b)) param.linearRampToValueAtTime(map(autoAt(pts, t)), at(t));
      param.linearRampToValueAtTime(map(autoAt(pts, t1)), at(t1));
    }
  }
}
function schedulePattern(EE, P, t0, t1, at) {
  const dur = (a, l) => at(a + l) - at(a);
  scheduleAuto(EE, P, t0, t1, at);
  for (const c of S.channels) { const arr = P.notes[c.id]; if (arr) for (const n of arr) if (n.s >= t0 && n.s < t1) playTrackNote(EE, c, n.p, at(n.s), dur(n.s, n.l) * 0.98, n.v, n.b); }
  for (const seg of chordSegments(P)) if (seg.s >= t0 && seg.s < t1) chordPlay(EE, S.chordInst, chordVoices(seg.c), at(seg.s), dur(seg.s, seg.l) * 0.98);
  if (S.bassMode !== 'off') {
    const nb = P.bars * 4;
    for (let i = Math.floor(t0 / PPQ); i < Math.min(nb, Math.ceil(t1 / PPQ)); i++) {
      const c = chordAtBeat(i, P); if (!c) continue;
      const root = 36 + c.r, bt = i * PPQ, prev = i > 0 ? chordAtBeat(i - 1, P) : null, changed = !prev || prev.r !== c.r || prev.q !== c.q;
      let hits;
      if (S.bassMode === 'sustain') { if (!(changed || i % 4 === 0)) continue; let j = i + 1; while (j < nb && j % 4 !== 0 && chordAtBeat(j, P) === c) j++; hits = [[0, (j - i) * PPQ]]; }
      else if (S.bassMode === '8th') hits = [[0, 22], [24, 22]];
      else hits = [[24, 20]];
      for (const [o, l] of hits) { const tt = bt + o; if (tt >= t0 && tt < t1) bassPlay(EE, S.bassInst, root, at(tt), dur(tt, l) * 0.95); }
    }
  }
}
const playSpan = () => S.playMode === 'song' ? songTicks() : totalTicks();
// 전체 시간축(PAT: 패턴, SONG: 곡)의 [t0, t1) 예약 — base + tSec(틱) = 절대 시각
function scheduleRange(EE, t0, t1, base, metro, from = 0) {
  if (S.playMode === 'song') {
    for (const cl of S.playlist.clips) for (const q of clipParts(cl, t0, t1)) schedulePattern(EE, q.P, q.from, q.to, lt => base + tSec(q.origin + lt));
    scheduleAudio(EE, t0, t1, base, from); scheduleSongAuto(EE, t0, t1, base);
  } else schedulePattern(EE, curPat(), t0, t1, lt => base + tSec(lt));
  if (metro) for (let tt = Math.ceil(t0 / PPQ) * PPQ; tt < t1; tt += PPQ) click(EE, base + tSec(tt), tt % BAR_T === 0);
}
const loopOn = () => $('loop').getAttribute('aria-pressed') === 'true';
function pump() {
  const ahead = 0.15, now = ctx.currentTime, tot = playSpan(), span = tot - st0;
  if (span <= 0) return;
  const spanSec = tSec(tot) - tSec(st0);
  while (true) {
    const k = Math.floor(nextTick / span), local = st0 + (nextTick - k * span), base = startAt + k * spanSec - tSec(st0);
    if (base + tSec(local) > now + ahead) break;
    if (!loopOn() && nextTick >= span) break;
    scheduleRange(E, local, Math.min(tot, local + 12), base, metroOn, st0); nextTick += 12;
  }
}
function updatePos(t) { const bar = Math.floor(t / BAR_T) + 1, beat = Math.floor((t % BAR_T) / PPQ) + 1; $('posOut').textContent = bar + ' : ' + beat + (useMap() && S.tempo.length ? ` ♩${Math.round(bpmAt(t) * 10) / 10}` : ''); }
let meterBuf = null;
function drawMeter() {
  const el = $('meterFill'); if (!el || !E || !E.meter) return;
  if (!meterBuf) meterBuf = new Float32Array(E.meter.fftSize); E.meter.getFloatTimeDomainData(meterBuf);
  let pk = 0; for (const v of meterBuf) pk = Math.max(pk, Math.abs(v));
  const db = 20 * Math.log10(pk + 1e-6); el.style.width = clamp((db + 48) / 48 * 100, 0, 100) + '%'; $('meterDb').textContent = pk > 0.0005 ? db.toFixed(1) + ' dB' : '-∞';
}
// 지금 재생 중인 시간축 틱 (재생 중이 아니면 -1)
function timelineNow() {
  if (!playing || !ctx) return -1; const el = ctx.currentTime - startAt, tot = playSpan(); if (el < 0) return st0;
  const spanSec = tSec(tot) - tSec(st0); return Math.min(tot - 1, tTick(tSec(st0) + (el % spanSec)));
}
// SONG 재생 중 지금 패턴이 울리고 있으면 그 안의 위치 (없으면 -1)
function localTickInCurPat(t) {
  for (const cl of S.playlist.clips) { if (cl.pat !== curPat().id) continue; const q = clipParts(cl, t, t + 1)[0]; if (q) return q.from; }
  return -1;
}
function frame() {
  if (!playing) return;
  const tot = playSpan(), el = ctx.currentTime - startAt, spanSec = tSec(tot) - tSec(st0);
  drawMeter();
  if (el < 0) { raf = requestAnimationFrame(frame); return; }
  if (!loopOn() && el >= spanSec) { stop(); return; }
  const t = Math.min(tot - 1, tTick(tSec(st0) + (el % spanSec)));
  if (S.playMode === 'song') { songTick = t; playTick = localTickInCurPat(t); followPlaylist(); }
  else { songTick = -1; playTick = t; }
  updatePos(t);
  if (playTick >= 0) { const X = playTick * TICKPX, v = view(); if (winOpen('roll') && (X < v.sl || X > v.sl + v.vw - 40)) wrap.scrollLeft = Math.max(0, X - 40); }
  if (winOpen('roll')) { drawRuler(); drawRoll(); drawLanes(); }
  drawRackPlayhead(); if (S.playMode === 'song') plOverlay();
  raf = requestAnimationFrame(frame);
}
const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>', STOP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>';
function play() {
  ensureCtx(); applyMix(E, S.mix); playing = true; st0 = S.playMode === 'song' ? Math.min(songStart, songTicks() - PPQ) : startTick;
  startAt = ctx.currentTime + 0.08; nextTick = 0; pump(); timer = setInterval(pump, 40);
  const b = $('play'); b.classList.add('on'); b.setAttribute('aria-label', '정지'); b.innerHTML = STOP_SVG; raf = requestAnimationFrame(frame);
}
function stop() {
  playing = false; clearInterval(timer); cancelAnimationFrame(raf); playTick = -1; songTick = -1; updatePos(S.playMode === 'song' ? songStart : startTick);
  const b = $('play'); b.classList.remove('on'); b.setAttribute('aria-label', '재생'); b.innerHTML = PLAY_SVG;
  if (E) {   // 예약된 소리를 끊기: 출력을 줄이고 새 엔진으로 교체
    const old = E, t = ctx.currentTime; old.out.gain.cancelScheduledValues(t); old.out.gain.setValueAtTime(old.out.gain.value, t); old.out.gain.linearRampToValueAtTime(0, t + 0.05);
    setTimeout(() => { try { old.out.disconnect(); } catch (e) {} }, 150); E = makeEngine(ctx, true); applyMix(E, S.mix);
  }
  const mf = $('meterFill'); if (mf) { mf.style.width = '0%'; $('meterDb').textContent = '-∞'; }
  drawRuler(); drawRoll(); drawLanes(); drawRackPlayhead(); drawPlaylist();
}
function setPlayMode(m) {
  const was = playing; if (was) stop();
  S.playMode = m; save();
  $('modePat').setAttribute('aria-checked', m === 'pat'); $('modeSong').setAttribute('aria-checked', m === 'song');
  updatePos(m === 'song' ? songStart : startTick); announce(m === 'song' ? 'SONG: 플레이리스트 곡 전체를 재생해요' : 'PAT: 지금 패턴만 반복해요');
  if (was) play();
}
$('play').onclick = () => playing ? stop() : play();
$('modePat').onclick = () => setPlayMode('pat');
$('modeSong').onclick = () => setPlayMode('song');
$('loop').onclick = () => $('loop').setAttribute('aria-pressed', !loopOn());
$('metro').onclick = () => { metroOn = !metroOn; $('metro').setAttribute('aria-pressed', metroOn); };
