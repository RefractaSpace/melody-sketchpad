/* 08-io.js — 결과 복사 · MIDI · WAV · 프로젝트 파일 · 내 프로젝트 */

// ---- 결과 복사 (대화에 붙여 넣는 글) ----
function posText(t) { const bar = Math.floor(t / (4 * PPQ)) + 1, beat = Math.floor((t % (4 * PPQ)) / PPQ) + 1, r = t % PPQ; if (r % 12 === 0) return `${bar}.${beat}.${r / 12 + 1}`; if (r % 16 === 0) return `${bar}.${beat}.t${r / 16 + 1}`; return `${bar}.${beat}+${r}/48`; }
function lenText(l) { if (l % 12 === 0) return String(l / 12); if (l % 16 === 0) return 't' + (l / 16); return l + '/48'; }
function stepString(arr, bars) {
  const out = []; for (let b = 0; b < bars; b++) { let t = ''; for (let i = 0; i < 16; i++) { const n = arr.find(x => x.s === (b * 16 + i) * 12); t += !n ? '.' : n.v >= 0.75 ? 'X' : n.v >= 0.4 ? 'x' : 'o'; } out.push(t); }
  return out.join(' ');
}
function resultText() {
  const key = names()[S.root] + (S.mode === 'minor' ? ' 단조' : ' 장조');
  const L = [`[멜로디 스케치] BPM ${S.bpm} · ${key} · 패턴 ${S.patterns.length}개 · 곡 ${songBars()}마디`];
  L.push('음 표기: 위치 = 마디.박.16분칸 (t = 셋잇단 칸) · 길이 = 16분 개수 (t = 셋잇단 개수) · v = 세기 (없으면 80) · 드럼: X 셈 · x 보통 · o 약함');
  L.push('채널: ' + S.channels.map((c, i) => `${i + 1}. ${c.name} (${c.kind === 'drum' ? '드럼 ' + DRUM_NAME[c.inst] : INSTS[c.inst]})`).join(' | '));
  for (const P of S.patterns) {
    L.push(`\n■ ${P.name} (${P.bars}마디)`);
    const cs = []; P.chords.forEach((c, i) => { if (c) cs.push(`${Math.floor(i / 4) + 1}.${i % 4 + 1} ${c.x ? '멈춤' : chordName(c)}`); });
    if (cs.length) L.push('  코드: ' + cs.join(' | '));
    for (const c of S.channels) {
      const arr = (P.notes[c.id] || []).slice().sort((a, b) => a.s - b.s || b.p - a.p); if (!arr.length) continue;
      if (c.kind === 'drum' && arr.every(n => n.s % 12 === 0)) { L.push(`  ${c.name}: ` + stepString(arr, P.bars)); continue; }
      L.push(`  ${c.name}:`); let line = [];
      arr.forEach((n, i) => { line.push(`${posText(n.s)} ${nn(n.p)} ${lenText(n.l)}` + (Math.round(n.v * 100) !== 80 ? ` v${Math.round(n.v * 100)}` : '')); if (line.length === 8 || i === arr.length - 1) { L.push('    ' + line.join(' | ')); line = []; } });
    }
  }
  const clips = [...S.playlist.clips].sort((a, b) => a.bar - b.bar || a.t - b.t);
  L.push('\n■ 플레이리스트 (곡 구성): ' + (clips.length ? clips.map(c => `${c.bar + 1}마디 ${patById(c.pat).name}`).join(' → ') : '비어 있음'));
  return L.join('\n');
}
$('copy').onclick = async () => {
  const t = scoreText(lib.list[lib.current]?.name), out = $('out'); out.value = t;
  try { await navigator.clipboard.writeText(t); status('악보를 복사했어요. 대화에 붙이거나 "악보 붙여넣기"로 다시 불러올 수 있어요.'); out.style.display = 'none'; }
  catch (e) { out.style.display = 'block'; out.focus(); out.select(); status('자동 복사가 막혀 있어요. 아래 글을 길게 눌러 복사해 주세요.'); }
};

