/* 17-input.js — MIDI 건반 · 자판 건반 · 음 녹음 · 마이크 녹음 */

// ---- 누르는 동안 울리는 음 ----
const live = new Map();   // 음높이 → {g, rec:{s0, raw}}
let recOn = false, quantOn = true, recUndo = false;
// 지금 재생 위치를 편집 중인 패턴 안의 틱으로 (재생 중이 아니거나 지금 패턴이 안 울리면 -1)
function nowPatTick() {
  if (!playing || !ctx) return -1;
  const el = (ctx.currentTime - startAt) / tickSec(); if (el < 0) return st0;
  const span = playSpan() - st0, t = st0 + (el % span);
  return S.playMode === 'song' ? localTickInCurPat(t) : t;
}
function liveOn(p, v) {
  if (p < LOW || p > HIGH) return;
  ensureCtx(); if (live.has(p)) liveOff(p);
  const c = curCh(), t = ctx.currentTime, L = {g:null, rec:null};
  if (c.kind === 'drum') drumHit(c.inst, t, E, v, chKey(c));
  else { L.g = ctx.createGain(); L.g.connect(getCh(E, chKey(c)).inp); voice(E, c.inst, p, t, 8, v, L.g, c.tone, chKey(c)); }
  if (recOn) { const raw = nowPatTick(); if (raw >= 0) L.rec = {raw, s0:quantOn ? (Math.round(raw / S.snap) * S.snap) % totalTicks() : Math.round(raw), v}; }
  live.set(p, L); keyDown = p; drawKeys();
  if (c.kind === 'drum' && L.rec) liveOff(p);   // 드럼은 치자마자 기록
}
function liveOff(p) {
  const L = live.get(p); if (!L) return; live.delete(p);
  if (L.g) { const g = L.g, t = ctx.currentTime; g.gain.setTargetAtTime(0, t, Math.max(0.03, curCh().tone.rel) / 3); setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 4000); }
  if (L.rec) {
    const c = curCh(), T = totalTicks(); let l = 12;
    if (c.kind !== 'drum') { const e = nowPatTick(); l = e < 0 ? S.len : e - L.rec.raw; if (l <= 0) l += T; l = quantOn ? Math.max(S.snap, Math.round(l / S.snap) * S.snap) : Math.max(3, Math.round(l)); }
    if (!recUndo) { pushUndo(); recUndo = true; }
    curNotes().push({p, s:L.rec.s0, l:Math.min(l, T - L.rec.s0), v:L.rec.v}); save(); drawRoll(); drawLanes(); drawRack();
  }
  if (keyDown === p) { keyDown = -1; drawKeys(); }
}
function setRec(on) {
  recOn = on; recUndo = false; $('recBtn').setAttribute('aria-pressed', on); $('recBtn').setAttribute('aria-label', on ? '녹음 끄기' : '녹음 대기');
  announce(on ? '녹음 대기: 재생하면서 건반을 치면 지금 채널에 찍혀요' : '녹음을 껐어요');
}
$('recBtn').onclick = () => setRec(!recOn);
$('quantBtn').onclick = () => { quantOn = !quantOn; $('quantBtn').setAttribute('aria-pressed', quantOn); };

// ---- MIDI 건반 (Web MIDI) ----
let midiAccess = null, sustain = false; const held = new Set();
function handleMidi(d) {
  const st = d[0] & 0xf0, a = d[1], b = d[2];
  if (st === 0x90 && b > 0) { held.delete(a); liveOn(a, Math.max(0.05, b / 127)); }
  else if (st === 0x80 || (st === 0x90 && b === 0)) { if (sustain) held.add(a); else liveOff(a); }
  else if (st === 0xb0 && a === 64) { sustain = b >= 64; if (!sustain) { held.forEach(liveOff); held.clear(); } }   // 서스테인 페달
}
function hookMidi() {
  const names = []; for (const inp of midiAccess.inputs.values()) { inp.onmidimessage = e => handleMidi(e.data); names.push(inp.name); }
  $('midiConn').setAttribute('aria-pressed', names.length > 0);
  status(names.length ? `MIDI 건반 연결됨: ${names.join(', ')}` : 'MIDI 건반이 보이지 않아요. USB로 연결한 뒤 다시 눌러 주세요.');
}
$('midiConn').onclick = async () => {
  if (!navigator.requestMIDIAccess) { status('이 브라우저는 MIDI 건반을 지원하지 않아요 (크롬·엣지에서 돼요).'); return; }
  try { midiAccess = await navigator.requestMIDIAccess(); hookMidi(); midiAccess.onstatechange = hookMidi; }
  catch (e) { status('MIDI 건반 연결이 거절됐어요. 브라우저 권한을 확인해 주세요.'); }
};

