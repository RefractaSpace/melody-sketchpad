/* 34-pitch.js — 6: 보컬 음정 보정
   ① 음 높이 찾기 (YIN) → ② 음 나누기 → ③ 음정 맞추기 (PSOLA: 길이는 그대로, 높이만) */

const A4 = 440, PITCH_LO = 65, PITCH_HI = 1200;   // 사람 목소리 범위 (Hz)
const hzToKey = f => 69 + 12 * Math.log2(f / A4);
const keyToHz = k => A4 * Math.pow(2, (k - 69) / 12);

/* ① 음 높이 찾기 — YIN. 한 조각의 기본 주파수와 확신도를 낸다. */
function yinPitch(x, sr, thr) {
  thr = thr || 0.15;
  const tauMin = Math.floor(sr / PITCH_HI), tauMax = Math.min(Math.floor(sr / PITCH_LO), (x.length >> 1) - 1);
  if (tauMax <= tauMin) return {hz:0, conf:0};
  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {         // 자기 자신과 tau만큼 밀어 비교한 차이
    let s = 0; for (let i = 0, n = x.length - tauMax; i < n; i++) { const v = x[i] - x[i + tau]; s += v * v; }
    d[tau] = s;
  }
  const cm = new Float32Array(tauMax + 1); let run = 0;  // 차이를 평균으로 나눠 정규화
  cm[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; cm[tau] = tau < tauMin ? 1 : d[tau] * tau / (run || 1e-9); }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) if (cm[t] < thr) { while (t + 1 <= tauMax && cm[t + 1] < cm[t]) t++; tau = t; break; }
  if (tau < 0) { let best = tauMin; for (let t = tauMin; t <= tauMax; t++) if (cm[t] < cm[best]) best = t; tau = best; if (cm[tau] > 0.5) return {hz:0, conf:0}; }
  const a = cm[tau - 1] ?? cm[tau], b = cm[tau], c = cm[tau + 1] ?? cm[tau];   // 포물선으로 소수점까지
  const denom = 2 * (2 * b - a - c);
  const shift = denom ? (c - a) / denom : 0;
  return {hz:sr / (tau + shift), conf:1 - b};
}
/* 소리 전체의 음 높이 곡선 (hop마다 한 점) */
function pitchTrack(x, sr, hop, win) {
  hop = hop || Math.round(sr * 0.01); win = win || Math.round(sr * 0.045);
  const out = [];
  for (let i = 0; i + win < x.length; i += hop) {
    const seg = x.subarray(i, i + win);
    let e = 0; for (let k = 0; k < seg.length; k++) e += seg[k] * seg[k];
    const rms = Math.sqrt(e / seg.length);
    const r = rms < 0.004 ? {hz:0, conf:0} : yinPitch(seg, sr);   // 조용한 곳은 건너뜀
    out.push({t:i / sr, hz:r.hz, conf:r.conf, rms});
  }
  // 옥타브가 갑자기 튀는 점 고치기 (앞뒤 값과 비교)
  for (let i = 1; i < out.length - 1; i++) {
    const p = out[i - 1].hz, c = out[i].hz, n = out[i + 1].hz;
    if (!p || !c || !n) continue;
    for (const m of [2, 0.5]) if (Math.abs(Math.log2(c / (p * m))) < 0.06 && Math.abs(Math.log2(n / p)) < 0.12) { out[i].hz = c / m; break; }
  }
  return out;
}
/* ② 음 나누기 — 음 높이가 안정된 구간을 음 하나로 */
function segmentNotes(track, minSec) {
  minSec = minSec || 0.08;
  const notes = []; let cur = null;
  for (const p of track) {
    const k = p.hz ? hzToKey(p.hz) : null;
    if (k == null || p.conf < 0.35) { if (cur) { notes.push(cur); cur = null; } continue; }
    if (cur && Math.abs(k - cur.sum / cur.n) < 0.8) { cur.sum += k; cur.n++; cur.end = p.t; cur.pts.push(p); }
    else { if (cur) notes.push(cur); cur = {start:p.t, end:p.t, sum:k, n:1, pts:[p]}; }
  }
  if (cur) notes.push(cur);
  return notes.filter(n => n.end - n.start >= minSec)
    .map(n => ({start:n.start, end:n.end, key:n.sum / n.n, pts:n.pts}));
}
/* 곡의 조에 맞는 가장 가까운 음 (조 밖으로 벗어나지 않게) */
function snapToScale(key) {                       // 앱의 조(S.root · S.mode)를 그대로 씀
  const near = Math.round(key); let best = near, bd = 99;
  for (let d = -6; d <= 6; d++) { const k = near + d;
    if (!inKey(((k % 12) + 12) % 12)) continue;
    if (Math.abs(k - key) < bd) { bd = Math.abs(k - key); best = k; } }
  return best;
}
/* ③ 음정 맞추기 — PSOLA
   원본에서 한 주기(T)마다 조각을 떼어, 새 간격(T/ratio)으로 다시 붙인다.
   ratio>1이면 조각이 촘촘해져 음이 높아지고, 조각 자체는 안 늘려서 길이·목소리 느낌이 유지된다. */