// ---- MIDI 저장 (트랙마다 MIDI 트랙) ----
function vlq(n) { const b = [n & 0x7f]; while (n >>= 7) b.unshift((n & 0x7f) | 0x80); return b; }
function mtrack(events, name) {
  const d = []; if (name) { const nb = [...new TextEncoder().encode(name)]; d.push(0, 0xff, 0x03, ...vlq(nb.length), ...nb); }
  events.sort((a, b) => a.t - b.t || a.o - b.o); let last = 0;
  for (const e of events) { d.push(...vlq(e.t - last), ...e.b); last = e.t; }
  d.push(0, 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, (d.length >>> 24) & 255, (d.length >>> 16) & 255, (d.length >>> 8) & 255, d.length & 255, ...d];
}
const PROG = {piano:0, epiano:4, strings:48, celesta:8, harp:46, bass:38, timpani:47, supersaw:81, pluck:84, chip:80, bell:14, sample:0};
// 내보낼 범위: SONG 모드이고 플레이리스트에 조각이 있으면 곡 전체, 아니면 지금 패턴
function flatten() {
  const song = S.playMode === 'song' && S.playlist.clips.length;
  const parts = song ? S.playlist.clips.flatMap(cl => clipParts(cl, 0, MAX_BARS * BAR_T)) : [{P:curPat(), origin:0, from:0, to:totalTicks()}];
  const notes = {}, chords = [];
  for (const {P, origin, from, to} of parts) {
    for (const c of S.channels) for (const n of P.notes[c.id] || []) if (n.s >= from && n.s < to) (notes[c.id] = notes[c.id] || []).push({...n, s:n.s + origin, l:Math.min(n.l, to - n.s)});
    for (const seg of chordSegments(P)) if (seg.s >= from && seg.s < to) chords.push({...seg, s:seg.s + origin, l:Math.min(seg.l, to - seg.s)});
  }
  return {song:!!song, notes, chords, len:song ? songTicks() : totalTicks()};
}
function midiBytes() {
  const F = flatten(), tev = b => { const us = Math.round(60000000 / b); return [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]; };
  const head = [{t:0, o:0, b:tev(S.bpm)}, {t:0, o:0, b:[0xff, 0x58, 4, 4, 2, 24, 8]}];
  if (F.song) for (const x of S.tempo) head.push({t:x.t, o:1, b:tev(x.bpm)});   // SONG이면 템포 지도도 MIDI에
  const tr = [mtrack(head, '멜로디 스케치패드')];
  const synth = S.channels.filter(c => c.kind === 'synth'), free = [0, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  synth.forEach((c, i) => {
    const ch = free[i % free.length], ev = [{t:0, o:0, b:[0xc0 | ch, PROG[c.inst] || 0]}];
    for (const n of F.notes[c.id] || []) { ev.push({t:n.s, o:1, b:[0x90 | ch, n.p, Math.max(1, Math.round(n.v * 127))]}); ev.push({t:n.s + n.l, o:0, b:[0x80 | ch, n.p, 0]}); }
    tr.push(mtrack(ev, c.name));
  });
  const cev = [{t:0, o:0, b:[0xc1, 89]}];
  for (const seg of F.chords) chordVoices(seg.c).forEach(m => { cev.push({t:seg.s, o:1, b:[0x91, m, 70]}); cev.push({t:seg.s + seg.l, o:0, b:[0x81, m, 0]}); });
  tr.push(mtrack(cev, '코드'));
  const dev = [], map = {kick:36, snare:38, hat:42, clap:39, crash:49};
  for (const c of S.channels) if (c.kind === 'drum') for (const n of F.notes[c.id] || []) { dev.push({t:n.s, o:1, b:[0x99, map[c.inst], Math.max(1, Math.round(n.v * 127))]}); dev.push({t:n.s + 6, o:0, b:[0x89, map[c.inst], 0]}); }
  tr.push(mtrack(dev, '드럼'));
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tr.length, 0, PPQ, ...tr.flat()]);
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xffffffff; for (const b of u) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(name, data) {
  const enc = new TextEncoder().encode(name), crc = crc32(data), le = (n, b) => Array.from({length:b}, (_, i) => (n >>> (8 * i)) & 255);
  const local = [...le(0x04034b50, 4), 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le(crc, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(enc.length, 2), 0, 0, ...enc];
  const off = local.length + data.length;
  const cen = [...le(0x02014b50, 4), 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le(crc, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(enc.length, 2), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...enc];
  const end = [...le(0x06054b50, 4), 0, 0, 0, 0, 1, 0, 1, 0, ...le(cen.length, 4), ...le(off, 4), 0, 0];
  const out = new Uint8Array(local.length + data.length + cen.length + end.length); out.set(local, 0); out.set(data, local.length); out.set(cen, off); out.set(end, off + cen.length); return out;
}

// ---- 저장하기 (claude.ai 안에서는 zip, 내 웹사이트에서는 파일 그대로) ----
let downloads = null; const inClaude = !!(window.claude && window.claude.use);
if (inClaude) window.claude.use('downloads').then(d => { downloads = d; if (d) ['midi', 'saveProj', 'wav'].forEach(id => $(id).hidden = false); }).catch(() => {});
else { ['midi', 'saveProj', 'wav'].forEach(id => $(id).hidden = false); $('wav').textContent = '오디오 저장 (WAV)'; $('midi').textContent = 'MIDI 저장'; }
function localDownload(filename, blob) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); status('저장했어요.'); }
async function offer(filename, data) {
  if (!downloads) return;
  try { await downloads.save({filename, data}); status('저장했어요.'); }
  catch (e) { const c = e && e.code; status(c === 'declined' ? '저장을 취소했어요.' : c === 'rate_limited' ? '잠시 후 다시 눌러 주세요.' : '이 화면에서는 저장할 수 없어요.'); if (c === 'unavailable' || c === 'not_granted') ['midi', 'saveProj', 'wav'].forEach(id => $(id).hidden = true); }
}
const fileName = () => (lib.list[lib.current]?.name || 'melody-sketch').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
$('midi').onclick = () => { const m = midiBytes(), fn = fileName(); if (inClaude) offer(fn + '-midi.zip', new Blob([zip(fn + '.mid', m)])); else localDownload(fn + '.mid', new Blob([m], {type:'audio/midi'})); };

