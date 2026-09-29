/* 22-sampedit.js — 샘플 편집: 자르기 · 뒤집기 · 페이드 인/아웃 · 노멀라이즈 (채널 샘플·오디오 클립) */
let se = null;   // {slot, label, buf(작업 중), orig(열 때)}
function copyBuf(b, s0 = 0, s1 = b.length) { const n = Math.max(1, s1 - s0), o = new AudioBuffer({numberOfChannels:b.numberOfChannels, length:n, sampleRate:b.sampleRate}); for (let c = 0; c < b.numberOfChannels; c++) o.copyToChannel(b.getChannelData(c).subarray(s0, s0 + n), c); return o; }
function seRange() { const a = +$('seStart').value / 1000, z = +$('seEnd').value / 1000, n = se.buf.length; return [Math.floor(Math.min(a, z) * n), Math.max(Math.floor(Math.max(a, z) * n), Math.floor(Math.min(a, z) * n) + 1)]; }
function seDraw() {
  const cv = $('seWave'), x = cv.getContext('2d'), W = cv.width, H = cv.height, d = se.buf.getChannelData(0), [s0, s1] = seRange();
  x.fillStyle = CS.panel2; x.fillRect(0, 0, W, H); x.fillStyle = CS.note;
  for (let i = 0; i < W; i++) { let m = 0; const a = Math.floor(i / W * d.length), b = Math.floor((i + 1) / W * d.length); for (let j = a; j < b; j++) m = Math.max(m, Math.abs(d[j])); x.fillRect(i, H / 2 - m * H / 2, 1, Math.max(1, m * H)); }
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 0, s0 / d.length * W, H); x.fillRect(s1 / d.length * W, 0, W, H);
  let pk = 0; for (let c = 0; c < se.buf.numberOfChannels; c++) { const q = se.buf.getChannelData(c); for (let i = s0; i < s1; i++) pk = Math.max(pk, Math.abs(q[i])); }
  $('seInfo').textContent = `남길 부분 ${((s1 - s0) / se.buf.sampleRate).toFixed(2)}초 / 전체 ${se.buf.duration.toFixed(2)}초 · 최대 ${(20 * Math.log10(pk || 1e-9)).toFixed(1)}dB`;
}
async function openSampleEditor(slot, label) {
  const sm = SAMPLES[slot]; if (!sm) { status('편집할 소리가 없어요.'); return; }
  se = {slot, label, buf:copyBuf(sm.buf), orig:sm.buf, hist:[]}; $('seUndo').disabled = true; $('seName').textContent = `${label} · ${sm.name || ''}`; $('seStart').value = 0; $('seEnd').value = 1000;
  const bak = await idbGet(slot + ':orig').catch(() => null); $('seRestore').disabled = !bak; seDraw(); openDlg($('seDlg'));
}
// 작업: 남길 부분(시작~끝)에만
function sePush() { se.hist.push(copyBuf(se.buf)); if (se.hist.length > 20) se.hist.shift(); $('seUndo').disabled = false; }
function seOp(fn, msg) { sePush(); const [s0, s1] = seRange(); for (let c = 0; c < se.buf.numberOfChannels; c++) fn(se.buf.getChannelData(c), s0, s1); seDraw(); announce(msg); }
$('seRev').onclick = () => seOp((d, a, b) => d.subarray(a, b).reverse(), '뒤집었어요');
const fadeLen = (a, b) => Math.min(b - a, Math.floor(se.buf.sampleRate * 0.3), Math.floor((b - a) / 4));
$('seFin').onclick = () => seOp((d, a, b) => { const n = fadeLen(a, b); for (let i = 0; i < n; i++) d[a + i] *= i / n; }, '페이드 인');
$('seFout').onclick = () => seOp((d, a, b) => { const n = fadeLen(a, b); for (let i = 0; i < n; i++) d[b - 1 - i] *= i / n; }, '페이드 아웃');
$('seNorm').onclick = () => { const [s0, s1] = seRange(); let pk = 0; for (let c = 0; c < se.buf.numberOfChannels; c++) { const d = se.buf.getChannelData(c); for (let i = s0; i < s1; i++) pk = Math.max(pk, Math.abs(d[i])); }
  if (pk < 1e-6) return; const k = 0.98 / pk; seOp((d, a, b) => { for (let i = a; i < b; i++) d[i] *= k; }, `노멀라이즈 (×${k.toFixed(2)})`); };