function psolaShift(x, sr, f0, ratio) {
  if (!f0 || Math.abs(ratio - 1) < 1e-4 || x.length < 8) return x.slice();
  const T = Math.max(4, Math.round(sr / f0)), win = T * 2;
  if (x.length < win + 2) return x.slice();
  const w = new Float32Array(win);
  for (let i = 0; i < win; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (win - 1));
  const out = new Float32Array(x.length), acc = new Float32Array(x.length);
  const step = T / ratio;                       // 붙이는 간격 (좁을수록 높아짐)
  // 조각은 원본의 주기 자리에서 순서대로 하나씩 꺼내 쓴다.
  // (자리를 dst로 계산하면 음을 정확히 옥타브 내릴 때 간격이 주기의 정수배가 되어 원본과 같아져 버린다)
  const marks = []; for (let m = 0; m + win < x.length; m += T) marks.push(m);
  if (!marks.length) return x.slice();
  let mi = 0;
  for (let dst = 0; dst + win < x.length; dst += step) {
    const src = marks[Math.min(marks.length - 1, mi++)];
    const d0 = Math.round(dst);
    for (let i = 0; i < win; i++) { out[d0 + i] += x[src + i] * w[i]; acc[d0 + i] += w[i]; }
  }
  // 겹친 만큼 나눠 주되, 창이 겹치는 정도가 배율에 따라 달라지므로 소리 크기를 원본에 맞춘다
  let e0 = 0, e1 = 0;
  for (let i = 0; i < out.length; i++) { out[i] = acc[i] > 1e-6 ? out[i] / acc[i] : 0; e0 += x[i] * x[i]; e1 += out[i] * out[i]; }
  if (e1 > 1e-12) { const g = Math.sqrt(e0 / e1); for (let i = 0; i < out.length; i++) out[i] *= g; }
  return out;
}
/* 음 하나를 목표 음으로 맞추기. amount 0~1 (1이면 완전히, 0.7이면 70%만 — 사람 느낌 남김) */
function tuneNote(x, sr, fromKey, toKey, amount) {
  const a = amount == null ? 1 : amount;
  const semi = (toKey - fromKey) * a;
  if (Math.abs(semi) < 0.01) return x.slice();
  return psolaShift(x, sr, keyToHz(fromKey), Math.pow(2, semi / 12));
}