// ---- 오디오 저장 (WAV) ----
function wavBytes(buf) {
  const sr = buf.sampleRate, n = buf.length, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { out.setInt16(o, clamp(L[i], -1, 1) * 32767, true); out.setInt16(o + 2, clamp(R[i], -1, 1) * 32767, true); }
  return new Uint8Array(out.buffer);
}
// WAV 만들기 (빠르게 하는 방법 두 가지)
// ① 곡 전체를 한꺼번에 예약하면 아직 소리 나지 않은 부품까지 매 순간 계산에 끼어들어 곡이 길수록 점점 느려져요.
//    → 1초마다 잠깐 멈추고(suspend) 다음 2초 분량만 예약해요.
// ② 끝난 음의 부품도 정리되기 전까지 계산에 남아요.
//    → 조각마다 채널 앞에 "버스"를 따로 두고, 그 조각의 마지막 음이 멈추면 버스를 뽑아요(disconnect).
const WAV_STEP = 1, WAV_AHEAD = 2, WAV_TAIL = 0.5, WAV_SAFE = 8;   // 초
async function renderWav(onProgress) {
  const sr = 44100, span = playSpan(), base = 0.05, secs = tSec(span) + 3;
  const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(sr * secs), sr);
  const OE = makeEngine(oc, false); applyMix(OE, S.mix);
  // 소리 부품이 멈추는 시각을 기록해서, 조각이 언제 완전히 끝나는지 알아냄
  let cur = null, sourceless = false;
  for (const f of ['createOscillator', 'createBufferSource']) {
    const make = oc[f].bind(oc);
    oc[f] = () => { const n = make(), chunk = cur, stop = n.stop.bind(n); let stopped = false; n.stop = (t = 0) => { stopped = true; if (chunk) chunk.end = Math.max(chunk.end, t); stop(t); };
      if (chunk) chunk.sources.push(() => stopped); return n; };
  }
  const chunks = []; let done = 0;
  const scheduleUntil = sec => {
    const end = Math.min(span, Math.ceil(tTick(Math.max(0, sec - base)) / 12) * 12); if (end <= done) return;
    const chunk = {buses:[], sources:[], end:0};
    for (const ch of Object.values(OE.ch)) { ch.realInp = ch.realInp || ch.inp; const g = oc.createGain(); g.connect(ch.realInp); ch.inp = g; chunk.buses.push(g); }
    cur = chunk; scheduleRange(OE, done, end, base, false); cur = null;
    // 멈춤 시각이 없는 부품이 하나라도 있으면 넉넉하게 기다림
    const rangeEnd = base + tSec(end); if (!chunk.sources.every(f => f())) chunk.end = Math.max(chunk.end, rangeEnd + WAV_SAFE);
    chunk.end = Math.max(chunk.end, rangeEnd) + WAV_TAIL; chunks.push(chunk); done = end;
  };
  const unplug = t => { for (const c of chunks) if (!c.gone && c.end < t) { c.buses.forEach(g => g.disconnect()); c.gone = true; } };
  if (typeof oc.suspend === 'function') {
    scheduleUntil(WAV_AHEAD);
    for (let t = WAV_STEP; t < secs - 0.1; t += WAV_STEP) oc.suspend(t).then(() => { unplug(t); scheduleUntil(t + WAV_AHEAD); if (onProgress) onProgress(t / secs); oc.resume(); });
  } else scheduleUntil(secs);   // suspend를 못 쓰는 브라우저는 예전처럼 한 번에
  const buf = await oc.startRendering();
  if (onProgress) onProgress(1);
  return wavBytes(buf);
}
const songEmpty = () => !S.patterns.some(P => Object.values(P.notes).some(a => a.length) || P.chords.some(Boolean));
$('wav').onclick = async () => {
  if (songEmpty()) { status('저장할 소리가 없어요. 먼저 음을 찍어 주세요.'); return; }
  const b = $('wav'); b.disabled = true; status('오디오를 만드는 중이에요…');
  const what = S.playMode === 'song' ? '곡 전체(SONG)' : '지금 패턴(PAT)', t0 = performance.now();
  try {
    let last = -1; const w = await renderWav(p => { const pc = Math.floor(p * 100); if (pc !== last) { last = pc; status(`${what}를 오디오로 만드는 중… ${pc}%`); b.textContent = `만드는 중 ${pc}%`; } }), fn = fileName();
    const took = ((performance.now() - t0) / 1000).toFixed(1);
    if (inClaude) await offer(fn + '-audio.zip', new Blob([zip(fn + '.wav', w)])); else localDownload(fn + '.wav', new Blob([w], {type:'audio/wav'}));
    status(`${what} 오디오를 저장했어요 (만드는 데 ${took}초).`);
  }
  catch (e) { status('오디오를 만들지 못했어요. 브라우저가 이 기능을 지원하지 않을 수 있어요.'); }
  finally { b.disabled = false; b.textContent = inClaude ? '오디오 저장 (zip)' : '오디오 저장 (WAV)'; }
};