$('seStart').oninput = $('seEnd').oninput = () => seDraw();
$('sePlay').onclick = () => { ensureCtx(); const [s0, s1] = seRange(), src = ctx.createBufferSource(); src.buffer = copyBuf(se.buf, s0, s1); src.connect(E.in); src.start(); };
$('seReset').onclick = () => { se.buf = copyBuf(se.orig); $('seStart').value = 0; $('seEnd').value = 1000; seDraw(); announce('열었을 때로 되돌렸어요'); };
$('seCancel').onclick = () => { $('seDlg').close(); se = null; };
async function seStore(buf, keepOrig) {
  const slot = se.slot, old = await idbGet(slot).catch(() => null), name = (SAMPLES[slot] && SAMPLES[slot].name) || '샘플', root = (SAMPLES[slot] && SAMPLES[slot].root) || 60;
  if (keepOrig && old && !(await idbGet(slot + ':orig').catch(() => null))) await idbPut(slot + ':orig', old);   // 처음 편집할 때만 원본 보관
  const ab = wavBytes(buf).buffer; SAMPLES[slot] = {buf, root, name}; await idbPut(slot, {ab, root, name});
  for (const a of S.audio || []) if (a.slot === slot) { a.off = Math.min(a.off, Math.max(0, buf.duration - 0.05)); a.len = Math.min(buf.duration - a.off, Math.max(a.len, 0.05)); if (keepOrig) { a.off = 0; a.len = buf.duration; } }
  save(); drawPlaylist(); buildMixer();
}
$('seApply').onclick = async () => { const [s0, s1] = seRange(), out = copyBuf(se.buf, s0, s1); await seStore(out, true); $('seDlg').close(); status(`${se.label}: ${out.duration.toFixed(2)}초로 편집했어요 (원본은 보관).`); se = null; };
$('seRestore').onclick = async () => { const bak = await idbGet(se.slot + ':orig').catch(() => null); if (!bak) return; const buf = await decode(bak.ab.slice(0)); await seStore(buf, false); for (const a of S.audio || []) if (a.slot === se.slot) { a.off = 0; a.len = buf.duration; } save(); drawPlaylist(); $('seDlg').close(); status(`${se.label}: 원본으로 되돌렸어요.`); se = null; };

$('seUndo').onclick = () => { if (!se.hist.length) return; se.buf = se.hist.pop(); $('seUndo').disabled = !se.hist.length; seDraw(); announce('편집 한 단계 되돌림'); };
// 늘이기(음높이 유지): WSOLA — 겹치는 창을 옮겨 붙이되, 이전 조각과 가장 닮은 자리를 찾아 붙여서 끊김을 줄임
function wsola(d, ratio) {
  const W = 2048, H = W / 2, SR = 256, out = new Float32Array(Math.floor(d.length * ratio) + W), win = new Float32Array(W); for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / W);
  let prev = 0;
  for (let o = 0, k = 0; o + W < out.length; o += H, k++) {
    const nominal = Math.round(o / ratio); let best = nominal;
    if (k > 0) { let bc = -Infinity; const ref = prev + H; for (let s = -SR; s <= SR; s += 4) { const p = nominal + s; if (p < 0 || p + W > d.length) continue; let c = 0; for (let i = 0; i < 256; i += 2) c += d[p + i] * d[ref + i]; if (c > bc) { bc = c; best = p; } } }
    best = clamp(best, 0, Math.max(0, d.length - W)); for (let i = 0; i < W; i++) out[o + i] += (d[best + i] || 0) * win[i]; prev = best;
  }
  return out.subarray(0, Math.floor(d.length * ratio));
}
function resample(d, r) { const n = Math.floor(d.length / r), o = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * r, j = Math.floor(x), f = x - j; o[i] = (d[j] || 0) * (1 - f) + (d[j + 1] || 0) * f; } return o; }
function seReplace(chs) { const n = chs[0].length, b = new AudioBuffer({numberOfChannels:chs.length, length:Math.max(1, n), sampleRate:se.buf.sampleRate}); chs.forEach((c, i) => b.copyToChannel(c, i)); se.buf = b; $('seStart').value = 0; $('seEnd').value = 1000; seDraw(); }
$('seStretch').onclick = () => { const r = +$('seStretchSel').value; if (r === 1) return; sePush(); const chs = []; for (let c = 0; c < se.buf.numberOfChannels; c++) chs.push(wsola(se.buf.getChannelData(c), r)); seReplace(chs); announce(`길이 ${Math.round(r * 100)}% (음높이 그대로)`); };
$('sePitch').onclick = () => { const st = +$('sePitchSel').value; if (!st) return; sePush(); const r = Math.pow(2, st / 12), chs = [];   // 늘인 뒤 빠르게 재생 = 길이 그대로, 음높이만 바뀜
  for (let c = 0; c < se.buf.numberOfChannels; c++) chs.push(resample(wsola(se.buf.getChannelData(c), r), r)); seReplace(chs); announce(`음높이 ${st > 0 ? '+' : ''}${st}반음 (길이 그대로)`); };