/* ── 앱 연결: 오디오 클립 하나를 음정 보정 ── */
// 보컬 클립 분석: 음 높이 곡선과 음 목록을 구해 둔다 (한 번만)
function vocalAnalyze(slot) {
  const s = SAMPLES[slot]; if (!s || !s.buf) return null;
  const sr = s.buf.sampleRate, x = s.buf.getChannelData(0);
  const track = pitchTrack(x, sr);
  const notes = segmentNotes(track);
  return VOCAL[slot] = {sr, track, notes, len:x.length / sr};
}
const VOCAL = {};
// 보정한 소리를 새 소리로 만들어 같은 클립에 넣는다. amount 0~1, 조에 맞추기
function vocalTune(slot, amount, useScale) {
  const s = SAMPLES[slot]; if (!s || !s.buf) return null;
  const v = VOCAL[slot] || vocalAnalyze(slot); if (!v || !v.notes.length) return null;
  const sr = v.sr, src = s.buf.getChannelData(0);
  const out = new Float32Array(src.length); out.set(src);          // 음이 아닌 곳(숨·자음)은 원본 그대로
  let moved = 0, sumCents = 0;
  for (const n of v.notes) {
    const i0 = Math.max(0, Math.round(n.start * sr)), i1 = Math.min(src.length, Math.round(n.end * sr));
    if (i1 - i0 < sr * 0.05) continue;
    const to = useScale === false ? Math.round(n.key) : snapToScale(n.key);
    const seg = src.subarray(i0, i1);
    const y = tuneNote(seg, sr, n.key, to, amount == null ? 1 : amount);
    // 이음매가 튀지 않게 양 끝 5ms를 부드럽게 섞음
    const f = Math.min(Math.round(sr * 0.005), (i1 - i0) >> 2);
    for (let i = 0; i < y.length && i0 + i < out.length; i++) {
      const w = i < f ? i / f : (i > y.length - f ? (y.length - i) / f : 1);
      out[i0 + i] = y[i] * w + src[i0 + i] * (1 - w);
    }
    moved++; sumCents += Math.abs(to - n.key) * 100;
  }
  const nb = ctx.createBuffer(1, out.length, sr); nb.getChannelData(0).set(out);
  return {buf:nb, notes:v.notes.length, moved, avgCents:moved ? Math.round(sumCents / moved) : 0};
}

/* ── 화면: 오디오 클립을 두 번 누르면 음정 보정 창 ── */
let tuneSlot = null;
function openTune(slot) {
  const v = VOCAL[slot] || vocalAnalyze(slot);
  if (!v) { status('이 클립의 소리를 찾을 수 없어요.'); return; }
  if (!v.notes.length) { status('노래한 음을 찾지 못했어요 (조용하거나 말소리일 수 있어요).'); return; }
  tuneSlot = slot;
  const off = v.notes.map(n => Math.abs(snapToScale(n.key) - n.key) * 100);
  const avg = Math.round(off.reduce((a, b) => a + b, 0) / off.length);
  $('tuneInfo').textContent = `음 ${v.notes.length}개 · 길이 ${v.len.toFixed(1)}초 · 지금 음정이 평균 ${avg}센트 어긋나 있어요`;
  $('tuneDlg').showModal();
}
function applyTune() {
  const amt = +$('tuneAmt').value / 100, useScale = $('tuneScale').checked;
  const r = vocalTune(tuneSlot, amt, useScale);
  if (!r) { status('보정할 수 없었어요.'); return; }
  pushUndo();
  const s = SAMPLES[tuneSlot];
  if (!s.orig) s.orig = s.buf;                       // 원본 보관 (되돌리기용)
  s.buf = r.buf;                                     // 파형은 PEAKS가 buf를 비교해 자동으로 다시 계산
  save(); drawPlaylist();
  status(`음정을 보정했어요 · 음 ${r.moved}개 · 평균 ${r.avgCents}센트 이동 (Ctrl+Z로 되돌리기)`);
}
(() => {
  const d = $('tuneDlg'); if (!d) return;
  $('tuneAmt').addEventListener('input', () => $('tuneAmtV').textContent = $('tuneAmt').value + '%');
  $('tuneCancel').addEventListener('click', () => d.close());
  $('tuneGo').addEventListener('click', () => { d.close(); applyTune(); });
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  // 플레이리스트에서 오디오 클립을 두 번 누르면 열림
  const plc = $('plCanvas') || document.querySelector('#win-playlist canvas');
  if (plc) plc.addEventListener('dblclick', e => {
    if (typeof auPos !== 'function') return;
    const q = auPos(e), a = audioAt(q.x, q.t); if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation(); openTune(a.slot);
  }, true);
})();