// ---- MIDI 불러오기 (채널마다 트랙, 10번 채널은 드럼) ----
function parseMidi(buf) {
  const d = new DataView(buf); let p = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; }, u16 = () => { const v = d.getUint16(p); p += 2; return v; };
  const vlqr = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  if (str(4) !== 'MThd') throw new Error('MIDI 파일이 아니에요');
  u32(); u16(); const nt = u16(), div = u16(); if (div & 0x8000) throw new Error('지원하지 않는 시간 형식이에요');
  const notes = [], drums = [], progs = {}, names = {}, markers = [], tempos = []; let tempo = 500000, tempoSet = false;
  for (let k = 0; k < nt; k++) {
    while (p < buf.byteLength && str(4) !== 'MTrk') p += u32();
    if (p >= buf.byteLength) break;
    const len = u32(), end = p + len; let t = 0, rs = 0, tname = ''; const open = {};
    while (p < end) {
      t += vlqr(); let st = d.getUint8(p); if (st & 0x80) p++; else st = rs;
      if (st === 0xff) { const ty = d.getUint8(p++), l = vlqr(); if (ty === 0x51) { const us = (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2); tempos.push([t, us]); if (!tempoSet) { tempo = us; tempoSet = true; } } if (ty === 0x03) tname = new TextDecoder().decode(new Uint8Array(buf, p, l)); if (ty === 0x06) markers.push([t, new TextDecoder().decode(new Uint8Array(buf, p, l))]); p += l; continue; }
      if (st === 0xf0 || st === 0xf7) { p += vlqr(); continue; }
      rs = st; const ty = st & 0xf0, ch = st & 0x0f, a = d.getUint8(p++), b = (ty === 0xc0 || ty === 0xd0) ? 0 : d.getUint8(p++);
      if (ty === 0xc0) progs[ch] = a;
      if (ty === 0x90 && b > 0) { if (ch === 9) drums.push({t, n:a, v:b}); else { (open[ch + ':' + a] = open[ch + ':' + a] || []).push({t, v:b}); if (tname && !names[ch]) names[ch] = tname; } }
      else if (ty === 0x80 || (ty === 0x90 && b === 0)) { const q = open[ch + ':' + a], o = q && q.shift(); if (o) notes.push({ch, p:a, t0:o.t, t1:t, v:o.v}); }   // 같은 음이 겹쳐도 먼저 켠 음부터 끔
    }
    p = end;
  }
  // BPM: 가장 오래 쓰인 템포 (템포가 곡 중간에 바뀌는 곡도 대표 값 하나로)
  let bpm = 60000000 / tempo;
  if (tempos.length > 1) {
    tempos.sort((a, b) => a[0] - b[0]); const endT = Math.max(...notes.map(n => n.t1), ...drums.map(x => x.t), tempos[tempos.length - 1][0] + 1), w = {};
    tempos.forEach(([t, us], i) => { const k = Math.round(60000000 / us * 2) / 2; w[k] = (w[k] || 0) + Math.max(0, (i + 1 < tempos.length ? tempos[i + 1][0] : endT) - t); });
    bpm = +Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
  }
  markers.sort((a, b) => a[0] - b[0]);
  return {notes, drums, div, bpm, progs, names, markers, tempoCount:tempos.length, tempos};
}
// General MIDI 악기 번호 → 스케치패드 악기
const PROG_TO_INST = pr => pr == null ? 'piano' : pr < 4 ? 'piano' : pr < 8 ? 'epiano' : pr === 8 ? 'celesta' : pr < 16 ? 'bell' : pr >= 32 && pr <= 39 ? 'bass'
  : pr === 46 ? 'harp' : pr === 47 ? 'timpani' : pr >= 40 && pr <= 55 ? 'strings' : pr >= 88 && pr <= 95 ? 'strings' : pr >= 80 && pr <= 87 ? 'supersaw' : pr >= 24 && pr <= 31 ? 'pluck' : 'piano';