// ---- 컴퓨터 자판 건반 ----
const TYPE_MAP = {z:0, s:1, x:2, d:3, c:4, v:5, g:6, b:7, h:8, n:9, j:10, m:11, q:12, '2':13, w:14, '3':15, e:16, r:17, '5':18, t:19, '6':20, y:21, '7':22, u:23, i:24};
let typeOn = false, typeOct = 4;
function typeLabel() { $('typeKeys').textContent = typeOn ? `⌨ 자판 건반 C${typeOct}~C${typeOct + 2}` : '⌨ 자판 건반'; }
function setType(on) { typeOn = on; $('typeKeys').setAttribute('aria-pressed', on); typeLabel(); if (!on) [...live.keys()].forEach(liveOff); announce(on ? `자판 건반 켬: Z줄은 C${typeOct}, Q줄은 C${typeOct + 1}. 빼기·같음표로 옥타브, Esc로 끄기` : '자판 건반을 껐어요'); }
$('typeKeys').onclick = () => setType(!typeOn);
document.addEventListener('keydown', e => {
  if (!typeOn || e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { setType(false); e.preventDefault(); return; }
  if (k === '-' || k === '=') { typeOct = clamp(typeOct + (k === '=' ? 1 : -1), 1, 7); typeLabel(); announce(`옥타브 C${typeOct}`); e.preventDefault(); e.stopPropagation(); return; }
  if (!(k in TYPE_MAP)) return;
  e.preventDefault(); e.stopPropagation(); if (e.repeat) return;
  liveOn(12 * (typeOct + 1) + TYPE_MAP[k], 0.8);   // 자판은 세기를 못 느끼니 고정 80%
}, true);
document.addEventListener('keyup', e => { if (!typeOn) return; const k = e.key.toLowerCase(); if (k in TYPE_MAP) { liveOff(12 * (typeOct + 1) + TYPE_MAP[k]); e.stopPropagation(); } }, true);
window.addEventListener('blur', () => [...live.keys()].forEach(liveOff));

// ---- 마이크 녹음 → 채널 샘플 ----
let mic = null;   // {rec, stream, chunks, slot, label, t0}
async function micToggle(slot, label) {
  if (mic) { const same = mic.slot === slot; mic.rec.stop(); if (same) return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { status('이 브라우저는 마이크 녹음을 지원하지 않아요.'); return; }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false}}); }
  catch (e) { status('마이크를 쓸 수 없어요. 브라우저에서 마이크 권한을 허락해 주세요.'); return; }
  const rec = new MediaRecorder(stream), chunks = [];
  mic = {rec, stream, chunks, slot, label, t0:performance.now()};
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    const m = mic; mic = null; stream.getTracks().forEach(t => t.stop());
    try {
      const ab = await new Blob(chunks, {type:rec.mimeType}).arrayBuffer(), buf = await decode(ab), name = `마이크 녹음 ${new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit', second:'2-digit'})}`;
      const ch = chById(m.slot.slice(3)); if (ch && ch.kind === 'synth') { ch.inst = 'sample'; save(); buildRack(); refreshTitles(); }
      SAMPLES[m.slot] = {buf, root:60, name}; await idbPut(m.slot, {ab, root:60, name});
      status(`${m.label}에 ${buf.duration.toFixed(1)}초를 녹음했어요.`);
    } catch (e) { status('녹음한 소리를 읽지 못했어요.'); }
    buildMixer(); buildBrowser();
  };
  rec.start(); status(`${label}: 마이크 녹음 중… 같은 버튼을 다시 누르면 멈춰요.`); buildMixer(); buildBrowser();
}
function micNewChannel() {
  if (mic) { mic.rec.stop(); return; }
  const n = S.channels.filter(c => c.inst === 'sample').length + 1; addChannel('synth', 'sample');
  const c = curCh(); c.name = '녹음 ' + n; save(); buildRack(); micToggle(chKey(c), c.name);
}
