/* 00-msk.js — 우리 형식 MSK (.msk) · 형식 자동 인식(스캔)
   맨 먼저 실행돼요: 앱이 켜질 때 브라우저에 MSK로 저장된 곡을 바로 읽어야 해서
   ─ 파일 구조 ─────────────────────────────────────────────
   머리 5바이트: 'M' 'S' 'K' 버전(1) 플래그(bit0 = 몸통 압축, bit1 = CRC 청크 필수)
   몸통: 청크가 이어짐 → [종류 4글자][길이: 가변 숫자][내용]
     INFO 곡 정보 · CHAN 채널 · FXCH 코드·베이스·마스터 믹서 · PATN 패턴(하나에 하나) · PLST 플레이리스트 · SMPL 내 샘플
     IDS  채널·패턴 번호표 (브라우저 안 저장용 — 내 샘플 연결을 지키려고)
     PLEX 조각 길이·시작 오프셋 · PCOL 패턴 색 · TMAP 템포 지도 · FXSL 이펙트 칸 · AUTO 자동화
     TEMP 정밀 BPM (×100, 예: 126.5 → 12650) · CRC  맨 끝, 앞 내용 전체의 CRC32 (바이트가 바뀌면 알아챔)
     모르는 종류는 건너뜀 → 나중에 형식을 늘려도 옛 앱이 안 깨짐
   가변 숫자(varint): 7비트씩, 앞 비트가 1이면 다음 바이트가 이어짐 → 0~127은 1바이트
   음 하나: [앞 음과 시작 차이][음높이][길이][세기] → 보통 4바이트
   자세한 설명: docs/msk-format.md */
