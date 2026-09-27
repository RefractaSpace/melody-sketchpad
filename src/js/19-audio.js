/* 19-audio.js — 오디오 클립: 녹음·파일 소리를 플레이리스트 위에 그대로 (SONG 재생·WAV·MP3·스템에 포함) */
// S.audio = [{id, slot:'au:<id>', name, t:트랙, s:시작 곡 틱, off:건너뛸 초, len:길이 초, gain}]
const audioEndTick = a => songTickAt(songSec(a.s) + a.len);
function audioAt(x, t) { const k = BAR_T / PL_BAR; return (S.audio || []).find(a => a.t === t && x >= a.s / k && x <= audioEndTick(a) / k); }
// 파형: 0.01초마다 최대값 (한 번만 계산)
const PEAKS = new Map();
function peaksOf(slot) {
  const sm = SAMPLES[slot]; if (!sm) return null; let p = PEAKS.get(slot); if (p && p.buf === sm.buf) return p.v;
  const d = sm.buf.getChannelData(0), step = Math.round(sm.buf.sampleRate / 100), v = new Float32Array(Math.ceil(d.length / step));
  for (let i = 0; i < v.length; i++) { let m = 0; for (let j = i * step, e = Math.min(d.length, j + step); j < e; j++) { const a = Math.abs(d[j]); if (a > m) m = a; } v[i] = m; }
  PEAKS.set(slot, {buf:sm.buf, v}); return v;
}
function drawAudioClips(x) {
  const k = PL_BAR / BAR_T;
  for (const a of S.audio || []) {
    const X = a.s * k, W = Math.max(6, (audioEndTick(a) - a.s) * k), Y = a.t * PL_ROW;
    rr(x, X + 1, Y + 2, W - 2, PL_ROW - 5, 4); x.fillStyle = CS.panel2; x.fill(); x.lineWidth = 1.5; x.strokeStyle = CS.note; x.stroke();
    const pk = peaksOf(a.slot); x.fillStyle = CS.note; x.globalAlpha = .7;
    if (pk) { const mid = Y + PL_ROW / 2 + 3, hh = (PL_ROW - 16) / 2, n = Math.max(1, Math.floor(W - 4));
      for (let i = 0; i < n; i += 2) { const sec = a.off + a.len * i / n, v = pk[Math.min(pk.length - 1, Math.floor(sec * 100))] || 0; x.fillRect(X + 2 + i, mid - v * hh, 1.2, Math.max(1, 2 * v * hh)); } }
    else { x.font = '10px "IBM Plex Sans KR",sans-serif'; x.fillText('소리 불러오는 중…', X + 6, Y + 16); }
    x.globalAlpha = 1; x.save(); x.beginPath(); x.rect(X + 2, Y, W - 4, PL_ROW); x.clip(); x.fillStyle = CS.ink; x.font = '600 10px "IBM Plex Sans KR",sans-serif'; x.textBaseline = 'top'; x.fillText('∿ ' + a.name, X + 6, Y + 4); x.restore();
  }
}
// 곡 틱 [t0, t1) 예약. from = 재생을 (다시) 시작한 틱 → 그때 이미 울리고 있어야 할 클립은 중간부터
function scheduleAudio(EE, t0, t1, base, from) {
  for (const a of S.audio || []) {
    const sm = SAMPLES[a.slot]; if (!sm) continue;
    const secA = songSec(a.s); let t, off;
    if (a.s >= t0 && a.s < t1) { t = base + tSec(a.s); off = a.off; }
    else if (t0 === from && a.s < t0 && songSec(t0) < secA + a.len) { t = base + tSec(t0); off = a.off + songSec(t0) - secA; }
    else continue;
    const dur = a.len - (off - a.off); if (dur <= 0.01) continue;
    const src = EE.ac.createBufferSource(), g = EE.ac.createGain(); src.buffer = sm.buf; g.gain.value = a.gain == null ? 1 : a.gain;
    src.connect(g); g.connect(getCh(EE, 'audio').inp); src.start(t, off, dur); src.stop(t + dur + 0.01);
  }
}
function freeTrack(s, e) { for (let t = 0; t < S.playlist.tracks; t++) { const k = BAR_T; if (!S.playlist.clips.some(c => c.t === t && c.bar * k < e && (c.bar + clipLen(c)) * k > s) && !(S.audio || []).some(a => a.t === t && a.s < e && audioEndTick(a) > s)) return t; } return 0; }
async function addAudioClip(ab, name, t, s) {
  const buf = await decode(ab.slice(0)), id = newId(), slot = 'au:' + id;
  SAMPLES[slot] = {buf, root:60, name}; await idbPut(slot, {ab, root:60, name});
  pushUndo(); const a = {id, slot, name:name.slice(0, 40), t:t == null ? freeTrack(s, s + BAR_T) : t, s, off:0, len:buf.duration, gain:1};
  S.audio.push(a); if (S.playMode !== 'song') setPlayMode('song'); save(); drawPlaylist(); buildMixer(); return a;
}
// ---- 플레이리스트에서 끌어 옮기기 · 양 끝 자르기 · 오른쪽 클릭 지우기 · 파일 끌어다 놓기 ----
let auDrag = null;
function auPos(e) { const r = plc.getBoundingClientRect(); return {x:e.clientX - r.left, t:clamp(Math.floor((e.clientY - r.top) / PL_ROW), 0, S.playlist.tracks - 1)}; }
function initAudioClips() {
  plc.addEventListener('pointerdown', e => {
    const q = auPos(e), a = audioAt(q.x, q.t); if (!a || e.button === 2) return;
    e.stopImmediatePropagation(); e.preventDefault(); const k = PL_BAR / BAR_T, X0 = a.s * k, X1 = audioEndTick(a) * k;
    auDrag = {a, edge:q.x >= X1 - 8 ? 'R' : q.x <= X0 + 7 ? 'L' : '', dx:q.x - X0, s0:a.s, off0:a.off, len0:a.len, moved:false}; pushUndo();
    try { plc.setPointerCapture(e.pointerId); } catch (_) {}
  }, true);
  plc.addEventListener('pointermove', e => {
    if (!auDrag) return; const q = auPos(e), d = auDrag, a = d.a, k = BAR_T / PL_BAR, snap = t => Math.max(0, Math.round(t / PPQ) * PPQ); d.moved = true;
    if (d.edge === 'R') a.len = clamp(songSec(q.x * k) - songSec(a.s), 0.05, SAMPLES[a.slot] ? SAMPLES[a.slot].buf.duration - a.off : a.len);
    else if (d.edge === 'L') { const ns = snap(q.x * k), ds = songSec(ns) - songSec(d.s0); if (d.off0 + ds >= 0 && d.len0 - ds > 0.05) { a.s = ns; a.off = d.off0 + ds; a.len = d.len0 - ds; } }
    else { a.s = snap((q.x - d.dx) * k); a.t = q.t; }
    drawPlaylist();
  }, true);
  plc.addEventListener('pointerup', () => { if (!auDrag) return; const d = auDrag; auDrag = null; if (d.moved) { save(); announce(`오디오 클립 ${d.a.name}: ${Math.floor(d.a.s / BAR_T) + 1}마디, ${d.a.len.toFixed(1)}초`); } }, true);
  plc.addEventListener('contextmenu', e => { const q = auPos(e), a = audioAt(q.x, q.t); if (!a) return; e.preventDefault(); e.stopImmediatePropagation(); pushUndo(); S.audio = S.audio.filter(x => x !== a); save(); drawPlaylist(); buildMixer(); announce(`오디오 클립 ${a.name}을 지웠어요.`); }, true);
  plc.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
  plc.addEventListener('drop', async e => {
    const f = [...e.dataTransfer.files].find(f => /^audio\//.test(f.type) || /\.(wav|mp3|ogg|m4a|flac|webm)$/i.test(f.name)); if (!f) return; e.preventDefault();
    const q = auPos(e), s = Math.max(0, Math.round(q.x * BAR_T / PL_BAR / PPQ) * PPQ);
    try { const a = await addAudioClip(await f.arrayBuffer(), f.name.replace(/\.[^.]+$/, ''), q.t, s); status(`오디오 클립 "${a.name}" (${a.len.toFixed(1)}초)을 ${Math.floor(s / BAR_T) + 1}마디에 놓았어요.`); }
    catch (err) { status('이 소리 파일을 읽지 못했어요.'); }
  });
}
// ---- 🎤 곡을 틀면서 녹음 → 시작 위치에 오디오 클립 ----
let voc = null;
async function vocalToggle() {
  if (voc) { voc.rec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { status('이 브라우저는 마이크 녹음을 지원하지 않아요.'); return; }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}}); }
  catch (e) { status('마이크를 쓸 수 없어요. 브라우저에서 마이크 권한을 허락해 주세요.'); return; }
  ensureCtx(); if (playing) stop(); if (S.playMode !== 'song') setPlayMode('song');
  const rec = new MediaRecorder(stream), chunks = [], s0 = songStart;
  voc = {rec, lead:0}; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstart = () => { const t0 = ctx.currentTime; play(); voc.lead = startAt - t0; };
  rec.onstop = async () => {
    const lead = voc.lead; voc = null; stream.getTracks().forEach(t => t.stop()); if (playing) stop(); $('vocRec').textContent = '🎤 녹음'; $('vocRec').setAttribute('aria-pressed', 'false');
    try {
      const ab = await new Blob(chunks, {type:rec.mimeType}).arrayBuffer(), a = await addAudioClip(ab, `녹음 ${(S.audio.length || 0) + 1}`, null, s0);
      // 지연 보정: 녹음 시작 → 곡 시작까지 + 스피커로 나가는 지연만큼 앞을 잘라냄
      const cut = clamp(lead + (ctx.outputLatency || 0) + (ctx.baseLatency || 0), 0, a.len - 0.05); a.off = cut; a.len -= cut; save(); drawPlaylist();
      status(`녹음 ${a.len.toFixed(1)}초를 ${Math.floor(s0 / BAR_T) + 1}마디 트랙 ${a.t + 1}에 놓았어요 (지연 ${Math.round(cut * 1000)}ms 보정).`);
    } catch (e) { status('녹음한 소리를 읽지 못했어요.'); }
  };
  rec.start(); $('vocRec').textContent = '■ 녹음 멈춤'; $('vocRec').setAttribute('aria-pressed', 'true'); status('곡을 틀면서 녹음 중… "■ 녹음 멈춤"을 누르면 끝나요.');
}
$('vocRec').onclick = vocalToggle;