// 조 알아맞히기 (크럼핸슬-슈뮤클러): 음마다 길이만큼 12음 비율을 세고, 장조·단조 24개 비율표와 가장 닮은 조를 고름
const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function guessKey(notes) {
  const h = Array(12).fill(0); for (const n of notes) h[n.p % 12] += Math.max(1, n.l);
  const corr = (a, b) => { const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12; let s = 0, sa = 0, sb = 0; for (let i = 0; i < 12; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb || 1); };
  let best = {root:0, mode:'major', r:-2};
  for (let k = 0; k < 12; k++) for (const [mode, prof] of [['major', KK_MAJ], ['minor', KK_MIN]]) { const rot = h.map((_, i) => h[(i + k) % 12]), r = corr(rot, prof); if (r > best.r) best = {root:k, mode, r}; }
  return best;
}
// MIDI 파일 → 곡 (채널마다 악기, 10번 채널은 드럼 채널, 이 앱이 저장한 "코드" 트랙은 코드 칸으로)
function midiToSong(ab) {
  const r = parseMidi(ab); if (!r.notes.length && !r.drums.length) throw new Error('이 MIDI에는 음이 없어요');
  const cv = t => Math.round(t * PPQ / r.div);
  const maxT = Math.max(...r.notes.map(n => cv(n.t1)), ...r.drums.map(x => cv(x.t) + 1), 1);
  let bars = Math.ceil(maxT / (4 * PPQ)); const cut = bars > MAX_BARS; bars = clamp(bars, 1, MAX_BARS);
  const lim = bars * 4 * PPQ; let moved = 0;
  const chordCh = Object.keys(r.names).map(Number).find(ch => r.names[ch] === '코드');
  const chans = [...new Set(r.notes.map(n => n.ch))].filter(ch => ch !== chordCh).sort((a, b) => a - b).slice(0, 12);
  const P = newPattern('Pattern 1', bars), channels = [];
  for (const ch of chans) {
    const c = newChannel('synth', PROG_TO_INST(r.progs[ch]), (r.names[ch] || ('채널 ' + (ch + 1))).slice(0, 24)); channels.push(c);
    P.notes[c.id] = r.notes.filter(n => n.ch === ch).map(n => { let p = n.p; while (p < LOW) { p += 12; moved++; } while (p > HIGH) { p -= 12; moved++; } const s0 = cv(n.t0); return {p, s:s0, l:Math.max(3, Math.min(cv(n.t1) - s0, lim - s0)), v:Math.max(0.05, n.v / 127)}; }).filter(n => n.s < lim);
  }
  const DM = {35:'kick', 36:'kick', 37:'snare', 38:'snare', 40:'snare', 42:'hat', 44:'hat', 46:'hat', 39:'clap', 49:'crash', 57:'crash', 52:'crash', 55:'crash'};
  for (const d of DRUMS) {
    const hits = r.drums.filter(x => DM[x.n] === d); if (!hits.length) continue;
    const c = newChannel('drum', d); channels.push(c);
    const by = {}; for (const x of hits) { const s0 = cv(x.t); if (s0 < lim) by[s0] = Math.max(by[s0] || 0, x.v / 127); }   // 정확한 위치 그대로 (롤도 살아 있게)
    P.notes[c.id] = Object.entries(by).map(([s0, v]) => ({p:DRUM_PITCH, s:+s0, l:12, v}));
  }
  const groups = {}; for (const n of r.notes.filter(n => n.ch === chordCh)) (groups[cv(n.t0)] = groups[cv(n.t0)] || []).push(n.p);
  for (const [t, ps] of Object.entries(groups)) {
    const pcs = [...new Set(ps.map(x => x % 12))], beat = Math.round(t / PPQ); if (beat >= bars * 4) continue;
    let found = null;
    for (const r0 of pcs) for (const [q, iv] of Object.entries(QUAL)) { const want = iv.map(i => (r0 + i) % 12); if (!found && want.length === pcs.length && want.every(x => pcs.includes(x))) found = {r:r0, q}; }
    P.chords[beat] = found || {r:Math.min(...ps) % 12, q:''};
  }
  if (!channels.length) channels.push(newChannel('synth', 'piano', '피아노'));
  // 구간 표시(마커)가 있으면 구간마다 패턴으로 나눠서 플레이리스트에 놓기
  let patterns = [P], clips = [{id:newId(), pat:P.id, t:0, bar:0}], split = 0;
  const BT = 4 * PPQ, mk = r.markers.map(([t, name]) => [Math.round(cv(t) / BT), name.trim() || '구간']).filter(([b], i, a) => b < bars && (i === 0 || b > a[i - 1][0]));
  if (mk.length >= 2) {
    if (mk[0][0] > 0) mk.unshift([0, '처음']);
    patterns = []; clips = []; const used = {};
    mk.forEach(([b0, name], i) => {
      const b1 = i + 1 < mk.length ? mk[i + 1][0] : bars, n = b1 - b0; if (n < 1) return;
      used[name] = (used[name] || 0) + 1; const Q = newPattern((used[name] > 1 ? `${name} ${used[name]}` : name).slice(0, 24), n), s0 = b0 * BT, s1 = b1 * BT;
      for (const [cid, arr] of Object.entries(P.notes)) Q.notes[cid] = arr.filter(x => x.s >= s0 && x.s < s1).map(x => ({...x, s:x.s - s0, l:Math.min(x.l, s1 - x.s)}));
      Q.chords = P.chords.slice(b0 * 4, b1 * 4); patterns.push(Q); clips.push({id:newId(), pat:Q.id, t:0, bar:b0});
    });
    split = patterns.length;
  }
  const key = guessKey(channels.filter(c => c.kind === 'synth').flatMap(c => P.notes[c.id] || []));
  // 템포 지도: MIDI의 템포 변화를 그대로 (기본 BPM은 가장 오래 쓰인 템포, PAT 반복용)
  const tempo = []; if (r.tempos.length > 1) { let last = null; for (const [t, us] of r.tempos) { const b = Math.round(60000000 / us * 100) / 100, tt = cv(t); if (tt >= lim) break; if (b !== last) { tempo.push({t:tt, bpm:b}); last = b; } } }
  const song = normalize({v:4, channels, patterns, pat:0, ch:0, mix:{}, root:key.root, mode:key.mode, playMode:split || tempo.length ? 'song' : 'pat', playlist:{tracks:PL_TRACKS, clips}, tempo, bpm:clamp(Math.round(r.bpm * 100) / 100, 60, 300)});
  const nNotes = Object.values(P.notes).reduce((a, x) => a + x.length, 0);
  return {song, info:`채널 ${song.channels.length}개, 음 ${nNotes}개, ${song.bpm} BPM, ${NAMES_S[key.root]} ${key.mode === 'minor' ? '단조' : '장조'}(음 비율로 추정), ` + (split ? `구간 ${split}개를 패턴으로 나눠 플레이리스트에 놓음` : `${bars}마디 패턴`) + (song.tempo.length ? ` · 템포 지도 ${song.tempo.length}곳 (기본 ${song.bpm} BPM)` : '') + (cut ? ` (${MAX_BARS}마디까지만)` : '') + (moved ? ' · 건반 밖의 음은 옥타브를 옮겼어요' : '')};
}
// ---- 프로젝트 파일 (내 샘플까지 담음) ----
function ab64(ab) { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function b64ab(b) { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
// 저장: 우리 형식 .msk (내 샘플까지, 압축)
$('saveProj').onclick = async () => {
  save(); const samples = await songSamples(S), u = await encodeMSK(S, lib.list[lib.current].name, samples), fn = fileName() + '.msk';
  if (inClaude) offer(fn.replace(/\.msk$/, '-msk.zip'), new Blob([zip(fn, u)])); else localDownload(fn, new Blob([u], {type:'application/octet-stream'}));
  const n = Object.keys(samples).length; setTimeout(() => status(`저장했어요: ${fn} (${(u.length / 1024).toFixed(1)} KB` + (n ? `, 내 샘플 ${n}개 포함` : '') + ')'), 300);
};
// 불러오기: 파일 속 내용을 스캔해서 형식을 알아냄 (MSK · 곡 코드 · MIDI · 프로젝트 · 악보)
$('loadProj').onclick = () => $('fileIn').click();
$('fileIn').onchange = async () => {
  const f = $('fileIn').files[0]; $('fileIn').value = ''; if (!f) return;
  try {
    const r = await loadAny(f), n = await openLoaded(r);
    status(`${r.from} 파일로 알아보고 "${lib.list[lib.current].name}"을 새 프로젝트로 열었어요` + (n ? ` (내 샘플 ${n}개)` : '') + (r.warnings.length ? ` · 알림 ${r.warnings.length}개` : '') + (r.info ? ` · ${r.info}` : '') + '.');
  } catch (e) { status('불러오지 못했어요: ' + (e.message || '알 수 없는 형식')); }
};

// ---- 내 프로젝트 (여러 곡) ----
function openProject(id) {
  clearTimeout(saveT); if (playing) stop();
  lib.current = id; saveLib(); let d = null; try { d = songFromStore(lsGet(PK(id))); } catch (e) {}
  S = d || blank(); undoStack = []; sel.clear(); $('selBar').hidden = true; startTick = 0; songStart = 0;
  refreshAll(); if (E) applyMix(E, S.mix); $('projName').value = lib.list[id].name; updatePos(0);
}
function newProject(copy) {
  const id = newId(), base = copy ? JSON.parse(JSON.stringify(S)) : {...blank(), bpm:S.bpm, root:S.root, mode:S.mode};
  lib.list[id] = {name:copy ? (lib.list[lib.current].name + ' 복사본').slice(0, 40) : '새 곡 ' + (Object.keys(lib.list).length + 1), updated:Date.now()};
  save(); lsSet(PK(id), songToStore(normalize(base))); openProject(id); return id;
}
function renderProjects() {
  const box = $('projList'); box.innerHTML = '';
  const ids = Object.keys(lib.list).sort((a, b) => lib.list[b].updated - lib.list[a].updated);
  for (const id of ids) {
    const p = lib.list[id], row = document.createElement('div'); row.className = 'prow' + (id === lib.current ? ' cur' : '');
    const nm = document.createElement('div'); nm.className = 'pn';
    const b = document.createElement('b'); b.textContent = p.name; const sp = document.createElement('span');
    sp.textContent = new Date(p.updated).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}) + (id === lib.current ? ' · 지금 여는 곡' : '');
    nm.append(b, sp);
    const bt = document.createElement('div'); bt.className = 'pb';
    const mk = (t, f) => { const x = document.createElement('button'); x.className = 'tbtn xs'; x.textContent = t; x.setAttribute('aria-label', p.name + ' ' + t); x.onclick = f; bt.appendChild(x); };
    if (id !== lib.current) mk('열기', () => { save(); openProject(id); $('projDlg').close(); status(`"${p.name}"을 열었어요.`); });
    mk('복제', () => { if (id !== lib.current) { save(); openProject(id); } newProject(true); renderProjects(); status('복제했어요.'); });
    mk('삭제', () => {
      if (!confirm(`"${p.name}"을 지울까요? 되돌릴 수 없어요.`)) return;
      delete lib.list[id]; lsDel(PK(id));
      if (!Object.keys(lib.list).length) { lib.current = null; newProject(false); }
      else if (id === lib.current) openProject(Object.keys(lib.list).sort((a, b) => lib.list[b].updated - lib.list[a].updated)[0]);
      saveLib(); renderProjects(); status('지웠어요.');
    });
    row.append(nm, bt); box.appendChild(row);
  }
}
$('projBtn').onclick = () => { save(); renderProjects(); const d = $('projDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); };
$('projNew').onclick = () => { newProject(false); renderProjects(); status('새 곡을 만들었어요.'); };
$('projClose').onclick = () => $('projDlg').close();
$('projName').onchange = () => { const v = $('projName').value.trim().slice(0, 40) || '이름 없는 곡'; $('projName').value = v; lib.list[lib.current].name = v; saveLib(); status('이름을 바꿨어요.'); };
$('clear').onclick = () => { newProject(false); status('새 곡을 만들었어요. 이전 곡은 “내 프로젝트”에 그대로 있어요.'); };