const MSK_VERSION = 1;
// 번호표 (뒤에만 덧붙여야 옛 파일이 그대로 읽혀요)
const MSK_INST = ['piano', 'epiano', 'supersaw', 'pluck', 'chip', 'bell', 'sample', 'strings', 'bass', 'celesta', 'harp', 'timpani', 'synth', 'kit', 'violin', 'viola', 'cello', 'contrabass', 'flute', 'clarinet', 'oboe', 'bassoon', 'trumpet', 'horn', 'trombone', 'tuba', 'marimba', 'glock', 'xylo', 'gm0', 'gm1', 'gm2', 'gm3', 'gm4', 'gm5', 'gm6', 'gm7', 'gm8', 'gm9', 'gm10', 'gm11', 'gm12', 'gm13', 'gm14', 'gm15', 'gm16', 'gm17', 'gm18', 'gm19', 'gm20', 'gm21', 'gm22', 'gm23', 'gm24', 'gm25', 'gm26', 'gm27', 'gm28', 'gm29', 'gm30', 'gm31', 'gm32', 'gm33', 'gm34', 'gm35', 'gm36', 'gm37', 'gm38', 'gm39', 'gm40', 'gm41', 'gm42', 'gm43', 'gm44', 'gm45', 'gm46', 'gm47', 'gm48', 'gm49', 'gm50', 'gm51', 'gm52', 'gm53', 'gm54', 'gm55', 'gm56', 'gm57', 'gm58', 'gm59', 'gm60', 'gm61', 'gm62', 'gm63', 'gm64', 'gm65', 'gm66', 'gm67', 'gm68', 'gm69', 'gm70', 'gm71', 'gm72', 'gm73', 'gm74', 'gm75', 'gm76', 'gm77', 'gm78', 'gm79', 'gm80', 'gm81', 'gm82', 'gm83', 'gm84', 'gm85', 'gm86', 'gm87', 'gm88', 'gm89', 'gm90', 'gm91', 'gm92', 'gm93', 'gm94', 'gm95', 'gm96', 'gm97', 'gm98', 'gm99', 'gm100', 'gm101', 'gm102', 'gm103', 'gm104', 'gm105', 'gm106', 'gm107', 'gm108', 'gm109', 'gm110', 'gm111', 'gm112', 'gm113', 'gm114', 'gm115', 'gm116', 'gm117', 'gm118', 'gm119', 'gm120', 'gm121', 'gm122', 'gm123', 'gm124', 'gm125', 'gm126', 'gm127', 'pianoPro', 'pianoMax'];   // 6: 드럼 키트·샘플 악기 (뒤에만 덧붙이기)
const MSK_CHORD = ['pad', 'supersaw', 'piano', 'epiano', 'pluck'];
const MSK_BMODE = ['off', 'sustain', '8th', 'offbeat'];
const MSK_BINST = ['reese', 'sub', 'saw'];
const MSK_KIT = ['edm', '808', 'hard', 'acoustic'];
const MSK_Q = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'dim', 'aug'];
const MSK_FX = ['', 'comp', 'dist', 'lpf', 'hpf', 'chorus', 'reverb', 'delay', 'eq', 'width', 'eq4', 'gate'];
const mskIdx = (list, v) => Math.max(0, list.indexOf(v));
const q8 = x => clamp(Math.round(x), 0, 255);
// CRC32: 바이트가 하나라도 바뀌면 값이 달라지는 "지문" (ZIP·PNG와 같은 계산법)
const MSK_CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function mskCrc(u) { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = MSK_CRC_T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

class MskW {   // 바이트 쓰기
  constructor(n = 4096) { this.b = new Uint8Array(n); this.n = 0; }
  need(k) { if (this.n + k > this.b.length) { let m = this.b.length * 2; while (m < this.n + k) m *= 2; const nb = new Uint8Array(m); nb.set(this.b.subarray(0, this.n)); this.b = nb; } }
  u8(x) { this.need(1); this.b[this.n++] = x & 255; }
  vu(x) { x = Math.max(0, Math.floor(x)); this.need(10); while (x >= 128) { this.b[this.n++] = (x & 127) | 128; x = Math.floor(x / 128); } this.b[this.n++] = x; }
  raw(u) { this.need(u.length); this.b.set(u, this.n); this.n += u.length; }
  str(s) { const u = MSK_TE.encode(s || ''); this.vu(u.length); this.raw(u); }
  chunk(type, fill) { const p = new MskW(256); fill(p); const body = p.done(); this.raw(MSK_TE.encode(type)); this.vu(body.length); this.raw(body); }
  done() { return this.b.slice(0, this.n); }
}
const MSK_TD = new TextDecoder(), MSK_TE = new TextEncoder();
class MskR {   // 바이트 읽기
  constructor(u) { this.u = u; this.i = 0; }
  end() { return this.i >= this.u.length; }
  u8() { if (this.i >= this.u.length) throw new Error('파일이 중간에 끊겼어요'); return this.u[this.i++]; }
  vu() { let x = 0, m = 1, b, k = 0; do { b = this.u8(); x += (b & 127) * m; m *= 128; if (++k > 8) throw new Error('숫자가 이상해요'); } while (b & 128); return x; }
  raw(n) { if (this.i + n > this.u.length) throw new Error('파일이 중간에 끊겼어요'); const s = this.u.subarray(this.i, this.i + n); this.i += n; return s; }
  str() { return MSK_TD.decode(this.raw(this.vu())); }
}
const wTone = (p, t) => { p.u8(q8(t.br * 100)); p.u8(q8(t.atk * 250)); p.u8(q8(t.rel * 100)); };
const rTone = r => ({br:r.u8() / 100, atk:r.u8() / 250, rel:r.u8() / 100});
const wMix = (p, m) => { p.u8(q8(m.v * 200)); p.u8(q8(m.pan * 100 + 100)); p.u8(q8(m.rev * 200)); p.u8(q8(m.dly * 200)); p.u8(q8((m.lo || 0) + 12)); p.u8(q8((m.mid || 0) + 12)); p.u8(q8((m.hi || 0) + 12)); p.u8((m.sc ? 1 : 0) | (m.mute ? 2 : 0) | (m.solo ? 4 : 0)); };
const rMix = r => { const v = r.u8() / 200, pan = (r.u8() - 100) / 100, rev = r.u8() / 200, dly = r.u8() / 200, lo = r.u8() - 12, mid = r.u8() - 12, hi = r.u8() - 12, f = r.u8(); return {v, pan, rev, dly, lo, mid, hi, sc:!!(f & 1), mute:f & 2 ? 1 : 0, solo:f & 4 ? 1 : 0}; };

async function mskDeflate(u, inflate) {
  const Stream = inflate ? window.DecompressionStream : window.CompressionStream; if (!Stream) return null;
  return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new Stream('deflate-raw'))).arrayBuffer());
}
// 곡 → 몸통 바이트 (압축 전). samples: {칸이름: {ab, root, name}}, keepIds: 번호표도 저장
function encodeMskBody(song, name, samples, keepIds) {
  const w = new MskW();
  if (meterOf(song).join('/') !== '4/4' || song.swing) w.chunk('METR', p => { const m = meterOf(song); p.u8(m[0]); p.u8(m[1]); p.u8(Math.round((song.swing || 0) * 100)); });
  w.chunk('INFO', p => { p.str(name || ''); p.vu(Math.round(song.bpm)); p.u8(song.root); p.u8(song.mode === 'minor' ? 1 : 0); p.u8(song.snap); p.u8(song.len); p.u8(song.playMode === 'song' ? 1 : 0);
    p.u8(mskIdx(MSK_CHORD, song.chordInst)); p.u8(mskIdx(MSK_BMODE, song.bassMode)); p.u8(mskIdx(MSK_BINST, song.bassInst)); p.u8(mskIdx(MSK_KIT, song.kit)); p.vu(song.pat); p.vu(song.ch); wTone(p, song.chordTone); });
  w.chunk('CHAN', p => { p.vu(song.channels.length); for (const c of song.channels) { p.u8(c.kind === 'drum' ? 1 : 0); p.u8(c.kind === 'drum' ? DRUMS.indexOf(c.inst) : mskIdx(MSK_INST, c.inst)); p.str(c.name); wTone(p, c.tone); wMix(p, song.mix[chKey(c)]); } });
  w.chunk('FXCH', p => { wMix(p, song.mix.chords); wMix(p, song.mix.bass); const m = song.mix.master; p.u8(q8(m.v * 200)); p.u8(q8(m.sc * 200)); p.u8(m.size); });
  for (const P of song.patterns) w.chunk('PATN', p => {
    p.str(P.name); p.vu(P.bars);
    const set = []; P.chords.forEach((c, i) => { if (c) set.push([i, c]); });
    p.vu(set.length); let last = -1; for (const [i, c] of set) { p.vu(i - last - 1); last = i; p.u8(c.x ? 255 : c.r * 16 + mskIdx(MSK_Q, c.q)); }
    const chans = song.channels.map((c, ci) => [ci, P.notes[c.id] || []]).filter(x => x[1].length);
    p.vu(chans.length);
    for (const [ci, arr] of chans) {
      p.vu(ci); const ns = arr.slice().sort((a, b) => a.s - b.s || a.p - b.p); p.vu(ns.length); let ps = 0;
      for (const n of ns) { p.vu(n.s - ps); ps = n.s; p.u8(n.p); p.vu(n.l); p.u8(clamp(Math.round(n.v * 250), 1, 250)); }
    }
  });
  w.chunk('PLST', p => { p.vu(song.playlist.tracks); const cl = song.playlist.clips.slice().sort((a, b) => a.bar - b.bar || a.t - b.t); p.vu(cl.length); let pb = 0;
    for (const c of cl) { p.vu(Math.max(0, song.patterns.findIndex(P => P.id === c.pat))); p.u8(c.t); p.vu(c.bar - pb); pb = c.bar; } });
  { const cl = song.playlist.clips.slice().sort((a, b) => a.bar - b.bar || a.t - b.t);   // PLST와 같은 순서
    if (cl.some(c => c.len || c.off)) w.chunk('PLEX', p => { p.vu(cl.length); for (const c of cl) { p.vu(c.len || 0); p.vu(c.off || 0); } }); }
  if (song.patterns.some(P => P.color)) w.chunk('PCOL', p => { p.vu(song.patterns.length); for (const P of song.patterns) p.u8(P.color || 0); });
  for (const [slot, s] of Object.entries(samples || {})) {
    const ci = slot.startsWith('ch:') ? song.channels.findIndex(c => chKey(c) === slot) : -1;
    if (slot.startsWith('ch:') && ci < 0) continue;   // 이 곡에 없는 채널의 샘플
    w.chunk('SMPL', p => { if (ci >= 0) { p.u8(0); p.vu(ci); } else { p.u8(1); p.str(slot); } p.str(s.name); p.u8(s.root); const u = new Uint8Array(s.ab); p.vu(u.length); p.raw(u); });
  }
  // 이펙트 칸: [종류(0 채널·1 코드·2 베이스), 채널 번호, 칸 수, (종류·a·b)…]
  const fxKeys = [...song.channels.map((c, i) => [0, i, chKey(c)]), [1, 0, 'chords'], [2, 0, 'bass'], [3, 0, 'master'], [4, 0, 'audio'], [5, 0, 'bus1'], [6, 0, 'bus2']].filter(([, , k]) => song.mix[k] && song.mix[k].fx && song.mix[k].fx.length);
  if (fxKeys.length) w.chunk('FXSL', p => { p.vu(fxKeys.length); for (const [kind, i, k] of fxKeys) { p.u8(kind); p.vu(i); const fx = song.mix[k].fx; p.vu(fx.length); for (const f of fx) { p.u8(mskIdx(MSK_FX, f.type)); p.u8(q8(f.a * 250)); p.u8(q8(f.b * 250)); } } });
  // 자동화: [패턴 번호, 채널 수, (채널 번호, 볼륨 점들, 필터 점들)…]
  const autoP = song.patterns.map((P, pi) => [pi, P]).filter(([, P]) => P.auto && Object.keys(P.auto).length);
  if (autoP.length) w.chunk('AUTO', p => { p.vu(autoP.length); for (const [pi, P] of autoP) { const ent = Object.entries(P.auto).map(([cid, A]) => [song.channels.findIndex(c => c.id === cid), A]).filter(([ci]) => ci >= 0); p.vu(pi); p.vu(ent.length);
    for (const [ci, A] of ent) { p.vu(ci); for (const k of ['vol', 'cut']) { const pts = A[k] || []; p.vu(pts.length); let ps = 0; for (const q of pts) { p.vu(q.s - ps); ps = q.s; p.u8(q8(q.v * 250)); } } } } });
  if (song.audio && song.audio.length) w.chunk('AUDC', p => { p.vu(song.audio.length); for (const a of song.audio) { p.str(a.slot); p.str(a.name); p.u8(a.t); p.vu(a.s); p.vu(Math.round(a.off * 1000)); p.vu(Math.round(a.len * 1000)); p.u8(Math.round(a.gain * 100)); } p.str(JSON.stringify(song.mix.audio || {})); });
  // 피치 벤드: [패턴, 채널, 시작 틱, 음높이, 반음+12]
  const bends = []; song.patterns.forEach((P, pi) => song.channels.forEach((c, ci) => (P.notes[c.id] || []).forEach(n => { if (n.b) bends.push([pi, ci, n.s, n.p, n.b + 12]); })));
  if (bends.length) w.chunk('BEND', p => { p.vu(bends.length); for (const [pi, ci, s, pp, b] of bends) { p.vu(pi); p.vu(ci); p.vu(s); p.u8(pp); p.u8(b); } });
  // 출력(버스) · 버스 설정 · 곡 자동화 (JSON, 채널은 번호로)
  const cix = k => { const i = song.channels.findIndex(c => chKey(c) === k); return i >= 0 ? '#' + i : k; }, outs = {}, busMix = {};
  for (const [k, v] of Object.entries(song.mix)) if (v && v.out) outs[cix(k)] = v.out;
  for (const b of ['bus1', 'bus2']) if (Object.values(outs).includes(b) && song.mix[b]) { const {fx, ...rest} = song.mix[b]; busMix[b] = rest; }
  if (Object.keys(outs).length) w.chunk('ROUT', p => p.str(JSON.stringify({o:outs, b:busMix})));
  if (song.sauto && Object.keys(song.sauto).length) w.chunk('SAUT', p => p.str(JSON.stringify(Object.fromEntries(Object.entries(song.sauto).map(([k, v]) => { const [key, prm] = k.split('|'); return [cix(key) + '|' + prm, v.map(q => [q.s, Math.round(q.v * 1000)])]; })))));
  const fx2 = []; for (const [kind, i, k] of fxKeys) (song.mix[k].fx || []).forEach((f, si) => { if (f.c != null || f.d != null) fx2.push([kind, i, si, q8((f.c == null ? 0.5 : f.c) * 250), q8((f.d == null ? 0.5 : f.d) * 250)]); });
  if (fx2.length) w.chunk('FXX2', p => { p.vu(fx2.length); for (const [kind, i, si, c3, d3] of fx2) { p.u8(kind); p.vu(i); p.u8(si); p.u8(c3); p.u8(d3); } });
  const smp = {}; song.channels.forEach((c, i) => { if (c.smp) smp[i] = c.smp; }); if (Object.keys(smp).length) w.chunk('SMPC', p => p.str(JSON.stringify(smp)));
  const syn = {}; song.channels.forEach((c, i) => { if (c.syn) syn[i] = c.syn; }); if (Object.keys(syn).length) w.chunk('SYNP', p => p.str(JSON.stringify(syn)));
  w.chunk('TEMP', p => p.vu(Math.round(song.bpm * 100)));
  if (song.tempo && song.tempo.length) w.chunk('TMAP', p => { p.vu(song.tempo.length); let pt = 0; for (const x of song.tempo) { p.vu(x.t - pt); pt = x.t; p.vu(Math.round(x.bpm * 100)); } });
  if (keepIds) w.chunk('IDS ', p => { p.vu(song.channels.length); for (const c of song.channels) p.str(c.id); p.vu(song.patterns.length); for (const P of song.patterns) p.str(P.id); });
  const crc = mskCrc(w.b.subarray(0, w.n));   // 여기까지 전체의 지문을 맨 끝에
  w.chunk('CRC ', p => { p.u8(crc & 255); p.u8(crc >>> 8 & 255); p.u8(crc >>> 16 & 255); p.u8(crc >>> 24 & 255); });
  return w.done();
}
const MSK_ZIP = 1, MSK_HASCRC = 2;
const mskFile = (body, flags) => { const out = new Uint8Array(5 + body.length); out.set([77, 83, 75, MSK_VERSION, flags | MSK_HASCRC]); out.set(body, 5); return out; };
// 곡 → .msk 파일 (압축할 수 있으면 압축)
async function encodeMSK(song, name, samples, compress = true) {
  let body = encodeMskBody(song, name, samples, false), flags = 0;
  if (compress) { const z = await mskDeflate(body, false); if (z && z.length < body.length) { body = z; flags |= MSK_ZIP; } }
  return mskFile(body, flags);
}
// 브라우저 안 저장용: 바로(동기로) 만들고, 번호표 포함, 압축 없음
const encodeMskSync = (song, name) => mskFile(encodeMskBody(song, name, {}, true), 0);
function mskHead(u) {
  if (!(u.length >= 5 && u[0] === 77 && u[1] === 83 && u[2] === 75)) throw new Error('MSK 파일이 아니에요');
  if (u[3] > MSK_VERSION) throw new Error(`더 새 버전(${u[3]})의 MSK 파일이에요. 사이트를 새로 고쳐 주세요`);
  return u[4];
}
// .msk 바이트 → {song, name, samples:[{slot, name, root, ab}]}
async function decodeMSK(u) {
  let body = u.subarray(5);
  const f = mskHead(u);
  if (f & MSK_ZIP) { body = await mskDeflate(body, true); if (!body) throw new Error('이 브라우저는 압축된 MSK 파일을 풀 수 없어요'); }
  return decodeMskBody(body, !!(f & MSK_HASCRC));
}
function decodeMskSync(u) { const f = mskHead(u); if (f & MSK_ZIP) throw new Error('압축된 MSK는 decodeMSK로 읽어 주세요'); return decodeMskBody(u.subarray(5), !!(f & MSK_HASCRC)); }
function decodeMskBody(body, needCrc) {
  let ids = null, crcOk = false, plex = null, pcol = null;
  const song = {v:4, channels:[], patterns:[], playlist:{tracks:PL_TRACKS, clips:[]}, mix:{}}, samples = [], clipsTodo = []; let name = '';
  try {
    const r = new MskR(body);
    while (!r.end()) {
      const at = r.i, type = MSK_TD.decode(r.raw(4)), p = new MskR(r.raw(r.vu()));
      if (type === 'CRC ') { const want = (p.u8() | p.u8() << 8 | p.u8() << 16 | p.u8() << 24) >>> 0; if (mskCrc(body.subarray(0, at)) !== want) throw new Error('검사 값이 안 맞아요 — 파일 일부가 바뀌었어요'); crcOk = true; continue; }
      if (type === 'METR') { song.meter = [p.u8(), p.u8()]; song.swing = p.u8() / 100; continue; }
      if (type === 'TEMP') { song.bpm = p.vu() / 100; continue; }
      if (type === 'FXSL') { for (let k = p.vu(); k > 0; k--) { const kind = p.u8(), i = p.vu(), fx = []; for (let n = p.vu(); n > 0; n--) fx.push({type:MSK_FX[p.u8()] || '', a:p.u8() / 250, b:p.u8() / 250}); (song._fx = song._fx || []).push([kind, i, fx]); } continue; }
      if (type === 'AUTO') { for (let k = p.vu(); k > 0; k--) { const pi = p.vu(), ent = []; for (let n = p.vu(); n > 0; n--) { const ci = p.vu(), A = {}; for (const key of ['vol', 'cut']) { const pts = []; let s = 0; for (let j = p.vu(); j > 0; j--) { s += p.vu(); pts.push({s, v:p.u8() / 250}); } if (pts.length) A[key] = pts; } ent.push([ci, A]); } (song._auto = song._auto || []).push([pi, ent]); } continue; }
      if (type === 'AUDC') { song.audio = []; for (let k = p.vu(); k > 0; k--) { const slot = p.str(), name = p.str(), t = p.u8(), s = p.vu(), off = p.vu() / 1000, len = p.vu() / 1000, gain = p.u8() / 100; song.audio.push({id:slot.slice(3), slot, name, t, s, off, len, gain}); } try { song._audioMix = JSON.parse(p.str()); } catch (e) {} continue; }
      if (type === 'FXX2') { song._fx2 = []; for (let k = p.vu(); k > 0; k--) song._fx2.push([p.u8(), p.vu(), p.u8(), p.u8() / 250, p.u8() / 250]); continue; }
      if (type === 'SMPC') { try { song._smp = JSON.parse(p.str()); } catch (e) {} continue; }
      if (type === 'SYNP') { try { song._syn = JSON.parse(p.str()); } catch (e) {} continue; }
      if (type === 'BEND') { song._bend = []; for (let k = p.vu(); k > 0; k--) song._bend.push([p.vu(), p.vu(), p.vu(), p.u8(), p.u8() - 12]); continue; }
      if (type === 'ROUT') { try { song._rout = JSON.parse(p.str()); } catch (e) {} continue; }
      if (type === 'SAUT') { try { song._saut = JSON.parse(p.str()); } catch (e) {} continue; }
      if (type === 'TMAP') { song.tempo = []; let t = 0; for (let k = p.vu(); k > 0; k--) { t += p.vu(); song.tempo.push({t, bpm:p.vu() / 100}); } continue; }
      if (type === 'INFO') {
        name = p.str(); const bpm0 = p.vu(); if (song.bpm == null) song.bpm = bpm0; song.root = p.u8(); song.mode = p.u8() ? 'minor' : 'major'; song.snap = p.u8(); song.len = p.u8(); song.playMode = p.u8() ? 'song' : 'pat';
        song.chordInst = MSK_CHORD[p.u8()] || 'pad'; song.bassMode = MSK_BMODE[p.u8()] || 'off'; song.bassInst = MSK_BINST[p.u8()] || 'reese'; song.kit = MSK_KIT[p.u8()] || 'edm'; song.pat = p.vu(); song.ch = p.vu(); song.chordTone = rTone(p);
      } else if (type === 'CHAN') {
        for (let k = p.vu(); k > 0; k--) {
          const kind = p.u8() ? 'drum' : 'synth', ii = p.u8(), c = newChannel(kind, kind === 'drum' ? DRUMS[ii] || 'kick' : MSK_INST[ii] || 'piano', p.str());
          c.tone = rTone(p); song.mix[chKey(c)] = rMix(p); song.channels.push(c);
        }
      } else if (type === 'FXCH') {
        song.mix.chords = rMix(p); song.mix.bass = rMix(p); song.mix.master = {v:p.u8() / 200, sc:p.u8() / 200, size:p.u8()};
      } else if (type === 'PATN') {
        const P = newPattern(p.str(), p.vu()); P.chords = Array(P.bars * BEATS).fill(null);
        let i = -1; for (let k = p.vu(); k > 0; k--) { i += p.vu() + 1; const b = p.u8(); if (i < P.chords.length) P.chords[i] = b === 255 ? {x:1} : {r:b >> 4, q:MSK_Q[b & 15] || ''}; }
        for (let k = p.vu(); k > 0; k--) {
          const c = song.channels[p.vu()], arr = []; let s = 0;
          for (let m = p.vu(); m > 0; m--) { s += p.vu(); arr.push({p:p.u8(), s, l:p.vu(), v:p.u8() / 250}); }
          if (c) P.notes[c.id] = arr;
        }
        song.patterns.push(P);
      } else if (type === 'PLST') {
        song.playlist.tracks = p.vu(); let bar = 0;
        for (let k = p.vu(); k > 0; k--) { const pi = p.vu(), t = p.u8(); bar += p.vu(); clipsTodo.push({pi, t, bar}); }
      } else if (type === 'SMPL') {
        const kind = p.u8(), key = kind === 0 ? p.vu() : p.str(), nm = p.str(), root = p.u8(), bytes = p.raw(p.vu());
        samples.push({key, byIndex:kind === 0, name:nm, root, ab:bytes.slice().buffer});
      } else if (type === 'PLEX') { plex = []; for (let k = p.vu(); k > 0; k--) plex.push([p.vu(), p.vu()]);
      } else if (type === 'PCOL') { pcol = []; for (let k = p.vu(); k > 0; k--) pcol.push(p.u8());
      } else if (type === 'IDS ') {
        ids = {ch:[], pat:[]}; for (let k = p.vu(); k > 0; k--) ids.ch.push(p.str()); for (let k = p.vu(); k > 0; k--) ids.pat.push(p.str());
      }
      // 모르는 청크는 건너뜀
    }
    if (needCrc && !crcOk) throw new Error('검사 값(CRC 청크)이 없어요');
  } catch (e) { throw new Error('MSK 파일이 망가졌어요 (' + e.message + ')'); }
  if (ids) {   // 저장해 둔 번호표로 되돌림 (믹서·음·샘플 칸이 번호표로 이어져 있어서)
    song.channels.forEach((c, i) => { const id = ids.ch[i]; if (!id || id === c.id) return;
      song.mix[chKey({id})] = song.mix[chKey(c)]; delete song.mix[chKey(c)];
      for (const P of song.patterns) if (P.notes[c.id]) { P.notes[id] = P.notes[c.id]; delete P.notes[c.id]; }
      c.id = id; });
    song.patterns.forEach((P, i) => { if (ids.pat[i]) P.id = ids.pat[i]; });
  }
  if (pcol) song.patterns.forEach((P, i) => { if (pcol[i]) P.color = pcol[i]; });
  for (const [kind, i, fx] of song._fx || []) { const k = kind === 0 ? (song.channels[i] ? chKey(song.channels[i]) : null) : [null, 'chords', 'bass', 'master', 'audio', 'bus1', 'bus2'][kind]; if (k) song.mix[k] = {...(song.mix[k] || {}), fx}; }
  for (const [pi, ent] of song._auto || []) { const P = song.patterns[pi]; if (!P) continue; P.auto = {}; for (const [ci, A] of ent) if (song.channels[ci]) P.auto[song.channels[ci].id] = A; }
  if (song._audioMix) song.mix.audio = {...(song.mix.audio || {}), ...song._audioMix};
  const kOf = k => k[0] === '#' ? (song.channels[+k.slice(1)] ? chKey(song.channels[+k.slice(1)]) : null) : k;
  for (const [pi, ci, s, pp, b] of song._bend || []) { const P = song.patterns[pi], c = song.channels[ci], n = P && c && (P.notes[c.id] || []).find(x => x.s === s && x.p === pp); if (n) n.b = b; }
  if (song._rout) { for (const [k, o] of Object.entries(song._rout.o || {})) { const key = kOf(k); if (key) song.mix[key] = {...(song.mix[key] || {}), out:o}; } for (const [b, v] of Object.entries(song._rout.b || {})) song.mix[b] = {...(song.mix[b] || {}), ...v}; }
  if (song._saut) { song.sauto = {}; for (const [k, v] of Object.entries(song._saut)) { const [key, prm] = k.split('|'), kk = kOf(key); if (kk) song.sauto[kk + '|' + prm] = v.map(([s, vv]) => ({s, v:vv / 1000})); } }
  for (const [i, v] of Object.entries(song._syn || {})) if (song.channels[+i]) song.channels[+i].syn = v; delete song._syn;
  for (const [i, v] of Object.entries(song._smp || {})) if (song.channels[+i]) song.channels[+i].smp = v; delete song._smp;
  for (const [kind, i, si, c3, d3] of song._fx2 || []) { const k = kind === 0 ? (song.channels[i] ? chKey(song.channels[i]) : null) : [null, 'chords', 'bass', 'master', 'audio', 'bus1', 'bus2'][kind]; const f = k && song.mix[k] && (song.mix[k].fx || [])[si]; if (f) { f.c = c3; f.d = d3; } } delete song._fx2;
  delete song._fx; delete song._auto; delete song._audioMix; delete song._bend; delete song._rout; delete song._saut;
  clipsTodo.forEach((c, i) => { const P = song.patterns[c.pi]; if (!P) return; const o = {id:newId(), pat:P.id, t:c.t, bar:c.bar}; if (plex && plex[i]) { if (plex[i][0]) o.len = plex[i][0]; if (plex[i][1]) o.off = plex[i][1]; } song.playlist.clips.push(o); });
  const out = normalize(song);
  return {song:out, name, samples:samples.map(s => ({slot:s.byIndex ? (out.channels[s.key] ? chKey(out.channels[s.key]) : null) : s.key, name:s.name, root:s.root, ab:s.ab})).filter(s => s.slot)};
}
// 곡 코드: 글로 주고받을 수 있게 MSK 바이트를 글자로 (MSK1. + base64url)
function mskToCode(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return 'MSK1.' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function codeToMsk(t) {
  const m = /^MSK\d*\.([A-Za-z0-9_\-\s]+)$/.exec(t.trim()); if (!m) throw new Error('곡 코드 모양이 아니에요');
  let b = m[1].replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
  const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u;
}

// ─ 형식 자동 인식: 파일 이름이 아니라 내용(앞부분 바이트)을 스캔 ─
const FORMAT_NAME = {msk:'MSK', code:'곡 코드', midi:'MIDI', json:'프로젝트(.json)', score:'악보(.txt)'};
function sniffFormat(u) {
  if (u.length >= 5 && u[0] === 77 && u[1] === 83 && u[2] === 75 && u[3] < 32) return 'msk';            // 'MSK' + 버전 번호
  if (u.length >= 4 && u[0] === 0x4d && u[1] === 0x54 && u[2] === 0x68 && u[3] === 0x64) return 'midi'; // 'MThd'
  const t = new TextDecoder().decode(u.subarray(0, 4096)).replace(/^\uFEFF/, '').trimStart();
  if (/^MSK\d*\.[A-Za-z0-9_\-]/.test(t)) return 'code';
  if (t.startsWith('{')) return 'json';
  if (/^#\s*멜로디 스케치패드 악보|^\s*\[(채널|패턴|플레이리스트)|^\s*(BPM|제목|조)\s*[:：]/m.test(t)) return 'score';
  return 'unknown';
}
// 어떤 형식이든 곡으로: File, Uint8Array, 또는 글
async function loadAny(src, fallbackName) {
  const u = typeof src === 'string' ? new TextEncoder().encode(src) : src instanceof Uint8Array ? src : new Uint8Array(await src.arrayBuffer());
  const kind = sniffFormat(u), name0 = (fallbackName || (src && src.name) || '불러온 곡').replace(/\.[^.]+$/, '');
  const text = () => new TextDecoder().decode(u).replace(/^\uFEFF/, '');
  if (kind === 'msk' || kind === 'code') { const r = await decodeMSK(kind === 'msk' ? u : codeToMsk(text())); return {song:r.song, name:r.name || name0, from:FORMAT_NAME[kind], samples:r.samples, warnings:[]}; }
  if (kind === 'midi') { const r = midiToSong(u.slice().buffer); return {song:r.song, name:name0, from:'MIDI', samples:[], warnings:[], info:r.info}; }
  if (kind === 'json') {
    const raw = JSON.parse(text()), s = raw && raw.app === 'melody-sketchpad' ? raw.song : raw;
    if (!s || !(s.notes || s.tracks || s.channels)) throw new Error('스케치패드 프로젝트 파일이 아니에요');
    const samples = Object.entries(raw.samples || {}).map(([slot, v]) => ({slot, name:v.name, root:v.root || 60, ab:b64ab(v.b64)}));
    return {song:normalize(s), name:raw.name || name0, from:FORMAT_NAME.json, samples, warnings:[]};
  }
  if (kind === 'score') { const r = parseScore(text()); return {song:r.song, name:r.title || name0, from:FORMAT_NAME.score, samples:[], warnings:r.warnings}; }
  throw new Error('무슨 형식인지 알 수 없어요 (MSK · 곡 코드 · MIDI · 프로젝트 · 악보를 읽을 수 있어요)');
}
// 불러온 곡을 새 프로젝트로 열고, 담겨 있던 내 샘플도 설치
async function openLoaded(r) {
  openAsProject(r.song, r.name); let n = 0;
  for (const s of r.samples || []) { try { SAMPLES[s.slot] = {buf:await decode(s.ab), root:s.root, name:s.name}; await idbPut(s.slot, {ab:s.ab, root:s.root, name:s.name}); n++; } catch (e) {} }
  if (n) { buildMixer(); buildBrowser(); }
  return n;
}
// 지금 곡에 쓰이는 내 샘플 모으기 (채널 샘플 + 예전 공용 칸)
async function songSamples(song) {
  const all = await idbAll(), keys = new Set([...song.channels.map(chKey), ...(song.audio || []).map(a => a.slot)]), out = {};
  for (const [k, v] of Object.entries(all)) if (v && v.ab && !k.endsWith(':orig') && (keys.has(k) || !(k.startsWith('ch:') || k.startsWith('au:')))) out[k] = v;   // 오디오 클립 소리는 이 곡이 쓰는 것만
  return out;
}

// ─ 브라우저 안(내 프로젝트) 저장: MSK 곡 코드로 → JSON보다 훨씬 작아서 곡을 많이 저장할 수 있어요 ─
function songToStore(song) { try { return mskToCode(encodeMskSync(song, '')); } catch (e) { return JSON.stringify(song); } }
function songFromStore(v) {
  if (!v) return null;
  if (v.startsWith('MSK')) return decodeMskSync(codeToMsk(v)).song;
  return normalize(JSON.parse(v));   // 예전(JSON)으로 저장된 곡
}
