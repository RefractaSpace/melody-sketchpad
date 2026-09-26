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
  const t = resultText(), out = $('out'); out.value = t;
  try { await navigator.clipboard.writeText(t); status('복사했어요. 대화에 붙여 주세요.'); out.style.display = 'none'; }
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
const PROG = {piano:0, epiano:4, supersaw:81, pluck:84, chip:80, bell:14, sample:0};
// 내보낼 범위: SONG 모드이고 플레이리스트에 조각이 있으면 곡 전체, 아니면 지금 패턴
function flatten() {
  const song = S.playMode === 'song' && S.playlist.clips.length, parts = song ? S.playlist.clips.map(c => ({P:patById(c.pat), off:c.bar * 4 * PPQ})) : [{P:curPat(), off:0}];
  const notes = {}, chords = [];
  for (const {P, off} of parts) {
    for (const c of S.channels) for (const n of P.notes[c.id] || []) (notes[c.id] = notes[c.id] || []).push({...n, s:n.s + off});
    for (const seg of chordSegments(P)) chords.push({...seg, s:seg.s + off});
  }
  return {song:!!song, notes, chords, len:song ? songTicks() : totalTicks()};
}
function midiBytes() {
  const F = flatten(), us = Math.round(60000000 / S.bpm), tr = [mtrack([{t:0, o:0, b:[0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]}, {t:0, o:0, b:[0xff, 0x58, 4, 4, 2, 24, 8]}], '멜로디 스케치패드')];
  const synth = S.channels.filter(c => c.kind === 'synth'), free = [0, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  synth.forEach((c, i) => {
    const ch = free[i % free.length], ev = [{t:0, o:0, b:[0xc0 | ch, PROG[c.inst] || 0]}];
    for (const n of F.notes[c.id] || []) { ev.push({t:n.s, o:1, b:[0x90 | ch, n.p, Math.max(1, Math.round(n.v * 127))]}); ev.push({t:n.s + n.l, o:0, b:[0x80 | ch, n.p, 0]}); }
    tr.push(mtrack(ev, c.name));
  });
  const cev = [{t:0, o:0, b:[0xc1, 89]}];
  for (const seg of F.chords) chordVoices(seg.c).forEach(m => { cev.push({t:seg.s, o:1, b:[0x91, m, 70]}); cev.push({t:seg.s + seg.l, o:0, b:[0x81, m, 0]}); });
  tr.push(mtrack(cev, '코드'));
  const dev = [], map = {kick:36, snare:38, hat:42, clap:39};
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
async function renderWav() {
  const sr = 44100, secs = playSpan() * tickSec() + 3, oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(sr * secs), sr);
  const OE = makeEngine(oc, false); applyMix(OE, S.mix); scheduleRange(OE, 0, playSpan(), 0.05, false);
  return wavBytes(await oc.startRendering());
}
const songEmpty = () => !S.patterns.some(P => Object.values(P.notes).some(a => a.length) || P.chords.some(Boolean));
$('wav').onclick = async () => {
  if (songEmpty()) { status('저장할 소리가 없어요. 먼저 음을 찍어 주세요.'); return; }
  const b = $('wav'); b.disabled = true; status('오디오를 만드는 중이에요…');
  try { status(S.playMode === 'song' ? '곡 전체(SONG)를 오디오로 만드는 중이에요…' : '지금 패턴(PAT)을 오디오로 만드는 중이에요…'); const w = await renderWav(), fn = fileName(); if (inClaude) await offer(fn + '-audio.zip', new Blob([zip(fn + '.wav', w)])); else localDownload(fn + '.wav', new Blob([w], {type:'audio/wav'})); }
  catch (e) { status('오디오를 만들지 못했어요. 브라우저가 이 기능을 지원하지 않을 수 있어요.'); }
  finally { b.disabled = false; }
};

// ---- MIDI 불러오기 (채널마다 트랙, 10번 채널은 드럼) ----
function parseMidi(buf) {
  const d = new DataView(buf); let p = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; }, u16 = () => { const v = d.getUint16(p); p += 2; return v; };
  const vlqr = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  if (str(4) !== 'MThd') throw new Error('MIDI 파일이 아니에요');
  u32(); u16(); const nt = u16(), div = u16(); if (div & 0x8000) throw new Error('지원하지 않는 시간 형식이에요');
  const notes = [], drums = [], progs = {}, names = {}; let tempo = 500000, tempoSet = false;
  for (let k = 0; k < nt; k++) {
    while (p < buf.byteLength && str(4) !== 'MTrk') p += u32();
    if (p >= buf.byteLength) break;
    const len = u32(), end = p + len; let t = 0, rs = 0, tname = ''; const open = {};
    while (p < end) {
      t += vlqr(); let st = d.getUint8(p); if (st & 0x80) p++; else st = rs;
      if (st === 0xff) { const ty = d.getUint8(p++), l = vlqr(); if (ty === 0x51 && !tempoSet) { tempo = (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2); tempoSet = true; } if (ty === 0x03) tname = new TextDecoder().decode(new Uint8Array(buf, p, l)); p += l; continue; }
      if (st === 0xf0 || st === 0xf7) { p += vlqr(); continue; }
      rs = st; const ty = st & 0xf0, ch = st & 0x0f, a = d.getUint8(p++), b = (ty === 0xc0 || ty === 0xd0) ? 0 : d.getUint8(p++);
      if (ty === 0xc0) progs[ch] = a;
      if (ty === 0x90 && b > 0) { if (ch === 9) drums.push({t, n:a, v:b}); else { open[ch + ':' + a] = {t, v:b}; if (tname && !names[ch]) names[ch] = tname; } }
      else if (ty === 0x80 || (ty === 0x90 && b === 0)) { const o = open[ch + ':' + a]; if (o) { notes.push({ch, p:a, t0:o.t, t1:t, v:o.v}); delete open[ch + ':' + a]; } }
    }
    p = end;
  }
  return {notes, drums, div, bpm:60000000 / tempo, progs, names};
}
const PROG_TO_INST = pr => pr == null ? 'piano' : pr < 4 ? 'piano' : pr < 8 ? 'epiano' : pr < 16 ? 'bell' : pr >= 80 && pr <= 87 ? 'supersaw' : 'piano';
$('midiIn').onchange = async () => {
  const f = $('midiIn').files[0]; $('midiIn').value = ''; if (!f) return;
  try {
    const r = parseMidi(await f.arrayBuffer()); if (!r.notes.length && !r.drums.length) { status('이 MIDI에는 음이 없어요.'); return; }
    const cv = t => Math.round(t * PPQ / r.div);
    const maxT = Math.max(...r.notes.map(n => cv(n.t1)), ...r.drums.map(x => cv(x.t) + 1), 1);
    let bars = Math.ceil(maxT / (4 * PPQ)); const cut = bars > MAX_BARS; bars = clamp(bars, 1, MAX_BARS);
    pushUndo(); sel.clear();
    const lim = bars * 4 * PPQ; let moved = 0;
    // 이 앱이 저장한 "코드" 트랙은 코드 칸으로 되돌림 (같은 순간에 시작한 음들 → 코드 이름)
    const chordCh = Object.keys(r.names).map(Number).find(ch => r.names[ch] === '코드');
    const chans = [...new Set(r.notes.map(n => n.ch))].filter(ch => ch !== chordCh).sort((a, b) => a - b).slice(0, 12);
    const P = newPattern('Pattern 1', bars), channels = [];
    for (const ch of chans) {
      const c = newChannel('synth', PROG_TO_INST(r.progs[ch]), (r.names[ch] || ('채널 ' + (ch + 1))).slice(0, 24)); channels.push(c);
      P.notes[c.id] = r.notes.filter(n => n.ch === ch).map(n => { let p = n.p; while (p < LOW) { p += 12; moved++; } while (p > HIGH) { p -= 12; moved++; } const s0 = cv(n.t0); return {p, s:s0, l:Math.max(3, Math.min(cv(n.t1) - s0, lim - s0)), v:Math.max(0.05, n.v / 127)}; }).filter(n => n.s < lim);
    }
    const DM = {35:'kick', 36:'kick', 37:'snare', 38:'snare', 40:'snare', 42:'hat', 44:'hat', 46:'hat', 39:'clap'};
    for (const d of DRUMS) {
      const hits = r.drums.filter(x => DM[x.n] === d); if (!hits.length) continue;
      const c = newChannel('drum', d); channels.push(c);
      const by = {}; for (const x of hits) { const s0 = Math.round(cv(x.t) / 12) * 12; if (s0 < lim) by[s0] = Math.max(by[s0] || 0, x.v / 127); }
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
    S = normalize({...S, v:4, channels, patterns:[P], pat:0, ch:0, mix:{master:S.mix.master}, playlist:{tracks:PL_TRACKS, clips:[{id:newId(), pat:P.id, t:0, bar:0}]}, bpm:clamp(Math.round(r.bpm), 60, 300)});
    save(); refreshAll(); if (E) applyMix(E, S.mix);
    const nNotes = Object.values(P.notes).reduce((a, x) => a + x.length, 0);
    status(`${f.name}을 불러왔어요: 채널 ${S.channels.length}개, 음 ${nNotes}개, ${S.bpm} BPM, ${bars}마디 패턴` + (cut ? ` (${MAX_BARS}마디까지만)` : '') + (moved ? ' · 롤 밖의 음은 옥타브를 옮겼어요' : ''));
  } catch (e) { status('MIDI를 읽지 못했어요: ' + (e.message || '알 수 없는 형식')); }
};
$('midiLoad').onclick = () => $('midiIn').click();

// ---- 프로젝트 파일 (내 샘플까지 담음) ----
function ab64(ab) { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function b64ab(b) { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
$('saveProj').onclick = async () => {
  const all = await idbAll(), samples = {};
  for (const [k, v] of Object.entries(all)) if (v && v.ab) samples[k] = {name:v.name, root:v.root, b64:ab64(v.ab)};
  const j = JSON.stringify({app:'melody-sketchpad', version:4, name:lib.list[lib.current]?.name, song:S, samples}), fn = fileName() + '.json';
  if (inClaude) offer(fn, j); else localDownload(fn, new Blob([j], {type:'application/json'}));
  const n = Object.keys(samples).length; if (n) setTimeout(() => status(`프로젝트를 저장했어요 (내 샘플 ${n}개 포함).`), 300);
};
$('loadProj').onclick = () => $('fileIn').click();
$('fileIn').onchange = async () => {
  const f = $('fileIn').files[0]; $('fileIn').value = ''; if (!f) return;
  try {
    const raw = JSON.parse(await f.text()), song = raw && raw.app === 'melody-sketchpad' ? raw.song : raw;
    if (!song || !(song.notes || song.tracks || song.channels)) throw 0;
    const id = newId(); lib.list[id] = {name:(raw.name || f.name.replace(/\.json$/i, '')).slice(0, 40), updated:Date.now()};
    lsSet(PK(id), JSON.stringify(normalize(song))); openProject(id);
    let n = 0;
    if (raw.samples) for (const [k, v] of Object.entries(raw.samples)) { try { const ab = b64ab(v.b64); SAMPLES[k] = {buf:await decode(ab), root:v.root || 60, name:v.name}; await idbPut(k, {ab, root:v.root || 60, name:v.name}); n++; } catch (e) {} }
    buildMixer(); status(`"${lib.list[id].name}"을 새 프로젝트로 불러왔어요` + (n ? ` (내 샘플 ${n}개 포함)` : '') + '.');
  } catch (e) { status('이 파일은 스케치패드 프로젝트 파일이 아니에요.'); }
};

// ---- 내 프로젝트 (여러 곡) ----
function openProject(id) {
  clearTimeout(saveT); if (playing) stop();
  lib.current = id; saveLib(); let d = null; try { d = JSON.parse(lsGet(PK(id)) || 'null'); } catch (e) {}
  S = normalize(d || blank()); undoStack = []; sel.clear(); $('selBar').hidden = true; startTick = 0; songStart = 0;
  refreshAll(); if (E) applyMix(E, S.mix); $('projName').value = lib.list[id].name; updatePos(0);
}
function newProject(copy) {
  const id = newId(), base = copy ? JSON.parse(JSON.stringify(S)) : {...blank(), bpm:S.bpm, root:S.root, mode:S.mode};
  lib.list[id] = {name:copy ? (lib.list[lib.current].name + ' 복사본').slice(0, 40) : '새 곡 ' + (Object.keys(lib.list).length + 1), updated:Date.now()};
  save(); lsSet(PK(id), JSON.stringify(base)); openProject(id); return id;
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
