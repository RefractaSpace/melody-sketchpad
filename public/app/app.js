/* 멜로디 스케치패드 — 읽기 쉬운 원본은 src/js/ (src/index.html과 똑같이 동작하도록 감싸지 않고 순서대로 합침) */
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
  if (/^#\s*(멜로디 스케치패드 악보|Melody Sketchpad score)|^\s*\[(채널|패턴|플레이리스트|Channels|Pattern|Playlist)|^\s*(BPM|제목|조)\s*[:：]/m.test(t)) return 'score';
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
  throw new Error(LANG === 'en' ? "Can't tell what format this is (MSK · song code · MIDI · project · score are supported)" : '무슨 형식인지 알 수 없어요 (MSK · 곡 코드 · MIDI · 프로젝트 · 악보를 읽을 수 있어요)');
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

/* 01-core.js — 공통 상수 · 곡 데이터 · 저장
   곡 데이터 S (버전 4, FL Studio식)
   - channels: [{id, name, kind:'synth'|'drum', inst, tone}]   ← 채널 랙의 한 줄
       synth: inst = piano·epiano·supersaw·pluck·chip·bell·sample / drum: inst = kick·snare·hat·clap
   - patterns: [{id, name, bars, notes:{채널id:[{p,s,l,v}]}, chords:[박마다]}]   ← 짧은 조각
       드럼 채널의 스텝도 음(높이 72)으로 저장 → 피아노 롤·세기 편집이 똑같이 됨
   - playlist: {tracks, clips:[{id, pat:패턴id, t:줄, bar:시작 마디}]}   ← 곡 구성
   - mode: 'pat'(패턴 반복) | 'song'(플레이리스트 재생), pat/ch: 편집 중인 패턴·채널 번호
   - mix: 채널 키('ch:<id>', 'chords', 'bass')마다 설정 + master */
const $ = id => document.getElementById(id);
const PPQ = 48, LOW = 24, HIGH = 108;                // 한 박 = 48틱, 건반 C1~C8 (서브 베이스부터 첼레스타까지)
const KEYW = 64, RULER = 24;
const ZX_LEVELS = [0.75, 1, 1.5, 2, 3, 4], RH_LEVELS = [14, 17, 20, 24, 28];
let zxi = 3, rhi = 2, TICKPX = ZX_LEVELS[zxi], ROWH = RH_LEVELS[rhi];
const LANE_H = 28, CHORD_H = 34, VEL_H = 60, LANES_H = CHORD_H + VEL_H;
const MAX_BARS = 128, MAX_PAT_BARS = 32, DRUM_PITCH = 72, PL_TRACKS = 10;
// 박자표: 한 마디 틱 BAR_T · 코드 칸 BEATS(4분음표) · 스텝 STEPS(16분음표). 정리·불러오기 중에는 METER_OV로 그 곡 박자를 씀
const METERS = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [6, 8], [12, 8]];
let METER_OV = null;
const meterOf = s => { const m = (s && s.meter) || [4, 4]; return METERS.some(x => x[0] === m[0] && x[1] === m[1]) ? m : [4, 4]; };
const barTicksOf = m => m[0] * PPQ * 4 / m[1];
// S가 아직 만들어지는 중(시작할 때 저장된 곡을 푸는 동안)이면 읽지 않음 — 읽으면 오류가 나서 빈 곡으로 대체돼요
function curSongOrNull() { try { return S; } catch (e) { return null; } }
Object.defineProperty(window, 'BAR_T', {get:() => barTicksOf(METER_OV || meterOf(curSongOrNull()))});
Object.defineProperty(window, 'BEATS', {get:() => BAR_T / PPQ});
Object.defineProperty(window, 'STEPS', {get:() => BAR_T / 12});
const SYN_DEF = {w1:'sawtooth', w2:'square', oct2:0, det:8, mix:0.35, sub:0, uni:1, spread:15, cut:0.72, res:0.15, fenv:0.3, fdec:0.25, atk:0.005, dec:0.25, sus:0.7, rel:0.25, lfoRate:5, lfoAmt:0, lfoTo:'cut', vol:0.7,
  fm:0, wt:0.5, m1s:'none', m1d:'cut', m1a:0, m2s:'none', m2d:'pitch', m2a:0};   // fm: 발진기2가 1의 주파수를 흔듦 · wt: 웨이브테이블 위치 · m1/m2: 모드 매트릭스(출처·대상·양)
const SYN_PRESETS = {
  '리드':  {w1:'sawtooth', w2:'sawtooth', det:12, mix:0.5, uni:3, spread:18, cut:0.7, res:0.2, fenv:0.35, fdec:0.3, atk:0.005, dec:0.3, sus:0.75, rel:0.2},
  '패드':  {w1:'sawtooth', w2:'triangle', det:6, mix:0.5, uni:3, spread:28, cut:0.52, res:0.1, fenv:0.1, fdec:0.8, atk:0.6, dec:0.5, sus:0.9, rel:1.2, lfoRate:0.4, lfoAmt:0.25, lfoTo:'cut'},
  '베이스': {w1:'sawtooth', w2:'square', oct2:-1, det:3, mix:0.3, sub:0.6, uni:1, cut:0.36, res:0.3, fenv:0.5, fdec:0.15, atk:0.003, dec:0.3, sus:0.6, rel:0.1},
  '플럭':  {w1:'square', w2:'sawtooth', det:5, mix:0.4, uni:1, cut:0.3, res:0.35, fenv:0.8, fdec:0.12, atk:0.002, dec:0.25, sus:0, rel:0.2},
  '브라스': {w1:'sawtooth', w2:'sawtooth', det:6, mix:0.5, uni:2, spread:10, cut:0.45, res:0.1, fenv:0.5, fdec:0.35, atk:0.06, dec:0.3, sus:0.8, rel:0.2, lfoRate:5.5, lfoAmt:0.05, lfoTo:'pitch'}
};
const SYN_WAVES = [['sawtooth', '톱니'], ['square', '사각'], ['triangle', '삼각'], ['sine', '사인'], ['table', '웨이브테이블']];
const MOD_SRC = [['none', '없음'], ['lfo', 'LFO'], ['env', '엔벨로프'], ['vel', '세기']], MOD_DST = [['cut', '필터'], ['pitch', '음높이'], ['vol', '볼륨'], ['fm', 'FM 양']];
const normSyn = o => { const s = {...SYN_DEF, ...(o || {})}, out = {};
  for (const [k, v] of Object.entries(SYN_DEF)) out[k] = typeof v === 'number' ? (isFinite(+s[k]) ? +s[k] : v) : String(s[k]);
  if (!SYN_WAVES.some(w => w[0] === out.w1)) out.w1 = 'sawtooth'; if (!SYN_WAVES.some(w => w[0] === out.w2)) out.w2 = 'square'; if (!['cut', 'pitch', 'vol'].includes(out.lfoTo)) out.lfoTo = 'cut';
  for (const k of ['m1s', 'm2s']) if (!MOD_SRC.some(x => x[0] === out[k])) out[k] = 'none'; for (const k of ['m1d', 'm2d']) if (!MOD_DST.some(x => x[0] === out[k])) out[k] = 'cut';
  out.fm = clamp(out.fm, 0, 1); out.wt = clamp(out.wt, 0, 1); out.m1a = clamp(out.m1a, -1, 1); out.m2a = clamp(out.m2a, -1, 1);
  out.uni = clamp(Math.round(out.uni), 1, 3); out.oct2 = clamp(Math.round(out.oct2), -1, 1); return out; };
// 샘플러 설정: 구간 반복(loop, ls~le 비율) · 조각(slices개로 나눠 C4부터 건반마다 한 조각)
const SMP_DEF = {loop:false, ls:0, le:1, slices:0};
const normSmp = o => { const s = {...SMP_DEF, ...(o || {})}; return {loop:!!s.loop, ls:clamp(+s.ls || 0, 0, 0.99), le:clamp(+s.le || 1, 0.01, 1), slices:[0, 4, 8, 16].includes(+s.slices) ? +s.slices : 0}; };
const SA_PARAMS = ['vol', 'cut', 'pan', 'rev', 'dly', 'fx1', 'fx2', 'fx3', 'fx4', 'fx5'];
const PAT_COLORS = ['', '#7b95e0', '#e08476', '#72c79f', '#dcb65e', '#b287e0', '#62bccd', '#dc86b4'];   // 0 = 색 없음
const NAMES_S = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NAMES_F = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const MAJ = [0,2,4,5,7,9,11], MIN = [0,2,3,5,7,8,10];
const QUAL = {'':[0,4,7], 'm':[0,3,7], '7':[0,4,7,10], 'maj7':[0,4,7,11], 'm7':[0,3,7,10], 'sus4':[0,5,7], 'dim':[0,3,6], 'aug':[0,4,8]};
const QNAME = {'':'장', 'm':'단', '7':'7', 'maj7':'maj7', 'm7':'m7', 'sus4':'sus4', 'dim':'dim', 'aug':'aug'};
const DRUMS = ['kick', 'snare', 'hat', 'clap', 'crash'];   // 뒤에만 덧붙이기 (MSK 번호표)
const DRUM_NAME = {kick:'킥', snare:'스네어', hat:'하이햇', clap:'박수', crash:'크래시'};
const INSTS = {piano:'피아노', synth:'신스', epiano:'일렉트릭 피아노', strings:'스트링 패드', celesta:'첼레스타', harp:'하프', bass:'서브 베이스', timpani:'팀파니', supersaw:'슈퍼소', pluck:'플럭', chip:'칩튠', bell:'벨', sample:'내 샘플', kit:'드럼 키트', violin:'바이올린', viola:'비올라', cello:'첼로', contrabass:'콘트라베이스', flute:'플루트', clarinet:'클라리넷', oboe:'오보에', bassoon:'바순', trumpet:'트럼펫', horn:'프렌치 호른', trombone:'트롬본', tuba:'튜바', marimba:'마림바', glock:'글로켄슈필', xylo:'실로폰', gm0:'그랜드 피아노', gm1:'밝은 피아노', gm2:'일렉트릭 그랜드', gm3:'혼키통크 피아노', gm4:'일렉트릭 피아노 1', gm5:'일렉트릭 피아노 2', gm6:'하프시코드', gm7:'클라비넷', gm8:'첼레스타 (GM)', gm9:'글로켄슈필 (GM)', gm10:'뮤직박스', gm11:'비브라폰', gm12:'마림바 (GM)', gm13:'실로폰 (GM)', gm14:'관 종', gm15:'덜시머', gm16:'드로바 오르간', gm17:'퍼커시브 오르간', gm18:'록 오르간', gm19:'교회 오르간', gm20:'리드 오르간', gm21:'아코디언', gm22:'하모니카', gm23:'탱고 아코디언', gm24:'나일론 기타', gm25:'스틸 기타', gm26:'재즈 기타', gm27:'클린 기타', gm28:'뮤트 기타', gm29:'오버드라이브 기타', gm30:'디스토션 기타', gm31:'기타 하모닉스', gm32:'어쿠스틱 베이스', gm33:'핑거 베이스', gm34:'픽 베이스', gm35:'프렛리스 베이스', gm36:'슬랩 베이스 1', gm37:'슬랩 베이스 2', gm38:'신스 베이스 1', gm39:'신스 베이스 2', gm40:'바이올린 솔로', gm41:'비올라 솔로', gm42:'첼로 솔로', gm43:'콘트라베이스 솔로', gm44:'트레몰로 현악', gm45:'피치카토 현악', gm46:'오케스트라 하프', gm47:'팀파니 (GM)', gm48:'현악 앙상블 1', gm49:'현악 앙상블 2', gm50:'신스 현악 1', gm51:'신스 현악 2', gm52:'합창 아', gm53:'목소리 우', gm54:'합성 목소리', gm55:'오케스트라 히트', gm56:'트럼펫 솔로', gm57:'트롬본 솔로', gm58:'튜바 솔로', gm59:'뮤트 트럼펫', gm60:'프렌치 호른 솔로', gm61:'브라스 섹션', gm62:'신스 브라스 1', gm63:'신스 브라스 2', gm64:'소프라노 색소폰', gm65:'알토 색소폰', gm66:'테너 색소폰', gm67:'바리톤 색소폰', gm68:'오보에 솔로', gm69:'잉글리시 호른', gm70:'바순 솔로', gm71:'클라리넷 솔로', gm72:'피콜로', gm73:'플루트 솔로', gm74:'리코더', gm75:'팬 플루트', gm76:'병 불기', gm77:'샤쿠하치', gm78:'휘파람', gm79:'오카리나', gm80:'스퀘어 리드', gm81:'톱니 리드', gm82:'캘리오페', gm83:'치프', gm84:'차랑', gm85:'목소리 리드', gm86:'5도 리드', gm87:'베이스+리드', gm88:'판타지아 패드', gm89:'웜 패드', gm90:'폴리신스 패드', gm91:'합창 패드', gm92:'보우드 패드', gm93:'메탈릭 패드', gm94:'헤일로 패드', gm95:'스위프 패드', gm96:'레인', gm97:'사운드트랙', gm98:'크리스털', gm99:'분위기', gm100:'브라이트니스', gm101:'고블린', gm102:'에코', gm103:'공상과학', gm104:'시타르', gm105:'밴조', gm106:'샤미센', gm107:'코토', gm108:'칼림바', gm109:'백파이프', gm110:'피들', gm111:'샤나이', gm112:'팅클 벨', gm113:'아고고', gm114:'스틸 드럼', gm115:'우드블록', gm116:'타이코 북', gm117:'멜로딕 톰', gm118:'신스 드럼', gm119:'리버스 심벌', gm120:'기타 프렛 노이즈', gm121:'숨소리', gm122:'해변', gm123:'새소리', gm124:'전화벨', gm125:'헬리콥터', gm126:'박수', gm127:'총소리', pianoPro:'그랜드 피아노 Pro', pianoMax:'그랜드 피아노 Max'};
const KITS_OK = ['edm', '808', 'hard', 'acoustic'];
const FIXED_CH = ['chords', 'bass', 'audio', 'bus1', 'bus2'];
// 화면에 보일 이름 — 영어일 때는 t()로 바꿔 준다 (정의는 한국어 원문 그대로)
const nameOf = v => (typeof t === 'function' ? t(v) : v);
const CH_NAME = {chords:'코드', bass:'베이스', audio:'오디오 클립', bus1:'버스 1', bus2:'버스 2', master:'마스터', kick:'킥', snare:'스네어', hat:'하이햇', clap:'박수'};
const MIX_DEF = {chords:{v:.85,pan:0,rev:.3,dly:0,sc:true}, bass:{v:.45,pan:0,rev:0,dly:0,sc:true}, audio:{v:.9,pan:0,rev:.08,dly:0,sc:false}, bus1:{v:.9,pan:0,rev:0,dly:0,sc:false}, bus2:{v:.9,pan:0,rev:0,dly:0,sc:false}};
const DRUM_MIX = {kick:{v:.6,pan:0,rev:0,dly:0,sc:false}, snare:{v:.7,pan:0,rev:.18,dly:0,sc:false}, hat:{v:.45,pan:.15,rev:.05,dly:0,sc:false}, clap:{v:.6,pan:-.1,rev:.25,dly:0,sc:false}, crash:{v:.4,pan:.2,rev:.3,dly:0,sc:false}};
const TRACK_MIX_DEF = {v:1, pan:0, rev:.22, dly:.18, sc:true};
const MASTER_DEF = {v:.85, sc:.5, size:2};
const STORE = 'melody-sketchpad-v1', LIB = 'melody-sketchpad-library', PK = id => 'melody-sketchpad-proj-' + id;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const toneDefault = () => ({br:1, atk:0, rel:0.25});
const chKey = c => 'ch:' + c.id;
const trackKey = chKey;   // 예전 이름 호환
function newChannel(kind, inst, name) { return {id:newId(), kind, inst, name:name || (kind === 'drum' ? DRUM_NAME[inst] : INSTS[inst]), tone:toneDefault()}; }
function newPattern(name, bars) { return {id:newId(), name, bars:bars || 4, notes:{}, chords:Array((bars || 4) * 4).fill(null)}; }
function chDefault(key, ch) {
  const d = key.startsWith('ch:') ? (ch && ch.kind === 'drum' ? DRUM_MIX[ch.inst] : TRACK_MIX_DEF) : MIX_DEF[key];
  return {...(d || TRACK_MIX_DEF), lo:0, mid:0, hi:0, mute:0, solo:0};
}
function blank() {
  const ch = [newChannel('synth', 'piano', '피아노'), newChannel('drum', 'kick'), newChannel('drum', 'clap'), newChannel('drum', 'hat'), newChannel('drum', 'snare')];
  const p = newPattern('Pattern 1', 4);
  const s = {v:4, bpm:150, root:5, mode:'minor', snap:12, len:24, channels:ch, patterns:[p], pat:0, ch:0, playMode:'pat', tempo:[],
    playlist:{tracks:PL_TRACKS, clips:[{id:newId(), pat:p.id, t:0, bar:0}]},
    chordInst:'pad', chordTone:{br:1, atk:0.15, rel:0.5}, bassMode:'off', bassInst:'reese', kit:'edm', mix:{}};
  fillMix(s); return s;
}
function fillMix(s) {
  const m = s.mix || {}, out = {};
  for (const c of s.channels) out[chKey(c)] = {...chDefault(chKey(c), c), ...(m[chKey(c)] || {})};
  for (const k of FIXED_CH) out[k] = {...chDefault(k), ...(m[k] || {})};
  for (const k of Object.keys(out)) { if (['bus1', 'bus2'].includes(out[k].out) && !['bus1', 'bus2', 'master'].includes(k)) {} else delete out[k].out; }
  const normFx = fx => (Array.isArray(fx) ? fx : []).filter(f => f && ['comp', 'dist', 'lpf', 'hpf', 'chorus', 'reverb', 'delay', 'eq', 'width', 'eq4', 'gate'].includes(f.type)).slice(0, 5).map(f => { const o = {type:f.type, a:clamp(+f.a || 0, 0, 1), b:clamp(+f.b || 0, 0, 1)}; if (f.c != null) o.c = clamp(+f.c, 0, 1); if (f.d != null) o.d = clamp(+f.d, 0, 1); return o; });
  for (const k of Object.keys(out)) out[k].fx = normFx(out[k].fx);
  out.master = {...MASTER_DEF, ...(m.master || {})}; out.master.fx = normFx(out.master.fx);
  s.mix = out;
}
const normNote = n => { const o = {p:n.p | 0, s:n.s | 0, l:n.l | 0, v:clamp(n.v == null ? 0.8 : +n.v, 0.05, 1)}, b = clamp(Math.round(+n.b || 0), -12, 12); if (b) o.b = b; return o; };   // b = 피치 벤드(반음)
const okNote = n => n && n.p >= LOW && n.p <= HIGH && n.s >= 0 && n.l > 0;
const normChord = c => c ? (c.x ? {x:1} : {r:clamp(c.r | 0, 0, 11), q:QUAL[c.q] ? c.q : ''}) : null;

// 버전 3(트랙 + 드럼 칸)까지의 곡을 버전 4(채널 + 패턴 + 플레이리스트)로 바꿈
function toV4(s) {
  if (!Array.isArray(s.tracks)) {   // 버전 2 이하: 멜로디 하나
    s = {...s, tracks:[{id:newId(), name:'멜로디 1', inst:s.inst === 'lead' ? 'supersaw' : (s.inst || 'piano'), notes:s.notes || [], tone:(s.tone && s.tone.melody) || toneDefault()}]};
    if (s.mix && s.mix.melody) s.mix = {...s.mix, ['trk:' + s.tracks[0].id]:s.mix.melody};
    if (s.tone && s.tone.chords) s.chordTone = s.tone.chords;
  }
  const bars = clamp(s.bars | 0 || 8, 1, MAX_BARS), old = s.mix || {};
  const oldBar = !s.v || s.v < 3, ch = s.chords || [];
  const p = newPattern('Pattern 1', bars);
  p.chords = Array.from({length:bars * BEATS}, (_, i) => normChord(oldBar ? (i % 4 === 0 ? ch[i / 4] : null) : ch[i]));
  const channels = [], mix = {};
  for (const t of s.tracks) { const c = {id:t.id || newId(), kind:'synth', inst:INSTS[t.inst] ? t.inst : 'piano', name:t.name || '멜로디', tone:{...toneDefault(), ...(t.tone || {})}}; channels.push(c); p.notes[c.id] = t.notes || []; if (old['trk:' + t.id]) mix[chKey(c)] = old['trk:' + t.id]; }
  for (const d of DRUMS) {
    const c = newChannel('drum', d); channels.push(c); if (old[d]) mix[chKey(c)] = old[d];
    const a = (s.drums && s.drums[d]) || []; p.notes[c.id] = [];
    a.forEach((v, i) => { v = v === true ? 1 : +v || 0; if (v > 0) p.notes[c.id].push({p:DRUM_PITCH, s:i * 12, l:12, v:clamp(v, 0.05, 1)}); });
  }
  for (const k of FIXED_CH) if (old[k]) mix[k] = old[k];
  if (old.master) mix.master = old.master;
  return {v:4, bpm:s.bpm, root:s.root, mode:s.mode, snap:s.snap, len:s.len, channels, patterns:[p], pat:0, ch:0, playMode:'pat',
    playlist:{tracks:PL_TRACKS, clips:[{id:newId(), pat:p.id, t:0, bar:0}]},
    chordInst:s.chordInst, chordTone:s.chordTone, bassMode:s.bassMode, bassInst:s.bassInst, kit:s.kit, mix};
}
const NOTE_RANGE = () => `${NAMES_S[LOW % 12]}${Math.floor(LOW / 12) - 1}~${NAMES_S[HIGH % 12]}${Math.floor(HIGH / 12) - 1}`;
function normalize(s) { const keep = METER_OV; METER_OV = meterOf(s); try { const r = normalizeRaw(s) || s; r.meter = METER_OV.slice(); r.swing = clamp(+r.swing || 0, 0, 1); return r; } finally { METER_OV = keep; } }
function normalizeRaw(s) {
  s = s && s.v >= 4 ? {...s} : toV4(s || {});
  const b = blank();
  s = {...b, ...s, v:4};
  const seen = new Set();
  s.channels = (s.channels || []).filter(c => c && (c.kind === 'drum' ? DRUMS.includes(c.inst) : true)).map(c => {
    let id = c.id || newId(); if (seen.has(id)) id = newId(); seen.add(id);
    const kind = c.kind === 'drum' ? 'drum' : 'synth';
    return {id, kind, inst:kind === 'drum' ? c.inst : (INSTS[c.inst] ? c.inst : 'piano'), name:(c.name || (kind === 'drum' ? DRUM_NAME[c.inst] : INSTS[c.inst]) || '채널').slice(0, 24), tone:{...toneDefault(), ...(c.tone || {})}, ...(c.syn || (INSTS[c.inst] && c.inst === 'synth') ? {syn:normSyn(c.syn)} : {}), ...(c.smp ? {smp:normSmp(c.smp)} : {})};
  });
  if (!s.channels.length) s.channels = b.channels;
  const ids = new Set(s.channels.map(c => c.id));
  s.patterns = (s.patterns || []).map((p, i) => {
    const bars = clamp(p.bars | 0 || 4, 1, MAX_BARS), lim = bars * BAR_T, notes = {};
    for (const [cid, arr] of Object.entries(p.notes || {})) if (ids.has(cid)) notes[cid] = (arr || []).filter(okNote).map(normNote).filter(n => n.s < lim).map(n => ({...n, l:Math.min(n.l, lim - n.s)}));
    const auto = {};   // 자동화: {채널id: {vol:[{s,v}], cut:[{s,v}]}} — 점은 패턴 끝(lim)까지 허용
    for (const [cid, A] of Object.entries(p.auto || {})) { if (!ids.has(cid) || !A) continue; const o = {};
      for (const k of ['vol', 'cut']) { const mp = new Map(); for (const x of A[k] || []) { const t = Math.round(+x.s || 0); if (t >= 0 && t <= lim) mp.set(t, clamp(+x.v || 0, 0, 1)); } if (mp.size) o[k] = [...mp].sort((a, b) => a[0] - b[0]).map(([s, v]) => ({s, v})); }
      if (Object.keys(o).length) auto[cid] = o; }
    return {id:p.id || newId(), name:(p.name || 'Pattern ' + (i + 1)).slice(0, 24), bars, notes, auto, chords:Array.from({length:bars * BEATS}, (_, k) => normChord((p.chords || [])[k])), color:clamp(p.color | 0, 0, PAT_COLORS.length - 1)};
  });
  if (!s.patterns.length) s.patterns = [newPattern('Pattern 1', 4)];
  const pids = new Set(s.patterns.map(p => p.id));
  const pl = s.playlist || {};
  s.playlist = {tracks:clamp(pl.tracks | 0 || PL_TRACKS, 4, 20), clips:(pl.clips || []).filter(c => c && pids.has(c.pat)).map(c => {
    const P = s.patterns.find(p => p.id === c.pat), o = {id:c.id || newId(), pat:c.pat, t:clamp(c.t | 0, 0, 19), bar:clamp(c.bar | 0, 0, MAX_BARS - 1)};
    const off = clamp(c.off | 0, 0, P.bars - 1), len = clamp(c.len | 0 || P.bars - off, 1, MAX_BARS - o.bar);
    if (off) o.off = off; if (len !== P.bars || off) o.len = len;   // 기본(패턴 그대로)이면 적지 않음
    return o; })};
  s.pat = clamp(s.pat | 0, 0, s.patterns.length - 1); s.ch = clamp(s.ch | 0, 0, s.channels.length - 1);
  s.playMode = s.playMode === 'song' ? 'song' : 'pat';
  // 곡 자동화: {"대상|값": [{s:곡 틱, v:0~1}]}
  { const ok = new Set([...s.channels.map(chKey), ...FIXED_CH, 'master']), sa = {};
    for (const [k, pts] of Object.entries(s.sauto || {})) { const [key, prm] = k.split('|'); if (!ok.has(key) || !SA_PARAMS.includes(prm) || !Array.isArray(pts)) continue;
      const mp = new Map(); for (const q of pts) { const t = Math.round(+q.s || 0); if (t >= 0 && t <= MAX_BARS * BAR_T) mp.set(t, clamp(+q.v || 0, 0, 1)); } if (mp.size) sa[k] = [...mp].sort((a, b) => a[0] - b[0]).map(([s2, v]) => ({s:s2, v})); }
    s.sauto = sa; }
  s.audio = (Array.isArray(s.audio) ? s.audio : []).filter(a => a && typeof a.slot === 'string' && a.slot.startsWith('au:')).map(a => ({id:a.id || a.slot.slice(3), slot:a.slot, name:String(a.name || '오디오').slice(0, 40),
    t:clamp(a.t | 0, 0, 19), s:clamp(Math.round(+a.s || 0), 0, MAX_BARS * BAR_T - 1), off:Math.max(0, +a.off || 0), len:clamp(+a.len || 1, 0.05, 900), gain:clamp(a.gain == null ? 1 : +a.gain, 0, 2)}));
  // 템포 지도: [{t:곡 틱, bpm}] — 틱 순서, 같은 틱은 뒤의 것
  const tm = new Map(); for (const x of Array.isArray(s.tempo) ? s.tempo : []) { const t = clamp(Math.round(+x.t || 0), 0, MAX_BARS * BAR_T), b = Math.round(clamp(+x.bpm || 0, 20, 400) * 100) / 100; if (b) tm.set(t, b); }
  s.tempo = [...tm].sort((a, b) => a[0] - b[0]).map(([t, bpm]) => ({t, bpm}));
  if (![12, 16, 24, 48].includes(+s.snap)) s.snap = 12;
  if (!KITS_OK.includes(s.kit)) s.kit = 'edm';
  if (!['off', 'sustain', '8th', 'offbeat'].includes(s.bassMode)) s.bassMode = 'off';
  s.chordTone = {br:1, atk:0.15, rel:0.5, ...(s.chordTone || {})};
  fillMix(s);
  return s;
}

// ---- 여러 곡 저장 (localStorage) ----
let lib = {current:null, list:{}};
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
function saveLib() { lsSet(LIB, JSON.stringify(lib)); }
function loadSong() {
  try { lib = JSON.parse(lsGet(LIB) || 'null') || {current:null, list:{}}; } catch (e) { lib = {current:null, list:{}}; }
  if (!lib.current || !lib.list[lib.current]) {
    let first = null;
    try { const old = JSON.parse(lsGet(STORE) || 'null'); if (old && old.notes) first = normalize(old); } catch (e) {}
    const id = newId();
    lib.list[id] = {name:first ? '내 첫 곡' : '새 곡', updated:Date.now()}; lib.current = id;
    lsSet(PK(id), songToStore(first || normalize(blank()))); saveLib();
  }
  try { const d = songFromStore(lsGet(PK(lib.current))); if (d) return d; } catch (e) {}
  return normalize(blank());   // 비상 경로도 늘 정리된 곡으로
}
let S = loadSong(), undoStack = [], redoStack = [], redoKeep = null, saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (!lsSet(PK(lib.current), songToStore(S))) status('저장 공간이 가득 찼어요. 안 쓰는 프로젝트를 지워 주세요.');
    if (typeof cloudOnSave === 'function') cloudOnSave();
    lib.list[lib.current].updated = Date.now(); saveLib();
  }, 200);
}
// 되돌리기·다시하기 — 새로 편집하면 다시하기 기록은 비운다 (갈래가 바뀌었으니까).
// 다만 눌렀는데 아무것도 안 바뀐 클릭은 cancelUndo()로 취소하는데, 그때 다시하기 기록도 되살린다
function pushUndo() { undoStack.push(JSON.stringify(S)); if (undoStack.length > 60) undoStack.shift(); redoKeep = redoStack; redoStack = []; undoBtns(); }
function cancelUndo() { const s = undoStack.pop(); if (redoKeep) { redoStack = redoKeep; redoKeep = null; } undoBtns(); return s; }
function undoBtns() { for (const [id, st] of [['undo', undoStack], ['redo', redoStack]]) { const b = document.getElementById(id); if (b) { b.setAttribute('aria-disabled', st.length ? 'false' : 'true'); b.classList.toggle('off', !st.length); } } }

// ---- 편집 상태 (여러 모듈이 함께 씀) ----
let sel = new Set(), clip = null, drag = null, lastVel = 0.8, lastDrumVel = 1;
let kb = {t:0, p:72}, kbStep = 0, playTick = -1, songTick = -1, startTick = 0, songStart = 0, keyDown = -1;
let playing = false;
const curPat = () => S.patterns[S.pat];
const curCh = () => S.channels[S.ch];
const curTrack = curCh;   // 예전 이름 호환
function notesOf(p, c) { return p.notes[c.id] || (p.notes[c.id] = []); }
const curNotes = () => notesOf(curPat(), curCh());
const patTicks = p => p.bars * BAR_T;
const totalTicks = () => patTicks(curPat());
const patById = id => S.patterns.find(p => p.id === id);
const chById = id => S.channels.find(c => c.id === id);
// 곡 길이 = 마지막 조각이 끝나는 마디 (조각이 없으면 지금 패턴 길이)
function songBars() { let e = 0; for (const c of S.playlist.clips) if (patById(c.pat)) e = Math.max(e, c.bar + clipLen(c)); for (const a of S.audio || []) e = Math.max(e, Math.ceil(audioEndTick(a) / BAR_T)); return clamp(e || S.patterns[S.pat].bars, 1, MAX_BARS); }
// 조각: 패턴을 off마디부터 len마디 동안 (패턴보다 길면 반복)
const clipLen = cl => cl.len || (patById(cl.pat) ? patById(cl.pat).bars - (cl.off || 0) : 1);
// 곡 틱 구간 [a, b)에서 이 조각이 울리는 부분들 → [{P, origin(패턴 0틱이 오는 곡 틱), from, to(패턴 틱)}]
function clipParts(cl, a, b) {
  const P = patById(cl.pat); if (!P) return [];
  const PL = patTicks(P), cs = cl.bar * BAR_T, ce = cs + clipLen(cl) * BAR_T, off = (cl.off || 0) * BAR_T, A = Math.max(a, cs), B = Math.min(b, ce), out = [];
  if (A >= B) return out;
  for (let r = Math.floor((A - cs + off) / PL); ; r++) {
    const origin = cs - off + r * PL; if (origin >= B) break;
    const from = Math.max(A, origin), to = Math.min(B, origin + PL); if (to > from) out.push({P, origin, from:from - origin, to:to - origin});
  }
  return out;
}
const songTicks = () => songBars() * BAR_T;

// ---- 음 이름 ----
function names() { const f = S.mode === 'major' ? [5,10,3,8,1,6].includes(S.root) : [2,7,0,5,10,3].includes(S.root); return f ? NAMES_F : NAMES_S; }
const nn = p => names()[p % 12] + (Math.floor(p / 12) - 1);
const inKey = pc => (S.mode === 'major' ? MAJ : MIN).includes((pc - S.root + 12) % 12);
const chordName = c => c ? names()[c.r] + (c.q === 'm' ? 'm' : c.q === '' ? '' : c.q) : '';
const chordVoices = c => { const base = 48 + c.r; return QUAL[c.q].map(i => base + i + (base + i < 52 ? 12 : 0)); };
function chordAtBeat(i, p) { const ch = (p || curPat()).chords; for (let k = i; k >= 0; k--) if (ch[k]) return ch[k].x ? null : ch[k]; return null; }

// ---- 알림 ----
// 문장 안에 곡 이름·숫자가 섞여 번역 사전으로 못 바꾸는 말은 두 벌을 두고 화면 언어로 고른다
const L2 = (ko, en) => { try { return LANG === 'en' ? en : ko; } catch (e) { return ko; } };
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;   // 영어 단수·복수
const fmtL = v => L2(v, ({'곡 코드':'song code', '프로젝트(.json)':'project (.json)', '악보(.txt)':'score (.txt)', '지금 곡':'current song'})[v] || v);
function status(s) { const el = $('status'); if (!el) return; el.textContent = (typeof tMsg === 'function' ? tMsg(s) : s); clearTimeout(status.t); status.t = setTimeout(() => el.textContent = '', 4000); }
function announce(m) { const el = $('sr'); if (el) { el.textContent = ''; setTimeout(() => el.textContent = (typeof tMsg === 'function' ? tMsg(m) : m), 30); } }

/* 02-view.js — 피아노 롤 그리기 (지금 패턴 · 지금 채널)
   곡 전체 크기의 캔버스 대신, 화면에 보이는 크기의 캔버스만 두고 스크롤 위치만큼 옮겨서 그려요.
   (128마디면 가로가 수만 px라 전체를 그리면 느리고, 브라우저 캔버스 한계도 넘어요) */
const wrap = $('rollWrap'), rc = $('rollCanvas'), kc = $('keys'), ru = $('ruler'), lc = $('laneCanvas'), lanes = $('lanes');
const gridBox = $('gridBox'), rulerBox = $('rulerBox'), laneBox = $('laneBox');
let DPR = clamp(window.devicePixelRatio || 1, 1, 3);
const rows = () => HIGH - LOW + 1;
const W = () => Math.ceil(totalTicks() * TICKPX), H = () => rows() * ROWH;
let CS = {};
function readCss() {
  const g = getComputedStyle(document.documentElement);
  for (const k of ['bg','panel','panel2','line','line2','ink','mute','row-in','row-out','row-root','note','note-ink','key-w','key-b','key-line','key-text','key-dot','step-a','step-b']) CS[k] = g.getPropertyValue('--' + k).trim();
}
function sizeCanvas(c, w, h) {
  const pw = Math.round(w * DPR), ph = Math.round(h * DPR);
  if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; c.style.width = w + 'px'; c.style.height = h + 'px'; }
  const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); return x;
}
function rr(x, a, b, w, h, r) { r = Math.min(r, w / 2, h / 2); x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
const isBlack = pc => [1, 3, 6, 8, 10].includes(pc);

// 보이는 영역 (world 좌표 = 곡 전체 기준 px)
function view() {
  const vw = Math.max(50, Math.min(W(), wrap.clientWidth - KEYW)), vh = Math.max(50, Math.min(H(), wrap.clientHeight - RULER));
  return {sl:wrap.scrollLeft, st:wrap.scrollTop, vw, vh};
}
function laneView() { return {sl:lanes.scrollLeft, vw:Math.max(50, Math.min(W(), lanes.clientWidth - KEYW))}; }
function layoutBoxes() {
  gridBox.style.width = W() + 'px'; gridBox.style.height = H() + 'px';
  rulerBox.style.width = W() + 'px'; laneBox.style.width = W() + 'px';
}

function drawKeys() {
  const x = sizeCanvas(kc, KEYW, H());
  x.fillStyle = CS['key-w']; x.fillRect(0, 0, KEYW, H());
  for (let p = HIGH; p >= LOW; p--) {
    const y = (HIGH - p) * ROWH, pc = p % 12;
    if (p === keyDown && !isBlack(pc)) { x.fillStyle = CS['key-line']; x.fillRect(0, y, KEYW, ROWH); }
    if (!isBlack(pc)) { x.fillStyle = CS['key-line']; x.fillRect(0, y + ROWH - 0.5, KEYW, 1); }
  }
  for (let p = HIGH; p >= LOW; p--) {
    const y = (HIGH - p) * ROWH;
    if (isBlack(p % 12)) { x.fillStyle = p === keyDown ? CS['key-line'] : CS['key-b']; rr(x, 0, y + 1, KEYW * 0.62, ROWH - 2, 3); x.fill(); }
  }
  x.font = '600 10px "IBM Plex Sans KR",sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'right';
  for (let p = HIGH; p >= LOW; p--) {
    const y = (HIGH - p) * ROWH, pc = p % 12;
    if (pc === 0 && ROWH >= 14) { x.fillStyle = CS['key-text']; x.fillText('C' + (Math.floor(p / 12) - 1), KEYW - 14, y + ROWH / 2); }
    if (inKey(pc)) { x.fillStyle = isBlack(pc) ? CS['key-line'] : CS['key-dot']; x.beginPath(); x.arc(KEYW - 6, y + ROWH / 2, pc === S.root ? 3.2 : 1.8, 0, 7); x.fill(); }
  }
  x.fillStyle = CS.line; x.fillRect(KEYW - 1, 0, 1, H());
}

function drawRuler() {
  const v = view(), x = sizeCanvas(ru, v.vw, RULER);
  ru.style.transform = `translateX(${v.sl}px)`;
  x.fillStyle = CS.panel2; x.fillRect(0, 0, v.vw, RULER); x.fillStyle = CS.line; x.fillRect(0, RULER - 1, v.vw, 1);
  x.save(); x.translate(-v.sl, 0);
  x.font = '600 11px "IBM Plex Mono",monospace'; x.textBaseline = 'middle';
  const t0 = Math.floor(v.sl / TICKPX / PPQ) * PPQ, t1 = Math.min(totalTicks(), (v.sl + v.vw) / TICKPX + PPQ);
  const labelEvery = TICKPX < 1 ? 2 : 1;
  for (let t = t0; t <= t1; t += PPQ) {
    const X = Math.round(t * TICKPX) + .5, bar = t % BAR_T === 0, b = t / BAR_T;
    x.fillStyle = bar ? CS.ink : CS.line2; x.fillRect(X, bar ? 4 : 14, 1, bar ? RULER - 5 : RULER - 15);
    if (bar && t < totalTicks() && b % labelEvery === 0) { x.fillStyle = CS.ink; x.fillText(String(b + 1), X + 5, 9); }
  }
  const sx = startTick * TICKPX; x.fillStyle = CS.ink; x.beginPath(); x.moveTo(sx, RULER - 1); x.lineTo(sx + 7, RULER - 8); x.lineTo(sx, RULER - 8); x.closePath(); x.fill();
  if (playTick >= 0) { x.fillStyle = CS.ink; x.fillRect(playTick * TICKPX - 1, 0, 2, RULER); }
  x.restore();
}

function drawRoll() {
  const v = view(), x = sizeCanvas(rc, v.vw, v.vh);
  rc.style.transform = `translate(${v.sl}px,${v.st}px)`;
  x.save(); x.translate(-v.sl, -v.st);
  const x0 = v.sl, x1 = v.sl + v.vw, pTop = clamp(HIGH - Math.floor(v.st / ROWH), LOW, HIGH), pBot = clamp(HIGH - Math.floor((v.st + v.vh) / ROWH), LOW, HIGH);
  for (let p = pTop; p >= pBot; p--) {
    const y = (HIGH - p) * ROWH, pc = p % 12;
    x.fillStyle = curCh() && curCh().inst === 'kit' ? (KIT_ROW[p] ? (KIT_ROW[p].i % 2 ? CS['row-in'] : CS['row-root']) : CS['row-out']) : pc === S.root ? CS['row-root'] : inKey(pc) ? CS['row-in'] : CS['row-out']; x.fillRect(x0, y, v.vw, ROWH);
    x.fillStyle = pc === 0 ? CS.line2 : CS.line; x.fillRect(x0, y + ROWH - 1, v.vw, 1);
  }
  const t0 = Math.floor(x0 / TICKPX / S.snap) * S.snap, t1 = Math.min(totalTicks(), x1 / TICKPX + S.snap);
  for (let t = t0; t <= t1; t += S.snap) {
    const X = Math.round(t * TICKPX) + .5, bar = t % BAR_T === 0, beat = t % PPQ === 0;
    x.fillStyle = bar ? CS.mute : (beat ? CS.line2 : CS.line); x.globalAlpha = bar ? .8 : 1; x.fillRect(X - .5, v.st, bar ? 1.5 : 1, v.vh);
  }
  x.globalAlpha = 1;
  const visible = n => n.s * TICKPX < x1 && (n.s + n.l) * TICKPX > x0 && n.p <= pTop && n.p >= pBot;
  x.lineWidth = 1; x.strokeStyle = CS.mute;
  // 다른 채널의 음: 흐린 테두리 (고스트 노트) — 멜로디 편집 중엔 멜로디 채널만, 드럼 편집 중엔 드럼 채널만
  const kind = curCh().kind;
  S.channels.forEach((c, ci) => { if (ci === S.ch || c.kind !== kind) return; for (const n of notesOf(curPat(), c)) if (visible(n)) { rr(x, n.s * TICKPX + 1.5, (HIGH - n.p) * ROWH + 2, Math.max(4, n.l * TICKPX - 2), ROWH - 4, 3); x.stroke(); } });
  x.font = '600 10px "IBM Plex Sans KR",sans-serif'; x.textBaseline = 'middle';
  for (const n of curNotes()) {
    if (!visible(n)) continue;
    const X = n.s * TICKPX, Y = (HIGH - n.p) * ROWH, Wn = Math.max(4, n.l * TICKPX - 1), hot = playTick >= n.s && playTick < n.s + n.l;
    rr(x, X + 1, Y + 1.5, Wn - 1, ROWH - 3, 3);
    if (hot) { x.fillStyle = CS.bg; x.fill(); x.lineWidth = 2; x.strokeStyle = CS.note; x.stroke(); }
    else { x.globalAlpha = 0.4 + 0.6 * n.v; x.fillStyle = CS.note; x.fill(); x.globalAlpha = 1; }
    if (sel.has(n)) { rr(x, X + 3, Y + 3.5, Wn - 5, ROWH - 7, 2); x.lineWidth = 1.5; x.strokeStyle = hot ? CS.note : CS['note-ink']; x.setLineDash([3, 2]); x.stroke(); x.setLineDash([]); }
    if (Wn > 30 && ROWH >= 16) { x.fillStyle = hot ? CS.note : CS['note-ink']; x.fillText(curCh().inst === 'kit' ? (KIT_ROW[n.p] ? KIT_ROW[n.p].nm : '') : nn(n.p), X + 6, Y + ROWH / 2); }
    x.fillStyle = hot ? CS.note : CS['note-ink']; x.globalAlpha = .5; x.fillRect(X + Wn - 4, Y + 5, 1.5, ROWH - 10); x.globalAlpha = 1;
  }
  if (drag && drag.mode === 'band') {
    const a = Math.min(drag.x0, drag.x1), b = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    x.strokeStyle = CS.ink; x.lineWidth = 1; x.setLineDash([4, 3]); x.strokeRect(a + .5, b + .5, w, h); x.setLineDash([]); x.fillStyle = CS.ink; x.globalAlpha = .08; x.fillRect(a, b, w, h); x.globalAlpha = 1;
  }
  if (document.activeElement === rc) { x.strokeStyle = CS.ink; x.lineWidth = 2; x.setLineDash([4, 3]); x.strokeRect(kb.t * TICKPX + 1, (HIGH - kb.p) * ROWH + 1, Math.max(8, S.snap * TICKPX) - 2, ROWH - 2); x.setLineDash([]); }
  if (startTick > 0) { x.fillStyle = CS.ink; x.globalAlpha = .35; x.fillRect(startTick * TICKPX - .5, v.st, 1, v.vh); x.globalAlpha = 1; }
  if (playTick >= 0) { x.fillStyle = CS.ink; x.fillRect(playTick * TICKPX - 1, v.st, 2, v.vh); }
  x.restore();
  $('empty').style.display = Object.values(curPat().notes).some(a => a.length) ? 'none' : 'block';
}

function drawLanes() {
  const v = laneView(), x = sizeCanvas(lc, v.vw, LANES_H);
  lc.style.transform = `translateX(${v.sl}px)`;
  x.fillStyle = CS.panel; x.fillRect(0, 0, v.vw, LANES_H);
  x.save(); x.translate(-v.sl, 0);
  const vy = CHORD_H, bw = BAR_T * TICKPX;
  x.fillStyle = CS.panel2; x.fillRect(v.sl, vy, v.vw, VEL_H); x.fillStyle = CS.line; x.fillRect(v.sl, vy, v.vw, 1);
  for (let b = Math.floor(v.sl / bw); b <= Math.ceil((v.sl + v.vw) / bw); b++) { x.fillStyle = CS.mute; x.globalAlpha = .6; x.fillRect(b * bw, CHORD_H, 1, VEL_H); x.globalAlpha = 1; }
  if (laneMode === 'bend') drawBendLane(x, v, vy);
  else if (laneMode !== 'vel') drawAutoLane(x, v, vy);
  else for (const n of [...curNotes()].sort((a, b) => a.v - b.v)) {
    const X = n.s * TICKPX; if (X < v.sl - 8 || X > v.sl + v.vw) continue;
    const hh = (VEL_H - 10) * n.v; x.fillStyle = CS.note; x.globalAlpha = sel.has(n) || !sel.size ? 1 : 0.35;
    x.fillRect(X + 1, vy + VEL_H - 4 - hh, 3, hh); x.beginPath(); x.arc(X + 2.5, vy + VEL_H - 4 - hh, 3.2, 0, 7); x.fill(); x.globalAlpha = 1;
  }
  if (playTick >= 0) { x.fillStyle = CS.ink; x.fillRect(playTick * TICKPX - 1, CHORD_H, 2, VEL_H); }
  drawLaneCursor(x);
  x.restore();
  drawChordRow();
}
function drawLaneCursor(x) {
  if (document.activeElement !== lc) return;
  const step = 12 * TICKPX, y = CHORD_H, h = VEL_H;
  x.strokeStyle = CS.ink; x.lineWidth = 2; x.setLineDash([4, 3]); x.strokeRect(kbStep * step + 1, y + 1, step - 2, h - 2); x.setLineDash([]);
}

// 코드 줄: 박마다 칸 (내용이 바뀔 때만 다시 만듦)
let chordSig = '';
function drawChordRow() {
  const row = $('chordRow'), bw = PPQ * TICKPX;
  const P = curPat(), sig = JSON.stringify([P.id, P.chords, bw, names()[1], S.root, S.mode]);
  if (sig === chordSig && row.childElementCount === P.bars * BEATS) return;
  chordSig = sig; row.innerHTML = '';
  let cur = null;
  for (let i = 0; i < P.bars * BEATS; i++) {
    const c = P.chords[i], bar = Math.floor(i / BEATS) + 1, beat = i % BEATS + 1;
    if (c) cur = c.x ? null : c;
    const el = document.createElement('button');
    el.className = 'cell' + (c && !c.x ? '' : cur ? ' cont' : ' none') + (beat === 1 ? '' : ' beat');
    el.style.width = bw + 'px';
    el.textContent = c ? (c.x ? '■' : chordName(c)) : (beat === 1 ? (cur ? '·' : '+ ' + bar) : (cur ? '·' : ''));
    el.setAttribute('aria-label', `${bar}마디 ${beat}박 코드 ` + (c ? (c.x ? '멈춤' : chordName(c)) : cur ? `${chordName(cur)} 이어짐` : '없음') + ', 눌러서 고르기');
    el.onclick = () => openChord(i);
    row.appendChild(el);
  }
}

function drawAll() {
  readCss(); layoutBoxes();
  $('corner').textContent = names()[S.root] + ' ' + (typeof t === 'function' ? t(S.mode === 'minor' ? '단조' : '장조') : (S.mode === 'minor' ? '단조' : '장조'));
  drawKeys(); drawRuler(); drawRoll(); drawLanes();
}
// 여러 번 요청돼도 한 프레임에 한 번만 그림
let drawReq = 0;
function requestDraw() { if (drawReq) return; drawReq = requestAnimationFrame(() => { drawReq = 0; drawRuler(); drawRoll(); drawLanes(); }); }
let syncing = false;
wrap.addEventListener('scroll', () => { if (!syncing) { syncing = true; lanes.scrollLeft = wrap.scrollLeft; syncing = false; } requestDraw(); }, {passive:true});
lanes.addEventListener('scroll', () => { if (!syncing) { syncing = true; wrap.scrollLeft = lanes.scrollLeft; syncing = false; } requestDraw(); }, {passive:true});

// 자동화 줄 (볼륨·필터): 점과 선, 없으면 기본값 점선
let laneMode = 'vel';
const autoY = (vy, val) => vy + VEL_H - 4 - val * (VEL_H - 10);
function drawAutoLane(x, v, vy) {
  const A = curPat().auto && curPat().auto[curCh().id], pts = (A && A[laneMode]) || [], W0 = 0, W1 = totalTicks() * TICKPX;
  x.strokeStyle = CS.mute; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(W0, autoY(vy, 1)); x.lineTo(W1, autoY(vy, 1)); x.stroke(); x.setLineDash([]);
  x.font = '11px "IBM Plex Sans KR",sans-serif'; x.fillStyle = CS.mute; x.textBaseline = 'top';
  if (!pts.length) { x.fillText(`${laneMode === 'vol' ? '볼륨' : '필터'} 자동화 — 눌러서 점 찍기`, v.sl + 8, vy + 6); return; }
  x.strokeStyle = CS.note; x.lineWidth = 2; x.beginPath(); x.moveTo(W0, autoY(vy, pts[0].v));
  for (const p of pts) x.lineTo(p.s * TICKPX, autoY(vy, p.v)); x.lineTo(W1, autoY(vy, pts[pts.length - 1].v)); x.stroke();
  x.fillStyle = CS.note; for (const p of pts) { x.beginPath(); x.arc(p.s * TICKPX, autoY(vy, p.v), 4, 0, 7); x.fill(); }
}

// 피치 벤드 줄: 가운데가 0, 위 +12 · 아래 -12 반음
function drawBendLane(x, v, vy) {
  const mid = vy + VEL_H / 2, hh = VEL_H / 2 - 5; x.fillStyle = CS.line; x.fillRect(v.sl, mid, v.vw, 1);
  x.font = '11px "IBM Plex Sans KR",sans-serif'; x.fillStyle = CS.mute; x.textBaseline = 'top';
  if (!curNotes().some(n => n.b)) x.fillText('피치 벤드 — 음 위를 위아래로 끌면 음이 끝날수록 휘어요 (두 번 누르면 0)', v.sl + 8, vy + 4);
  for (const n of curNotes()) { const X = n.s * TICKPX, W = Math.max(3, n.l * TICKPX - 2); if (X > v.sl + v.vw || X + W < v.sl) continue;
    const b = n.b || 0, y = mid - b / 12 * hh; x.fillStyle = sel.has(n) ? CS.ink : CS.note; x.globalAlpha = b ? 0.9 : 0.35;
    x.fillRect(X + 1, Math.min(y, mid), W, Math.max(2, Math.abs(y - mid))); x.globalAlpha = 1; if (b) { x.fillStyle = CS.ink; x.fillText((b > 0 ? '+' : '') + b, X + 3, b > 0 ? y - 12 : y + 2); } }
}

/* 03-edit.js — 피아노 롤 편집 (도구 · 롤 · 세기 줄 · 키보드 · 선택 · 코드 · 마디 복사) */

// ---- 도구 ----
let tool = 'draw';
function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
  rc.style.cursor = t === 'hand' ? 'grab' : t === 'erase' ? 'not-allowed' : t === 'select' ? 'default' : 'crosshair';
  if (t !== 'select' && sel.size) { sel.clear(); selChanged(); }
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
rc.style.touchAction = 'none';

// ---- 좌표: 화면 → 곡 전체 기준 ----
function pos(e) { const r = rc.getBoundingClientRect(), v = view(); const x = e.clientX - r.left + v.sl, y = e.clientY - r.top + v.st; return {x, y, tick:x / TICKPX, p:HIGH - Math.floor(y / ROWH)}; }
function hit(tick, p) { const ns = curNotes(); for (let i = ns.length - 1; i >= 0; i--) { const n = ns[i]; if (n.p === p && tick >= n.s && tick < n.s + n.l) return i; } return -1; }
function selChanged() { const ns = new Set(curNotes()); for (const n of [...sel]) if (!ns.has(n)) sel.delete(n); $('selBar').hidden = sel.size === 0; $('selCount').textContent = sel.size + '개 선택'; drawRoll(); drawLanes(); drawRack(); }
function bandSelect() {
  const t0 = Math.min(drag.x0, drag.x1) / TICKPX, t1 = Math.max(drag.x0, drag.x1) / TICKPX;
  const p0 = HIGH - Math.floor(Math.max(drag.y0, drag.y1) / ROWH), p1 = HIGH - Math.floor(Math.min(drag.y0, drag.y1) / ROWH);
  sel = new Set(curNotes().filter(n => n.p >= p0 && n.p <= p1 && n.s < t1 && n.s + n.l > t0));
}

// ---- 롤 조작 (마우스 · 터치 · 두 손가락 이동) ----
const ptrs = new Map(); let pan = null, erased = false;
function avgPtr() { let x = 0, y = 0; for (const v of ptrs.values()) { x += v.x; y += v.y; } return {x:x / ptrs.size, y:y / ptrs.size}; }
function startPan() { const a = avgPtr(); pan = {x:a.x, y:a.y, sl:wrap.scrollLeft, st:wrap.scrollTop}; }
function eraseAt(q) { const i = hit(q.tick, q.p); if (i >= 0) { if (!erased) { pushUndo(); erased = true; } curNotes().splice(i, 1); selChanged(); } }
rc.addEventListener('contextmenu', e => { e.preventDefault(); const q = pos(e), i = hit(q.tick, q.p); if (i >= 0) { pushUndo(); curNotes().splice(i, 1); save(); selChanged(); } });
rc.addEventListener('pointerdown', e => {
  if (e.button === 2) return;
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY}); try { rc.setPointerCapture(e.pointerId); } catch (_) {}
  if (ptrs.size >= 2 || tool === 'hand') {
    if (drag) { const s = cancelUndo(); if (s) { S = normalize(JSON.parse(s)); sel.clear(); } drag = null; drawRoll(); }
    startPan(); if (tool === 'hand') rc.style.cursor = 'grabbing'; return;
  }
  const q = pos(e); if (q.p < LOW || q.p > HIGH) return; e.preventDefault();
  if (tool === 'erase') { erased = false; eraseAt(q); drag = {mode:'erase'}; return; }
  if (tool === 'select') {
    const i = hit(q.tick, q.p);
    if (i >= 0) { const n = curNotes()[i]; if (!sel.has(n)) sel = new Set([n]); pushUndo(); drag = {mode:'moveSel', x0:q.x, y0:q.y, orig:[...sel].map(m => ({m, s:m.s, p:m.p})), moved:false}; selChanged(); }
    else { sel.clear(); drag = {mode:'band', x0:q.x, y0:q.y, x1:q.x, y1:q.y}; selChanged(); }
    return;
  }
  const i = hit(q.tick, q.p); pushUndo();
  if (i >= 0) { const n = curNotes()[i]; drag = {mode:(n.s + n.l) * TICKPX - q.x < 9 ? 'resize' : 'move', i, x0:q.x, y0:q.y, orig:{...n}, moved:false}; }
  else {
    const s = Math.floor(q.tick / S.snap) * S.snap, l = Math.min(S.len, totalTicks() - s);
    const v0 = curCh().kind === 'drum' ? lastDrumVel : lastVel;
    if (curCh().inst === 'kit') q.p = kitSnap(q.p);
    curNotes().push({p:q.p, s, l, v:v0}); drag = {mode:'new', i:curNotes().length - 1, x0:q.x, y0:q.y, orig:{p:q.p, s, l}, moved:false};
    preview(q.p, v0); drawRoll(); drawLanes();
  }
});
rc.addEventListener('pointermove', e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pan) { const a = avgPtr(); wrap.scrollLeft = pan.sl - (a.x - pan.x); wrap.scrollTop = pan.st - (a.y - pan.y); return; }
  if (!drag) return;
  const q = pos(e);
  if (drag.mode === 'erase') { eraseAt(q); return; }
  if (drag.mode === 'band') { drag.x1 = clamp(q.x, 0, W()); drag.y1 = clamp(q.y, 0, H()); bandSelect(); $('selBar').hidden = sel.size === 0; $('selCount').textContent = sel.size + '개 선택'; drawRoll(); return; }
  if (Math.abs(q.x - drag.x0) > 4 || Math.abs(q.y - drag.y0) > 4) drag.moved = true;
  if (!drag.moved) return;
  if (drag.mode === 'moveSel') {
    let dt = Math.round((q.x - drag.x0) / TICKPX / S.snap) * S.snap, dp = -Math.round((q.y - drag.y0) / ROWH);
    const o = drag.orig, minS = Math.min(...o.map(a => a.s)), maxE = Math.max(...o.map(a => a.s + a.m.l)), minP = Math.min(...o.map(a => a.p)), maxP = Math.max(...o.map(a => a.p));
    dt = clamp(dt, -minS, totalTicks() - maxE); dp = clamp(dp, LOW - minP, HIGH - maxP);
    const firstP = o[0].m.p; for (const a of o) { a.m.s = a.s + dt; a.m.p = a.p + dp; } if (o[0].m.p !== firstP) preview(o[0].m.p);
    drawRoll(); return;
  }
  const n = curNotes()[drag.i]; if (!n) return;
  if (drag.mode === 'move') {
    const dt = Math.round((q.x - drag.x0) / TICKPX / S.snap) * S.snap, dp = -Math.round((q.y - drag.y0) / ROWH);
    const ns = clamp(drag.orig.s + dt, 0, totalTicks() - n.l), np = clamp(drag.orig.p + dp, LOW, HIGH);
    if (np !== n.p) preview(np, n.v); n.s = ns; n.p = np;
  } else { const end = Math.ceil(q.tick / S.snap) * S.snap; n.l = clamp(end - n.s, S.snap, totalTicks() - n.s); }
  drawRoll();
});
function upPtr(e) {
  ptrs.delete(e.pointerId);
  if (pan) { if (ptrs.size === 0) { pan = null; if (tool === 'hand') rc.style.cursor = 'grab'; } return; }
  if (!drag) return;
  if (drag.mode === 'band') { drag = null; selChanged(); return; }
  if (drag.mode === 'moveSel') { if (!drag.moved) cancelUndo(); drag = null; save(); drawRoll(); drawLanes(); return; }
  if (drag.mode === 'move' && !drag.moved) { sel.delete(curNotes()[drag.i]); curNotes().splice(drag.i, 1); }
  drag = null; save(); selChanged();
}
rc.addEventListener('pointerup', upPtr); rc.addEventListener('pointercancel', upPtr);

// ---- 건반 · 눈금자 ----
kc.addEventListener('pointerdown', e => { const r = kc.getBoundingClientRect(), p = HIGH - Math.floor((e.clientY - r.top) / ROWH); if (p < LOW || p > HIGH) return; keyDown = p; preview(p); drawKeys(); });
kc.addEventListener('pointerup', () => { keyDown = -1; drawKeys(); });
kc.addEventListener('pointerleave', () => { if (keyDown >= 0) { keyDown = -1; drawKeys(); } });
ru.addEventListener('click', e => {
  const r = ru.getBoundingClientRect(), x = e.clientX - r.left + wrap.scrollLeft;
  startTick = clamp(Math.floor(x / TICKPX / PPQ) * PPQ, 0, totalTicks() - PPQ); updatePos(startTick); drawRuler(); drawRoll();
  if (playing) { stop(); play(); }
});
ru.addEventListener('dblclick', () => { startTick = 0; updatePos(0); drawRuler(); drawRoll(); });

// ---- 세기 줄 (지금 채널의 음) ----
let velDrag = false;
function laneHit(e) { const r = lc.getBoundingClientRect(); return {x:e.clientX - r.left + lanes.scrollLeft, y:e.clientY - r.top}; }
const velValue = y => clamp((CHORD_H + VEL_H - 4 - y) / (VEL_H - 10), 0.05, 1);
function velAt(x, y) {
  const v = velValue(y); let best = null, bd = 9;
  for (const n of curNotes()) { const d = Math.abs(n.s * TICKPX + 2.5 - x); if (d < bd) { bd = d; best = n.s; } }
  if (best == null) return 0;
  let targets = curNotes().filter(n => n.s === best); if (targets.some(n => sel.has(n))) targets = targets.filter(n => sel.has(n));
  targets.forEach(n => n.v = v); if (curCh().kind === 'drum') lastDrumVel = v; else lastVel = v; return targets.length;
}
// ---- 자동화 줄 편집 ----
function autoPts(create) {
  const P = curPat(), c = curCh(); if (!P.auto) P.auto = {};
  let A = P.auto[c.id]; if (!A) { if (!create) return null; A = P.auto[c.id] = {}; }
  if (!A[laneMode]) { if (!create) return null; A[laneMode] = []; } return A[laneMode];
}
function autoNear(pts, q) { let best = -1, bd = 10; pts.forEach((p, i) => { const d = Math.hypot(p.s * TICKPX - q.x, autoY(CHORD_H, p.v) - q.y); if (d < bd) { bd = d; best = i; } }); return best; }
function autoClean() { const P = curPat(), c = curCh(), A = P.auto[c.id]; if (!A) return; for (const k of Object.keys(A)) { A[k].sort((a, b) => a.s - b.s); if (!A[k].length) delete A[k]; } if (!Object.keys(A).length) delete P.auto[c.id]; }
let autoDrag = null;
lc.addEventListener('pointerdown', e => {
  if (laneMode === 'vel' || laneMode === 'bend') return; const q = laneHit(e); if (q.y < CHORD_H || e.button === 2) return;
  e.stopImmediatePropagation(); pushUndo(); const pts = autoPts(true); let i = autoNear(pts, q);
  const s = clamp(Math.round(q.x / TICKPX / S.snap) * S.snap, 0, totalTicks()), val = clamp((CHORD_H + VEL_H - 4 - q.y) / (VEL_H - 10), 0, 1);
  if (i < 0) { const same = pts.findIndex(p => p.s === s); if (same >= 0) { pts[same].v = val; i = same; } else { pts.push({s, v:val}); pts.sort((a, b) => a.s - b.s); i = pts.findIndex(p => p.s === s); } }
  autoDrag = pts[i]; try { lc.setPointerCapture(e.pointerId); } catch (_) {} drawLanes();
}, true);
lc.addEventListener('pointermove', e => {
  if (!autoDrag) return; const q = laneHit(e), pts = autoPts(true);
  const s = clamp(Math.round(q.x / TICKPX / S.snap) * S.snap, 0, totalTicks());
  if (!pts.some(p => p !== autoDrag && p.s === s)) autoDrag.s = s;
  autoDrag.v = clamp((CHORD_H + VEL_H - 4 - q.y) / (VEL_H - 10), 0, 1); pts.sort((a, b) => a.s - b.s); drawLanes();
});
lc.addEventListener('pointerup', () => { if (!autoDrag) return; autoDrag = null; autoClean(); save(); announce(`${laneMode === 'vol' ? '볼륨' : '필터'} 자동화 점을 바꿨어요.`); });
function autoDelete(e) { if (laneMode === 'vel' || laneMode === 'bend') return; e.preventDefault(); const pts = autoPts(false); if (!pts) return; const i = autoNear(pts, laneHit(e)); if (i < 0) return; pushUndo(); pts.splice(i, 1); autoClean(); save(); drawLanes(); }
lc.addEventListener('dblclick', autoDelete); lc.addEventListener('contextmenu', autoDelete);
$('laneMode').onchange = () => { laneMode = $('laneMode').value; drawLanes(); announce('아래 줄: ' + $('laneMode').selectedOptions[0].textContent); };
lc.addEventListener('pointerdown', e => { const q = laneHit(e); if (q.y < CHORD_H) return; pushUndo(); try { lc.setPointerCapture(e.pointerId); } catch (_) {} velDrag = true; if (!velAt(q.x, q.y)) cancelUndo(); drawLanes(); drawRoll(); });
lc.addEventListener('pointermove', e => { if (!velDrag) return; const q = laneHit(e); velAt(q.x, q.y); drawLanes(); drawRoll(); });
lc.addEventListener('pointerup', () => { if (velDrag) { velDrag = false; save(); drawRack(); announce('세기를 바꿨어요.'); } });
lc.addEventListener('pointercancel', () => { velDrag = false; });

// ---- 키보드로 작곡 (접근성) ----
function posName(t) { const bar = Math.floor(t / BAR_T) + 1, beat = Math.floor((t % BAR_T) / PPQ) + 1, sub = Math.floor((t % PPQ) / S.snap) + 1; return `${bar}마디 ${beat}박` + (sub > 1 ? ` ${sub}번째 칸` : ''); }
function noteAtCursor() { return curNotes().find(n => n.p === kb.p && kb.t >= n.s && kb.t < n.s + n.l); }
function showCursor() {
  const X = kb.t * TICKPX, Y = (HIGH - kb.p) * ROWH, v = view();
  if (X < v.sl || X > v.sl + v.vw - 60) wrap.scrollLeft = Math.max(0, X - v.vw / 3);
  if (Y < v.st || Y > v.st + v.vh - ROWH) wrap.scrollTop = Math.max(0, Y - v.vh / 2);
  drawRoll();
}
function describe() { const n = noteAtCursor(); return `${curCh().name}, ${nn(kb.p)}, ${posName(kb.t)}` + (n ? `, 음 있음 (길이 ${lenText(n.l)}, 세기 ${Math.round(n.v * 100)})` : ''); }
rc.tabIndex = 0; rc.setAttribute('aria-describedby', 'kbHelp');
rc.addEventListener('focus', () => { kb.t = Math.min(kb.t, totalTicks() - S.snap); showCursor(); announce('피아노 롤. ' + describe()); });
rc.addEventListener('blur', () => drawRoll());
rc.addEventListener('keydown', e => {
  const k = e.key; let used = true, msg = null;
  if (k === 'ArrowLeft' || k === 'ArrowRight') { const st = e.shiftKey ? BAR_T : S.snap; kb.t = clamp(kb.t + (k === 'ArrowLeft' ? -st : st), 0, totalTicks() - S.snap); kb.t = Math.floor(kb.t / S.snap) * S.snap; msg = describe(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { kb.p = clamp(kb.p + (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1), LOW, HIGH); preview(kb.p, lastVel); msg = describe(); }
  else if (k === 'Enter') {
    const n = noteAtCursor(); pushUndo();
    if (n) { curNotes().splice(curNotes().indexOf(n), 1); msg = `${nn(kb.p)} 음을 지웠어요`; }
    else { if (curCh().inst === 'kit') kb.p = kitSnap(kb.p); const l = Math.min(S.len, totalTicks() - kb.t); curNotes().push({p:kb.p, s:kb.t, l, v:lastVel}); preview(kb.p, lastVel); msg = `${nn(kb.p)} 음을 찍었어요, 길이 ${lenText(l)}`; }
    save(); selChanged();
  }
  else if (k === 'Delete' || k === 'Backspace') { const n = noteAtCursor(); if (n) { pushUndo(); curNotes().splice(curNotes().indexOf(n), 1); save(); selChanged(); msg = '지웠어요'; } else used = false; }
  else if (k === '+' || k === '=' || k === '-') { const n = noteAtCursor(); if (n) { pushUndo(); n.l = clamp(n.l + (k === '-' ? -S.snap : S.snap), S.snap, totalTicks() - n.s); save(); msg = `길이 ${lenText(n.l)}`; } else msg = '여기에는 음이 없어요'; }
  else if (k === '[' || k === ']') { const n = noteAtCursor(); if (n) { pushUndo(); n.v = clamp(Math.round((n.v + (k === ']' ? .1 : -.1)) * 20) / 20, .05, 1); lastVel = n.v; save(); preview(n.p, n.v); msg = `세기 ${Math.round(n.v * 100)}`; } else msg = '여기에는 음이 없어요'; }
  else used = false;
  if (used) { e.preventDefault(); e.stopPropagation(); showCursor(); drawLanes(); drawRack(); if (msg) announce(msg); }
});
lc.tabIndex = 0; lc.setAttribute('aria-describedby', 'kbHelp');
function laneDesc() {
  const bar = Math.floor(kbStep / STEPS) + 1, beat = Math.floor((kbStep % STEPS) / 4) + 1, sub = kbStep % 4 + 1;
  const ns = curNotes().filter(n => Math.floor(n.s / 12) === kbStep);
  return `세기 줄, ${bar}마디 ${beat}박 ${sub}번째 칸, ` + (ns.length ? `음 ${ns.length}개, 세기 ${Math.round(ns[0].v * 100)}` : '음 없음');
}
lc.addEventListener('focus', () => { drawLanes(); announce(laneDesc()); });
lc.addEventListener('blur', () => drawLanes());
lc.addEventListener('keydown', e => {
  const k = e.key; let used = true;
  if (k === 'ArrowLeft' || k === 'ArrowRight') kbStep = clamp(kbStep + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? STEPS : 1), 0, curPat().bars * STEPS - 1);
  else if (k === '[' || k === ']') {
    const ns = curNotes().filter(n => Math.floor(n.s / 12) === kbStep);
    if (ns.length) { pushUndo(); ns.forEach(n => n.v = clamp(Math.round((n.v + (k === ']' ? .1 : -.1)) * 20) / 20, .05, 1)); save(); drawRoll(); }
  } else used = false;
  if (used) {
    e.preventDefault(); e.stopPropagation();
    const X = kbStep * 12 * TICKPX; if (X < lanes.scrollLeft || X > lanes.scrollLeft + lanes.clientWidth - 120) lanes.scrollLeft = Math.max(0, X - lanes.clientWidth / 3);
    drawLanes(); announce(laneDesc());
  }
});

// ---- 선택한 음 작업 ----
const selNotes = () => [...sel].filter(n => curNotes().includes(n));
function transpose(d) { const ns = selNotes(); if (!ns.length) return; if (ns.some(n => n.p + d < LOW || n.p + d > HIGH)) { status('더 이상 올리거나 내릴 수 없어요.'); return; } pushUndo(); ns.forEach(n => n.p += d); preview(ns[0].p); save(); drawRoll(); }
function shiftSel(dt) { const ns = selNotes(); if (!ns.length) return; const minS = Math.min(...ns.map(n => n.s)), maxE = Math.max(...ns.map(n => n.s + n.l)); dt = clamp(dt, -minS, totalTicks() - maxE); if (!dt) return; pushUndo(); ns.forEach(n => n.s += dt); save(); drawRoll(); drawLanes(); }
function delSel() { if (!selNotes().length) return; pushUndo(); curPat().notes[curCh().id] = curNotes().filter(n => !sel.has(n)); sel.clear(); save(); selChanged(); drawRack(); }
function pasteNotes(rel, at) {
  const out = [];
  for (const r of rel) { const s = at + r.s; if (s >= totalTicks()) continue; out.push({p:r.p, s, l:Math.min(r.l, totalTicks() - s), v:r.v == null ? 0.8 : r.v}); }
  if (!out.length) { status('붙일 자리가 곡 밖이에요. 마디 수를 늘리거나 눈금자에서 시작 위치를 앞으로 옮겨 보세요.'); return 0; }
  pushUndo(); curNotes().push(...out); sel = new Set(out); save(); selChanged(); return out.length;
}
function dupSel() {
  const ns = selNotes(); if (!ns.length) return;
  const minS = Math.min(...ns.map(n => n.s)), maxE = Math.max(...ns.map(n => n.s + n.l)), span = Math.ceil((maxE - minS) / PPQ) * PPQ;
  const c = pasteNotes(ns.map(n => ({p:n.p, s:n.s - minS, l:n.l, v:n.v})), minS + span); if (c) status(c + '개를 바로 뒤에 복제했어요.');
}
$('selDup').onclick = dupSel; $('selUp').onclick = () => transpose(1); $('selDown').onclick = () => transpose(-1); $('selDel').onclick = delSel;
$('selNone').onclick = () => { sel.clear(); selChanged(); };

// ---- 코드 고르기 (박 단위) ----
const dlg = $('chordDlg'); let chordSlot = 0, pick = {r:0, q:'m'};
function openChord(i) {
  chordSlot = i; const P = curPat(), c = P.chords[i] && !P.chords[i].x ? P.chords[i] : chordAtBeat(i);
  pick = c ? {r:c.r, q:c.q} : {r:S.root, q:S.mode === 'minor' ? 'm' : ''};
  renderChordDlg(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}
function renderChordDlg() {
  const g = $('rootGrid'), N = names(); g.innerHTML = '';
  for (let i = 0; i < 12; i++) { const r = (S.root + i) % 12, b = document.createElement('button'); b.className = 'tbtn' + (inKey(r) ? ' inkey' : ''); b.textContent = N[r]; b.setAttribute('aria-pressed', pick.r === r); b.onclick = () => { pick.r = r; renderChordDlg(); }; g.appendChild(b); }
  const q = $('qGrid'); q.innerHTML = '';
  for (const k of Object.keys(QUAL)) { const b = document.createElement('button'); b.className = 'tbtn'; b.textContent = QNAME[k]; b.setAttribute('aria-pressed', pick.q === k); b.onclick = () => { pick.q = k; renderChordDlg(); }; q.appendChild(b); }
  $('chordTitle').textContent = `${Math.floor(chordSlot / BEATS) + 1}마디 ${chordSlot % BEATS + 1}박 코드 · ${chordName(pick)}`;
}
$('chordOk').onclick = () => { pushUndo(); curPat().chords[chordSlot] = {...pick}; save(); dlg.close(); drawChordRow(); drawPlaylist(); };
$('chordNone').onclick = () => { pushUndo(); curPat().chords[chordSlot] = null; save(); dlg.close(); drawChordRow(); };
$('chordStop').onclick = () => { pushUndo(); curPat().chords[chordSlot] = {x:1}; save(); dlg.close(); drawChordRow(); };
$('chordHear').onclick = () => { ensureCtx(); applyMix(E, S.mix); chordPlay(E, S.chordInst, chordVoices(pick), ctx.currentTime + 0.02, 1.4); };

// ---- 마디 복사 (지금 패턴의 모든 채널 · 코드) ----
$('cpGo').onclick = () => {
  const P = curPat(); let a = +$('cpFrom').value, b = +$('cpTo').value, c = +$('cpDest').value; if (b < a) [a, b] = [b, a];
  const n = b - a + 1;
  if (c + n - 1 > P.bars) { status(`붙일 자리가 모자라요. ${c}마디부터 ${n}마디를 붙이려면 패턴이 ${c + n - 1}마디 이상이어야 해요.`); return; }
  pushUndo();
  const BT = BAR_T, s0 = (a - 1) * BT, s1 = b * BT, d0 = (c - 1) * BT, d1 = d0 + n * BT, shift = d0 - s0;
  for (const cid of Object.keys(P.notes)) {
    const arr = P.notes[cid], src = arr.filter(x => x.s >= s0 && x.s < s1).map(x => ({p:x.p, s:x.s + shift, l:Math.min(x.l, s1 - x.s), v:x.v}));
    P.notes[cid] = arr.filter(x => !(x.s >= d0 && x.s < d1)).concat(src);
  }
  const ch = P.chords.slice((a - 1) * BEATS, b * BEATS); for (let i = 0; i < ch.length; i++) P.chords[(c - 1) * BEATS + i] = ch[i] ? {...ch[i]} : null;
  sel.clear(); save(); refreshAll(); status(`${a}~${b}마디를 ${c}~${c + n - 1}마디에 복사했어요 (이 패턴의 모든 채널·코드).`);
};

// ---- 퀀타이즈: 고른 음(없으면 이 채널 전체)을 스냅 칸에 맞춤 ----
function quantizeNotes() {
  const arr = selNotes().length ? selNotes() : curNotes(); if (!arr.length) { status('맞출 음이 없어요.'); return 0; }
  const mode = $('qzMode').value, g = S.snap, k = mode === 'half' ? 0.5 : 1, T = totalTicks(); let moved = 0;
  pushUndo();
  for (const n of arr) {
    const s0 = n.s, l0 = n.l, e0 = n.s + n.l; n.s = clamp(Math.round(n.s + (Math.round(n.s / g) * g - n.s) * k), 0, T - 1);
    n.l = mode === 'both' ? Math.max(g, Math.round(e0 / g) * g - n.s) : l0; n.l = Math.max(1, Math.min(n.l, T - n.s));
    if (n.s !== s0 || n.l !== l0) moved++;
  }
  // 맞춘 뒤 같은 자리·같은 음이 겹치면 하나만 (센 쪽)
  const keep = new Map(); for (const n of curNotes()) { const key = n.p + ':' + n.s, o = keep.get(key); if (!o || n.v > o.v) keep.set(key, n); }
  const before = curNotes().length; curPat().notes[curCh().id] = curNotes().filter(n => keep.get(n.p + ':' + n.s) === n); sel = new Set([...sel].filter(n => curNotes().includes(n)));
  save(); drawRoll(); drawLanes(); drawRack();
  const merged = before - curNotes().length; status(`${arr.length}음 중 ${moved}음을 스냅(${S.snap}틱) 칸에 맞췄어요` + (merged ? ` · 겹친 ${merged}음은 합쳤어요` : '') + '.');
  return moved;
}
$('qzBtn').onclick = quantizeNotes;

// ---- 피치 벤드 줄 편집 ----
let bendDrag = null;
function bendNoteAt(x) { return curNotes().filter(n => x >= n.s * TICKPX && x <= (n.s + n.l) * TICKPX).sort((a, b) => b.s - a.s)[0]; }
const bendVal = y => clamp(Math.round((CHORD_H + VEL_H / 2 - y) / (VEL_H / 2 - 5) * 12), -12, 12);
lc.addEventListener('pointerdown', e => {
  if (laneMode !== 'bend') return; const q = laneHit(e); if (q.y < CHORD_H) return; e.stopImmediatePropagation();
  const n = bendNoteAt(q.x); if (!n) return; pushUndo(); bendDrag = sel.has(n) ? selNotes() : [n]; for (const m of bendDrag) { m.b = bendVal(q.y); if (!m.b) delete m.b; } drawLanes();
  try { lc.setPointerCapture(e.pointerId); } catch (_) {}
}, true);
lc.addEventListener('pointermove', e => { if (!bendDrag) return; const q = laneHit(e); for (const m of bendDrag) { m.b = bendVal(q.y); if (!m.b) delete m.b; } drawLanes(); });
lc.addEventListener('pointerup', () => { if (!bendDrag) return; const b = bendDrag[0].b || 0; bendDrag = null; save(); announce(`피치 벤드 ${b > 0 ? '+' : ''}${b}반음`); });
lc.addEventListener('dblclick', e => { if (laneMode !== 'bend') return; const n = bendNoteAt(laneHit(e).x); if (n && n.b) { pushUndo(); delete n.b; save(); drawLanes(); } });

/* 04-audio.js — 소리 엔진 (음색 · 믹서 채널 · 사이드체인 · 피아노 샘플)
   채널은 필요할 때 만들어져요: 채널 랙의 채널마다 'ch:<id>', 그리고 코드·베이스 */
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const SAMPLES = {};            // 샘플 칸 → {buf, root, name}
const PIANO = {};              // 건반 번호 → AudioBuffer (Salamander Grand Piano, CC-BY 3.0)
const PIANO_CDN = 'https://cdn.jsdelivr.net/gh/Tonejs/audio@master/salamander/';
const PIANO_L = {soft:{}, hard:{}}, PIANO_LG = {soft:{}, hard:{}};   // 세기 층: 약하게(v4)·세게(v14) 녹음과 크기 맞춤 배수
let ctx = null, E = null, pianoState = 'wait';

// ---- 피아노 소리: piano.js가 뒤에서 도착하면 그때 준비 (그동안은 합성 피아노) ----
function pianoStat(t) { const el = $('pianoStat'); if (el) el.textContent = t; }
async function decodePianoB64(src, into = PIANO) {
  for (const [k, b64] of Object.entries(src)) {
    try { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); into[+k] = await decode(u.buffer); } catch (e) {}
  }
}
// 세기 층은 기본 피아노가 준비된 뒤에 뒤에서 불러와요 (한 파일 버전은 이미 들어 있음)
let layerState = 'wait';
async function decodeLayers() {
  const L = window.PIANO_LAYERS || {};
  for (const n of ['soft', 'hard']) if (L[n] && !Object.keys(PIANO_L[n]).length) { Object.assign(PIANO_LG[n], L[n].gain); await decodePianoB64(L[n].s, PIANO_L[n]); delete L[n].s; }
  if (Object.keys(PIANO_L.soft).length && Object.keys(PIANO_L.hard).length && layerState !== 'ready') { layerState = 'ready'; pianoStat(tMsg('피아노 세기 층 준비됨') + tMsg(' (약하게·세게 친 녹음)')); setTimeout(() => pianoStat(''), 3000); }
}
function loadLayers() {
  if (layerState !== 'wait') return; layerState = 'loading';
  window.addEventListener('piano-layer-ready', () => decodeLayers());
  const L = window.PIANO_LAYERS || {};
  for (const n of ['soft', 'hard']) if (!L[n]) { const sc = document.createElement('script'); sc.src = `piano-${n}.js`; sc.async = true; document.head.appendChild(sc); }
  decodeLayers();
}
async function loadPianoCDN() {
  const pc = {C:0, Ds:3, Fs:6, A:9}, list = [[96, 'C7']];
  for (let o = 2; o <= 6; o++) for (const n of ['C', 'Ds', 'Fs', 'A']) list.push([12 * (o + 1) + pc[n], n + o]);
  await Promise.all(list.map(async ([m, nm]) => { try { const r = await fetch(PIANO_CDN + nm + '.mp3'); if (r.ok) PIANO[m] = await decode(await r.arrayBuffer()); } catch (e) {} }));
}
async function preparePiano() {
  if (pianoState !== 'wait') return; pianoState = 'loading';
  if (window.PIANO_SAMPLES) await decodePianoB64(window.PIANO_SAMPLES); else await loadPianoCDN();
  pianoState = Object.keys(PIANO).length ? 'ready' : 'fail';
  pianoStat(pianoState === 'ready' ? '녹음 피아노 준비됨' : '녹음 피아노를 못 불러와서 합성 피아노를 써요');
  setTimeout(() => { if (pianoState === 'ready' && layerState !== 'ready') pianoStat(''); }, 3000);
  if (pianoState === 'ready' && window.PIANO_SAMPLES) loadLayers();
}
// ---- 서버 에셋: /assets/piano/{base,soft,hard}/<음>.mp3 — 한 번 받으면 내 컴퓨터(캐시)에 보관 ----
const ASSET_BASE = (window.MSK_SERVER || '') + '/assets/piano/', ASSET_CACHE = 'msk-assets-v1';
async function fetchCached(url, networkFirst) {
  let cache = null; try { cache = await caches.open(ASSET_CACHE); } catch (e) {}
  if (cache && !networkFirst) { const hit = await cache.match(url).catch(() => null); if (hit) return hit.arrayBuffer(); }
  try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); if (cache) cache.put(url, r.clone()).catch(() => {}); return await r.arrayBuffer(); }
  catch (e) { if (cache) { const hit = await cache.match(url).catch(() => null); if (hit) return hit.arrayBuffer(); } throw e; }
}
async function loadPianoAssets() {
  if (location.protocol === 'file:' && !window.MSK_SERVER) return false;   // 파일로 연 웹 페이지는 예전 방식(piano.js)
  try {
    const man = JSON.parse(new TextDecoder().decode(await fetchCached(ASSET_BASE + 'manifest.json', true))), L = man.layers;
    const one = async (layer, k, into) => { into[k] = await decode(await fetchCached(`${ASSET_BASE}${layer}/${k}.mp3`)); };
    // 6 최적화: 자주 쓰는 가운데 음역(C3~C6)을 먼저 받아 바로 소리가 나게, 바깥쪽은 뒤에서
    const mid = L.base.keys.filter(k => k >= 48 && k <= 84), out = L.base.keys.filter(k => k < 48 || k > 84);
    await Promise.all(mid.map(k => one('base', k, PIANO)));
    pianoState = 'ready'; pianoStat('녹음 피아노 준비됨 (서버)');
    Promise.all(out.map(k => one('base', k, PIANO).catch(() => {})));
    // 6 최적화: 기본 층으로 이미 소리가 나므로, 세기 층(약하게·세게)은 화면이 한가할 때 뒤에서 받음
    const rest = async () => { layerState = 'loading';
      for (const n of ['soft', 'hard']) if (L[n]) { Object.assign(PIANO_LG[n], L[n].gain); await Promise.all(L[n].keys.map(k => one(n, k, PIANO_L[n]))); }
      layerState = 'ready'; pianoStat(tMsg('피아노 세기 층 준비됨')); setTimeout(() => pianoStat(''), 3000); };
    (window.requestIdleCallback || (f => setTimeout(f, 800)))(() => rest(), {timeout:4000});
    return true;
  } catch (e) { if (!Object.keys(PIANO).length) return false; layerState = 'wait'; return true; }   // 기본 층은 받았으면 그대로 씀
}
function watchPiano() {
  if (window.PIANO_SAMPLES) { preparePiano(); return; }
  pianoStat('녹음 피아노 불러오는 중… (그동안은 합성 피아노)');
  window.addEventListener('piano-samples-ready', () => preparePiano(), {once:true});
  // 화면을 그린 뒤에 요청 → 느린 네트워크에서도 앱이 먼저 떠요. 못 받으면 CDN으로
  setTimeout(() => loadPianoAssets().then(ok => { if (ok) return; const sc = document.createElement('script'); sc.src = window.PIANO_SRC || 'piano.js'; sc.async = true; sc.onerror = () => preparePiano(); document.head.appendChild(sc); }), 30);
}
function pianoSample(E, m, t, d, vel, dest, T) {
  T = T || toneDefault(); const keys = Object.keys(PIANO).map(Number); if (!keys.length) return false;
  let r = keys[0]; for (const k of keys) if (Math.abs(k - m) < Math.abs(r - m)) r = k;
  const ac = E.ac, rate = Math.pow(2, (m - r) / 12);
  // 세기 층 섞기: 약하게 ~0.3 | 섞음 | 0.55~0.75 기본 | 섞음 | 0.95~ 세게 (소리 크기가 같게 섞는 코사인 곡선)
  const hasL = PIANO_L.soft[r] && PIANO_L.hard[r], ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1), cf = x => [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];
  let layers = [[PIANO[r], 1]];
  if (hasL) { if (vel < 0.55) { const [a, b] = cf(ramp(vel, 0.3, 0.55)); layers = [[PIANO_L.soft[r], a * (PIANO_LG.soft[r] || 1)], [PIANO[r], b]]; }
    else if (vel > 0.75) { const [a, b] = cf(ramp(vel, 0.75, 0.95)); layers = [[PIANO[r], a], [PIANO_L.hard[r], b * (PIANO_LG.hard[r] || 1)]]; } }
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(18000, ((hasL ? 5000 : 2200) + (hasL ? 11000 : 11000) * vel) * T.br); lp.Q.value = 0.5;
  let longest = 0; const srcs = [];
  for (const [buf, w] of layers) { if (!buf || w < 0.01) continue; const src = ac.createBufferSource(), lg = ac.createGain(); src.buffer = buf; src.playbackRate.value = rate; bendParam(src.playbackRate, rate); lg.gain.value = w; src.connect(lg); lg.connect(lp); srcs.push(src); longest = Math.max(longest, buf.duration); }
  const g = ac.createGain(), lv = (0.45 + 0.55 * vel) * 0.9;
  if (T.atk > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(lv, t + T.atk); } else g.gain.setValueAtTime(lv, t);
  const off = Math.max(t + d, t + 0.08 + T.atk); g.gain.setValueAtTime(lv, off); g.gain.setTargetAtTime(0.0001, off, Math.max(0.03, T.rel) / 3);
  lp.connect(g); g.connect(dest);
  for (const src of srcs) { src.start(t); src.stop(Math.min(off + Math.max(0.6, T.rel * 2), t + longest / rate + 0.05)); } return true;
}

// ---- 엔진 ----
function ensureCtx() { if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); E = makeEngine(ctx, true); applyMix(E, S.mix); } if (ctx.state === 'suspended') ctx.resume(); }
function makeIR(ac, sec) {
  const len = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < ac.sampleRate * 0.012 ? i / (ac.sampleRate * 0.012) : 1); } }
  return b;
}
function makeEngine(ac, live) {
  const E = {ac, ch:{}}, mk = () => ac.createGain();
  // 마스터: 글루 압축 → 부드러운 클리핑 → 리미터
  E.in = mk(); const glue = ac.createDynamicsCompressor(); glue.threshold.value = -16; glue.ratio.value = 2.5; glue.attack.value = 0.01; glue.release.value = 0.2;
  const shp = ac.createWaveShaper(), cv = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; cv[i] = Math.tanh(1.3 * x) / Math.tanh(1.3); } shp.curve = cv; shp.oversample = '2x';
  const lim = ac.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08;
  E.out = mk(); E.mfx = {fxIn:mk(), fxOut:mk(), fxSig:'', fxNodes:[]}; E.mAuto = mk();   // 마스터 이펙트 칸 · 곡 자동화(마스터 볼륨)
  E.in.connect(E.mfx.fxIn); E.mfx.fxIn.connect(E.mfx.fxOut); E.mfx.fxOut.connect(E.mAuto); E.mAuto.connect(glue); glue.connect(shp); shp.connect(lim); lim.connect(E.out); E.out.connect(ac.destination);
  if (live) { E.meter = ac.createAnalyser(); E.meter.fftSize = 1024; E.out.connect(E.meter); }
  // 공간: 리버브 · 핑퐁 딜레이
  E.rev = ac.createConvolver(); E.revRet = mk(); E.revRet.gain.value = 0.9; E.rev.connect(E.revRet); E.revRet.connect(E.in);
  const dl = ac.createDelay(2), dr = ac.createDelay(2), fbl = mk(), fbr = mk(), dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 4500;
  const mg = ac.createChannelMerger(2); E.dlyIn = mk(); E.dlyIn.connect(dlp); dlp.connect(dl); dl.connect(dr); dl.connect(fbl); dr.connect(fbr); fbr.connect(dl);
  dl.connect(mg, 0, 0); dr.connect(mg, 0, 1); E.dlyRet = mk(); E.dlyRet.gain.value = 0.7; mg.connect(E.dlyRet); E.dlyRet.connect(E.in); E._dl = [dl, dr, fbl, fbr];
  const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; E.noise = nb;
  E.waves = makeWaves(ac); E.size = -1;
  return E;
}
// 채널: 입력 → 사이드체인 → EQ(저·중·고) → 이펙트 칸 → 자동화(볼륨·필터) → 볼륨 → 팬 → 마스터 (+ 리버브·딜레이 센드)
function getCh(E, key) {
  if (E.ch[key]) return E.ch[key];
  const ac = E.ac, mk = () => ac.createGain();
  const inp = mk(), duck = mk(), vol = mk(), pan = ac.createStereoPanner(), rs = mk(), ds = mk();
  const lo = ac.createBiquadFilter(), md = ac.createBiquadFilter(), hi = ac.createBiquadFilter();
  lo.type = 'lowshelf'; lo.frequency.value = 180; md.type = 'peaking'; md.frequency.value = 1200; md.Q.value = 0.8; hi.type = 'highshelf'; hi.frequency.value = 5000;
  // 곡 자동화용: sVol · sCut · sPan (패턴 자동화 aVol·aCut과 따로)
  const sVol = mk(), sCut = ac.createBiquadFilter(), sPan = ac.createStereoPanner(); sCut.type = 'lowpass'; sCut.frequency.value = AUTO_CUT_MAX; sCut.Q.value = 0.7;
  const fxIn = mk(), fxOut = mk(), aVol = mk(), aCut = ac.createBiquadFilter(); aCut.type = 'lowpass'; aCut.frequency.value = AUTO_CUT_MAX; aCut.Q.value = 0.7;
  inp.connect(duck); duck.connect(lo); lo.connect(md); md.connect(hi); hi.connect(fxIn); fxIn.connect(fxOut); fxOut.connect(aVol); aVol.connect(aCut); aCut.connect(sVol); sVol.connect(sCut); sCut.connect(vol); vol.connect(pan); pan.connect(sPan); pan.connect(rs); pan.connect(ds); rs.connect(E.rev); ds.connect(E.dlyIn);
  const m = S.mix[key] || chDefault(key, key.startsWith('ch:') ? chById(key.slice(3)) : null); vol.gain.value = m.v; pan.pan.value = m.pan; rs.gain.value = m.rev; ds.gain.value = m.dly;
  sPan.connect(outDest(E, key, m));   // 출력: 마스터 또는 버스 (m이 정해진 뒤에)
  const ch = E.ch[key] = {inp, duck, vol, pan, rs, ds, lo, md, hi, fxIn, fxOut, aVol, aCut, sVol, sCut, sPan, outKey:outKey(key, m), fxSig:'', fxNodes:[]};
  applyFx(E, ch, m.fx || []); return ch;
}
// 채널 출력: 마스터 또는 버스 1·2 (버스 자신은 늘 마스터로)
const BUSES = ['bus1', 'bus2'], outKey = (key, m) => !BUSES.includes(key) && key !== 'master' && m && BUSES.includes(m.out) ? m.out : 'master';
function outDest(E, key, m) { const o = outKey(key, m); return o === 'master' ? E.in : getCh(E, o).inp; }
// ---- 이펙트 칸 (채널마다 3칸) — a·b는 0~1 손잡이 ----
const FX_TYPES = ['', 'comp', 'dist', 'lpf', 'hpf', 'chorus', 'reverb', 'delay', 'eq', 'width', 'eq4', 'gate'], FX_SLOTS = 5, FX_KEYS = ['a', 'b', 'c', 'd'];   // 뒤에만 덧붙이기 (MSK 번호표)
const FX_NAME = {'':'비어 있음', comp:'압축기', dist:'디스토션', lpf:'로우패스', hpf:'하이패스', chorus:'코러스', reverb:'리버브', delay:'딜레이', eq:'EQ (한 밴드)', width:'스테레오 폭', eq4:'EQ (4밴드)', gate:'트랜스 게이트'};
const FX_KNOBS = {comp:['임계값', '비율'], dist:['세기', '밝기'], lpf:['주파수', '공명'], hpf:['주파수', '공명'], chorus:['깊이', '섞기'], reverb:['길이', '섞기'], delay:['시간', '섞기'], eq:['주파수', '증감'], width:['폭', '출력'], eq4:['저음 100Hz', '중저 500Hz', '중고 2.5kHz', '고음 8kHz'], gate:['박자', '깊이']};
const FX_AUTOK = {comp:0, dist:1, lpf:0, hpf:0, chorus:1, reverb:1, delay:1, eq:1, width:0, eq4:0, gate:1};   // 곡 자동화가 움직이는 손잡이
const DELAY_NOTES = [[0.25, '1/16'], [0.5, '1/8'], [0.75, '3/16'], [1, '1/4'], [1.5, '3/8'], [2, '1/2']];
const FX_DEF = {comp:[0.7, 0.16], dist:[0.3, 0.5], lpf:[0.7, 0.1], hpf:[0.2, 0.1], chorus:[0.5, 0.4], reverb:[0.35, 0.3], delay:[0.55, 0.3], eq:[0.5, 0.65], width:[0.75, 0.67], eq4:[0.5, 0.5, 0.5, 0.5], gate:[0.5, 0.8]};
const AUTO_CUT_MAX = 18000, cutHz = v => 40 * Math.pow(AUTO_CUT_MAX / 40, clamp(v, 0, 1));   // 0~1 → 40Hz~18kHz (귀에 고르게)
function makeFx(ac, f) {
  const g = () => ac.createGain(), a = f.a, b = f.b;
  if (f.type === 'comp') {   // 압축기: 큰 소리를 눌러 고르게, 줄어든 만큼 다시 키움
    const c = ac.createDynamicsCompressor(), thr = -60 + a * 60, ratio = 1 + b * 19, mk = g();
    c.threshold.value = thr; c.ratio.value = ratio; c.knee.value = 6; c.attack.value = 0.005; c.release.value = 0.15;
    mk.gain.value = Math.pow(10, (-thr * (1 - 1 / ratio)) / 40); c.connect(mk); return {inp:c, out:mk, pa:c.threshold, map:v => -60 + v * 60};
  }
  if (f.type === 'dist') {   // 디스토션: tanh로 찌그러뜨리고 로우패스로 밝기 조절
    const pre = g(), sh = ac.createWaveShaper(), tone = ac.createBiquadFilter(), post = g(), k = 1 + a * 30, cv = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); } sh.curve = cv; sh.oversample = '2x';
    tone.type = 'lowpass'; tone.frequency.value = 1500 + b * 16000; post.gain.value = 1 / (1 + a * 1.5);
    pre.connect(sh); sh.connect(tone); tone.connect(post); return {inp:pre, out:post, pa:tone.frequency, map:v => 1500 + v * 16000};
  }
  if (f.type === 'lpf' || f.type === 'hpf') { const q = ac.createBiquadFilter(); q.type = f.type === 'lpf' ? 'lowpass' : 'highpass'; q.frequency.value = cutHz(a); q.Q.value = 0.5 + b * 15; return {inp:q, out:q, pa:q.frequency, map:cutHz}; }
  if (f.type === 'chorus') {   // 코러스: 살짝 흔들리는 지연 소리를 섞어서 넓게
    const inp = g(), out = g(), dry = g(), wet = g(), d1 = ac.createDelay(0.1), d2 = ac.createDelay(0.1), lfo = ac.createOscillator(), dep = g(), dep2 = g(), p1 = ac.createStereoPanner(), p2 = ac.createStereoPanner();
    d1.delayTime.value = 0.017; d2.delayTime.value = 0.023; lfo.frequency.value = 0.8; dep.gain.value = 0.002 + a * 0.006; dep2.gain.value = -(0.002 + a * 0.006);
    lfo.connect(dep); lfo.connect(dep2); dep.connect(d1.delayTime); dep2.connect(d2.delayTime); lfo.start();
    p1.pan.value = -0.6; p2.pan.value = 0.6; dry.gain.value = 1 - b * 0.4; wet.gain.value = b * 0.8;
    inp.connect(dry); dry.connect(out); inp.connect(d1); inp.connect(d2); d1.connect(p1); d2.connect(p2); p1.connect(wet); p2.connect(wet); wet.connect(out);
    return {inp, out, pa:wet.gain, map:v => v * 0.8, stop:() => { try { lfo.stop(); } catch (e) {} }};
  }
  if (f.type === 'reverb') {   // 리버브: 잡음을 지수로 줄인 울림(IR)을 합성
    const inp = g(), out = g(), dry = g(), wet = g(), cv = ac.createConvolver(), sec = 0.4 + a * 4, n = Math.floor(ac.sampleRate * sec), ir = ac.createBuffer(2, n, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    cv.buffer = ir; dry.gain.value = 1 - b * 0.5; wet.gain.value = b; inp.connect(dry); dry.connect(out); inp.connect(cv); cv.connect(wet); wet.connect(out);
    return {inp, out, pa:wet.gain, map:v => v};
  }
  if (f.type === 'delay') {   // 딜레이: 템포에 맞춘 시간, 되먹임 40%, 되먹임은 점점 어둡게
    const inp = g(), out = g(), wet = g(), dl = ac.createDelay(4), fb = g(), lp = ac.createBiquadFilter(), beats = DELAY_NOTES[Math.min(5, Math.floor(a * 6))][0];
    dl.delayTime.value = Math.min(3.9, beats * 60 / S.bpm); fb.gain.value = 0.4; lp.type = 'lowpass'; lp.frequency.value = 5000; wet.gain.value = b;
    inp.connect(out); inp.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(out);
    return {inp, out, pa:wet.gain, map:v => v};
  }
  if (f.type === 'eq') { const q = ac.createBiquadFilter(); q.type = 'peaking'; q.frequency.value = cutHz(a); q.Q.value = 1.2; q.gain.value = (b - 0.5) * 24; return {inp:q, out:q, pa:q.gain, map:v => (v - 0.5) * 24}; }
  if (f.type === 'width') {   // 스테레오 폭: 가운데(L+R)는 그대로, 옆(L−R)을 w배
    const inp = g(), out = g(), sp = ac.createChannelSplitter(2), mg = ac.createChannelMerger(2), w = a * 2;
    inp.channelCount = 2; inp.channelCountMode = 'explicit'; inp.channelInterpretation = 'speakers'; inp.connect(sp);
    const link = (from, to, v) => { const k = g(); k.gain.value = v; sp.connect(k, from); k.connect(mg, 0, to); };
    link(0, 0, 0.5 + w / 2); link(1, 0, 0.5 - w / 2); link(0, 1, 0.5 - w / 2); link(1, 1, 0.5 + w / 2);
    out.gain.value = b * 1.5; mg.connect(out); return {inp, out};
  }
  if (f.type === 'eq4') {   // 4밴드 EQ: 저음 셸프 · 피크 둘 · 고음 셸프, 손잡이마다 ±12dB
    const bands = [['lowshelf', 100], ['peaking', 500], ['peaking', 2500], ['highshelf', 8000]].map(([ty, hz], i) => { const q = ac.createBiquadFilter(); q.type = ty; q.frequency.value = hz; q.Q.value = 0.9; q.gain.value = ((f[FX_KEYS[i]] == null ? 0.5 : f[FX_KEYS[i]]) - 0.5) * 24; return q; });
    for (let i = 0; i < 3; i++) bands[i].connect(bands[i + 1]); return {inp:bands[0], out:bands[3], pa:bands[0].gain, map:v => (v - 0.5) * 24};
  }
  if (f.type === 'gate') {   // 트랜스 게이트: 템포에 맞춘 사각파로 소리를 켰다 껐다 (1/4·1/8·1/16·1/32)
    const inp = g(), out = g(), lfo = ac.createOscillator(), sh = ac.createWaveShaper(), div = [1, 2, 4, 8][Math.min(3, Math.floor(a * 4))], dep = clamp(b, 0, 1), cv = new Float32Array(256);
    for (let i = 0; i < 256; i++) cv[i] = i < 128 ? 1 - dep : 1; sh.curve = cv; lfo.type = 'square'; lfo.frequency.value = S.bpm / 60 * div; out.gain.value = 0;
    lfo.connect(sh); sh.connect(out.gain); lfo.start(0); inp.connect(out); return {inp, out, stop:() => { try { lfo.stop(); } catch (e) {} }};
  }
  return null;
}
function applyFx(E, ch, fx) {
  const sig = JSON.stringify(fx); if (sig === ch.fxSig) return; ch.fxSig = sig;
  try { ch.fxIn.disconnect(); } catch (e) {}
  for (const n of ch.fxNodes) { try { n.out.disconnect(); } catch (e) {} if (n.stop) n.stop(); }
  ch.fxNodes = []; let prev = ch.fxIn;
  for (const f of fx) { const n = makeFx(E.ac, f); if (!n) continue; prev.connect(n.inp); prev = n.out; ch.fxNodes.push(n); }
  prev.connect(ch.fxOut);
}
function applyMix(E, mix) {
  const t = E.ac.currentTime, keys = Object.keys(mix).filter(k => k !== 'master'), anySolo = keys.some(k => mix[k].solo);
  for (const k of keys) {
    const m = mix[k], ch = getCh(E, k), on = !m.mute && (!anySolo || m.solo || (BUSES.includes(k) && keys.some(j => mix[j].solo && mix[j].out === k)));   // 솔로한 채널이 이 버스로 가면 버스도 켜둠
    const ok = outKey(k, m); if (ch.outKey !== ok) { try { ch.sPan.disconnect(); } catch (e) {} ch.sPan.connect(outDest(E, k, m)); ch.outKey = ok; }
    ch.vol.gain.setTargetAtTime(on ? m.v : 0, t, 0.015); ch.pan.pan.setTargetAtTime(m.pan, t, 0.015); ch.rs.gain.setTargetAtTime(m.rev, t, 0.015); ch.ds.gain.setTargetAtTime(m.dly, t, 0.015);
    ch.lo.gain.setTargetAtTime(m.lo || 0, t, 0.015); ch.md.gain.setTargetAtTime(m.mid || 0, t, 0.015); ch.hi.gain.setTargetAtTime(m.hi || 0, t, 0.015);
    applyFx(E, ch, m.fx || []);
  }
  if (mix.master) applyFx(E, E.mfx, mix.master.fx || []);
  for (const k of Object.keys(E.ch)) if (!mix[k]) E.ch[k].vol.gain.setTargetAtTime(0, t, 0.015);   // 지운 트랙
  E.out.gain.setTargetAtTime(mix.master.v, t, 0.015);
  const secs = [0.9, 1.6, 2.6, 3.8][mix.master.size] || 1.6; if (E.size !== mix.master.size) { E.rev.buffer = makeIR(E.ac, secs); E.size = mix.master.size; }
  const beat = 60 / S.bpm, [dl, dr, fbl, fbr] = E._dl; dl.delayTime.setValueAtTime(beat * 0.75, t); dr.delayTime.setValueAtTime(beat * 0.75, t); fbl.gain.value = 0.35; fbr.gain.value = 0.35;
}
function playSample(E, slot, m, t, d, vel, dest) {
  const s = SAMPLES[slot]; if (!s) return false;
  const ch = slot.startsWith('ch:') ? chById(slot.slice(3)) : null, cfg = ch && ch.smp, dur = s.buf.duration;
  if (cfg && cfg.slices && m != null) {   // 조각: C4부터 건반마다 한 조각, 음높이는 그대로
    const N = cfg.slices, k = ((m - 60) % N + N) % N, len = dur / N, src = E.ac.createBufferSource(), g = E.ac.createGain(); src.buffer = s.buf; g.gain.value = vel;
    src.connect(g); g.connect(dest); const play = Math.min(len, d != null ? d + 0.02 : len); src.start(t, k * len, play); g.gain.setValueAtTime(vel, t + Math.max(0, play - 0.01)); g.gain.linearRampToValueAtTime(0.0001, t + play); src.stop(t + play + 0.02); return true;
  }
  const src = E.ac.createBufferSource(); src.buffer = s.buf; src.playbackRate.value = m == null ? 1 : Math.pow(2, (m - s.root) / 12); bendParam(src.playbackRate, src.playbackRate.value);
  if (cfg && cfg.loop && d != null) { src.loop = true; src.loopStart = cfg.ls * dur; src.loopEnd = Math.max(cfg.ls * dur + 0.01, cfg.le * dur); }   // 구간 반복: 누르는 동안 계속
  const g = E.ac.createGain(); g.gain.setValueAtTime(vel, t);
  if (d != null) { g.gain.setValueAtTime(vel, t + d); g.gain.linearRampToValueAtTime(0.0001, t + d + 0.08); }
  src.connect(g); g.connect(dest); src.start(t); src.stop(t + (d != null ? d + 0.1 : s.buf.duration / src.playbackRate.value + 0.05)); return true;
}
function sidechain(EE, t) {
  const amt = S.mix.master.sc; if (amt <= 0) return; const beat = 60 / S.bpm;
  for (const k of Object.keys(S.mix)) {
    if (k === 'master' || !S.mix[k].sc) continue;
    const g = getCh(EE, k).duck.gain; g.setValueAtTime(1 - amt * (k === 'bass' ? 1 : 0.85), t); g.setTargetAtTime(1, t + 0.02, beat * 0.18);
  }
}
// 지금 트랙 악기로 한 음 들려주기
function playTrackNote(EE, ch, p, t, d, v, b) {
  if (ch.kind === 'drum') { drumHit(ch.inst, t, EE, v, chKey(ch)); return; }
  if (ch.inst === 'kit') { kitHit(p, t, EE, v, chKey(ch)); return; }
  if (b) BEND = {r:Math.pow(2, b / 12), t0:t + Math.min(0.08, d * 0.25), t1:t + Math.max(0.02, d)};   // 음이 끝날수록 b반음까지 휨
  const dest = getCh(EE, chKey(ch)).inp;
  if (!b && typeof smpPlay === 'function' && smpPlay(EE, ch, p, t, d, v, dest)) { BEND = null; return; }   // 샘플이 준비됐으면 샘플로 (음 휘기는 합성으로)
  try { voice(EE, typeof playInst === 'function' ? playInst(ch.inst) : ch.inst, p, t, d, v, dest, ch.tone, chKey(ch)); } finally { BEND = null; }
}
function preview(p, v) { ensureCtx(); playTrackNote(E, curTrack(), p, ctx.currentTime + 0.01, 0.3, v == null ? 0.9 : v); }

// ---- 음색 (파형 · 봉투 · 악기들) ----
function makeWaves(ac){const N=40,re=new Float32Array(N),im=new Float32Array(N);
  for(let k=1;k<N;k++)im[k]=Math.pow(k,-1.25)*(k%7===0?0.2:1)*(1+0.3*Math.sin(k*1.7));   // 피아노 배음
  const piano=ac.createPeriodicWave(re,im);
  const re2=new Float32Array(N),im2=new Float32Array(N);for(let k=1;k<N;k++)im2[k]=(2/(k*Math.PI))*Math.sin(k*Math.PI*0.25);   // 25% 펄스
  const pulse=ac.createPeriodicWave(re2,im2);return{piano,pulse}}

function adsr(g,t,a,peak,d,sus,end,rel){g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.setTargetAtTime(peak*sus,t+a,d/3);g.gain.setTargetAtTime(0.0001,Math.max(end,t+a),rel/4)}
let BEND = null;   // 피치 벤드: {r:목표 배수, t0, t1} — 음을 예약하는 동안만 켜짐
function bendParam(prm, v0) { if (BEND) { prm.setValueAtTime(v0, BEND.t0); prm.exponentialRampToValueAtTime(v0 * BEND.r, BEND.t1); } }
function osc(ac,type,f,det,t,stop,dest){const o=ac.createOscillator();if(typeof type==='string')o.type=type;else o.setPeriodicWave(type);o.frequency.value=f;bendParam(o.frequency,f);o.detune.value=det||0;o.connect(dest);o.start(t);o.stop(stop);return o}
function noiseBurst(E,t,d,type,f,q,v,dest){const s=E.ac.createBufferSource();s.buffer=E.noise;s.loop=true;const fl=E.ac.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=E.ac.createGain();
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+d);s.connect(fl);fl.connect(g);g.connect(dest);s.start(t,Math.random()*0.5);s.stop(t+d+0.05)}

function voice(E,inst,m,t,d,vel=1,dest,tone,slot){const ac=E.ac,f=hz(m),end=t+d;dest=dest||getCh(E,trackKey(curTrack())).inp;const T=tone||toneDefault(),br=T.br,rel=Math.max(0.03,T.rel),atk=T.atk;if(inst==='synth'){synthVoice(E,f,t,d,vel,dest,slot);return}
  if(inst==='sample'){if(playSample(E,slot||'melody',m,t,d,vel*0.9,dest)||playSample(E,'melody',m,t,d,vel*0.9,dest))return;inst='piano'}
  if(inst==='bass'){   // 서브 베이스: 사인파 + 약한 찌그러짐(배음) + 낮은 필터
    const g=ac.createGain(),sh=ac.createWaveShaper(),lp=ac.createBiquadFilter(),cv=new Float32Array(256);for(let i=0;i<256;i++){const x=i/127.5-1;cv[i]=Math.tanh(1.8*x)/Math.tanh(1.8)}sh.curve=cv;
    lp.type='lowpass';lp.frequency.value=Math.min(4000,420*br);sh.connect(lp);lp.connect(g);g.connect(dest);const st=end+rel+0.1;
    osc(ac,'sine',f,0,t,st,sh);const o2=ac.createGain();o2.gain.value=0.25;o2.connect(sh);osc(ac,'triangle',f,0,t,st,o2);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.55*vel,t+0.006+atk);g.gain.setValueAtTime(0.55*vel,Math.max(end,t+0.01));g.gain.setTargetAtTime(0.0001,Math.max(end,t+0.01),rel/4);return}
  if(inst==='celesta'){   // 첼레스타: 맑은 사인파 + 4배 배음(금속 막대), 빨리 사라짐
    const g=ac.createGain();g.connect(dest);const st=t+2.2+rel;osc(ac,'sine',f,0,t,st,g);
    const h=ac.createGain();h.gain.setValueAtTime(0.35,t);h.gain.exponentialRampToValueAtTime(0.001,t+0.25);h.connect(g);osc(ac,'sine',f*4,0,t,st,h);
    const lv=0.22*vel;g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(lv,t+0.003+atk);g.gain.setTargetAtTime(0.0001,t+0.01,0.45*br);return}
  if(inst==='harp'){   // 하프: 삼각파 + 짧은 줄 튕김 잡음, 부드럽게 사라짐
    const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(Math.min(16000,f*8*br),t);lp.frequency.setTargetAtTime(Math.max(600,f*2),t,0.3);lp.connect(g);g.connect(dest);
    const st=t+Math.max(2,d+rel+1);osc(ac,'triangle',f,0,t,st,lp);const s2=ac.createGain();s2.gain.value=0.3;s2.connect(lp);osc(ac,'sine',f*2,0,t,st,s2);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.32*vel,t+0.004);g.gain.setTargetAtTime(0.0001,t+0.01,0.6);noiseBurst(E,t,0.015,'bandpass',Math.min(9000,f*6),1.5,0.04*vel,dest);return}
  if(inst==='timpani'){   // 팀파니: 낮은 사인파(살짝 내려가는 음) + 둥 하는 잡음
    const g=ac.createGain();g.connect(dest);const st=t+2.2;const o=osc(ac,'sine',f*1.02,0,t,st,g);o.frequency.setTargetAtTime(f,t,0.05);
    const o2=ac.createGain();o2.gain.value=0.3;o2.connect(g);osc(ac,'sine',f*1.5,0,t,st,o2);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.6*vel,t+0.005);g.gain.setTargetAtTime(0.0001,t+0.02,0.5);noiseBurst(E,t,0.08,'lowpass',400,0.7,0.25*vel,dest);return}
  if(inst==='strings'){   // 스트링 패드: 톱니파 4개를 조금씩 어긋나게 + 부드러운 필터 + 느린 비브라토 + 천천히 켜지고 꺼짐
    const g=ac.createGain(),lp=ac.createBiquadFilter(),hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=160;lp.type='lowpass';lp.frequency.value=Math.min(12000,(1500+f*1.1)*br);lp.Q.value=0.3;
    hp.connect(lp);lp.connect(g);g.connect(dest);const a=Math.max(0.22,atk),r=Math.max(0.7,rel*3),hold=Math.max(end,t+a),st=hold+r*2.5;
    const lfo=ac.createOscillator(),ld=ac.createGain();lfo.frequency.value=4.8;ld.gain.setValueAtTime(0,t);ld.gain.linearRampToValueAtTime(7,t+a+0.4);lfo.connect(ld);lfo.start(t);lfo.stop(st);
    [-11,-4,4,11].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=[-.55,-.2,.2,.55][i];p.connect(hp);const o=osc(ac,'sawtooth',f,c,t+i*0.004,st,p);ld.connect(o.detune)});
    const lv=0.05*(0.55+0.45*vel);g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(lv,t+a);g.gain.setValueAtTime(lv,hold);g.gain.setTargetAtTime(0.0001,hold,r/3);return}
  if(inst==='piano'&&pianoSample(E,m,t,d,vel,dest,T))return;
  if(inst==='piano'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';const b=(1400+2600*vel+f*1.5)*br;
    lp.frequency.setValueAtTime(Math.min(18000,b*2.2),t);lp.frequency.setTargetAtTime(Math.max(400,b*0.5),t+0.02,0.35);lp.connect(g);g.connect(dest);
    const st=Math.max(end,t+0.3)+rel+1.2;[-3,3].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=i?0.3:-0.3;p.connect(lp);osc(ac,E.waves.piano,f,c,t+i*0.0015,st,p)});
    const sub=ac.createGain();sub.gain.value=0.25;sub.connect(lp);osc(ac,'sine',f,0,t,st,sub);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.4*vel,t+0.004+atk);g.gain.setTargetAtTime(0.17*vel,t+0.004+atk,0.18);g.gain.setTargetAtTime(0.05*vel,t+0.3+atk,1.2);g.gain.setTargetAtTime(0.0001,Math.max(end,t+0.12),rel/3);
    noiseBurst(E,t,0.03,'bandpass',Math.min(8000,f*4),1.2,0.05*vel,dest);return}
  if(inst==='epiano'){const g=ac.createGain(),trem=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,5000*br);lp.connect(trem);trem.connect(g);g.connect(dest);
    const st=Math.max(end,t+0.2)+rel+0.3;const car=ac.createOscillator(),mod=ac.createOscillator(),mi=ac.createGain();car.frequency.value=f;mod.frequency.value=f;
    mi.gain.setValueAtTime(f*(0.6+1.4*vel)*br,t);mi.gain.setTargetAtTime(f*0.15,t,0.45);mod.connect(mi);mi.connect(car.frequency);
    const p=ac.createStereoPanner();p.pan.value=((m%12)/11-0.5)*0.6;car.connect(p);p.connect(lp);
    const tine=ac.createOscillator(),tg=ac.createGain();tine.frequency.value=f*14;tg.gain.setValueAtTime(0.12*vel,t);tg.gain.exponentialRampToValueAtTime(0.0001,t+0.06);tine.connect(tg);tg.connect(lp);
    const lfo=ac.createOscillator(),lg=ac.createGain();lfo.frequency.value=4.5;lg.gain.value=0.15;lfo.connect(lg);lg.connect(trem.gain);trem.gain.value=0.85;
    [car,mod,tine,lfo].forEach(o=>{o.start(t);o.stop(st)});
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.3*vel,t+0.003+atk);g.gain.setTargetAtTime(0.12*vel,t+0.003+atk,0.6);g.gain.setTargetAtTime(0.0001,Math.max(end,t+0.05),rel/3);return}
  if(inst==='supersaw'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.Q.value=1.2;lp.frequency.setValueAtTime(Math.min(18000,2500*br),t);lp.frequency.linearRampToValueAtTime(Math.min(18000,6500*br),t+0.05+atk);lp.frequency.setTargetAtTime(Math.min(18000,4200*br),t+0.05+atk,0.2);
    lp.connect(g);g.connect(dest);const st=end+rel+0.4;[-24,-14,-6,0,6,14,24].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,(i-3)/3));p.connect(lp);osc(ac,'sawtooth',f,c,t+(i===3?0:Math.random()*0.004),st,p)});
    const sq=ac.createGain();sq.gain.value=0.5;sq.connect(lp);osc(ac,'square',f/2,0,t,st,sq);adsr(g,t,0.006+atk,0.13*vel,0.15,0.75,end,rel);return}
  if(inst==='pluck'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.Q.value=3;lp.frequency.setValueAtTime(Math.min(18000,7000*br),t);lp.frequency.setTargetAtTime(500*br,t,0.08);lp.connect(g);g.connect(dest);
    const st=t+Math.max(d,0.2)+rel+0.6;[-8,8].forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=i?0.6:-0.6;p.connect(lp);osc(ac,'sawtooth',f,c,t+i*0.002,st,p)});osc(ac,'square',f,0,t,st,lp);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.24*vel,t+0.003+atk);g.gain.setTargetAtTime(0.0001,t+0.003+atk,0.08+rel*0.35);return}
  if(inst==='chip'){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,9000*br);lp.connect(g);g.connect(dest);const o=osc(ac,E.waves.pulse,f,0,t,end+rel+0.1,lp);const lfo=ac.createOscillator(),lg=ac.createGain();lfo.frequency.value=6;lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(18,t+0.25);lfo.connect(lg);lg.connect(o.detune);lfo.start(t);lfo.stop(end+rel+0.1);
    adsr(g,t,0.002+atk,0.14*vel,0.05,0.8,end,Math.min(rel,0.3));return}
  // bell (FM)
  const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,9000*br);lp.connect(g);g.connect(dest);const car=ac.createOscillator(),mod=ac.createOscillator(),mi=ac.createGain();car.frequency.value=f;mod.frequency.value=f*3.5;
  mi.gain.setValueAtTime(f*2.5*br,t);mi.gain.setTargetAtTime(f*0.3,t,0.4);mod.connect(mi);mi.connect(car.frequency);car.connect(lp);const st=t+Math.max(d,0.4)+rel+1.6;car.start(t);mod.start(t);car.stop(st);mod.stop(st);
  const c2=ac.createGain();c2.gain.value=0.3;c2.connect(lp);osc(ac,'sine',f*2,3,t,st,c2);
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.22*vel,t+0.003+atk);g.gain.setTargetAtTime(0.0001,t+0.003+atk,0.3+rel*0.5)}

function chordPlay(E,inst,notes,t,d){const ac=E.ac,dest=getCh(E,'chords').inp,end=t+d,T=S.chordTone,br=T.br,rel=Math.max(0.03,T.rel);
  if(inst==='piano'||inst==='epiano'){notes.forEach(m=>voice(E,inst,m,t,d,0.65,dest,T));return}
  if(inst==='pluck'){for(let k=0;k<Math.max(1,Math.round(d/(60/S.bpm)));k++)notes.forEach(m=>voice(E,'pluck',m+12,t+k*60/S.bpm,0.2,0.6,dest,T));return}
  const saw=inst==='supersaw';const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(18000,(saw?5200:1600)*br);lp.Q.value=0.7;lp.connect(g);g.connect(dest);
  const dets=saw?[-18,-7,0,7,18]:[-10,0,10];notes.forEach(m=>dets.forEach((c,i)=>{const p=ac.createStereoPanner();p.pan.value=(i/(dets.length-1)-.5)*2;p.connect(lp);osc(ac,'sawtooth',hz(saw?m+12:m),c,t+Math.random()*0.005,end+rel+0.8,p)}));
  if(!saw){notes.forEach(m=>osc(ac,'triangle',hz(m),0,t,end+rel+0.8,lp))}
  const pk=(saw?0.12:0.09)/Math.sqrt(notes.length);adsr(g,t,(saw?0.01:0.03)+T.atk,pk,0.3,0.85,end,rel)}

function bassPlay(E,inst,m,t,d){const ac=E.ac,f=hz(m),end=t+d,dest=getCh(E,'bass').inp;const g=ac.createGain();g.connect(dest);
  if(inst==='sub'){const sh=ac.createWaveShaper();const cv=new Float32Array(256);for(let i=0;i<256;i++){const x=i/127.5-1;cv[i]=Math.tanh(2*x)}sh.curve=cv;sh.connect(g);osc(ac,'sine',f,0,t,end+0.2,sh);adsr(g,t,0.004,0.35,0.1,0.9,end,0.05);return}
  const lp=ac.createBiquadFilter();lp.type='lowpass';lp.connect(g);
  if(inst==='reese'){lp.frequency.value=700;lp.Q.value=1.5;[-16,16].forEach(c=>osc(ac,'sawtooth',f,c,t,end+0.2,lp));const s=ac.createGain();s.gain.value=0.9;s.connect(g);osc(ac,'sine',f,0,t,end+0.2,s);adsr(g,t,0.006,0.2,0.1,0.9,end,0.05);return}
  lp.Q.value=4;lp.frequency.setValueAtTime(2200,t);lp.frequency.setTargetAtTime(350,t,0.07);osc(ac,'sawtooth',f,0,t,end+0.2,lp);osc(ac,'square',f/2,0,t,end+0.2,lp);adsr(g,t,0.003,0.22,0.08,0.7,end,0.04)}

const KITS={edm:{k:[190,48,.09,.09,2.5,.5],s:[[185,330],2600,.2,.55,.14],h:[1,.06,.35],c:[.18,.4]},
  '808':{k:[125,44,.25,.34,1.3,.12],s:[[180,330],1800,.15,.45,.1],h:[1.3,.045,.3],c:[.3,.45]},
  hard:{k:[320,55,.06,.13,7,.9],s:[[200,380],3000,.3,.7,.12],h:[1,.05,.45],c:[.22,.55]},
  acoustic:{k:[110,58,.05,.07,1,.3],s:[[190,290],3600,.26,.6,.08],h:[0,.09,.3],c:[.14,.35]}};

function drumHit(d,t,EE,vel,key){EE=EE||E;vel=vel==null?1:vel;const ac=EE.ac,dest=getCh(EE,key||d).inp,K=KITS[S.kit]||KITS.edm;
  if((key&&playSample(EE,key,null,t,null,vel,dest))||playSample(EE,d,null,t,null,vel,dest)){if(d==='kick')sidechain(EE,t);return}
  if(d==='kick'){const[f0,f1,sw,tau,drive,click]=K.k;const o=ac.createOscillator(),g=ac.createGain(),sh=ac.createWaveShaper();const cv=new Float32Array(512);for(let i=0;i<512;i++){const x=i/255.5-1;cv[i]=Math.tanh(drive*x)/Math.tanh(drive)}sh.curve=cv;
    o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+sw);g.gain.setValueAtTime(vel,t);g.gain.setTargetAtTime(0.0001,t+0.04,tau);o.connect(sh);sh.connect(g);g.connect(dest);o.start(t);o.stop(t+tau*6+0.1);
    if(S.kit==='acoustic')noiseBurst(EE,t,0.03,'bandpass',900,0.8,click*vel,dest);else noiseBurst(EE,t,0.012,'highpass',3000,0.7,click*vel,dest);sidechain(EE,t)}
  else if(d==='snare'){const[tones,nf,nd,nv,td]=K.s;tones.forEach((fr,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.setValueAtTime(fr*1.4,t);o.frequency.exponentialRampToValueAtTime(fr,t+0.03);g.gain.setValueAtTime((i?0.25:0.45)*vel,t);g.gain.exponentialRampToValueAtTime(0.0001,t+td);o.connect(g);g.connect(dest);o.start(t);o.stop(t+td+0.05)});
    noiseBurst(EE,t,nd,'bandpass',nf,0.6,nv*vel,dest);noiseBurst(EE,t,nd*0.6,'highpass',6500,0.7,0.25*vel,dest)}
  else if(d==='hat'){const[mul,dec,lv]=K.h;const g=ac.createGain();g.connect(dest);
    if(!mul){noiseBurst(EE,t,dec,'highpass',8000,0.7,lv*vel,dest);return}
    const bp=ac.createBiquadFilter(),hp=ac.createBiquadFilter();bp.type='bandpass';bp.frequency.value=10000;bp.Q.value=0.8;hp.type='highpass';hp.frequency.value=7000;
    bp.connect(hp);hp.connect(g);[2,3,4.16,5.43,6.79,8.21].forEach(r=>osc(ac,'square',40*r*4*mul,0,t,t+dec+0.08,bp));g.gain.setValueAtTime(lv*vel,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dec)}
  else if(d==='crash'){   // 크래시 심벌: 금속성 사각파 여러 개 + 밝은 잡음, 길게 사라짐
    const g=ac.createGain(),hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=4200;hp.connect(g);g.connect(dest);
    [2,3,4.16,5.43,6.79,8.21,9.6].forEach(r=>osc(ac,'square',40*r*3.1,0,t,t+2.2,hp));g.gain.setValueAtTime(0.16*vel,t);g.gain.exponentialRampToValueAtTime(0.0001,t+1.9);
    noiseBurst(EE,t,1.6,'highpass',5500,0.5,0.55*vel,dest)}
  else{const[tail,lv]=K.c;for(let k=0;k<3;k++)noiseBurst(EE,t+k*0.009,0.02,'bandpass',1500,1.5,0.5*vel,dest);noiseBurst(EE,t+0.027,tail,'bandpass',1400,1.2,lv*vel,dest)}}

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
  P = P || curPat(); const out = [], n = P.bars * BEATS; let cur = null, start = 0;
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
  for (const c of S.channels) { const arr = P.notes[c.id]; if (arr) for (const n of arr) if (n.s >= t0 && n.s < t1) playTrackNote(EE, c, n.p, at(n.s + (S.swing && n.s % 24 === 12 ? S.swing * 6 : 0)), dur(n.s, n.l) * 0.98, n.v, n.b); }
  for (const seg of chordSegments(P)) if (seg.s >= t0 && seg.s < t1) chordPlay(EE, S.chordInst, chordVoices(seg.c), at(seg.s), dur(seg.s, seg.l) * 0.98);
  if (S.bassMode !== 'off') {
    const nb = P.bars * BEATS;
    for (let i = Math.floor(t0 / PPQ); i < Math.min(nb, Math.ceil(t1 / PPQ)); i++) {
      const c = chordAtBeat(i, P); if (!c) continue;
      const root = 36 + c.r, bt = i * PPQ, prev = i > 0 ? chordAtBeat(i - 1, P) : null, changed = !prev || prev.r !== c.r || prev.q !== c.q;
      let hits;
      if (S.bassMode === 'sustain') { if (!(changed || i % BEATS === 0)) continue; let j = i + 1; while (j < nb && j % BEATS !== 0 && chordAtBeat(j, P) === c) j++; hits = [[0, (j - i) * PPQ]]; }
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

/* 06-mixer.js — 믹서 (채널 랙의 채널마다 한 줄 · 코드 · 베이스 · 마스터) */
function mixSlider(label, val, min, max, step, on, fmt) {
  const w = document.createElement('label'); w.className = 'knob';
  const s = document.createElement('input'); s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = val; s.setAttribute('aria-label', tMsg(label));
  const v = document.createElement('span'); v.className = 'kv'; v.textContent = fmt(val);
  const l = document.createElement('span'); l.className = 'kl'; l.textContent = tMsg(label);
  s.oninput = () => { on(+s.value); v.textContent = fmt(+s.value); }; s.onchange = () => save();
  w.append(l, s, v); return w;
}
const pct = v => Math.round(v * 100), eqf = v => (v > 0 ? '+' : '') + v.toFixed(0) + 'dB';
const hzf = v => { const h = cutHz(v); return h >= 1000 ? (h / 1000).toFixed(1) + 'k' : Math.round(h) + ''; };
function fxFmt(type, j) {
  if (type === 'eq4') return v => ((v - 0.5) * 24 > 0 ? '+' : '') + ((v - 0.5) * 24).toFixed(1) + 'dB';
  if (type === 'gate') return j ? pct : v => ['1/4', '1/8', '1/16', '1/32'][Math.min(3, Math.floor(v * 4))];
  if (type === 'reverb') return j ? pct : v => (0.4 + v * 4).toFixed(1) + '초';
  if (type === 'delay') return j ? pct : v => DELAY_NOTES[Math.min(5, Math.floor(v * 6))][1];
  if (type === 'eq') return j ? v => ((v - 0.5) * 24 > 0 ? '+' : '') + ((v - 0.5) * 24).toFixed(1) + 'dB' : hzf;
  if (type === 'width') return j ? v => Math.round(v * 150) + '%' : v => Math.round(v * 200) + '%';
  if (type === 'comp') return j ? v => (1 + v * 19).toFixed(1) + ':1' : v => Math.round(-60 + v * 60) + 'dB';
  if (type === 'lpf' || type === 'hpf') return j ? v => (0.5 + v * 15).toFixed(1) : hzf;
  return pct;
}
const remix = () => { if (E) applyMix(E, S.mix); };
function subTitle(st, txt) { const h = document.createElement('div'); h.className = 'sub'; h.textContent = tMsg(txt); st.appendChild(h); }
function toneKnobs(st, T) {
  subTitle(st, '음색');
  st.appendChild(mixSlider('밝기', T.br, 0.3, 2, 0.05, v => { T.br = v; }, v => pct(v) + '%'));
  st.appendChild(mixSlider('어택', T.atk, 0, 0.8, 0.01, v => { T.atk = v; }, v => (v * 1000).toFixed(0) + 'ms'));
  st.appendChild(mixSlider('릴리즈', T.rel, 0.05, 2, 0.01, v => { T.rel = v; }, v => v < 1 ? (v * 1000).toFixed(0) + 'ms' : v.toFixed(1) + 's'));
}
function channelStrip(key, label) {
  const m = S.mix[key], st = document.createElement('div'); st.className = 'strip'; st.setAttribute('role', 'group'); st.setAttribute('aria-label', label + ' 채널');
  const hd = document.createElement('div'); hd.className = 'sh'; const b = document.createElement('b'); b.textContent = tMsg(label); hd.appendChild(b);
  const ms = document.createElement('div'); ms.className = 'ms';
  const btn = (txt, title, get, set) => { const x = document.createElement('button'); x.className = 'tbtn xs'; x.textContent = txt; x.title = tMsg(title); x.setAttribute('aria-label', label + ' ' + title); x.setAttribute('aria-pressed', !!get()); x.onclick = () => { set(!get()); x.setAttribute('aria-pressed', !!get()); remix(); save(); }; ms.appendChild(x); };
  btn('M', '뮤트', () => m.mute, v => m.mute = v ? 1 : 0);
  btn('S', '솔로', () => m.solo, v => m.solo = v ? 1 : 0);
  const kc = key.startsWith('ch:') ? chById(key.slice(3)) : null;
  if (!(kc && kc.kind === 'drum' && kc.inst === 'kick')) btn('SC', '사이드체인 받기', () => m.sc, v => m.sc = v);
  hd.appendChild(ms); st.appendChild(hd);
  st.appendChild(mixSlider('볼륨', m.v, 0, 1.2, 0.01, v => { m.v = v; remix(); }, pct));
  st.appendChild(mixSlider('팬', m.pan, -1, 1, 0.05, v => { m.pan = v; remix(); }, v => v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + pct(Math.abs(v))));
  st.appendChild(mixSlider('리버브', m.rev, 0, 1, 0.01, v => { m.rev = v; remix(); }, pct));
  st.appendChild(mixSlider('딜레이', m.dly, 0, 1, 0.01, v => { m.dly = v; remix(); }, pct));
  subTitle(st, 'EQ');
  st.appendChild(mixSlider('저음', m.lo, -12, 12, 1, v => { m.lo = v; remix(); }, eqf));
  st.appendChild(mixSlider('중음', m.mid, -12, 12, 1, v => { m.mid = v; remix(); }, eqf));
  st.appendChild(mixSlider('고음', m.hi, -12, 12, 1, v => { m.hi = v; remix(); }, eqf));
  // 이펙트 칸: 채운 칸 + 빈 칸 하나 (최대 3칸)
  subTitle(st, '이펙트'); m.fx = m.fx || [];
  for (let k = 0; k < FX_SLOTS; k++) {
    const f = m.fx[k];
    st.appendChild(selectEl(`${label} 이펙트 ${k + 1}`, Object.entries(FX_NAME), f ? f.type : '', v => {
      pushUndo(); const a = m.fx.slice(); if (!v) a.splice(k, 1); else a[k] = Object.fromEntries([['type', v], ...FX_DEF[v].map((x, j) => [FX_KEYS[j], x])]); m.fx = a.filter(Boolean); remix(); buildMixer(); }));
    if (!f) break;
    if (k > 0) { const up = document.createElement('button'); up.className = 'tbtn xs'; up.textContent = '↑ 위로'; up.setAttribute('aria-label', `${label} 이펙트 ${k + 1}을 위로`); up.onclick = () => { pushUndo(); const a = m.fx.slice(); [a[k - 1], a[k]] = [a[k], a[k - 1]]; m.fx = a; remix(); buildMixer(); }; st.appendChild(up); }
    FX_KNOBS[f.type].forEach((nm, j) => { const key = FX_KEYS[j]; if (f[key] == null) f[key] = (FX_DEF[f.type] || [])[j] == null ? 0.5 : FX_DEF[f.type][j]; st.appendChild(mixSlider(nm, f[key], 0, 1, 0.01, v => { f[key] = v; m.fx = m.fx.slice(); remix(); }, fxFmt(f.type, j))); });
  }
  if (!BUSES.includes(key)) { subTitle(st, '출력'); st.appendChild(selectEl(`${label} 출력`, [['master', '마스터'], ['bus1', '버스 1'], ['bus2', '버스 2']], m.out || 'master', v => { if (v === 'master') delete m.out; else m.out = v; remix(); buildMixer(); buildSaSelects(); })); }
  return st;
}
// 마스터 이펙트 칸 (채널과 같은 방식)
function fxSection(st, m, label) {
  subTitle(st, '이펙트'); m.fx = m.fx || [];
  for (let k = 0; k < FX_SLOTS; k++) {
    const f = m.fx[k];
    st.appendChild(selectEl(`${label} 이펙트 ${k + 1}`, Object.entries(FX_NAME), f ? f.type : '', v => { pushUndo(); const a = m.fx.slice(); if (!v) a.splice(k, 1); else a[k] = Object.fromEntries([['type', v], ...FX_DEF[v].map((x, j) => [FX_KEYS[j], x])]); m.fx = a.filter(Boolean); remix(); buildMixer(); }));
    if (!f) break;
    if (k > 0) { const up = document.createElement('button'); up.className = 'tbtn xs'; up.textContent = '↑ 위로'; up.setAttribute('aria-label', `${label} 이펙트 ${k + 1}을 위로`); up.onclick = () => { pushUndo(); const a = m.fx.slice(); [a[k - 1], a[k]] = [a[k], a[k - 1]]; m.fx = a; remix(); buildMixer(); }; st.appendChild(up); }
    FX_KNOBS[f.type].forEach((nm, j) => { const key = FX_KEYS[j]; if (f[key] == null) f[key] = (FX_DEF[f.type] || [])[j] == null ? 0.5 : FX_DEF[f.type][j]; st.appendChild(mixSlider(nm, f[key], 0, 1, 0.01, v => { f[key] = v; m.fx = m.fx.slice(); remix(); }, fxFmt(f.type, j))); });
  }
}
function selectEl(label, opts, val, on) {
  const s = document.createElement('select'); s.setAttribute('aria-label', tMsg(label));
  for (const [v, txt] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = tMsg(txt); s.appendChild(o); }
  s.value = val; s.onchange = () => { on(s.value); save(); }; return s;
}
function buildMixer() {
  const box = $('mixerStrips'); box.innerHTML = '';
  S.channels.forEach((c, i) => {
    const st = channelStrip(chKey(c), `${i + 1}. ${nameOf(c.name)}`); st.classList.add('trk'); if (i === S.ch) st.classList.add('cur');
    const ex = document.createElement('div'); ex.className = 'sx';
    if (c.kind === 'synth') {
      toneKnobs(st, c.tone);
      ex.appendChild(selectEl(c.name + ' 악기', Object.entries(INSTS), c.inst, v => { c.inst = v; if (v === 'synth') c.syn = normSyn(c.syn); buildRack(); refreshTitles(); buildMixer(); }));
      if (c.inst === 'synth') synthPanel(ex, c);
    } else ex.appendChild(selectEl(c.name + ' 드럼 소리', Object.entries(DRUM_NAME), c.inst, v => { c.inst = v; buildRack(); ensureCtx(); applyMix(E, S.mix); drumHit(v, ctx.currentTime + 0.02, E, 1, chKey(c)); }));
    ex.appendChild(sampleCtl(chKey(c), c.name));
    st.appendChild(ex); box.appendChild(st);
  });
  { const st = channelStrip('chords', CH_NAME.chords); toneKnobs(st, S.chordTone); const ex = document.createElement('div'); ex.className = 'sx';
    ex.appendChild(selectEl('코드 소리', [['pad','패드'],['supersaw','슈퍼소 코드'],['piano','피아노'],['epiano','일렉트릭 피아노'],['pluck','플럭']], S.chordInst, v => S.chordInst = v)); st.appendChild(ex); box.appendChild(st); }
  if ((S.audio || []).length) box.appendChild(channelStrip('audio', CH_NAME.audio));
  for (const b of BUSES) if (Object.values(S.mix).some(m => m.out === b)) box.appendChild(channelStrip(b, CH_NAME[b]));
  { const st = channelStrip('bass', CH_NAME.bass), ex = document.createElement('div'); ex.className = 'sx';
    ex.appendChild(selectEl('베이스 패턴', [['off','끔'],['sustain','길게'],['8th','8분'],['offbeat','오프비트']], S.bassMode, v => S.bassMode = v));
    ex.appendChild(selectEl('베이스 소리', [['reese','리스'],['sub','서브'],['saw','톱니']], S.bassInst, v => S.bassInst = v)); st.appendChild(ex); box.appendChild(st); }
  const ma = S.mix.master, st = document.createElement('div'); st.className = 'strip master'; st.setAttribute('role', 'group'); st.setAttribute('aria-label', '마스터');
  st.innerHTML = '<div class="sh"><b>' + tMsg('마스터') + '</b></div>';
  st.appendChild(mixSlider('볼륨', ma.v, 0, 1.2, 0.01, v => { ma.v = v; remix(); }, pct));
  st.appendChild(mixSlider('사이드체인', ma.sc, 0, 0.9, 0.01, v => { ma.sc = v; }, pct));
  st.appendChild(mixSlider('리버브 길이', ma.size, 0, 3, 1, v => { ma.size = v; remix(); }, v => tMsg(['짧게','보통','길게','아주 길게'][v])));
  fxSection(st, ma, '마스터');
  const kx = document.createElement('div'); kx.className = 'sx';
  kx.appendChild(selectEl('드럼 키트', [['edm','키트: EDM'],['808','키트: 808'],['hard','키트: 하드'],['acoustic','키트: 어쿠스틱풍']], S.kit, v => {
    S.kit = v; ensureCtx(); applyMix(E, S.mix); const t = ctx.currentTime + 0.02; drumHit('kick', t); drumHit('hat', t + 0.15); drumHit('snare', t + 0.3); drumHit('hat', t + 0.45); }));
  st.appendChild(kx);
  const mt = document.createElement('div'); mt.className = 'meter'; mt.innerHTML = '<div class="mbar"><i id="meterFill"></i></div><span id="meterDb">-∞</span>'; st.appendChild(mt);
  box.appendChild(st);
}
$('mixReset').onclick = () => {
  pushUndo(); S.mix = {}; S.channels.forEach(c => c.tone = toneDefault()); S.chordTone = {br:1, atk:0.15, rel:0.5}; S.kit = 'edm';
  fillMix(S); buildMixer(); remix(); save(); status('믹서를 기본값으로 되돌렸어요.');
};

/* 07-assets.js — 내 샘플 (IndexedDB에 저장) */
const DB_NAME = 'melody-sketchpad-assets';
function idb() { return new Promise((res, rej) => { if (!window.indexedDB) return rej(new Error('no idb')); const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbPut(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) {} }
async function idbGet(k) { try { const db = await idb(); return await new Promise(res => { const rq = db.transaction('s', 'readonly').objectStore('s').get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); }); } catch (e) { return null; } }
async function idbDel(k) { try { const db = await idb(); await new Promise(res => { const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {} }
async function idbAll() { try { const db = await idb(); return await new Promise(res => { const out = {}, rq = db.transaction('s', 'readonly').objectStore('s').openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); }; rq.onerror = () => res(out); }); } catch (e) { return {}; } }
const decoder = () => ctx || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
async function decode(ab) { const ac = decoder(); return await new Promise((res, rej) => { const p = ac.decodeAudioData(ab.slice(0), res, rej); if (p && p.then) p.then(res, rej); }); }
// slot: 'ch:<id>' (채널마다). 예전 칸 이름 'melody'·'trk:…'·'kick'… 도 찾아 씀
function sampleCtl(slot, label) {
  const w = document.createElement('div'); w.className = 'smp'; const s = SAMPLES[slot], ch = chById(slot.slice(3)), isTrack = !!(ch && ch.kind === 'synth');
  const nm = document.createElement('span'); nm.className = 'sn'; nm.textContent = s ? tMsg(s.name) : (isTrack && SAMPLES.melody ? tMsg('공용 샘플: ') + SAMPLES.melody.name : tMsg('기본 소리'));
  const up = document.createElement('button'); up.className = 'tbtn xs'; up.textContent = tMsg(s ? '바꾸기' : '내 샘플'); up.setAttribute('aria-label', label + ' 샘플 넣기');
  const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'audio/*'; fi.hidden = true;
  up.onclick = () => fi.click();
  fi.onchange = async () => {
    const f = fi.files[0]; if (!f) return; if (f.size > 15 * 1024 * 1024) { status('샘플은 15MB 이하로 넣어 주세요.'); return; }
    try {
      const ab = await f.arrayBuffer(), buf = await decode(ab), root = s ? s.root : 60;
      SAMPLES[slot] = {buf, root, name:f.name}; await idbPut(slot, {ab, root, name:f.name});
      if (isTrack) { ch.inst = 'sample'; save(); buildRack(); refreshTitles(); }
      buildMixer(); status(`${label}에 "${f.name}"을 넣었어요.`);
    } catch (e) { status('이 파일은 소리로 읽을 수 없어요. wav나 mp3로 넣어 주세요.'); }
  };
  const mc = document.createElement('button'), recNow = typeof mic !== 'undefined' && mic && mic.slot === slot; mc.className = 'tbtn xs' + (recNow ? ' micon' : ''); mc.textContent = tMsg(recNow ? '■ 멈춤' : '녹음'); mc.classList.toggle('ic-mic', !recNow);
  mc.setAttribute('aria-label', label + (recNow ? ' 마이크 녹음 멈추기' : ' 마이크로 녹음')); mc.onclick = () => micToggle(slot, label);
  const ed = document.createElement('button'); ed.className = 'tbtn xs ic-cut'; ed.textContent = tMsg('편집'); ed.hidden = !SAMPLES[slot]; ed.setAttribute('aria-label', label + ' 샘플 편집'); ed.onclick = () => openSampleEditor(slot, label);
  w.append(nm, up, mc, ed, fi);
  const smCh = slot.startsWith('ch:') ? chById(slot.slice(3)) : null;
  if (smCh && smCh.kind === 'synth' && SAMPLES[slot]) {   // 샘플러: 구간 반복 · 조각을 건반에
    const c2 = smCh.smp = normSmp(smCh.smp), set = (k, v) => { c2[k] = v; save(); };
    w.appendChild(selectEl(label + ' 구간 반복', [['0', '반복 끔'], ['1', '누르는 동안 구간 반복']], c2.loop ? '1' : '0', v => set('loop', v === '1')));
    w.appendChild(mixSlider('반복 시작', c2.ls, 0, 0.99, 0.01, v => set('ls', v), v => Math.round(v * 100) + '%'));
    w.appendChild(mixSlider('반복 끝', c2.le, 0.01, 1, 0.01, v => set('le', v), v => Math.round(v * 100) + '%'));
    w.appendChild(selectEl(label + ' 조각', [['0', '조각 안 냄'], ['4', '4조각 → C4부터'], ['8', '8조각 → C4부터'], ['16', '16조각 → C4부터']], String(c2.slices), v => set('slices', +v)));
  }
  if (s) {
    if (isTrack) {
      const rs = document.createElement('select'); rs.className = 'xs'; rs.setAttribute('aria-label', '샘플의 기준음');
      for (let p = 36; p <= 84; p++) { const o = document.createElement('option'); o.value = p; o.textContent = '기준 ' + NAMES_S[p % 12] + (Math.floor(p / 12) - 1); rs.appendChild(o); }
      rs.value = s.root; rs.onchange = async () => { s.root = +rs.value; const all = await idbAll(); if (all[slot]) { all[slot].root = s.root; idbPut(slot, all[slot]); } };
      w.appendChild(rs);
    }
    const del = document.createElement('button'); del.className = 'tbtn xs'; del.textContent = '기본으로';
    del.onclick = async () => { delete SAMPLES[slot]; await idbDel(slot); buildMixer(); };
    w.appendChild(del);
  }
  return w;
}
async function loadSamples() { const all = await idbAll(); for (const [k, v] of Object.entries(all)) { if (k.endsWith(':orig')) continue; try { SAMPLES[k] = {buf:await decode(v.ab), root:v.root || 60, name:v.name}; } catch (e) {} } buildMixer(); }

/* 08-io.js — 결과 복사 · MIDI · WAV · 프로젝트 파일 · 내 프로젝트 */

// ---- 결과 복사 (대화에 붙여 넣는 글) ----
function posText(t) { const bar = Math.floor(t / BAR_T) + 1, beat = Math.floor((t % BAR_T) / PPQ) + 1, r = t % PPQ; if (r % 12 === 0) return `${bar}.${beat}.${r / 12 + 1}`; if (r % 16 === 0) return `${bar}.${beat}.t${r / 16 + 1}`; return `${bar}.${beat}+${r}/48`; }
function lenText(l) { if (l % 12 === 0) return String(l / 12); if (l % 16 === 0) return 't' + (l / 16); return l + '/48'; }
function stepString(arr, bars) {
  const out = []; for (let b = 0; b < bars; b++) { let t = ''; for (let i = 0; i < STEPS; i++) { const n = arr.find(x => x.s === (b * STEPS + i) * 12); t += !n ? '.' : n.v >= 0.75 ? 'X' : n.v >= 0.4 ? 'x' : 'o'; } out.push(t); }
  return out.join(' ');
}
function resultText() {
  const key = names()[S.root] + (S.mode === 'minor' ? ' 단조' : ' 장조');
  const L = [`[멜로디 스케치] BPM ${S.bpm} · ${key} · 패턴 ${S.patterns.length}개 · 곡 ${songBars()}마디`];
  L.push('음 표기: 위치 = 마디.박.16분칸 (t = 셋잇단 칸) · 길이 = 16분 개수 (t = 셋잇단 개수) · v = 세기 (없으면 80) · 드럼: X 셈 · x 보통 · o 약함');
  L.push('채널: ' + S.channels.map((c, i) => `${i + 1}. ${c.name} (${c.kind === 'drum' ? '드럼 ' + DRUM_NAME[c.inst] : INSTS[c.inst]})`).join(' | '));
  for (const P of S.patterns) {
    L.push(`\n■ ${P.name} (${P.bars}마디)`);
    const cs = []; P.chords.forEach((c, i) => { if (c) cs.push(`${Math.floor(i / BEATS) + 1}.${i % BEATS + 1} ${c.x ? '멈춤' : chordName(c)}`); });
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
const PROG = {synth:81, piano:0, epiano:4, strings:48, celesta:8, harp:46, bass:38, timpani:47, supersaw:81, pluck:84, chip:80, bell:14, sample:0};
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
  const head = [{t:0, o:0, b:tev(S.bpm)}, {t:0, o:0, b:[0xff, 0x58, 4, meterOf(S)[0], Math.log2(meterOf(S)[1]), 24, 8]}];
  if (F.song) for (const x of S.tempo) head.push({t:x.t, o:1, b:tev(x.bpm)});   // SONG이면 템포 지도도 MIDI에
  const tr = [mtrack(head, '멜로디 스케치패드')];
  const synth = S.channels.filter(c => c.kind === 'synth' && c.inst !== 'kit'), free = [0, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
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
  for (const c of S.channels) if (c.inst === 'kit') for (const n of F.notes[c.id] || []) { const g = kitToGm(n.p); dev.push({t:n.s, o:1, b:[0x99, g, Math.max(1, Math.round(n.v * 127))]}); dev.push({t:n.s + Math.max(6, Math.min(n.l, 48)), o:0, b:[0x89, g, 0]}); }
  tr.push(mtrack(dev, '드럼'));
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tr.length, 0, PPQ, ...tr.flat()]);
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xffffffff; for (const b of u) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
// zip (압축 없이 담기만) — 파일 여러 개
function zipFiles(files) {
  const le = (n, b) => Array.from({length:b}, (_, i) => (n >>> (8 * i)) & 255), parts = [], cens = []; let off = 0;
  for (const [name, data] of files) {
    const enc = new TextEncoder().encode(name), crc = crc32(data);
    const local = new Uint8Array([...le(0x04034b50, 4), 20, 0, 0, 8, 0, 0, 0, 0, 0, 0, ...le(crc, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(enc.length, 2), 0, 0, ...enc]);   // 0x0800 = 이름이 UTF-8
    cens.push(new Uint8Array([...le(0x02014b50, 4), 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0, 0, ...le(crc, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(enc.length, 2), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le(off, 4), ...enc]));
    parts.push(local, data); off += local.length + data.length;
  }
  const cenLen = cens.reduce((a, c) => a + c.length, 0), end = new Uint8Array([...le(0x06054b50, 4), 0, 0, 0, 0, ...le(files.length, 2), ...le(files.length, 2), ...le(cenLen, 4), ...le(off, 4), 0, 0]);
  const all = [...parts, ...cens, end], out = new Uint8Array(all.reduce((a, c) => a + c.length, 0)); let p = 0; for (const c of all) { out.set(c, p); p += c.length; } return out;
}
const zip = (name, data) => zipFiles([[name, data]]);

// ---- 스템: 쓰는 채널마다 "그 채널만 솔로"로 WAV ----
function stemKeys() {
  const inSong = S.playMode === 'song' && S.playlist.clips.length, pats = inSong ? [...new Set(S.playlist.clips.map(c => patById(c.pat)))].filter(Boolean) : [curPat()];
  const keys = S.channels.filter(c => pats.some(P => (P.notes[c.id] || []).length)).map(c => [chKey(c), c.name]);
  if (pats.some(P => P.chords.some(Boolean))) { keys.push(['chords', '코드']); if (S.bassMode !== 'off') keys.push(['bass', '베이스']); }
  if (inSong && (S.audio || []).length) keys.push(['audio', '오디오 클립']);
  return keys;
}
async function renderStems(onProgress) {
  const keys = stemKeys(), files = [], base = JSON.parse(JSON.stringify(S));
  for (let i = 0; i < keys.length; i++) {
    const song = JSON.parse(JSON.stringify(base)); for (const k of Object.keys(song.mix)) if (k !== 'master') { song.mix[k].solo = k === keys[i][0]; song.mix[k].mute = false; }
    const w = await withSongAsync(normalize(song), () => renderWav(p => onProgress && onProgress((i + p) / keys.length, keys[i][1])));
    files.push([`${String(i + 1).padStart(2, '0')} ${keys[i][1].replace(/[\\/:*?"<>|]+/g, '_')}.wav`, w]);
  }
  return files;
}
// ---- MP3: WAV → lamejs 192kbps (처음 쓸 때만 받아요) ----
let lameP = null;
const loadLame = () => lameP || (lameP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js'; s.onload = () => window.lamejs ? res(window.lamejs) : rej(new Error('MP3 인코더를 못 불러왔어요')); s.onerror = () => { lameP = null; rej(new Error('MP3 인코더를 받지 못했어요 (인터넷 연결 확인)')); }; document.head.appendChild(s); }));
async function wavToMp3(w, onProgress) {
  const L = await loadLame(), dv = new DataView(w.buffer, w.byteOffset, w.byteLength), n = (w.byteLength - 44) >> 2, left = new Int16Array(n), right = new Int16Array(n);
  for (let i = 0; i < n; i++) { left[i] = dv.getInt16(44 + i * 4, true); right[i] = dv.getInt16(46 + i * 4, true); }
  const enc = new L.Mp3Encoder(2, 44100, 192), out = [], B = 1152 * 16;
  for (let i = 0, k = 0; i < n; i += B, k++) { const b = enc.encodeBuffer(left.subarray(i, i + B), right.subarray(i, i + B)); if (b.length) out.push(new Uint8Array(b)); if (k % 8 === 0) { onProgress && onProgress(i / n); await new Promise(r => setTimeout(r, 0)); } }
  const e = enc.flush(); if (e.length) out.push(new Uint8Array(e));
  const u = new Uint8Array(out.reduce((a, c) => a + c.length, 0)); let p = 0; for (const c of out) { u.set(c, p); p += c.length; } return u;
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
  const notes = [], drums = [], progs = {}, names = {}, markers = [], tempos = []; let meter = null; let tempo = 500000, tempoSet = false;
  for (let k = 0; k < nt; k++) {
    while (p < buf.byteLength && str(4) !== 'MTrk') p += u32();
    if (p >= buf.byteLength) break;
    const len = u32(), end = p + len; let t = 0, rs = 0, tname = ''; const open = {};
    while (p < end) {
      t += vlqr(); let st = d.getUint8(p); if (st & 0x80) p++; else st = rs;
      if (st === 0xff) { const ty = d.getUint8(p++), l = vlqr(); if (ty === 0x51) { const us = (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2); tempos.push([t, us]); if (!tempoSet) { tempo = us; tempoSet = true; } } if (ty === 0x03) tname = new TextDecoder().decode(new Uint8Array(buf, p, l)); if (ty === 0x58 && meter == null) meter = [d.getUint8(p), 1 << d.getUint8(p + 1)]; if (ty === 0x06) markers.push([t, new TextDecoder().decode(new Uint8Array(buf, p, l))]); p += l; continue; }
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
  return {notes, drums, div, bpm, progs, names, markers, tempoCount:tempos.length, tempos, meter};
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
function midiToSong(ab) { const keep = METER_OV; try { return midiToSongRaw(ab); } finally { METER_OV = keep; } }
function midiToSongRaw(ab) {
  const r = parseMidi(ab); if (!r.notes.length && !r.drums.length) throw new Error('이 MIDI에는 음이 없어요');
  const mt = r.meter && METERS.some(x => x[0] === r.meter[0] && x[1] === r.meter[1]) ? r.meter : [4, 4]; METER_OV = mt;
  const cv = t => Math.round(t * PPQ / r.div);
  const maxT = Math.max(...r.notes.map(n => cv(n.t1)), ...r.drums.map(x => cv(x.t) + 1), 1);
  let bars = Math.ceil(maxT / BAR_T); const cut = bars > MAX_BARS; bars = clamp(bars, 1, MAX_BARS);
  const lim = bars * BAR_T; let moved = 0;
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
    const pcs = [...new Set(ps.map(x => x % 12))], beat = Math.round(t / PPQ); if (beat >= bars * BEATS) continue;
    let found = null;
    for (const r0 of pcs) for (const [q, iv] of Object.entries(QUAL)) { const want = iv.map(i => (r0 + i) % 12); if (!found && want.length === pcs.length && want.every(x => pcs.includes(x))) found = {r:r0, q}; }
    P.chords[beat] = found || {r:Math.min(...ps) % 12, q:''};
  }
  if (!channels.length) channels.push(newChannel('synth', 'piano', '피아노'));
  // 구간 표시(마커)가 있으면 구간마다 패턴으로 나눠서 플레이리스트에 놓기
  let patterns = [P], clips = [{id:newId(), pat:P.id, t:0, bar:0}], split = 0;
  const BT = BAR_T, mk = r.markers.map(([t, name]) => [Math.round(cv(t) / BT), name.trim() || '구간']).filter(([b], i, a) => b < bars && (i === 0 || b > a[i - 1][0]));
  if (mk.length >= 2) {
    if (mk[0][0] > 0) mk.unshift([0, '처음']);
    patterns = []; clips = []; const used = {};
    mk.forEach(([b0, name], i) => {
      const b1 = i + 1 < mk.length ? mk[i + 1][0] : bars, n = b1 - b0; if (n < 1) return;
      used[name] = (used[name] || 0) + 1; const Q = newPattern((used[name] > 1 ? `${name} ${used[name]}` : name).slice(0, 24), n), s0 = b0 * BT, s1 = b1 * BT;
      for (const [cid, arr] of Object.entries(P.notes)) Q.notes[cid] = arr.filter(x => x.s >= s0 && x.s < s1).map(x => ({...x, s:x.s - s0, l:Math.min(x.l, s1 - x.s)}));
      Q.chords = P.chords.slice(b0 * BEATS, b1 * BEATS); patterns.push(Q); clips.push({id:newId(), pat:Q.id, t:0, bar:b0});
    });
    split = patterns.length;
  }
  const key = guessKey(channels.filter(c => c.kind === 'synth').flatMap(c => P.notes[c.id] || []));
  // 템포 지도: MIDI의 템포 변화를 그대로 (기본 BPM은 가장 오래 쓰인 템포, PAT 반복용)
  const tempo = []; if (r.tempos.length > 1) { let last = null; for (const [t, us] of r.tempos) { const b = Math.round(60000000 / us * 100) / 100, tt = cv(t); if (tt >= lim) break; if (b !== last) { tempo.push({t:tt, bpm:b}); last = b; } } }
  const song = normalize({v:4, channels, patterns, pat:0, ch:0, mix:{}, root:key.root, mode:key.mode, playMode:split || tempo.length ? 'song' : 'pat', playlist:{tracks:PL_TRACKS, clips}, tempo, meter:mt, bpm:clamp(Math.round(r.bpm * 100) / 100, 60, 300)});
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
    status(L2(`${r.from} 파일로 알아보고 "${lib.list[lib.current].name}"을 새 프로젝트로 열었어요` + (n ? ` (내 샘플 ${n}개)` : '') + (r.warnings.length ? ` · 알림 ${r.warnings.length}개` : ''),
             `Read as ${fmtL(r.from)} and opened "${lib.list[lib.current].name}" as a new project` + (n ? ` (${n} of your samples)` : '') + (r.warnings.length ? ` · ${pl(r.warnings.length, 'notice')}` : '')) + (r.info ? ` · ${r.info}` : '') + '.');
  } catch (e) { status(L2('불러오지 못했어요: ', "Couldn't open it: ") + (e.message || L2('알 수 없는 형식', 'unknown format'))); }
};

// ---- 내 프로젝트 (여러 곡) ----
function openProject(id) {
  clearTimeout(saveT); if (playing) stop();
  lib.current = id; saveLib(); let d = null; try { d = songFromStore(lsGet(PK(id))); } catch (e) {}
  S = d || blank(); undoStack = []; redoStack = []; redoKeep = null; undoBtns(); sel.clear(); $('selBar').hidden = true; startTick = 0; songStart = 0;
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

/* 10-rack.js — 채널 랙 (F6)
   채널마다: 켜기(LED) · 볼륨 · 이름(누르면 피아노 롤) · ⋯ 메뉴 · 스텝 버튼 16개/마디
   음이 스텝(16분 칸 시작·16분 길이)에만 있으면 버튼으로, 멜로디처럼 자유로우면 작은 미리보기 그림으로 보여요 */
const rackBody = $('rackBody');
let rackSteps = [], rackHot = -1;

// 이 채널의 음이 모두 16분 칸에 딱 맞으면 스텝으로 보여 줄 수 있음
const stepFriendly = (c, arr) => arr.every(n => n.s % 12 === 0 && n.l === 12 && (c.kind === 'drum' || n.p === arr[0].p));
function stepLabel(c, k, on, v) { const bar = Math.floor(k / STEPS) + 1, beat = Math.floor((k % STEPS) / 4) + 1, sub = k % 4 + 1; return `${c.name} ${bar}마디 ${beat}박 ${sub}번째 칸 ` + (on ? `켜짐, 세기 ${Math.round(v * 100)}` : '꺼짐'); }

function buildRack() {
  const P = curPat(), nSteps = P.bars * STEPS, keepFocus = document.activeElement && rackBody.contains(document.activeElement) ? document.activeElement.dataset : null;
  rackBody.innerHTML = ''; rackSteps = []; rackHot = -1;
  $('rackTitle').textContent = tMsg(P.name) + ` · ${P.bars}` + tMsg('마디 (두 번 누르면 이름 바꾸기)');
  S.channels.forEach((c, ci) => {
    const m = S.mix[chKey(c)], arr = notesOf(P, c);
    const row = document.createElement('div'); row.className = 'rrow' + (ci === S.ch ? ' sel' : ''); row.setAttribute('role', 'group'); row.setAttribute('aria-label', c.name + ' 채널');
    const led = document.createElement('button'); led.className = 'led'; led.title = tMsg('켜기 / 끄기 (뮤트)'); led.setAttribute('aria-label', c.name + ' 켜기'); led.setAttribute('aria-pressed', !m.mute);
    led.onclick = () => { m.mute = m.mute ? 0 : 1; led.setAttribute('aria-pressed', !m.mute); if (E) applyMix(E, S.mix); save(); buildMixer(); };
    const vol = document.createElement('input'); vol.type = 'range'; vol.className = 'rvol'; vol.min = 0; vol.max = 1.2; vol.step = 0.01; vol.value = m.v; vol.title = tMsg('볼륨'); vol.setAttribute('aria-label', c.name + ' 볼륨');
    vol.oninput = () => { m.v = +vol.value; if (E) applyMix(E, S.mix); }; vol.onchange = () => { save(); buildMixer(); };
    const nm = document.createElement('button'); nm.className = 'cname'; nm.title = tMsg('누르면 이 채널의 피아노 롤'); nm.setAttribute('aria-label', `${tMsg(c.name)}, ${c.kind === 'drum' ? tMsg('드럼') + ' ' + tMsg(DRUM_NAME[c.inst]) : tMsg(INSTS[c.inst])}`);
    nm.textContent = nameOf(c.name); const sm = document.createElement('small'); sm.textContent = c.kind === 'drum' ? '' : tMsg(INSTS[c.inst]); if (sm.textContent && sm.textContent !== nm.textContent) nm.appendChild(sm);
    nm.onclick = () => { selectChannel(ci); openWin('roll'); };
    const more = document.createElement('button'); more.className = 'cmore'; more.textContent = '⋯'; more.title = tMsg('채널 메뉴'); more.setAttribute('aria-label', c.name + ' 메뉴'); more.setAttribute('aria-haspopup', 'menu');
    more.onclick = e => channelMenu(ci, e.currentTarget);
    row.append(led, vol, nm, more);
    if (arr.length && !stepFriendly(c, arr)) {
      const cv = document.createElement('canvas'), w = Math.min(nSteps * 20 + P.bars * 6, 1400), h = 26; cv.className = 'rprev'; cv.title = '피아노 롤로 찍은 음 — 누르면 피아노 롤'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `${c.name}: 음 ${arr.length}개 (피아노 롤)`);
      const x = sizeCanvas(cv, w, h), lo = Math.min(...arr.map(n => n.p)), hi = Math.max(...arr.map(n => n.p)), span = Math.max(12, hi - lo + 1), T = totalTicks();
      x.fillStyle = CS.note; for (const n of arr) { const X = n.s / T * w, Y = h - 3 - (n.p - lo + 1) / span * (h - 6); x.globalAlpha = 0.4 + 0.6 * n.v; x.fillRect(X, Y, Math.max(2, n.l / T * w - 1), 2.5); } x.globalAlpha = 1;
      cv.onclick = () => { selectChannel(ci); openWin('roll'); };
      row.appendChild(cv); rackSteps.push(null);
    } else {
      const st = document.createElement('div'); st.className = 'steps'; const els = [];
      const on = new Map(arr.map(n => [n.s / 12, n]));
      for (let k = 0; k < nSteps; k++) {
        const n = on.get(k), b = document.createElement('button');
        b.className = 'st' + (Math.floor(k / 4) % 2 ? ' b' : '') + (k % STEPS === 0 && k ? ' bar' : '') + (n ? ' on' : '');
        if (n) b.style.opacity = 0.4 + 0.6 * n.v;
        b.dataset.ci = ci; b.dataset.k = k; b.tabIndex = (ci === S.ch && k === 0) ? 0 : -1;
        b.setAttribute('aria-pressed', !!n); b.setAttribute('aria-label', stepLabel(c, k, !!n, n ? n.v : 0));
        st.appendChild(b); els.push(b);
      }
      row.appendChild(st); rackSteps.push(els);
    }
    rackBody.appendChild(row);
  });
  if (keepFocus && keepFocus.k != null) { const r = rackSteps[+keepFocus.ci]; if (r && r[+keepFocus.k]) { r[+keepFocus.k].tabIndex = 0; r[+keepFocus.k].focus(); } }
}
const drawRack = () => buildRack();
function toggleStep(ci, k) {
  const c = S.channels[ci], arr = notesOf(curPat(), c), i = arr.findIndex(n => n.s === k * 12);
  pushUndo();
  if (i >= 0) arr.splice(i, 1);
  else {
    const p = c.kind === 'drum' ? DRUM_PITCH : (arr[0] ? arr[0].p : 72), v = c.kind === 'drum' ? lastDrumVel : lastVel;
    arr.push({p, s:k * 12, l:12, v}); ensureCtx(); applyMix(E, S.mix); playTrackNote(E, c, p, ctx.currentTime + 0.01, 0.2, v);
  }
  save(); buildRack(); if (ci === S.ch) { drawRoll(); drawLanes(); }
  const now = i < 0; announce(`${c.name} ${now ? '켰어요' : '껐어요'}`);
}
rackBody.addEventListener('click', e => { const b = e.target.closest('.st'); if (b) toggleStep(+b.dataset.ci, +b.dataset.k); });
rackBody.addEventListener('keydown', e => {
  const b = e.target.closest('.st'); if (!b) return;
  let ci = +b.dataset.ci, k = +b.dataset.k; const k0 = k, c0 = ci;
  if (e.key === 'ArrowRight') k++; else if (e.key === 'ArrowLeft') k--;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const d = e.key === 'ArrowDown' ? 1 : -1; do { ci += d; } while (rackSteps[ci] === null); }
  else if (e.key === 'Home') k = 0; else if (e.key === 'End') k = curPat().bars * STEPS - 1;
  else return;
  e.preventDefault();
  const r = rackSteps[ci]; if (!r) return; k = clamp(k, 0, r.length - 1);
  if (ci === c0 && k === k0) return;
  b.tabIndex = -1; r[k].tabIndex = 0; r[k].focus();
});
function drawRackPlayhead() {
  const k = playTick >= 0 ? Math.floor(playTick / 12) : -1; if (k === rackHot) return;
  for (const r of rackSteps) if (r) { if (rackHot >= 0 && r[rackHot]) r[rackHot].classList.remove('hot'); if (k >= 0 && r[k]) r[k].classList.add('hot'); }
  rackHot = k;
}
function selectChannel(i) {
  S.ch = clamp(i, 0, S.channels.length - 1); sel.clear(); $('selBar').hidden = true; save();
  buildRack(); refreshTitles(); drawRoll(); drawLanes(); buildMixer();
  announce(`${curCh().name} 채널의 피아노 롤이에요.`);
}
// ⋯ 메뉴: 이름 바꾸기 · 위로 · 아래로 · 복제 · 삭제
function closeMenu() { const m = document.querySelector('.cmenu'); if (m) m.remove(); document.removeEventListener('pointerdown', menuOutside, true); }
function menuOutside(e) { if (!e.target.closest('.cmenu')) closeMenu(); }
function channelMenu(ci, anchor) {
  closeMenu(); const c = S.channels[ci], m = document.createElement('div'); m.className = 'cmenu'; m.setAttribute('role', 'menu');
  const item = (t, f, dis) => { const b = document.createElement('button'); b.setAttribute('role', 'menuitem'); b.textContent = t; b.disabled = !!dis; b.onclick = () => { closeMenu(); f(); anchor.focus(); }; m.appendChild(b); };
  item('이름 바꾸기', () => { const v = prompt('채널 이름', c.name); if (v == null) return; pushUndo(); c.name = (v.trim() || c.name).slice(0, 24); save(); refreshAll(); });
  item('위로', () => moveChannel(ci, -1), ci === 0);
  item('아래로', () => moveChannel(ci, 1), ci === S.channels.length - 1);
  item('복제', () => { pushUndo(); const n = {...c, id:newId(), name:(c.name + ' 2').slice(0, 24), tone:{...c.tone}}; S.channels.splice(ci + 1, 0, n); for (const P of S.patterns) if (P.notes[c.id]) P.notes[n.id] = P.notes[c.id].map(x => ({...x})); S.mix[chKey(n)] = {...S.mix[chKey(c)]}; fillMix(S); save(); refreshAll(); });
  item('삭제', () => deleteChannel(ci), S.channels.length < 2);
  document.body.appendChild(m); const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(r.left, innerWidth - 160) + 'px'; m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8) + 'px';
  m.querySelector('button:not(:disabled)').focus();
  m.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); anchor.focus(); } if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const bs = [...m.querySelectorAll('button:not(:disabled)')], i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); } });
  setTimeout(() => document.addEventListener('pointerdown', menuOutside, true), 0);
}
function moveChannel(ci, d) { const j = ci + d; if (j < 0 || j >= S.channels.length) return; pushUndo(); const a = S.channels; [a[ci], a[j]] = [a[j], a[ci]]; if (S.ch === ci) S.ch = j; else if (S.ch === j) S.ch = ci; save(); refreshAll(); }
function deleteChannel(ci) {
  if (S.channels.length < 2) return; const c = S.channels[ci], cnt = S.patterns.reduce((a, P) => a + (P.notes[c.id] || []).length, 0);
  if (!confirm(`"${c.name}" 채널을 지울까요? (모든 패턴에서 음 ${cnt}개, 되돌리기로 되살릴 수 있어요)`)) return;
  pushUndo(); S.channels.splice(ci, 1); for (const P of S.patterns) delete P.notes[c.id]; delete S.mix[chKey(c)];
  S.ch = clamp(S.ch >= ci ? S.ch - 1 : S.ch, 0, S.channels.length - 1); fillMix(S); save(); refreshAll(); if (E) applyMix(E, S.mix); status(`"${c.name}" 채널을 지웠어요.`);
}
function addChannel(kind, inst) {
  if (S.channels.length >= 16) { status('채널은 16개까지 만들 수 있어요.'); return; }
  pushUndo(); const c = newChannel(kind, inst); S.channels.push(c); fillMix(S); if (E) applyMix(E, S.mix);
  S.ch = S.channels.length - 1; save(); refreshAll(); status(`"${c.name}" 채널을 더했어요.`);
  ensureCtx(); playTrackNote(E, c, 72, ctx.currentTime + 0.02, 0.3, 0.9);
}
$('chAdd').onchange = () => { const v = $('chAdd').value; $('chAdd').value = ''; if (!v) return; const [k, i] = v.split(':'); if (k === 'merge') { mergeToKit(); return; } addChannel(k, i); };
$('rackTitle').ondblclick = () => renamePattern(S.pat);

/* 11-playlist.js — 플레이리스트 (F5): 패턴 조각을 시간 위에 놓아 곡을 만들어요 */
const plWrap = $('plWrap'), plc = $('plCanvas'), plr = $('plRuler'), plHead = $('plHead');
const PL_BAR = 30, PL_ROW = 34, PL_RULER = 22;
let plDrag = null, plCur = {bar:0, t:0}, plPress = 0;
function clipAt(bar, t) { const cs = S.playlist.clips; for (let i = cs.length - 1; i >= 0; i--) { const c = cs[i]; if (c.t === t && bar >= c.bar && bar < c.bar + clipLen(c)) return c; } return null; }

// 조각·격자·눈금자는 바뀔 때만 그려서 저장(캐시)하고, 재생 중 매 프레임은 복사 + 재생선만 (plOverlay)
let plCache = null;
function snapCanvas(c) { const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); return o; }
function drawPlaylist() {
  if (!plc) return;
  const keepTick = songTick; songTick = -1;   // 캐시에는 재생선·재생 중 테두리를 넣지 않음
  try { drawPlaylistBase(); } finally { songTick = keepTick; }
  plCache = {r:snapCanvas(plr), c:snapCanvas(plc)}; plOverlay(false);
}
function plOverlay(blit = true) {
  if (!plc) return; if (!plCache || plCache.c.width !== plc.width || plCache.c.height !== plc.height) { drawPlaylist(); return; }
  const dpr = plc.width / (MAX_BARS * PL_BAR), h = S.playlist.tracks * PL_ROW + saH();
  for (const [cv, cache] of [[plr, plCache.r], [plc, plCache.c]]) { const x = cv.getContext('2d'); if (blit) { x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(cache, 0, 0); } x.setTransform(dpr, 0, 0, dpr, 0, 0); }
  if (songTick < 0) return;
  const X = songTick / BAR_T * PL_BAR, xr = plr.getContext('2d'), x = plc.getContext('2d');
  xr.fillStyle = CS.ink; xr.fillRect(X - 1, 0, 2, PL_RULER);
  x.lineWidth = 2; x.strokeStyle = CS.ink;
  for (const cl of S.playlist.clips) { const len = clipLen(cl); if (songTick >= cl.bar * BAR_T && songTick < (cl.bar + len) * BAR_T) { rr(x, cl.bar * PL_BAR + 1, cl.t * PL_ROW + 2, len * PL_BAR - 2, PL_ROW - 5, 4); x.stroke(); } }
  x.fillStyle = CS.ink; x.fillRect(X - 1, 0, 2, h);
}
function drawPlaylistBase() {
  const tracks = S.playlist.tracks, w = MAX_BARS * PL_BAR, h = tracks * PL_ROW + saH();
  if (plHead.childElementCount !== tracks) { plHead.innerHTML = ''; for (let i = 0; i < tracks; i++) { const d = document.createElement('div'); d.textContent = (typeof t === 'function' ? t('트랙') : '트랙') + ' ' + (i + 1); plHead.appendChild(d); } }
  // 눈금자
  let x = sizeCanvas(plr, w, PL_RULER); x.fillStyle = CS.panel2; x.fillRect(0, 0, w, PL_RULER); x.fillStyle = CS.line; x.fillRect(0, PL_RULER - 1, w, 1);
  x.font = '600 10px "IBM Plex Mono",monospace'; x.textBaseline = 'middle';
  const endBar = songBars();
  for (let b = 0; b <= MAX_BARS; b++) { const X = b * PL_BAR + .5, big = b % 4 === 0; x.fillStyle = big ? CS.ink : CS.line2; x.fillRect(X, big ? 3 : 13, 1, big ? PL_RULER - 4 : PL_RULER - 14); if (big && b < MAX_BARS) { x.fillStyle = CS.ink; x.fillText(String(b + 1), X + 4, 8); } }
  const ss = songStart / BAR_T * PL_BAR; x.fillStyle = CS.ink; x.beginPath(); x.moveTo(ss, PL_RULER - 1); x.lineTo(ss + 7, PL_RULER - 8); x.lineTo(ss, PL_RULER - 8); x.closePath(); x.fill();
  drawTempoCurve(x, w, PL_RULER);
  if (songTick >= 0) { x.fillStyle = CS.ink; x.fillRect(songTick / BAR_T * PL_BAR - 1, 0, 2, PL_RULER); }
  // 격자
  x = sizeCanvas(plc, w, h);
  for (let t = 0; t < tracks; t++) { x.fillStyle = t % 2 ? CS['row-out'] : CS['row-in']; x.fillRect(0, t * PL_ROW, w, PL_ROW); x.fillStyle = CS.line; x.fillRect(0, (t + 1) * PL_ROW - 1, w, 1); }
  for (let b = 0; b <= MAX_BARS; b++) { x.fillStyle = b % 4 === 0 ? CS.line2 : CS.line; x.fillRect(b * PL_BAR, 0, 1, h); }
  x.fillStyle = CS.panel; x.globalAlpha = .55; x.fillRect(endBar * PL_BAR, 0, w - endBar * PL_BAR, h); x.globalAlpha = 1;
  x.fillStyle = CS.mute; x.fillRect(endBar * PL_BAR, 0, 2, h);
  // 패턴 조각
  x.font = '600 11px "IBM Plex Sans KR",sans-serif'; x.textBaseline = 'top';
  for (const cl of S.playlist.clips) {
    const P = patById(cl.pat); if (!P) continue;
    const len = clipLen(cl), X = cl.bar * PL_BAR, Y = cl.t * PL_ROW, W = len * PL_BAR, cur = P.id === curPat().id, col = PAT_COLORS[P.color];
    const hot = songTick >= cl.bar * BAR_T && songTick < (cl.bar + len) * BAR_T;
    rr(x, X + 1, Y + 2, W - 2, PL_ROW - 5, 4); x.fillStyle = col || (cur ? CS.note : CS.line2); x.globalAlpha = col ? (cur ? 1 : 0.8) : (cur ? 0.95 : 0.9); x.fill(); x.globalAlpha = 1;
    if (cur && col) { x.lineWidth = 2; x.strokeStyle = CS.note; x.stroke(); }
    if (hot) { x.lineWidth = 2; x.strokeStyle = CS.ink; x.stroke(); }
    // 음 미리보기 (조각 안에서 반복되는 만큼)
    const all = Object.values(P.notes).flat(), ink = col ? '#111' : cur ? CS.bg : CS.ink;
    if (all.length) { const lo = Math.min(...all.map(n => n.p)), hi = Math.max(...all.map(n => n.p)), sp = Math.max(12, hi - lo + 1), k = PL_BAR / BAR_T; x.fillStyle = ink; x.globalAlpha = .55;
      for (const q of clipParts(cl, 0, MAX_BARS * BAR_T)) {
        const ox = q.origin * k;
        if (q.from === 0 && q.origin > cl.bar * BAR_T) { x.globalAlpha = .35; x.fillRect(ox, Y + 4, 1, PL_ROW - 9); x.globalAlpha = .55; }   // 반복 경계
        for (const n of all) if (n.s >= q.from && n.s < q.to) x.fillRect(ox + n.s * k + 1, Y + PL_ROW - 6 - (n.p - lo + 1) / sp * (PL_ROW - 20), Math.max(1.5, Math.min(n.l, q.to - n.s) * k), 1.5);
      } x.globalAlpha = 1; }
    x.fillStyle = ink; x.globalAlpha = .5; x.fillRect(X + W - 4, Y + 8, 1.5, PL_ROW - 17); x.fillRect(X + 3, Y + 8, 1.5, PL_ROW - 17); x.globalAlpha = 1;   // 끝 손잡이
    x.save(); x.beginPath(); x.rect(X + 2, Y, W - 4, PL_ROW); x.clip(); x.fillStyle = ink; x.fillText(P.name + (cl.off ? ` (${cl.off + 1}마디부터)` : ''), X + 7, Y + 4); x.restore();
  }
  if (document.activeElement === plc) { x.strokeStyle = CS.ink; x.lineWidth = 2; x.setLineDash([4, 3]); x.strokeRect(plCur.bar * PL_BAR + 1, plCur.t * PL_ROW + 1, PL_BAR - 2, PL_ROW - 3); x.setLineDash([]); }
  if (songTick >= 0) { x.fillStyle = CS.ink; x.fillRect(songTick / BAR_T * PL_BAR - 1, 0, 2, h); }
  drawAudioClips(x);
  drawSongAutoLane(x);
}
function followPlaylist() {
  if (!winOpen('playlist')) return; const X = songTick / BAR_T * PL_BAR, vw = plWrap.clientWidth - 78;
  if (X < plWrap.scrollLeft || X > plWrap.scrollLeft + vw - 30) plWrap.scrollLeft = Math.max(0, X - 30);
}
function plPos(e) { const r = plc.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; return {bar:clamp(Math.floor(x / PL_BAR), 0, MAX_BARS - 1), t:clamp(Math.floor(y / PL_ROW), 0, S.playlist.tracks - 1), x}; }
// 조각의 끝 근처인지 (끌어서 길이 바꾸기)
function plEdge(cl, x) { const X0 = cl.bar * PL_BAR, X1 = (cl.bar + clipLen(cl)) * PL_BAR; return x >= X1 - 8 ? 'R' : x <= X0 + 7 ? 'L' : ''; }
function removeClip(cl) { pushUndo(); S.playlist.clips = S.playlist.clips.filter(c => c !== cl); save(); drawPlaylist(); status(`${patById(cl.pat).name} 조각을 지웠어요.`); }
function placeClip(bar, t) {
  const P = curPat(); bar = clamp(bar, 0, MAX_BARS - P.bars);
  const cl = {id:newId(), pat:P.id, t, bar}; S.playlist.clips.push(cl); return cl;
}
plc.addEventListener('contextmenu', e => { e.preventDefault(); const q = plPos(e), cl = clipAt(q.bar, q.t); if (cl) removeClip(cl); });
plc.addEventListener('pointerdown', e => {
  if (e.button === 2) return; e.preventDefault(); plc.focus({preventScroll:true});
  const q = plPos(e); plCur = {bar:q.bar, t:q.t}; let cl = clipAt(q.bar, q.t); pushUndo(); let created = false;
  if (!cl) { cl = placeClip(q.bar, q.t); created = true; }
  const edge = created ? '' : plEdge(cl, q.x);
  plDrag = {cl, off:q.bar - cl.bar, moved:false, created, x0:e.clientX, y0:e.clientY, edge, bar0:cl.bar, len0:clipLen(cl), off0:cl.off || 0};
  try { plc.setPointerCapture(e.pointerId); } catch (_) {}
  clearTimeout(plPress);
  if (!created && e.pointerType !== 'mouse') plPress = setTimeout(() => { if (plDrag && !plDrag.moved) { cancelUndo(); const c = plDrag.cl; plDrag = null; removeClip(c); } }, 550);
  drawPlaylist();
});
plc.addEventListener('pointermove', e => {
  if (!plDrag) return; const q = plPos(e);
  if (Math.abs(e.clientX - plDrag.x0) > 4 || Math.abs(e.clientY - plDrag.y0) > 4) { plDrag.moved = true; clearTimeout(plPress); }
  if (!plDrag.moved) return;
  const d = plDrag, cl = d.cl, P = patById(cl.pat);
  if (d.edge === 'R') { cl.len = clamp(Math.round(q.x / PL_BAR) - cl.bar, 1, MAX_BARS - cl.bar); }   // 늘리면 패턴이 반복돼요
  else if (d.edge === 'L') {   // 앞을 잘라내기: 시작을 뒤로 → 그만큼 패턴 앞부분을 건너뜀
    const nb = clamp(Math.round(q.x / PL_BAR), d.bar0 - d.off0, d.bar0 + d.len0 - 1), dd = nb - d.bar0;
    cl.bar = nb; cl.off = ((d.off0 + dd) % P.bars + P.bars) % P.bars; cl.len = d.len0 - dd; if (!cl.off) delete cl.off;
  } else { cl.bar = clamp(q.bar - d.off, 0, MAX_BARS - clipLen(cl)); cl.t = q.t; }
  drawPlaylist();
});
plc.addEventListener('mousemove', e => { if (plDrag) return; const q = plPos(e), cl = clipAt(q.bar, q.t); plc.style.cursor = cl && plEdge(cl, q.x) ? 'ew-resize' : cl ? 'grab' : 'crosshair'; });
function plUp() {
  clearTimeout(plPress); if (!plDrag) return; const d = plDrag; plDrag = null;
  if (!d.created && !d.moved) { cancelUndo(); const i = S.patterns.findIndex(p => p.id === d.cl.pat); if (i !== S.pat) selectPattern(i); }
  else { save(); if (d.created) announce(`${patById(d.cl.pat).name}을 ${d.cl.bar + 1}마디 트랙 ${d.cl.t + 1}에 놓았어요.`); else if (d.edge) announce(`${patById(d.cl.pat).name} 조각: ${d.cl.bar + 1}마디부터 ${clipLen(d.cl)}마디`); }
  drawPlaylist();
}
plc.addEventListener('pointerup', plUp); plc.addEventListener('pointercancel', plUp);
plc.addEventListener('dblclick', e => { const q = plPos(e), cl = clipAt(q.bar, q.t); if (!cl) return; selectPattern(S.patterns.findIndex(p => p.id === cl.pat)); openWin('roll'); });
plr.addEventListener('click', e => {
  const r = plr.getBoundingClientRect(); songStart = clamp(Math.floor((e.clientX - r.left) / PL_BAR), 0, MAX_BARS - 1) * BAR_T;
  if (S.playMode !== 'song') setPlayMode('song');
  updatePos(songStart); drawPlaylist(); if (playing) { stop(); play(); }
});
plr.addEventListener('dblclick', () => { songStart = 0; updatePos(0); drawPlaylist(); });
// 키보드: 방향키로 칸 이동 · Enter로 지금 패턴 놓기/지우기 · Delete로 지우기
plc.addEventListener('focus', () => { drawPlaylist(); announce(plDesc()); });
plc.addEventListener('blur', () => drawPlaylist());
function plDesc() { const cl = clipAt(plCur.bar, plCur.t); return `플레이리스트, 트랙 ${plCur.t + 1}, ${plCur.bar + 1}마디, ` + (cl ? `${patById(cl.pat).name} 있음 (${clipLen(cl)}마디)` : '비어 있음') + `. 놓을 패턴: ${curPat().name}. 대괄호로 조각 길이 조절`; }
plc.addEventListener('keydown', e => {
  const k = e.key; let used = true;
  if (k === 'ArrowLeft' || k === 'ArrowRight') plCur.bar = clamp(plCur.bar + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 4 : 1), 0, MAX_BARS - 1);
  else if (k === 'ArrowUp' || k === 'ArrowDown') plCur.t = clamp(plCur.t + (k === 'ArrowUp' ? -1 : 1), 0, S.playlist.tracks - 1);
  else if (k === 'Enter') { const cl = clipAt(plCur.bar, plCur.t); if (cl) removeClip(cl); else { pushUndo(); placeClip(plCur.bar, plCur.t); save(); } }
  else if (k === 'Delete' || k === 'Backspace') { const cl = clipAt(plCur.bar, plCur.t); if (cl) removeClip(cl); }
  else if (k === '[' || k === ']') { const cl = clipAt(plCur.bar, plCur.t); if (cl) { pushUndo(); cl.len = clamp(clipLen(cl) + (k === ']' ? 1 : -1), 1, MAX_BARS - cl.bar); save(); } }
  else used = false;
  if (used) {
    e.preventDefault(); e.stopPropagation();
    const X = plCur.bar * PL_BAR; if (X < plWrap.scrollLeft || X > plWrap.scrollLeft + plWrap.clientWidth - 140) plWrap.scrollLeft = Math.max(0, X - 60);
    drawPlaylist(); announce(plDesc());
  }
});

/* 12-windows.js — 떠다니는 창 (FL Studio처럼 끌어서 옮기고, 모서리로 크기 조절)
   휴대폰(폭 760px 이하)에서는 창이 위아래로 쌓여요 */
const WINS = ['browser', 'playlist', 'rack', 'roll', 'mixer'];
const WIN_NAME = {browser:'브라우저', playlist:'플레이리스트', rack:'채널 랙', roll:'피아노 롤', mixer:'믹서'};
const LAYOUT_BASE = 'melody-sketchpad-layout-v2', ws = $('workspace');
// 화면 크기 종류마다 배치를 따로 저장 (노트북 ↔ 큰 모니터를 오가도 각자 맞게)
const sizeClass = () => innerHeight < 900 ? 'low' : 'high', layoutKey = () => LAYOUT_BASE + '-' + sizeClass();
let layoutClass = null;
let layout = {}, zTop = 10;
const winEl = n => $('win-' + n);
const stacked = () => window.matchMedia('(max-width:760px)').matches;
const winOpen = n => !winEl(n).hidden;
function defaultLayout() {
  // 작업 영역 아래에 오는 것(아래 버튼 줄·도움말·간격·여백)의 실제 높이를 빼야 아래 버튼 줄이 화면 안에 들어옴
  const app = ws.parentElement, acs = getComputedStyle(app), gap = parseFloat(acs.rowGap) || 0; let below = parseFloat(acs.paddingBottom) || 0;
  for (let e = ws.nextElementSibling; e; e = e.nextElementSibling) if (getComputedStyle(e).display !== 'none') below += e.getBoundingClientRect().height + gap;
  const W = Math.max(900, ws.clientWidth), top = ws.getBoundingClientRect().top + scrollY, avail = Math.max(440, Math.floor(innerHeight - top - below - 26));
  const tallRoll = avail - (clamp(Math.round(avail * .26), 150, 210) + clamp(Math.round(avail * .29), 170, 236) + 12);
  if (innerHeight < 900 || tallRoll < 420) {   // 높은 화면 배치에서 피아노 롤이 420px(약 12줄)도 안 되면 노트북 배치로 (피아노 롤이 우선)
    // 노트북처럼 낮은 화면: 왼쪽에 플레이리스트+채널 랙, 오른쪽 전체를 피아노 롤. 브라우저·믹서는 F8·F9로
    const L = clamp(Math.round(W * 0.36), 380, 560), plH = Math.round(avail * 0.42);
    return {
      playlist:{x:0, y:0, w:L - 6, h:plH, open:true},
      rack:    {x:0, y:plH + 6, w:L - 6, h:avail - plH - 6, open:true},
      roll:    {x:L, y:0, w:W - L, h:avail, open:true},
      browser: {x:W - 330, y:40, w:320, h:Math.min(avail - 40, 620), open:false},
      mixer:   {x:L, y:Math.max(0, avail - 300), w:W - L, h:300, open:false}
    };
  }
  // 높은 화면: 위 플레이리스트 · 가운데 채널 랙+믹서 · 아래 피아노 롤, 왼쪽 브라우저
  // 위 두 줄은 쓸 수 있는 높이에 비례해 줄어듦 → 피아노 롤이 나머지를 차지하고 아래 버튼 줄은 화면 안에
  const L = 266, R = W - L, plH = clamp(Math.round(avail * .26), 150, 210), midH = clamp(Math.round(avail * .29), 170, 236), rollY = plH + midH + 12, rollH = Math.max(280, avail - rollY);
  return {
    browser: {x:0, y:0, w:L - 6, h:rollY + rollH, open:true},
    playlist:{x:L, y:0, w:R, h:plH, open:true},
    rack:    {x:L, y:plH + 6, w:Math.round(R * 0.56) - 3, h:midH, open:true},
    mixer:   {x:L + Math.round(R * 0.56) + 3, y:plH + 6, w:R - Math.round(R * 0.56) - 3, h:midH, open:true},
    roll:    {x:L, y:rollY, w:R, h:rollH, open:true}
  };
}
function saveLayout() { lsSet(layoutKey(), JSON.stringify(layout)); }
function loadLayout() {
  const def = defaultLayout(); let saved = null; try { saved = JSON.parse(lsGet(layoutKey()) || 'null'); } catch (e) {}
  layout = {}; for (const n of WINS) layout[n] = {...def[n], ...((saved && saved[n]) || {})}; layoutClass = sizeClass();
}
function applyLayout() {
  let bottom = 0;
  for (const n of WINS) {
    const el = winEl(n), L = layout[n]; el.hidden = !L.open;
    if (!stacked()) { el.style.left = L.x + 'px'; el.style.top = L.y + 'px'; el.style.width = L.w + 'px'; el.style.height = L.h + 'px'; }
    else { el.style.left = el.style.top = el.style.width = ''; if (n !== 'roll' && n !== 'playlist' && n !== 'browser') el.style.height = ''; }
    if (L.open) bottom = Math.max(bottom, L.y + L.h);
    document.querySelectorAll(`[data-win-toggle="${n}"]`).forEach(b => b.setAttribute('aria-pressed', L.open));
  }
  ws.style.minHeight = stacked() ? '' : (bottom + 10) + 'px';
}
function redrawWin(n) {
  if (n === 'roll') drawAll();
  else if (n === 'playlist') drawPlaylist();
}
function frontWin(n) { const el = winEl(n); el.style.zIndex = ++zTop; document.querySelectorAll('.win.front').forEach(w => w.classList.remove('front')); el.classList.add('front'); }
function openWin(n) { layout[n].open = true; applyLayout(); frontWin(n); saveLayout(); requestAnimationFrame(() => redrawWin(n)); }
function closeWin(n) { layout[n].open = false; applyLayout(); saveLayout(); }
function toggleWin(n) { if (winOpen(n) && winEl(n).classList.contains('front')) closeWin(n); else { openWin(n); announce(WIN_NAME[n] + ' 창을 열었어요.'); } }
function initWindows() {
  loadLayout(); applyLayout(); frontWin('roll');
  window.addEventListener('resize', () => { if (sizeClass() !== layoutClass) { loadLayout(); applyLayout(); drawAll(); drawPlaylist(); } });
  for (const n of WINS) {
    const el = winEl(n), head = el.querySelector('.wh');
    el.addEventListener('pointerdown', () => frontWin(n), true);
    head.addEventListener('pointerdown', e => {
      if (stacked() || e.button !== 0 || e.target.closest('button,select,input,label,.grp,.copy,.zoom')) return;
      e.preventDefault(); const L = layout[n], sx = e.clientX, sy = e.clientY, ox = L.x, oy = L.y;
      const mv = ev => { L.x = clamp(ox + ev.clientX - sx, -L.w + 80, ws.clientWidth - 80); L.y = Math.max(0, oy + ev.clientY - sy); el.style.left = L.x + 'px'; el.style.top = L.y + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); applyLayout(); saveLayout(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    // 크기 조절(오른쪽 아래 모서리)이 끝나면 저장하고 다시 그림
    let rt = 0;
    new ResizeObserver(() => {
      if (el.hidden) return;
      if (!stacked()) { const L = layout[n]; L.w = el.offsetWidth; L.h = el.offsetHeight; }
      clearTimeout(rt); rt = setTimeout(() => { if (!stacked()) { applyLayout(); saveLayout(); } redrawWin(n); }, 60);
    }).observe(el);
  }
  document.querySelectorAll('[data-win-toggle]').forEach(b => b.onclick = () => toggleWin(b.dataset.winToggle));
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeWin(b.dataset.close));
  $('layoutReset').onclick = () => { layout = defaultLayout(); applyLayout(); saveLayout(); drawAll(); drawPlaylist(); status('창 배치를 처음처럼 되돌렸어요.'); };
  window.matchMedia('(max-width:760px)').addEventListener('change', () => { applyLayout(); drawAll(); drawPlaylist(); });
}

/* 13-browser.js — 브라우저 (F8): 소리를 미리 듣고 채널로 더해요 · 패턴 목록 */
const browserBody = $('browserBody');
function bSection(title) { const s = document.createElement('div'); s.className = 'bsec'; const h = document.createElement('h3'); h.textContent = tMsg(title); s.appendChild(h); browserBody.appendChild(s); return s; }
function bItem(sec, label, btns, cur) {
  const d = document.createElement('div'); d.className = 'bitem' + (cur ? ' cur' : ''); const sp = document.createElement('span'); sp.textContent = tMsg(label); d.appendChild(sp);
  for (const [t, f, aria] of btns) { const b = document.createElement('button'); b.textContent = tMsg(t); b.setAttribute('aria-label', tMsg(aria || (label + ' ' + t))); b.onclick = f; d.appendChild(b); }
  sec.appendChild(d); return d;
}
function hearSynth(inst) { ensureCtx(); applyMix(E, S.mix); const t = ctx.currentTime + 0.02, dest = E.in; [60, 64, 67, 72].forEach((p, i) => voice(E, inst, p, t + i * 0.18, 0.3, 0.85, dest, toneDefault())); }
function hearDrum(d) { ensureCtx(); applyMix(E, S.mix); const t = ctx.currentTime + 0.02; drumHit(d, t, E, 1, '__preview'); }
function buildBrowser() {
  browserBody.innerHTML = '';
  let s = bSection('악기');
  for (const [k, n] of Object.entries(INSTS)) if (k !== 'sample') bItem(s, n, [['▶', () => hearSynth(k), n + ' 미리 듣기'], ['채널로', () => addChannel('synth', k), n + ' 채널로 더하기']]);
  s = bSection('드럼');
  const kit = selectEl('드럼 키트', [['edm','키트: EDM'],['808','키트: 808'],['hard','키트: 하드'],['acoustic','키트: 어쿠스틱풍']], S.kit, v => { S.kit = v; buildMixer(); hearDrum('kick'); }); s.appendChild(kit);
  for (const d of DRUMS) bItem(s, DRUM_NAME[d], [['▶', () => hearDrum(d), DRUM_NAME[d] + ' 미리 듣기'], ['채널로', () => addChannel('drum', d), DRUM_NAME[d] + ' 채널로 더하기']]);
  s = bSection('코드 소리 (코드 줄에 쓰는 소리)');
  for (const [k, n] of [['pad','패드'],['supersaw','슈퍼소 코드'],['piano','피아노'],['epiano','일렉트릭 피아노'],['pluck','플럭']])
    bItem(s, n, [['▶', () => { ensureCtx(); applyMix(E, S.mix); chordPlay(E, k, chordVoices({r:S.root, q:S.mode === 'minor' ? 'm' : ''}), ctx.currentTime + 0.02, 1.2); }, n + ' 미리 듣기'],
      ['쓰기', () => { S.chordInst = k; save(); buildBrowser(); buildMixer(); status(`코드 소리를 ${n}(으)로 바꿨어요.`); }, n + ' 코드 소리로 쓰기']], S.chordInst === k);
  s = bSection('자동 베이스 (코드를 따라가요)');
  s.appendChild(selectEl('베이스 패턴', [['off','베이스: 끔'],['sustain','베이스: 길게'],['8th','베이스: 8분'],['offbeat','베이스: 오프비트']], S.bassMode, v => { S.bassMode = v; buildMixer(); }));
  for (const [k, n] of [['reese','리스'],['sub','서브'],['saw','톱니']])
    bItem(s, n, [['▶', () => { ensureCtx(); applyMix(E, S.mix); bassPlay(E, k, 36 + S.root, ctx.currentTime + 0.02, 0.6); }, n + ' 베이스 미리 듣기'],
      ['쓰기', () => { S.bassInst = k; if (S.bassMode === 'off') S.bassMode = '8th'; save(); buildBrowser(); buildMixer(); }, n + ' 베이스로 쓰기']], S.bassInst === k && S.bassMode !== 'off');
  s = bSection('패턴');
  S.patterns.forEach((P, i) => { const it = bItem(s, `${tMsg(P.name)} · ${P.bars}${tMsg('마디')}`, [['색', () => { pushUndo(); P.color = (P.color + 1) % PAT_COLORS.length; save(); buildBrowser(); drawPlaylist(); }, `${P.name} 색 바꾸기 (지금 ${P.color ? P.color + '번' : '없음'})`], ['열기', () => { selectPattern(i); openWin('roll'); }], ['이름', () => renamePattern(i)], ['삭제', () => deletePattern(i)]], i === S.pat);
    if (P.color) it.style.boxShadow = `inset 4px 0 ${PAT_COLORS[P.color]}`; });
  s = bSection('녹음');
  bItem(s, mic ? '마이크 녹음 중…' : '마이크로 녹음해서 새 채널', [[mic ? '■ 멈춤' : '녹음', () => micNewChannel(), mic ? '마이크 녹음 멈추기' : '마이크로 녹음해서 새 채널 만들기']]);
  const names = Object.entries(SAMPLES);
  if (names.length) { s = bSection('내 샘플'); for (const [k, v] of names) bItem(s, v.name, [['▶', () => { ensureCtx(); playSample(E, k, null, ctx.currentTime + 0.02, null, 0.9, E.in); }, v.name + ' 미리 듣기']]); }
}

/* 14-score.js — 악보 텍스트 형식 (.txt)
   사람도 AI도 읽고 쓸 수 있는 곡 파일. 곡 → 텍스트(scoreText), 텍스트 → 곡(parseScore).
   자세한 설명: docs/score-format.md
   담기는 것: 템포·조·채널(악기·볼륨·팬)·패턴(음·세기·코드·드럼 스텝)·플레이리스트
   안 담기는 것: 리버브·딜레이·EQ·음색 손잡이·내 샘플 (이건 프로젝트 파일 .json에 담겨요) */
const SCORE_HEAD = '# 멜로디 스케치패드 악보 v1', SCORE_HEAD_EN = '# Melody Sketchpad score v1';
// 영어 화면에서는 영어 낱말로 쓰고, 읽을 때는 한국어·영어를 다 받는다 (예전에 복사한 악보도 열리게)
const enOf = s => (window.I18N && I18N.en && I18N.en[s]) || s;
// 읽기 오류·경고 문장: 화면 언어로 (한국어, 영어)
const ms = (ko, en) => LANG === 'en' ? en : ko;
const CHORD_SOUND = {pad:'패드', supersaw:'슈퍼소', piano:'피아노', epiano:'일렉트릭 피아노', pluck:'플럭'};
const BASS_MODE = {off:'끔', sustain:'길게', '8th':'8분', offbeat:'오프비트'};
const BASS_INST = {reese:'리스', sub:'서브', saw:'톱니'};
const KIT_NAME = {edm:'EDM', '808':'808', hard:'하드', acoustic:'어쿠스틱'};
const safeName = s => String(s).replace(/[|,@=:：\[\]\r\n]/g, '·').trim() || '이름없음';
const byLabel = (map, v) => { v = String(v).trim().toLowerCase(); for (const [k, n] of Object.entries(map)) if (k.toLowerCase() === v || n.toLowerCase() === v || enOf(n).toLowerCase() === v) return k; return null; };

// 다른 곡을 잠깐 S 자리에 끼워서 처리 (변환기에서 씀)
function withSong(song, fn) { const keep = S; S = song; try { return fn(); } finally { S = keep; } }
async function withSongAsync(song, fn) { const keep = S; S = song; try { return await fn(); } finally { S = keep; } }

// ---------- 곡 → 텍스트 ----------
const velChar = v => v >= 0.95 ? 'X' : String(clamp(Math.round(v * 10), 1, 9));
function scoreText(title) {
  const E = LANG === 'en', W = (ko, en) => E ? en : ko, lab = (map, k) => E ? enOf(map[k]) : map[k];
  const L = [E ? SCORE_HEAD_EN : SCORE_HEAD,
    W('# 위치 = 마디.박.칸 (칸 1~4 = 16분, t1~t3 = 셋잇단) · 길이 = 16분 개수 (t = 셋잇단 개수) · v = 세기 % (없으면 80)',
      '# position = bar.beat.step (step 1-4 = 16ths, t1-t3 = triplets) · length = number of 16ths (t = triplets) · v = velocity % (80 if missing)'),
    W('# 드럼 줄은 16칸 = 1마디 · X = 100% · 1~9 = 10~90% · . = 쉼 · 줄 앞이 공백이면 앞 줄에 이어짐',
      '# drum lines: 16 steps = 1 bar · X = 100% · 1-9 = 10-90% · . = rest · a line starting with a space continues the line above'), ''];
  if (title) L.push(W('제목: ', 'Title: ') + String(title).replace(/[\r\n]/g, ' '));
  if (meterOf(S).join('/') !== '4/4') L.push(W('박자: ', 'Meter: ') + meterOf(S).join('/')); if (S.swing) L.push(W('스윙: ', 'Swing: ') + Math.round(S.swing * 100) + '%');
  L.push('BPM: ' + S.bpm, W('조: ', 'Key: ') + names()[S.root] + (S.mode === 'minor' ? W(' 단조', ' minor') : W(' 장조', ' major')), W('재생: ', 'Play: ') + (S.playMode === 'song' ? 'SONG' : 'PAT'),
    ...(S.tempo.length ? [W('템포 변화: ', 'Tempo changes: ') + S.tempo.map(x => `${posText(x.t)} ${x.bpm}`).join(' | ')] : []),
    W('코드 소리: ', 'Chord sound: ') + lab(CHORD_SOUND, S.chordInst), W('베이스: ', 'Bass: ') + lab(BASS_MODE, S.bassMode) + (S.bassMode === 'off' ? '' : ' ' + lab(BASS_INST, S.bassInst)), W('드럼 키트: ', 'Drum kit: ') + lab(KIT_NAME, S.kit), '');
  // 채널 이름이 겹치면 뒤에 숫자를 붙임
  const cname = new Map(), used = new Set();
  for (const c of S.channels) { const base = safeName(E ? nameOf(c.name) : c.name); let n = base, k = 2; while (used.has(n)) n = base + ' ' + k++; used.add(n); cname.set(c.id, n); }
  L.push(W('[채널]', '[Channels]'));
  for (const c of S.channels) {
    const m = S.mix[chKey(c)], d = chDefault(chKey(c), c), extra = [];
    if (Math.abs(m.v - d.v) > 0.005) extra.push(W('볼륨 ', 'vol ') + Math.round(m.v * 100));
    if (Math.abs(m.pan - d.pan) > 0.005) extra.push(W('팬 ', 'pan ') + Math.round(m.pan * 100));
    if (m.mute) extra.push(W('뮤트', 'mute'));
    L.push(`${cname.get(c.id)} = ${c.kind === 'drum' ? W('드럼 ', 'Drum ') + lab(DRUM_NAME, c.inst) : lab(INSTS, c.inst)}` + (extra.length ? '    ' + extra.join(' ') : ''));
  }
  const pname = new Map(), pused = new Set();
  for (const P of S.patterns) { let n = safeName(P.name), k = 2; while (pused.has(n)) n = safeName(P.name) + ' ' + k++; pused.add(n); pname.set(P.id, n); }
  for (const P of S.patterns) {
    L.push('', `${W('[패턴]', '[Pattern]')} ${pname.get(P.id)} | ${P.bars}${W('마디', ' bars')}` + (P.color ? ` | ${W('색', 'color')} ${P.color}` : ''));
    const cs = []; P.chords.forEach((c, i) => { if (c) cs.push(`${Math.floor(i / BEATS) + 1}.${i % BEATS + 1} ${c.x ? W('멈춤', 'stop') : chordName(c)}`); });
    if (cs.length) L.push(W('코드: ', 'Chords: ') + cs.join(' | '));
    for (const c of S.channels) {
      const arr = (P.notes[c.id] || []).slice().sort((a, b) => a.s - b.s || b.p - a.p); if (!arr.length) continue;
      const head = cname.get(c.id) + ': ';
      if (c.kind === 'drum' && arr.every(n => n.s % 12 === 0)) {
        const bars = []; for (let b = 0; b < P.bars; b++) { let t = ''; for (let i = 0; i < STEPS; i++) { const n = arr.find(x => x.s === (b * STEPS + i) * 12); t += n ? velChar(n.v) : '.'; } bars.push(t); }
        for (let b = 0; b < bars.length; b += 4) L.push((b ? '  ' : head) + bars.slice(b, b + 4).join(' '));
        continue;
      }
      const items = arr.map(n => `${posText(n.s)} ${nn(n.p)} ${lenText(n.l)}` + (Math.round(n.v * 100) !== 80 ? ` v${Math.round(n.v * 100)}` : ''));
      for (let i = 0; i < items.length; i += 8) L.push((i ? '  ' : head) + items.slice(i, i + 8).join(' | '));
    }
    for (const c of S.channels) { const A = P.auto && P.auto[c.id]; if (!A) continue; for (const [k, nm] of [['vol', W('볼륨', 'Volume')], ['cut', W('필터', 'Filter')]]) if (A[k]) L.push(`${cname.get(c.id)} ${nm}: ` + A[k].map(q => `${posText(q.s)} ${Math.round(q.v * 100)}`).join(' | ')); }
  }
  L.push('', W('[플레이리스트]', '[Playlist]'));
  const byTrack = {}; for (const cl of S.playlist.clips) (byTrack[cl.t] = byTrack[cl.t] || []).push(cl);
  for (const t of Object.keys(byTrack).map(Number).sort((a, b) => a - b))
    L.push(`${W('트랙', 'Track')} ${t + 1}: ` + byTrack[t].sort((a, b) => a.bar - b.bar).map(cl => `${pname.get(cl.pat)} @${cl.bar + 1}` + (cl.len ? `:${cl.len}` : '') + (cl.off ? `+${cl.off}` : '')).join(', '));
  return L.join('\n') + '\n';
}

// ---------- 텍스트 → 곡 ----------
const PC_OF = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
const ACC = {'#':1, '♯':1, 'b':-1, '♭':-1, '':0};
function parsePitch(tok) { const m = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(tok); if (!m) return null; return 12 * (+m[3] + 1) + PC_OF[m[1].toUpperCase()] + ACC[m[2]]; }
function parsePos(tok) {
  const m = /^(\d+)\.(\d+)(?:\.(t?)(\d+)|\+(\d+)\/48)?$/.exec(tok); if (!m) return null;
  const bar = +m[1], beat = +m[2]; if (bar < 1 || beat < 1 || beat > 4) return null;
  let off = 0; if (m[4] != null) { const k = +m[4]; if (m[3] ? k < 1 || k > 3 : k < 1 || k > 4) return null; off = (k - 1) * (m[3] ? 16 : 12); } else if (m[5] != null) off = +m[5];
  return (bar - 1) * BAR_T + (beat - 1) * PPQ + off;
}
function parseLen(tok) { let m = /^(t?)(\d+)$/.exec(tok); if (m) return +m[2] * (m[1] ? 16 : 12); m = /^(\d+)\/48$/.exec(tok); return m ? +m[1] : null; }
const CHORD_Q = {'':'', 'm':'m', 'min':'m', '7':'7', 'maj7':'maj7', 'M7':'maj7', 'Δ7':'maj7', 'm7':'m7', 'min7':'m7', 'sus4':'sus4', 'sus':'sus4', 'dim':'dim', '°':'dim', 'aug':'aug', '+':'aug'};
function parseChord(tok) {
  if (/^(멈춤|stop|x|-)$/i.test(tok)) return {c:{x:1}};
  const m = /^([A-G])([#♯b♭]?)(.*)$/.exec(tok); if (!m) return null;
  const r = (PC_OF[m[1]] + ACC[m[2]] + 12) % 12;
  if (m[3] in CHORD_Q) return {c:{r, q:CHORD_Q[m[3]]}};
  const q = /^m(?!aj)/.test(m[3]) ? (/7/.test(m[3]) ? 'm7' : 'm') : /^maj/.test(m[3]) ? 'maj7' : /^7|^9|^13/.test(m[3]) ? '7' : '';
  return {c:{r, q}, warn:ms(`"${tok}"는 코드 줄에 없는 코드라서 "${NAMES_S[r]}${q}"로 바꿨어요 (복잡한 코드는 채널에 음으로 찍어 주세요)`, `"${tok}" isn't a chord the chord lane supports, so it became "${NAMES_S[r]}${q}" (put complex chords in a channel as notes)`)};
}
function parseScore(text) { const keep = METER_OV; METER_OV = [4, 4]; try { return parseScoreRaw(text); } finally { METER_OV = keep; } }
function parseScoreRaw(text) {
  const lines = String(text).replace(/\r/g, '').split('\n'), warnings = [];
  const song = {v:4, bpm:120, root:0, mode:'major', snap:12, len:24, channels:[], patterns:[], pat:0, ch:0, playMode:'pat',
    playlist:{tracks:PL_TRACKS, clips:[]}, chordInst:'pad', bassMode:'off', bassInst:'reese', kit:'edm', mix:{}};
  let title = '', sec = 'head', P = null, lastKey = null;
  const chByName = new Map(), patByName = new Map(), stepAt = new Map(), clipsTodo = [];
  const fail = (i, msg) => { const e = new Error(ms(`${i + 1}번째 줄: ${msg}`, `Line ${i + 1}: ${msg}`)); e.line = i + 1; throw e; };
  const warn = (i, msg) => warnings.push(ms(`${i + 1}번째 줄: ${msg}`, `Line ${i + 1}: ${msg}`));
  const channelNamed = (i, name) => {
    let c = chByName.get(name); if (c) return c;
    c = newChannel('synth', 'piano', name); song.channels.push(c); chByName.set(name, c);
    warn(i, ms(`"${name}" 채널이 [채널]에 없어서 피아노 채널로 만들었어요`, `"${name}" wasn't in [Channels], so it became a piano channel`)); return c;
  };
  const handle = (i, key, val) => {
    if (sec === 'head') {
      const k = key.replace(/\s/g, '').toLowerCase();
      if (k === '제목' || k === '곡' || k === 'title') title = val.slice(0, 40);
      else if (k === 'bpm' || k === '템포' || k === 'tempo') { const b = parseFloat(val); if (!(b >= 20 && b <= 400)) fail(i, ms(`BPM "${val}"을 읽을 수 없어요`, `Can't read BPM "${val}"`)); song.bpm = clamp(Math.round(b * 100) / 100, 60, 300); if (song.bpm !== Math.round(b * 100) / 100) warn(i, ms(`BPM은 60~300만 돼서 ${song.bpm}로 바꿨어요`, `BPM must be 60-300, so it was set to ${song.bpm}`)); }
      else if (k === '조' || k === '키' || k === 'key') {
        const m = /^([A-G])([#♯b♭]?)\s*(장조|단조|major|minor|maj|min|m)?/i.exec(val); if (!m) fail(i, ms(`조 "${val}"를 읽을 수 없어요 (예: C 장조, F# 단조)`, `Can't read key "${val}" (e.g. C major, F# minor)`));
        song.root = (PC_OF[m[1].toUpperCase()] + ACC[m[2]] + 12) % 12; song.mode = /단조|minor|min|^m$/i.test(m[3] || '') ? 'minor' : 'major';
      }
      else if (k === '박자' || k === 'meter' || k === 'time' || k === 'timesignature') { const mm = /(\d+)\s*\/\s*(\d+)/.exec(val), m2 = mm && [+mm[1], +mm[2]]; if (m2 && METERS.some(x => x[0] === m2[0] && x[1] === m2[1])) { song.meter = m2; METER_OV = m2; } else warn(i, ms(`박자 "${val}"는 쓸 수 없어요 (${METERS.map(x => x.join('/')).join(' ')})`, `Meter "${val}" isn't supported (${METERS.map(x => x.join('/')).join(' ')})`)); }
      else if (k === '스윙' || k === 'swing') song.swing = clamp((parseFloat(val) || 0) / 100, 0, 1);
      else if (k === '재생' || k === 'play' || k === 'mode') song.playMode = /song/i.test(val) ? 'song' : 'pat';
      else if (k === '템포변화' || k === '템포지도' || k === 'tempochanges' || k === 'tempomap') {
        song.tempo = song.tempo || [];
        for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) { const [pt, bt] = part.split(/\s+/), t = parsePos(pt || ''), b = parseFloat(bt); if (t == null || !(b >= 20 && b <= 400)) { warn(i, ms(`템포 변화 "${part}"를 읽을 수 없어요 (예: 17.1 140)`, `Can't read tempo change "${part}" (e.g. 17.1 140)`)); continue; } song.tempo.push({t, bpm:b}); }
      }
      else if (k === '코드소리' || k === 'chordsound') { const v = byLabel(CHORD_SOUND, val); if (v) song.chordInst = v; else warn(i, ms(`코드 소리 "${val}"를 몰라서 패드로 했어요`, `Unknown chord sound "${val}", using Pad`)); }
      else if (k === '베이스' || k === 'bass') { const [a, b] = val.split(/\s+/); const md = byLabel(BASS_MODE, a || ''); if (md) song.bassMode = md; else warn(i, ms(`베이스 "${val}"를 몰라서 끔으로 했어요`, `Unknown bass "${val}", turned it off`)); if (b) { const bi = byLabel(BASS_INST, b); if (bi) song.bassInst = bi; } }
      else if (k === '드럼키트' || k === '키트' || k === 'drumkit' || k === 'kit') { const v = byLabel(KIT_NAME, val.replace(/풍$/, '')); if (v) song.kit = v; }
      else warn(i, ms(`"${key}" 항목은 몰라서 건너뛰었어요`, `Skipped unknown field "${key}"`));
      return;
    }
    if (sec === 'pl') {
      const m = /^(?:트랙|track)\s*(\d+)$/i.exec(key.trim()); if (!m) { warn(i, ms(`"${key}"는 "트랙 1:" 모양이어야 해요`, `"${key}" should look like "Track 1:"`)); return; }
      for (const part of val.split(',').map(x => x.trim()).filter(Boolean)) {
        const mm = /^(.+?)\s*@\s*(\d+)(?::(\d+))?(?:\+(\d+))?$/.exec(part); if (!mm) { warn(i, ms(`"${part}"는 "패턴이름 @마디" 모양이어야 해요 (길이·시작: @1:8+2)`, `"${part}" should look like "pattern name @bar" (length·offset: @1:8+2)`)); continue; }
        clipsTodo.push({i, name:mm[1].trim(), t:clamp(+m[1] - 1, 0, 19), bar:+mm[2] - 1, len:mm[3] ? +mm[3] : 0, off:mm[4] ? +mm[4] : 0});
      }
      return;
    }
    if (!P) fail(i, ms('음이나 코드는 [패턴] 아래에 써 주세요', 'Notes and chords go under a [Pattern]'));
    const lim = P.bars * BAR_T;
    if (key === '코드' || /^chords?$/i.test(key.trim())) {
      for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) {
        const [pt, ct] = part.split(/\s+/), m = /^(\d+)\.(\d+)$/.exec(pt || ''), r = ct ? parseChord(ct) : null;
        if (!m || !r) { warn(i, ms(`코드 "${part}"를 읽을 수 없어요 (예: 1.1 Fm)`, `Can't read chord "${part}" (e.g. 1.1 Fm)`)); continue; }
        const beat = (+m[1] - 1) * BEATS + (+m[2] - 1); if (beat < 0 || beat >= P.bars * BEATS || +m[2] > BEATS) { warn(i, ms(`코드 위치 ${pt}가 패턴 밖이에요`, `Chord position ${pt} is outside the pattern`)); continue; }
        P.chords[beat] = r.c; if (r.warn) warn(i, r.warn);
      }
      return;
    }
    const am = /^(.+?)\s+(볼륨|필터|volume|filter)$/i.exec(key.trim());
    if (am && chByName.has(am[1].trim())) {   // 자동화 줄: 위치 값%
      const c = chByName.get(am[1].trim()), k = /볼륨|volume/i.test(am[2]) ? 'vol' : 'cut'; P.auto = P.auto || {}; const A = P.auto[c.id] = P.auto[c.id] || {}; A[k] = A[k] || [];
      for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) { const [pt, vt] = part.split(/\s+/), t = parsePos(pt || ''), v = parseFloat(vt); if (t == null || !(v >= 0 && v <= 100) || t > lim) { warn(i, ms(`자동화 "${part}"를 읽을 수 없어요 (예: 1.1.1 80)`, `Can't read automation "${part}" (e.g. 1.1.1 80)`)); continue; } A[k].push({s:t, v:v / 100}); }
      return;
    }
    const c = channelNamed(i, key.trim()), arr = notesOf(P, c);
    if (/^[Xxo1-9.\-\s|]+$/.test(val)) {   // 드럼(스텝) 줄
      let k = stepAt.get(c.id) || 0;
      for (const ch of val.replace(/[\s|]/g, '')) {
        if (k >= P.bars * STEPS) { warn(i, ms(`${c.name} 스텝이 패턴 길이(${P.bars}마디)보다 길어서 뒤는 버렸어요`, `${c.name} steps are longer than the pattern (${P.bars} bars), the rest was dropped`)); break; }
        const v = ch === 'X' ? 1 : ch === 'x' ? 0.6 : ch === 'o' ? 0.3 : /\d/.test(ch) ? +ch / 10 : 0;
        if (v) arr.push({p:c.kind === 'drum' ? DRUM_PITCH : 72, s:k * 12, l:12, v}); k++;
      }
      stepAt.set(c.id, k); return;
    }
    for (const part of val.split('|').map(x => x.trim()).filter(Boolean)) {
      const tk = part.split(/\s+/), s = parsePos(tk[0] || ''), p0 = parsePitch(tk[1] || ''), l = parseLen(tk[2] || '');
      if (s == null || p0 == null || !l) { warn(i, ms(`음 "${part}"를 읽을 수 없어요 (예: 1.2.3 G5 2 v90)`, `Can't read note "${part}" (e.g. 1.2.3 G5 2 v90)`)); continue; }
      if (s >= lim) { warn(i, ms(`음 "${part}"가 패턴 밖(${P.bars}마디 뒤)이라 버렸어요`, `Note "${part}" is past the pattern (${P.bars} bars), dropped`)); continue; }
      let p = p0; while (p < LOW) p += 12; while (p > HIGH) p -= 12; if (p !== p0) warn(i, ms(`${tk[1]}는 건반(${NOTE_RANGE()}) 밖이라 ${NAMES_S[p % 12]}${Math.floor(p / 12) - 1}로 옮겼어요`, `${tk[1]} is outside the keyboard (${NOTE_RANGE()}), moved to ${NAMES_S[p % 12]}${Math.floor(p / 12) - 1}`));
      let v = 0.8; const vt = tk.find(x => /^v\d+$/i.test(x)); if (vt) v = clamp(+vt.slice(1) / 100, 0.05, 1);
      arr.push({p, s, l:Math.min(l, lim - s), v});
    }
  };
  lines.forEach((raw, i) => {
    if (!raw.trim() || /^\s*(#|\/\/)/.test(raw)) return;
    const line = raw.trim(), cont = /^\s/.test(raw) && lastKey != null;
    const hm = /^\[\s*([^\]|]+?)\s*(?:\|\s*([^\]]*))?\]\s*(.*)$/.exec(line);
    if (hm && !cont) {
      const name = hm[1].replace(/\s+/g, ' '); lastKey = null;
      if (name === '채널' || /^channels?$/i.test(name)) { sec = 'ch'; return; }
      if (name === '플레이리스트' || /^playlist$/i.test(name)) { sec = 'pl'; return; }
      const pm = /^(패턴|pattern)/i.exec(name);
      if (pm) {
        let rest = hm[3] || '', inner = name.slice(pm[1].length).trim(); if (hm[2]) rest = (inner ? inner + ' | ' : '') + hm[2] + (rest ? ' ' + rest : ''); else if (inner) rest = inner + (rest ? ' ' + rest : '');
        const [pn, pb, pc] = rest.split('|').map(x => (x || '').trim()); const bars = parseInt((pb || '').replace(/[^\d]/g, ''), 10) || 4, color = /(?:색|color)\s*(\d)/i.exec(pc || '');
        if (!pn) fail(i, ms('패턴 이름이 없어요 (예: [패턴] 후렴 | 4마디)', 'The pattern has no name (e.g. [Pattern] Chorus | 4 bars)'));
        if (patByName.has(pn)) fail(i, ms(`"${pn}" 패턴이 두 번 나와요`, `Pattern "${pn}" appears twice`));
        if (bars > MAX_PAT_BARS) warn(i, ms(`패턴은 ${MAX_PAT_BARS}마디까지 편하게 쓸 수 있어요`, `Patterns work best up to ${MAX_PAT_BARS} bars`));
        P = newPattern(pn.slice(0, 24), clamp(bars, 1, MAX_BARS)); if (color) P.color = clamp(+color[1], 0, PAT_COLORS.length - 1); song.patterns.push(P); patByName.set(pn, P); stepAt.clear(); sec = 'pat'; return;
      }
      fail(i, ms(`[${name}]은 모르는 칸이에요 ([채널] · [패턴] · [플레이리스트] 중 하나)`, `Unknown section [${name}] (use [Channels] · [Pattern] · [Playlist])`));
    }
    if (cont) { handle(i, lastKey, line); return; }
    if (sec === 'ch') {
      const m = /^(.+?)\s*=\s*(.+)$/.exec(line); if (!m) fail(i, ms('채널은 "이름 = 악기" 모양으로 써 주세요 (예: 킥 = 드럼 킥)', 'Write channels as "name = instrument" (e.g. Kick = Drum Kick)'));
      const name = m[1].trim(); let spec = m[2].trim(); if (chByName.has(name)) fail(i, ms(`"${name}" 채널이 두 번 나와요`, `Channel "${name}" appears twice`));
      const vol = /(?:볼륨|\bvol(?:ume)?)\s*(-?\d+)/i.exec(spec), pan = /(?:팬|\bpan)\s*(-?\d+)/i.exec(spec), mute = /(?:^|\s)(?:뮤트|mute)\s*$/i.test(spec.replace(/(?:볼륨|\bvol(?:ume)?|팬|\bpan)\s*-?\d+/gi, ''));
      // 음소거 표시는 맨 끝의 낱말일 때만 ("뮤트 기타"·"뮤트 트럼펫" 같은 악기 이름을 지우지 않게)
      spec = spec.replace(/(?:볼륨|\bvol(?:ume)?|팬|\bpan)\s*-?\d+/gi, '').replace(/(?:^|\s)(?:뮤트|mute)\s*$/i, '').trim();
      let c;
      // 악기 이름 전체를 먼저 찾는다 ("드럼 키트" 악기를 "드럼 + 키트"로 쪼개지 않게)
      const whole = byLabel(INSTS, spec), dm = whole ? null : /^(?:드럼|drum)\s+(.+)$/i.exec(spec);
      if (whole) c = newChannel('synth', whole, name);
      else if (dm) { const d = byLabel(DRUM_NAME, dm[1]); if (!d) fail(i, ms(`드럼 "${dm[1]}"을 몰라요 (킥·스네어·하이햇·박수)`, `Unknown drum "${dm[1]}" (Kick · Snare · Hi-hat · Clap · Crash)`)); c = newChannel('drum', d, name); }
      else { const inst = byLabel(INSTS, spec);
        if (!inst) {   // 159개를 다 늘어놓지 않고, 낱말이 겹치는 이름 몇 개만 알려 준다
          const words = spec.toLowerCase().split(/\s+/).filter(w => w.length >= 2), lab = n => LANG === 'en' ? enOf(n) : n;
          const near = Object.values(INSTS).map(lab).filter(n => words.some(w => n.toLowerCase().includes(w))).slice(0, 6);
          fail(i, ms(`악기 "${spec}"를 몰라요` + (near.length ? ` (비슷한 이름: ${near.join(' · ')})` : ' (악기 이름은 브라우저 창에 보이는 이름 그대로 써요)'),
                     `Unknown instrument "${spec}"` + (near.length ? ` (did you mean: ${near.join(' · ')})` : ' (use the names shown in the Browser)')));
        }
        c = newChannel('synth', inst, name); }
      song.channels.push(c); chByName.set(name, c);
      const mx = {}; if (vol) mx.v = clamp(+vol[1] / 100, 0, 1.2); if (pan) mx.pan = clamp(+pan[1] / 100, -1, 1); if (mute) mx.mute = 1;
      if (Object.keys(mx).length) song.mix[chKey(c)] = mx;
      return;
    }
    const k = line.search(/[:：]/); if (k < 1) fail(i, ms('"이름: 내용" 모양이어야 해요', 'Lines should look like "name: content"'));
    lastKey = line.slice(0, k).trim(); handle(i, lastKey, line.slice(k + 1).trim());
  });
  if (!song.patterns.length) { const e = new Error(ms('[패턴]이 하나도 없어요', 'There is no [Pattern]')); e.line = 0; throw e; }
  if (!song.channels.length) song.channels.push(newChannel('synth', 'piano', '피아노'));
  for (const c of clipsTodo) { const p = patByName.get(c.name); if (!p) { warn(c.i, ms(`"${c.name}" 패턴이 없어서 건너뛰었어요`, `Skipped "${c.name}": no such pattern`)); continue; } const o = {id:newId(), pat:p.id, t:c.t, bar:clamp(c.bar, 0, MAX_BARS - 1)}; if (c.len) o.len = c.len; if (c.off) o.off = c.off; song.playlist.clips.push(o); }
  if (!song.playlist.clips.length) song.playlist.clips.push({id:newId(), pat:song.patterns[0].id, t:0, bar:0});
  return {song:normalize(song), title, warnings};
}

/* 15-convert.js — 붙여넣기 · 파일 변환기
   넣는 것은 형식을 스캔해서 알아봐요: MSK · 곡 코드 · MIDI · 프로젝트(.json) · 악보(.txt)
   만드는 것: MSK · 곡 코드 · 악보 · 프로젝트 · MIDI · 오디오(.wav)
   지금 열린 곡은 건드리지 않고, 변환할 곡을 잠깐 S 자리에 끼워서 저장 함수를 그대로 써요 */
function openDlg(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
function openAsProject(song, name) {
  const id = newId(); lib.list[id] = {name:(name || '불러온 곡').slice(0, 40), updated:Date.now()};
  save(); lsSet(PK(id), songToStore(song)); openProject(id); return id;
}
const songSummary = song => withSong(song, () => { const notes = S.patterns.reduce((a, P) => a + Object.values(P.notes).reduce((b, x) => b + x.length, 0), 0);
  return L2(`채널 ${S.channels.length}개 · 패턴 ${S.patterns.length}개 · 곡 ${songBars()}마디 · ${S.bpm} BPM · ${names()[S.root]} ${S.mode === 'minor' ? '단조' : '장조'} · 음 ${notes}개`,
            `${pl(S.channels.length, 'channel')} · ${pl(S.patterns.length, 'pattern')} · ${pl(songBars(), 'bar')} · ${S.bpm} BPM · ${names()[S.root]} ${S.mode === 'minor' ? 'minor' : 'major'} · ${pl(notes, 'note')}`); });
function listMsg(el, head, items) {
  el.innerHTML = ''; const b = document.createElement('b'); b.textContent = head; el.appendChild(b);
  if (items && items.length) { const ul = document.createElement('ul'); for (const t of items.slice(0, 30)) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); } if (items.length > 30) { const li = document.createElement('li'); li.textContent = L2(`…그리고 ${items.length - 30}개 더`, `…and ${items.length - 30} more`); ul.appendChild(li); } el.appendChild(ul); }
}

// ---- 악보 붙여넣기 ----
const scoreTA = $('scoreText'), scoreMsg = $('scoreMsg');
let pasted = null;   // 검사를 통과한 결과
async function scoreCheck(selectErr) {
  const text = scoreTA.value; pasted = null; if (!text.trim()) { scoreMsg.textContent = L2('악보나 곡 코드를 붙여 넣어 주세요.', 'Paste a score or a song code.'); return null; }
  const kind = sniffFormat(new TextEncoder().encode(text.slice(0, 4096)));
  try {
    const r = await loadAny(text, '붙여 넣은 곡');
    listMsg(scoreMsg, L2(`${r.from}로 알아봤어요: `, `Read as ${fmtL(r.from)}: `) + (r.name !== '붙여 넣은 곡' ? '"' + r.name + '" · ' : '') + songSummary(r.song) + (r.warnings.length ? L2(` · 알림 ${r.warnings.length}개`, ` · ${pl(r.warnings.length, 'notice')}`) : ''), r.warnings);
    return pasted = r;
  } catch (e) {
    listMsg(scoreMsg, '' + (kind === 'unknown' ? '' : fmtL(FORMAT_NAME[kind]) + ': ') + e.message, null);
    if (selectErr && e.line) { const ls = text.split('\n'); let a = 0; for (let k = 0; k < e.line - 1; k++) a += ls[k].length + 1; scoreTA.focus(); scoreTA.setSelectionRange(a, a + ls[e.line - 1].length); }
    return null;
  }
}
let scoreT = 0;
scoreTA.addEventListener('input', () => { clearTimeout(scoreT); scoreT = setTimeout(() => scoreCheck(false), 300); });
$('scoreIn').onclick = () => { scoreMsg.textContent = ''; openDlg($('scoreDlg')); if (scoreTA.value) scoreCheck(false); scoreTA.focus(); };
$('scoreFile').onclick = () => $('scoreFileIn').click();
$('scoreFileIn').onchange = async () => { const f = $('scoreFileIn').files[0]; $('scoreFileIn').value = ''; if (!f) return; scoreTA.value = await f.text(); await scoreCheck(true); };
$('scoreClose').onclick = () => $('scoreDlg').close();
$('scoreLoad').onclick = async () => {
  const r = await scoreCheck(true); if (!r) return;
  $('scoreDlg').close(); const n = await openLoaded(r);
  status(`${r.from}을 새 프로젝트 "${lib.list[lib.current].name}"로 불러왔어요` + (n ? ` (내 샘플 ${n}개)` : '') + (r.warnings.length ? ` (알림 ${r.warnings.length}개)` : '') + '.');
};

// ---- 파일 변환기 ----
let conv = null;   // {song, name, from, warnings, samples}
const CONV_BTNS = ['convMsk', 'convCode', 'convTxt', 'convJson', 'convMid', 'convWav', 'convMp3', 'convStem', 'convOpen'];
function convShow() {
  const on = !!conv; CONV_BTNS.forEach(id => $(id).disabled = !on);
  if (!on) { $('convInfo').textContent = '아직 고른 파일이 없어요.'; return; }
  listMsg($('convInfo'), `${conv.from}: "${conv.name}" — ${songSummary(conv.song)}`, conv.warnings);
}
async function convSave(ext, data, mime) {
  const fn = (conv.name || 'melody-sketch').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
  if (inClaude) { if (ext === 'zip') await offer(fn + '.zip', new Blob([data])); else if (typeof data === 'string') await offer(fn + '.' + ext, data); else await offer(`${fn}-${ext}.zip`, new Blob([zip(fn + '.' + ext, data)])); }
  else localDownload(fn + '.' + ext, new Blob([data], {type:mime}));
}
// MIDI·오디오는 플레이리스트에 조각이 있으면 곡 전체로
const convSongForAudio = () => ({...conv.song, playMode:conv.song.playlist.clips.length ? 'song' : 'pat'});
$('convBtn').onclick = () => { convShow(); openDlg($('convDlg')); };
$('convClose').onclick = () => $('convDlg').close();
$('convPick').onclick = () => $('convIn').click();
$('convIn').onchange = async () => {
  const f = $('convIn').files[0]; $('convIn').value = ''; if (!f) return;
  try { conv = await loadAny(f); convShow(); announce(L2(`${conv.from} 파일로 알아봤어요. 바꿀 형식을 골라 주세요.`, `Read as ${fmtL(conv.from)}. Pick a format to convert to.`)); }
  catch (e) { conv = null; convShow(); listMsg($('convInfo'), L2('읽지 못했어요: ', "Couldn't read it: ") + (e.message || L2('알 수 없는 형식', 'unknown format')), null); }
};
$('convCur').onclick = async () => { save(); const song = normalize(JSON.parse(JSON.stringify(S))), sm = await songSamples(song);
  conv = {song, name:lib.list[lib.current].name, from:'지금 곡', warnings:[], samples:Object.entries(sm).map(([slot, v]) => ({slot, name:v.name, root:v.root, ab:v.ab}))}; convShow(); };
const convSampleMap = () => Object.fromEntries((conv.samples || []).map(s => [s.slot, {ab:s.ab, root:s.root, name:s.name}]));
$('convMsk').onclick = async () => convSave('msk', await encodeMSK(conv.song, conv.name, convSampleMap()), 'application/octet-stream');
$('convCode').onclick = async () => {
  const code = mskToCode(await encodeMSK(conv.song, conv.name, {})), out = $('out'); out.value = code;
  try { await navigator.clipboard.writeText(code); listMsg($('convInfo'), `곡 코드를 복사했어요 (${code.length.toLocaleString()}글자). "붙여넣기"에 넣으면 이 곡이 열려요. 내 샘플은 빠져요.`, null); }
  catch (e) { out.style.display = 'block'; out.focus(); out.select(); listMsg($('convInfo'), '자동 복사가 막혀 있어요. 아래 곡 코드를 길게 눌러 복사해 주세요.', null); }
};
$('convTxt').onclick = () => convSave('txt', withSong(conv.song, () => scoreText(conv.name)), 'text/plain;charset=utf-8');
$('convJson').onclick = () => convSave('json', JSON.stringify({app:'melody-sketchpad', version:4, name:conv.name, song:conv.song, samples:{}}), 'application/json');
$('convMid').onclick = () => convSave('mid', withSong(convSongForAudio(), () => midiBytes()), 'audio/midi');
$('convWav').onclick = async () => {
  const b = $('convWav'); CONV_BTNS.forEach(id => $(id).disabled = true);
  try { const w = await withSongAsync(convSongForAudio(), () => renderWav(p => b.textContent = `만드는 중 ${Math.floor(p * 100)}%`)); await convSave('wav', w, 'audio/wav'); }
  catch (e) { status('오디오를 만들지 못했어요.'); }
  finally { b.textContent = '오디오 (.wav)'; convShow(); }
};
// 오래 걸리는 오디오 만들기 공통: 버튼에 진행률, 끝나면 되돌림
async function convBusy(id, label, job) {
  const b = $(id); CONV_BTNS.forEach(x => $(x).disabled = true);
  try { await job(t => b.textContent = t); } catch (e) { listMsg($('convInfo'), '' + (e.message || '만들지 못했어요'), null); }
  finally { b.textContent = label; convShow(); }
}
$('convMp3').onclick = () => convBusy('convMp3', 'MP3 (.mp3)', async show => {
  const w = await withSongAsync(convSongForAudio(), () => renderWav(p => show(`소리 만드는 중 ${Math.floor(p * 100)}%`)));
  const m = await wavToMp3(w, p => show(`MP3로 바꾸는 중 ${Math.floor(p * 100)}%`)); await convSave('mp3', m, 'audio/mpeg');
  listMsg($('convInfo'), `MP3 ${(m.length / 1e6).toFixed(1)}MB (WAV ${(w.length / 1e6).toFixed(1)}MB의 ${Math.round(m.length / w.length * 100)}%)`, null);
});
$('convStem').onclick = () => convBusy('convStem', '스템 (채널별 WAV .zip)', async show => {
  const files = await withSongAsync(convSongForAudio(), () => renderStems((p, name) => show(`스템 ${Math.floor(p * 100)}% · ${name}`)));
  if (!files.length) throw new Error('소리 나는 채널이 없어요'); await convSave('zip', zipFiles(files), 'application/zip');
  listMsg($('convInfo'), `스템 ${files.length}개: ${files.map(f => f[0].replace(/\.wav$/, '')).join(', ')}`, null);
});
$('convOpen').onclick = async () => { $('convDlg').close(); await openLoaded({...conv, song:normalize(JSON.parse(JSON.stringify(conv.song)))}); status(`"${conv.name}"을 새 프로젝트로 열었어요.`); };

/* 17-input.js — MIDI 건반 · 자판 건반 · 음 녹음 · 마이크 녹음 */

// ---- 누르는 동안 울리는 음 ----
const live = new Map();   // 음높이 → {g, rec:{s0, raw}}
let recOn = false, quantOn = true, recUndo = false;
// 지금 재생 위치를 편집 중인 패턴 안의 틱으로 (재생 중이 아니거나 지금 패턴이 안 울리면 -1)
function nowPatTick() {
  const t = timelineNow(); if (t < 0) return -1;
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
function typeLabel() { $('typeKeys').textContent = typeOn ? `자판 건반 C${typeOct}~C${typeOct + 2}` : '자판 건반'; }
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

/* 18-tempo.js — 템포 지도 편집 (플레이리스트의 "템포 지도" 버튼) */
function setTempo(arr) { pushUndo(); S.tempo = normalize({...S, tempo:arr}).tempo; save(); drawPlaylist(); updatePos(S.playMode === 'song' ? songStart : startTick); }
function tempoRowPos(t) { return {bar:Math.floor(t / BAR_T) + 1, beat:Math.floor((t % BAR_T) / PPQ) + 1}; }
function buildTempoList() {
  const box = $('tempoList'); box.innerHTML = '';
  $('tempoInfo').textContent = S.tempo.length ? `바뀌는 곳 ${S.tempo.length}개 · 기본 ${S.bpm} BPM (PAT 반복과 곡 시작에 써요)` : `아직 없어요 — 곡 전체가 ${S.bpm} BPM이에요.`;
  S.tempo.slice(0, 400).forEach((x, i) => {
    const r = document.createElement('div'); r.className = 'trow'; const p = tempoRowPos(x.t);
    const bar = document.createElement('input'); bar.type = 'number'; bar.min = 1; bar.max = MAX_BARS; bar.value = p.bar; bar.setAttribute('aria-label', `${i + 1}번째 바뀌는 곳 마디`);
    const beat = document.createElement('select'); beat.setAttribute('aria-label', `${i + 1}번째 바뀌는 곳 박`); for (let b = 1; b <= 4; b++) { const o = document.createElement('option'); o.value = b; o.textContent = b + '박'; beat.appendChild(o); } beat.value = p.beat;
    const bpm = document.createElement('input'); bpm.type = 'number'; bpm.min = 20; bpm.max = 400; bpm.step = 0.01; bpm.value = x.bpm; bpm.setAttribute('aria-label', `${i + 1}번째 바뀌는 곳 BPM`);
    const del = document.createElement('button'); del.className = 'tbtn xs'; del.textContent = '삭제'; del.setAttribute('aria-label', `${i + 1}번째 바뀌는 곳 삭제`);
    const off = x.t % PPQ;   // 박 사이에 있던 위치는 그대로 유지
    const commit = () => { const a = S.tempo.map(y => ({...y})); a[i] = {t:(clamp(+bar.value || 1, 1, MAX_BARS) - 1) * BAR_T + (+beat.value - 1) * PPQ + off, bpm:+bpm.value || x.bpm}; setTempo(a); buildTempoList(); };
    bar.onchange = beat.onchange = bpm.onchange = commit;
    del.onclick = () => { setTempo(S.tempo.filter((_, k) => k !== i)); buildTempoList(); };
    const lab = document.createElement('span'); lab.textContent = '마디'; r.append(bar, lab, beat, bpm, document.createTextNode('BPM'), del); box.appendChild(r);
  });
  if (S.tempo.length > 400) { const d = document.createElement('p'); d.className = 'dsub'; d.textContent = `…${S.tempo.length - 400}개 더 있어요`; box.appendChild(d); }
}
$('tempoBtn').onclick = () => { buildTempoList(); openDlg($('tempoDlg')); };
$('tempoClose').onclick = () => $('tempoDlg').close();
$('tempoAdd').onclick = () => {
  const t = Math.min(songStart, songTicks() - BAR_T), cur = Math.round(bpmAt(t) * 100) / 100;
  setTempo([...S.tempo, {t: S.tempo.some(x => x.t === t) ? t + BAR_T : t, bpm:cur}]); buildTempoList();
  announce(`${Math.floor(t / BAR_T) + 1}마디에 바뀌는 곳을 추가했어요. BPM을 고쳐 주세요.`);
};
// 끝 4마디를 박마다 조금씩 느리게 (마지막에 70%까지)
$('tempoRit').onclick = () => {
  const end = songTicks(), start = Math.max(0, end - 4 * BAR_T), b0 = bpmAt(start), a = S.tempo.filter(x => x.t < start);
  for (let t = start, k = 0, n = (end - start) / PPQ; t < end; t += PPQ, k++) a.push({t, bpm:Math.round(b0 * (1 - 0.3 * (k + 1) / n) * 100) / 100});
  setTempo(a); buildTempoList(); status(`끝 4마디를 ${Math.round(b0)} → ${Math.round(b0 * 0.7)} BPM으로 점점 느리게 했어요 (SONG 재생에서 들려요).`);
};
$('tempoClear').onclick = () => { if (!S.tempo.length) return; setTempo([]); buildTempoList(); };
// 플레이리스트 눈금자에 템포 곡선 그리기
function drawTempoCurve(x, w, h) {
  if (!S.tempo.length) return;
  const end = MAX_BARS * BAR_T, k = PL_BAR / BAR_T, pts = tempoPts(), bs = pts.map(p => 60 / PPQ / p.spt), lo = Math.min(...bs), hi = Math.max(...bs), y = b => h - 2 - (hi > lo ? (b - lo) / (hi - lo) : 0.5) * 7;
  x.strokeStyle = CS.ink; x.globalAlpha = .7; x.lineWidth = 1.2; x.beginPath();
  pts.forEach((p, i) => { const X = p.t * k, b = bs[i]; if (i) x.lineTo(X, y(bs[i - 1])); x.lineTo(X, y(b)); if (i === pts.length - 1) x.lineTo(end * k, y(b)); });
  x.stroke(); x.globalAlpha = 1;
}

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
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.shiftKey) {   // Shift+누르기 = 그 자리(박 단위)에서 둘로 나누기
      const tk = Math.round(q.x * BAR_T / PL_BAR / PPQ) * PPQ, cut = songSec(tk) - songSec(a.s); if (cut <= 0.05 || cut >= a.len - 0.05) return;
      pushUndo(); const b = {...a, id:newId(), s:tk, off:a.off + cut, len:a.len - cut}; a.len = cut; S.audio.push(b); save(); drawPlaylist(); announce(`오디오 클립을 ${Math.floor(tk / BAR_T) + 1}마디에서 나눴어요.`); return;
    } const k = PL_BAR / BAR_T, X0 = a.s * k, X1 = audioEndTick(a) * k;
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
  plc.addEventListener('dblclick', e => { const q = auPos(e), a = audioAt(q.x, q.t); if (!a) return; e.stopImmediatePropagation(); openSampleEditor(a.slot, '오디오 클립 ' + a.name); }, true);
  plc.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
  plc.addEventListener('drop', async e => {
    const f = [...e.dataTransfer.files].find(f => /^audio\//.test(f.type) || /\.(wav|mp3|ogg|m4a|flac|webm)$/i.test(f.name)); if (!f) return; e.preventDefault();
    const q = auPos(e), s = Math.max(0, Math.round(q.x * BAR_T / PL_BAR / PPQ) * PPQ);
    try { const a = await addAudioClip(await f.arrayBuffer(), f.name.replace(/\.[^.]+$/, ''), q.t, s); status(`오디오 클립 "${a.name}" (${a.len.toFixed(1)}초)을 ${Math.floor(s / BAR_T) + 1}마디에 놓았어요.`); }
    catch (err) { status('이 소리 파일을 읽지 못했어요.'); }
  });
}
// ---- 곡을 틀면서 녹음 → 시작 위치에 오디오 클립 ----
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
    const lead = voc.lead; voc = null; stream.getTracks().forEach(t => t.stop()); if (playing) stop(); $('vocRec').textContent = '녹음'; $('vocRec').setAttribute('aria-pressed', 'false');
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

/* 20-sauto.js — 곡 전체 자동화: 플레이리스트 아래 줄 하나에 곡 처음~끝 선 (SONG 재생·WAV에 적용) */
const SA_H = 84, SA_NAME = {vol:'볼륨', cut:'필터', pan:'팬', rev:'리버브 보내기', dly:'딜레이 보내기', fx1:'이펙트 1', fx2:'이펙트 2', fx3:'이펙트 3', fx4:'이펙트 4', fx5:'이펙트 5'};
let saKey = '';   // 지금 보는 줄 "대상|값" ('' = 숨김)
const saH = () => saKey ? SA_H : 0;
function saTargets() {
  const t = S.channels.map(c => [chKey(c), c.name]); t.push(['chords', '코드'], ['bass', '베이스']);
  if ((S.audio || []).length) t.push(['audio', '오디오 클립']); for (const b of BUSES) if (Object.values(S.mix).some(m => m.out === b)) t.push([b, CH_NAME[b]]);
  t.push(['master', '마스터']); return t;
}
function saParams(key) {
  const fx = (S.mix[key] && S.mix[key].fx) || [], out = key === 'master' ? ['vol'] : ['vol', 'cut', 'pan', 'rev', 'dly'];
  fx.forEach((f, i) => out.push('fx' + (i + 1))); return out;
}
function saLabel(key, prm) { if (!prm.startsWith('fx')) return tMsg(SA_NAME[prm]); const f = ((S.mix[key] || {}).fx || [])[+prm[2] - 1]; return f ? `${tMsg(SA_NAME[prm])} ${tMsg(FX_NAME[f.type])} ${tMsg(FX_KNOBS[f.type][FX_AUTOK[f.type] || 0])}` : tMsg(SA_NAME[prm]); }
function buildSaSelects() {
  const tSel = $('saTarget'), pSel = $('saParam'), [k0, p0] = saKey ? saKey.split('|') : ['', ''];
  tSel.innerHTML = `<option value="">${tMsg('자동화 줄 숨김')}</option>` + saTargets().map(([k, n]) => `<option value="${k}"${k === k0 ? ' selected' : ''}>${Object.keys(S.sauto).some(x => x.startsWith(k + '|')) ? '● ' : ''}${nameOf(n)}</option>`).join('');
  pSel.hidden = !k0; pSel.innerHTML = k0 ? saParams(k0).map(p => `<option value="${p}"${p === p0 ? ' selected' : ''}>${S.sauto[k0 + '|' + p] ? '● ' : ''}${saLabel(k0, p)}</option>`).join('') : '';
}
function saSet() { const k = $('saTarget').value; saKey = k ? k + '|' + ($('saParam').value && saParams(k).includes($('saParam').value) ? $('saParam').value : 'vol') : ''; buildSaSelects(); drawPlaylist(); }
$('saTarget').onchange = () => { $('saParam').value = 'vol'; saSet(); announce(saKey ? '곡 자동화 줄: ' + $('saTarget').selectedOptions[0].textContent : '곡 자동화 줄을 숨겼어요'); };
$('saParam').onchange = saSet;
// ---- 그리기 ----
const saY = (y0, v) => y0 + SA_H - 6 - v * (SA_H - 14);
function drawSongAutoLane(x) {
  if (!saKey) return;
  const y0 = S.playlist.tracks * PL_ROW, w = MAX_BARS * PL_BAR, k = PL_BAR / BAR_T, pts = S.sauto[saKey] || [], [key, prm] = saKey.split('|');
  x.fillStyle = CS.panel2; x.fillRect(0, y0, w, SA_H); x.fillStyle = CS.line; x.fillRect(0, y0, w, 1);
  for (let b = 0; b <= MAX_BARS; b += 4) { x.fillStyle = CS.line; x.fillRect(b * PL_BAR, y0, 1, SA_H); }
  x.font = '11px "IBM Plex Sans KR",sans-serif'; x.textBaseline = 'top'; x.fillStyle = CS.mute;
  const name = (saTargets().find(t => t[0] === key) || [0, key])[1] + ' · ' + saLabel(key, prm);
  x.fillText(pts.length ? name : name + ' — 눌러서 점 찍기 · 끌어 옮기기 · 두 번 눌러 지우기', plWrap.scrollLeft + 8, y0 + 4);
  if (!pts.length) return;
  x.strokeStyle = CS.note; x.lineWidth = 2; x.beginPath(); x.moveTo(0, saY(y0, pts[0].v)); for (const p of pts) x.lineTo(p.s * k, saY(y0, p.v)); x.lineTo(w, saY(y0, pts[pts.length - 1].v)); x.stroke();
  x.fillStyle = CS.note; for (const p of pts) { x.beginPath(); x.arc(p.s * k, saY(y0, p.v), 4, 0, 7); x.fill(); }
}
// ---- 편집 ----
let saDrag = null;
function saHit(e) { const r = plc.getBoundingClientRect(); return {x:e.clientX - r.left, y:e.clientY - r.top - S.playlist.tracks * PL_ROW}; }
function saNear(pts, q) { const k = PL_BAR / BAR_T; let best = -1, bd = 10; pts.forEach((p, i) => { const d = Math.hypot(p.s * k - q.x, saY(0, p.v) - q.y); if (d < bd) { bd = d; best = i; } }); return best; }
const saTick = x => clamp(Math.round(x * BAR_T / PL_BAR / (PPQ / 4)) * (PPQ / 4), 0, MAX_BARS * BAR_T), saVal = y => clamp((SA_H - 6 - y) / (SA_H - 14), 0, 1);
function initSongAuto() {
  plc.addEventListener('pointerdown', e => {
    if (!saKey) return; const q = saHit(e); if (q.y < 0 || e.button === 2) return; e.stopImmediatePropagation(); e.preventDefault();
    pushUndo(); const pts = S.sauto[saKey] = S.sauto[saKey] || []; let i = saNear(pts, q);
    if (i < 0) { const s = saTick(q.x), same = pts.find(p => p.s === s); if (same) same.v = saVal(q.y); else pts.push({s, v:saVal(q.y)}); pts.sort((a, b) => a.s - b.s); i = pts.findIndex(p => p.s === s); }
    saDrag = pts[i]; try { plc.setPointerCapture(e.pointerId); } catch (_) {} drawPlaylist();
  }, true);
  plc.addEventListener('pointermove', e => { if (!saDrag) return; e.stopImmediatePropagation(); const q = saHit(e), pts = S.sauto[saKey], s = saTick(q.x); if (!pts.some(p => p !== saDrag && p.s === s)) saDrag.s = s; saDrag.v = saVal(q.y); pts.sort((a, b) => a.s - b.s); drawPlaylist(); }, true);
  plc.addEventListener('pointerup', e => { if (!saDrag) return; e.stopImmediatePropagation(); saDrag = null; save(); buildSaSelects(); }, true);
  const del = e => { if (!saKey) return; const q = saHit(e); if (q.y < 0) return; e.preventDefault(); e.stopImmediatePropagation(); const pts = S.sauto[saKey]; if (!pts) return; const i = saNear(pts, q); if (i < 0) return;
    pushUndo(); pts.splice(i, 1); if (!pts.length) delete S.sauto[saKey]; save(); drawPlaylist(); buildSaSelects(); };
  plc.addEventListener('dblclick', del, true); plc.addEventListener('contextmenu', del, true);
  buildSaSelects();
}
// ---- 재생: 대상의 오디오 값에 선 예약 (6틱마다 중간 점) ----
function saParamOf(EE, key, prm) {
  if (key === 'master') return prm === 'vol' ? [EE.mAuto.gain, v => v] : null;
  const ch = getCh(EE, key);
  if (prm === 'vol') return [ch.sVol.gain, v => v]; if (prm === 'cut') return [ch.sCut.frequency, cutHz]; if (prm === 'pan') return [ch.sPan.pan, v => v * 2 - 1];
  if (prm === 'rev') return [ch.rs.gain, v => v]; if (prm === 'dly') return [ch.ds.gain, v => v];
  const n = ch.fxNodes[+prm[2] - 1]; return n && n.pa ? [n.pa, n.map] : null;
}
function scheduleSongAuto(EE, t0, t1, base) {
  for (const [k, pts] of Object.entries(S.sauto || {})) {
    if (!pts.length) continue; const [key, prm] = k.split('|'), pm = saParamOf(EE, key, prm); if (!pm) continue; const [param, map] = pm, at = t => base + tSec(t);
    param.setValueAtTime(map(autoAt(pts, t0)), at(t0));
    const cuts = new Set(pts.filter(q => q.s > t0 && q.s < t1).map(q => q.s)); for (let t = Math.floor(t0 / 6) * 6 + 6; t < t1; t += 6) cuts.add(t);
    for (const t of [...cuts].sort((a, b) => a - b)) param.linearRampToValueAtTime(map(autoAt(pts, t)), at(t));
    param.linearRampToValueAtTime(map(autoAt(pts, t1)), at(t1));
  }
}

/* 21-synth.js — 악기 "신스": 발진기 2개 + 서브 → 필터(엔벨로프) → 앰프 ADSR, LFO, 유니즌 */
// 웨이브테이블: 위치 0 사인 → 0.33 삼각 → 0.66 톱니 → 1 사각 사이를 배음 비율로 섞은 파형 (21단계 캐시)
const WT_CACHE = new WeakMap();
function wavetable(ac, pos) {
  let m = WT_CACHE.get(ac); if (!m) { m = {}; WT_CACHE.set(ac, m); } const k = Math.round(clamp(pos, 0, 1) * 20); if (m[k]) return m[k];
  const N = 32, shapes = [n => n === 1 ? 1 : 0, n => n % 2 ? 8 / (Math.PI * Math.PI) * ((n - 1) / 2 % 2 ? -1 : 1) / (n * n) : 0, n => 2 / (Math.PI * n) * (n % 2 ? 1 : -1), n => n % 2 ? 4 / (Math.PI * n) : 0];
  const x = k / 20 * 3, i = Math.min(2, Math.floor(x)), w = x - i, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) im[n] = shapes[i](n) * (1 - w) + shapes[i + 1](n) * w;
  return m[k] = ac.createPeriodicWave(re, im);
}
function synthVoice(E, f, t, d, vel, dest, slot) {
  const ac = E.ac, c = slot && slot.startsWith('ch:') ? chById(slot.slice(3)) : null, P = normSyn(c && c.syn), end = t + d, stopT = end + P.rel * 4 + 0.05;
  const mixG = ac.createGain(), flt = ac.createBiquadFilter(), amp = ac.createGain(), oscs = [];
  flt.type = 'lowpass'; flt.Q.value = 0.5 + P.res * 18; mixG.connect(flt); flt.connect(amp); amp.connect(dest);
  // 필터 엔벨로프: 올라갔다가 fdec초 동안 기본 주파수로
  const base = cutHz(P.cut), top = Math.min(18000, base * Math.pow(2, P.fenv * 6));
  flt.frequency.setValueAtTime(top, t); flt.frequency.setTargetAtTime(base, t + 0.002, Math.max(0.01, P.fdec) / 3);
  const pk = P.vol * vel * 0.45;
  const g1 = ac.createGain(); g1.gain.value = (1 - P.mix) / P.uni; g1.connect(mixG);
  const wave = w => w === 'table' ? wavetable(ac, P.wt) : w, o1 = [];
  for (let u = 0; u < P.uni; u++) { const o = osc(ac, wave(P.w1), f, (u - (P.uni - 1) / 2) * P.spread, t, stopT, g1); oscs.push(o); o1.push(o); }
  const g2 = ac.createGain(); g2.gain.value = P.mix; g2.connect(mixG); const o2 = osc(ac, wave(P.w2), f * Math.pow(2, P.oct2), P.det, t, stopT, g2); oscs.push(o2);
  // FM: 발진기2와 같은 주파수의 사인이 발진기1의 주파수를 흔듦 (양 = fm × 주파수 × 4)
  let fmG = null; if (P.fm > 0 || [P.m1d, P.m2d].includes('fm')) { const mo = osc(ac, 'sine', f * Math.pow(2, P.oct2), P.det, t, stopT, (fmG = ac.createGain())); fmG.gain.value = P.fm * f * 4; o1.forEach(o => fmG.connect(o.frequency)); }
  if (P.sub > 0) { const gs = ac.createGain(); gs.gain.value = P.sub * 0.8; gs.connect(mixG); oscs.push(osc(ac, 'sine', f / 2, 0, t, stopT, gs)); }

  amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(pk, t + Math.max(0.002, P.atk));
  amp.gain.setTargetAtTime(pk * P.sus + 0.0001, t + Math.max(0.002, P.atk), Math.max(0.01, P.dec) / 3); amp.gain.setTargetAtTime(0.0001, Math.max(end, t + P.atk), Math.max(0.01, P.rel) / 3);
  // 모드 매트릭스 2칸: 출처(LFO·엔벨로프·세기) → 대상(필터·음높이·볼륨·FM 양)
  let lfoNode = null; const getLfo = () => { if (!lfoNode) { lfoNode = ac.createOscillator(); lfoNode.frequency.value = clamp(P.lfoRate, 0.05, 20); lfoNode.start(t); lfoNode.stop(stopT); } return lfoNode; };
  for (const [s0, d0, a0] of [[P.m1s, P.m1d, P.m1a], [P.m2s, P.m2d, P.m2a]]) {
    if (s0 === 'none' || !a0) continue; let src;
    if (s0 === 'lfo') src = getLfo();
    else { src = ac.createConstantSource(); src.start(t); src.stop(stopT);
      if (s0 === 'vel') src.offset.value = vel; else { src.offset.setValueAtTime(0, t); src.offset.linearRampToValueAtTime(1, t + Math.max(0.002, P.atk)); src.offset.setTargetAtTime(0, t + Math.max(0.002, P.atk), Math.max(0.01, P.fdec) / 3); } }
    const g = ac.createGain(); src.connect(g);
    if (d0 === 'cut') { g.gain.value = 6000 * a0; g.connect(flt.frequency); }   // 양 1 = +6kHz else if (d0 === 'pitch') { g.gain.value = 1200 * a0; oscs.forEach(o => g.connect(o.detune)); }
    else if (d0 === 'vol') { g.gain.value = pk * 0.5 * a0; g.connect(amp.gain); } else if (fmG) { g.gain.value = f * 4 * a0; g.connect(fmG.gain); }
  }
  if (P.lfoAmt > 0) {
    const lfo = getLfo(), lg = ac.createGain(); lfo.connect(lg);
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
  S2('LFO 속도', 'lfoRate', 0.05, 12, 0.05, v => v.toFixed(2) + 'Hz'); S2('LFO 양', 'lfoAmt', 0, 1, 0.01, pc);
  S2('웨이브테이블 위치', 'wt', 0, 1, 0.01, v => ['사인', '삼각', '톱니', '사각'][Math.round(v * 3)] + ' ' + pc(v)); S2('FM 양', 'fm', 0, 1, 0.01, pc);
  for (const n of [1, 2]) { box.appendChild(selectEl(`${c.name} 모드 ${n} 출처`, MOD_SRC, P['m' + n + 's'], v => set('m' + n + 's', v))); box.appendChild(selectEl(`${c.name} 모드 ${n} 대상`, MOD_DST, P['m' + n + 'd'], v => set('m' + n + 'd', v))); S2(`모드 ${n} 양`, 'm' + n + 'a', -1, 1, 0.01, pc); }
  S2('신스 볼륨', 'vol', 0, 1, 0.01, pc);
}

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

/* 23-cloud.js — 서버에 곡 저장·열기 (/api/songs, 저장소 키) */
const CLOUD_API = (window.MSK_SERVER || '') + '/api/songs', AUTH_API = (window.MSK_SERVER || '') + '/api/auth', CK = 'msk-cloud-key', CA = 'msk-cloud-auto', AK = 'msk-auth';
// 로그인 정보 {token, username} — 30일 동안 유지 (서버가 서명한 토큰)
const authInfo = () => { try { return JSON.parse(lsGet(AK) || 'null'); } catch (e) { return null; } };
function setAuth(a) { lsSet(AK, a ? JSON.stringify(a) : ''); authUI();
  if (typeof fetchTier === 'function') { if (!a && typeof serverTier !== 'undefined') serverTier = null; fetchTier().then(() => { if (typeof applyTier === 'function') applyTier(); }); }   // 6: 로그인·로그아웃하면 등급 다시 확인
}
function authUI() { const a = authInfo(); $('authOut').hidden = !!a; $('authIn').hidden = !a; $('authName').textContent = a ? a.username + tMsg(' 계정으로 로그인됨') : ''; $('authMove').hidden = !(a && cloudKey()); $('cloudBtn').textContent = a ? a.username : tMsg('로그인'); }
async function authCall(action, body, token) {
  const r = await fetch(`${AUTH_API}?action=${action}`, {method:body ? 'POST' : 'GET', headers:{'content-type':'application/json', ...(token ? {authorization:'Bearer ' + token} : {})}, body:body ? JSON.stringify(body) : undefined});
  let j = {}; try { j = await r.json(); } catch (e) {} if (!r.ok) throw Object.assign(new Error(j.message || j.error || 'HTTP ' + r.status), {status:r.status}); return j;
}
const cloudKey = () => lsGet(CK) || '';
function newCloudKey() { const a = new Uint8Array(18); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function cloudFetch(q, opt = {}) {
  const a = authInfo(), useKey = opt.useKey, h = {...(opt.headers || {})}; if (a && !useKey) h.authorization = 'Bearer ' + a.token; else h['x-msk-key'] = cloudKey();
  const r = await fetch(CLOUD_API + q, {...opt, headers:h});
  if (r.status === 401 && a && !useKey) setAuth(null);   // 토큰이 만료되면 로그아웃 상태로
  if (!r.ok) { let m = 'HTTP ' + r.status; try { const j = await r.json(); m = j.message || j.error || m; } catch (e) {} throw Object.assign(new Error(m), {status:r.status}); }
  return r;
}
async function cloudUpload(quiet) {
  if (!authInfo() && !cloudKey()) lsSet(CK, newCloudKey());
  const u = await encodeMSK(S, lib.list[lib.current].name, await songSamples(S)), name = lib.list[lib.current].name;
  if (u.length > 4 * 1024 * 1024) throw new Error(`곡이 ${(u.length / 1e6).toFixed(1)}MB라 서버 한도(4MB)를 넘어요 (내 샘플·오디오 클립이 크면 생겨요)`);
  const r = await (await cloudFetch(`?id=${encodeURIComponent(lib.current)}&name=${encodeURIComponent(name)}`, {method:'PUT', headers:{'content-type':'application/octet-stream'}, body:u})).json();
  if (!quiet) status(`서버에 올렸어요: "${name}" (${(u.length / 1024).toFixed(0)}KB)`); return r;
}
let cloudT = 0, cloudFailed = false;
function cloudOnSave() {   // 저장할 때마다(3초 모아서) 자동으로 서버에
  if (lsGet(CA) !== '1' || !(authInfo() || cloudKey())) return; clearTimeout(cloudT);
  cloudT = setTimeout(() => cloudUpload(true).then(() => { cloudFailed = false; }).catch(e => { if (!cloudFailed) status('서버 자동 저장 실패: ' + e.message + ' (내 컴퓨터에는 저장돼 있어요)'); cloudFailed = true; }), 3000);
}
async function cloudRefresh() {
  const box = $('cloudList'); box.innerHTML = ''; $('cloudKey').value = cloudKey(); $('cloudAuto').checked = lsGet(CA) === '1';
  authUI(); if (!authInfo() && !cloudKey()) { $('cloudState').textContent = '로그인하면 곡을 계정에 저장해요. 로그인 없이 쓰려면 아래 "저장소 키"를 쓰세요.'; return; }
  try {
    const {songs} = await (await cloudFetch('')).json();
    $('cloudState').textContent = `서버 연결됨 · ${authInfo() ? authInfo().username + ' 계정' : '저장소 키'} · 곡 ${songs.length}개`;
    for (const s of songs) {
      const row = document.createElement('div'); row.className = 'trow';
      const nm = document.createElement('span'); nm.style.flex = '1'; nm.textContent = `${s.name} · ${(s.size / 1024).toFixed(0)}KB · ${new Date(s.uploadedAt).toLocaleString('ko-KR')}`;
      const op = document.createElement('button'); op.className = 'tbtn xs'; op.textContent = '열기'; op.setAttribute('aria-label', s.name + ' 열기');
      op.onclick = async () => { try { const u = new Uint8Array(await (await cloudFetch('?id=' + encodeURIComponent(s.id))).arrayBuffer()), r = await decodeMSK(u); $('cloudDlg').close(); await openLoaded({song:r.song, name:r.name || s.name, from:'서버', samples:r.samples, warnings:[]}); status(`서버에서 "${s.name}"을 열었어요.`); } catch (e) { status('열지 못했어요: ' + e.message); } };
      const dl = document.createElement('button'); dl.className = 'tbtn xs'; dl.textContent = '지우기'; dl.setAttribute('aria-label', s.name + ' 서버에서 지우기');
      dl.onclick = async () => { if (!confirm(`서버에서 "${s.name}"을 지울까요? 내 컴퓨터의 곡은 그대로예요.`)) return; try { await cloudFetch('?id=' + encodeURIComponent(s.id), {method:'DELETE'}); cloudRefresh(); } catch (e) { status('지우지 못했어요: ' + e.message); } };
      row.append(nm, op, dl); box.appendChild(row);
    }
  } catch (e) {
    $('cloudState').textContent = e.status === 503 ? '서버 저장소가 아직 연결되지 않았어요 (Vercel에서 Blob 저장소를 이 프로젝트에 연결해야 해요).' : e.status === 401 ? '저장소 키 모양이 틀렸어요 (16~64글자, 영문·숫자·-·_).' : '서버에 연결하지 못했어요: ' + e.message + ' (인터넷 연결 확인)';
  }
}
$('cloudBtn').onclick = () => { cloudRefresh(); openDlg($('cloudDlg')); };
async function authGo(action) {
  const username = $('authUser').value.trim().toLowerCase(), password = $('authPass').value;
  // 만 14세 미만은 가입을 받지 않음 (서버도 확인함)
  if (action === 'signup' && !$('authAge').checked) { $('cloudState').textContent = tMsg('회원가입하려면 만 14세 이상 확인과 개인정보처리방침 동의에 체크해 주세요. 만 14세 미만은 로그인 없이 쓸 수 있어요.'); $('authAge').focus(); return; }
  try { const j = await authCall(action, action === 'signup' ? {username, password, age14:true} : {username, password}); $('authPass').value = ''; setAuth({token:j.token, username:j.username}); status(action === 'signup' ? `${j.username} 계정을 만들었어요.` : `${j.username}(으)로 로그인했어요.`); cloudRefresh(); }
  catch (e) { $('cloudState').textContent = (action === 'signup' ? '회원가입 실패: ' : '로그인 실패: ') + e.message; }
}
$('authLogin').onclick = () => authGo('login'); $('authSignup').onclick = () => authGo('signup');
$('authPass').onkeydown = e => { if (e.key === 'Enter') authGo('login'); };
$('authLogout').onclick = () => { setAuth(null); status('로그아웃했어요. 내 컴퓨터의 곡은 그대로예요.'); cloudRefresh(); };
$('authDelete').onclick = async () => {
  const pw = prompt('계정과 서버의 곡을 모두 지워요 (내 컴퓨터의 곡은 그대로). 계속하려면 비밀번호를 넣어 주세요.'); if (!pw) return;
  try { await authCall('delete', {password:pw}, authInfo().token); setAuth(null); status('계정을 삭제했어요.'); cloudRefresh(); } catch (e) { $('cloudState').textContent = '계정 삭제 실패: ' + e.message; }
};
// 저장소 키로 올린 곡을 로그인한 계정으로 복사
$('authMove').onclick = async () => {
  try { const {songs} = await (await cloudFetch('', {useKey:true})).json(); let n = 0;
    for (const s of songs) { const u = new Uint8Array(await (await cloudFetch('?id=' + encodeURIComponent(s.id), {useKey:true})).arrayBuffer());
      await cloudFetch(`?id=${encodeURIComponent(s.id)}&name=${encodeURIComponent(s.name)}`, {method:'PUT', headers:{'content-type':'application/octet-stream'}, body:u}); n++; $('cloudState').textContent = `옮기는 중 ${n}/${songs.length}`; }
    status(`저장소 키의 곡 ${n}개를 계정으로 복사했어요 (키 쪽에도 남아 있어요).`); cloudRefresh(); } catch (e) { $('cloudState').textContent = '옮기기 실패: ' + e.message; }
};
setTimeout(authUI, 0);
$('cloudClose').onclick = () => $('cloudDlg').close();
$('cloudRefresh').onclick = cloudRefresh;
$('cloudKey').onchange = () => { const v = $('cloudKey').value.trim(); if (v && !/^[A-Za-z0-9_-]{16,64}$/.test(v)) { status('저장소 키는 16~64글자(영문·숫자·-·_)예요.'); return; } lsSet(CK, v); cloudRefresh(); };
$('cloudKeyNew').onclick = () => { if (cloudKey() && !confirm('새 키를 만들면 지금 키의 곡 목록은 이 기기에서 안 보여요 (서버에는 남아 있어요). 계속할까요?')) return; lsSet(CK, newCloudKey()); cloudRefresh(); };
$('cloudKeyCopy').onclick = async () => { try { await navigator.clipboard.writeText(cloudKey()); status('저장소 키를 복사했어요.'); } catch (e) { $('cloudKey').select(); } };
$('cloudAuto').onchange = () => { lsSet(CA, $('cloudAuto').checked ? '1' : '0'); if ($('cloudAuto').checked && !cloudKey()) { lsSet(CK, newCloudKey()); cloudRefresh(); } };
$('cloudUp').onclick = async () => { try { await cloudUpload(false); cloudRefresh(); } catch (e) { $('cloudState').textContent = '올리지 못했어요: ' + e.message; } };

/* 공유 링크 만들기 — 곡을 서버에 올리고 /s/<id> 주소를 받는다 */
async function makeShareLink() {
  if (!authInfo()) return status('공유하려면 로그인해 주세요.');
  const b = $('shareBtn'); const old = b.textContent;
  b.textContent = '…'; b.disabled = true;
  try {
    const up = await cloudUpload(true);
    if (!up || !up.url) throw new Error('곡 주소를 받지 못했어요');
    const name = (lib.list[lib.current] || {}).name || '내 곡';
    const bars = Math.max(1, Math.ceil((curPat()?.len || 48) / 48));
    const r = await fetch((window.MSK_SERVER || '') + '/api/share?action=create', {
      method:'POST', headers:{'content-type':'application/json', authorization:'Bearer ' + authInfo().token},
      body:JSON.stringify({name, url:up.url, bars, bpm:S.bpm, size:up.size})});
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || '만들지 못했어요');
    const link = location.origin + j.link;
    try { await navigator.clipboard.writeText(link); status(`공유 링크를 복사했어요: ${link}`); }
    catch (e) { prompt('이 링크를 복사해 주세요', link); }
  } catch (e) { status('공유 링크를 만들지 못했어요: ' + e.message); }
  finally { b.textContent = old; b.disabled = false; }
}
document.addEventListener('DOMContentLoaded', () => { const b = $('shareBtn'); if (b) b.onclick = makeShareLink; });
if (document.readyState !== 'loading') { const b = $('shareBtn'); if (b) b.onclick = makeShareLink; }

/* 개발자 페이지용 — 방문 한 번과 터진 오류를 서버에 알린다 (누가 왔는지는 안 보냄) */
(() => {
  const send = (action, body) => {
    try {
      fetch((window.MSK_SERVER || '') + '/api/stats?action=' + action,
            {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body),
             keepalive:true}).catch(() => {});
    } catch (e) {}
  };
  // 하루에 한 번만 센다
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem('msk.hit') !== today) {
      localStorage.setItem('msk.hit', today);
      send('hit', {lang:(typeof LANG !== 'undefined' ? LANG : 'ko'),
                   device:(matchMedia('(pointer:coarse)').matches ? 'phone' : 'desktop')});
    }
  } catch (e) {}
  // 오류는 같은 것을 거푸 보내지 않는다
  const seen = new Set();
  addEventListener('error', ev => {
    const m = String(ev.message || '').slice(0, 300); if (!m || seen.has(m)) return;
    seen.add(m);
    send('err', {msg:m, where:`${(ev.filename || '').split('/').pop()}:${ev.lineno || 0}`,
                 ua:navigator.userAgent.slice(0, 160)});
  });
  addEventListener('unhandledrejection', ev => {
    const m = String(ev.reason && ev.reason.message || ev.reason || '').slice(0, 300);
    if (!m || seen.has(m)) return;
    seen.add(m); send('err', {msg:m, where:'promise', ua:navigator.userAgent.slice(0, 160)});
  });
})();

/* 24-desktop.js — 데스크톱 앱에서만: .msk 파일 두 번 클릭·파일 > 열기로 넘어온 곡 열기 (웹에서는 아무것도 안 함) */
if (window.mskDesktop) {
  window.mskDesktop.onOpenFile(async (name, bytes) => {
    try { const r = await loadAny(new File([bytes], name), name.replace(/\.[^.]+$/, '')); await openLoaded(r); status(L2(`${r.from} 파일 "${name}"을 열었어요.`, `Opened ${fmtL(r.from)} file "${name}".`)); }
    catch (e) { status(L2(`"${name}"을 열지 못했어요: `, `Couldn't open "${name}": `) + (e.message || L2('알 수 없는 형식', 'unknown format'))); }
  });
  window.mskDesktop.info().then(i => { document.title = `멜로디 스케치패드 ${i.version}`; }).catch(() => {});
}

/* 25-mypage.js — 내 페이지: 계정 정보 · 서버의 내 곡(미리보기 그림) · 비밀번호 · 로그아웃 */
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';   // 서버 한도(4×1024×1024)와 같은 단위
// 곡의 음 배치를 작은 그림으로 (곡 모드면 플레이리스트 전체, 아니면 첫 패턴)
function drawThumb(cv, song) {
  const r = cv.getBoundingClientRect(), W = Math.max(200, Math.round(r.width || 210)), H = 96, x = cv.getContext('2d'); cv.width = W * DPR; cv.height = H * DPR; x.setTransform(DPR, 0, 0, DPR, 0, 0);
  x.fillStyle = CS.bg; x.fillRect(0, 0, W, H);
  const notes = [], cix = {}; song.channels.forEach((c, i) => cix[c.id] = i);
  withSong(song, () => {
    const parts = song.playlist.clips.length ? song.playlist.clips.flatMap(cl => clipParts(cl, 0, MAX_BARS * BAR_T)) : [{P:song.patterns[0], origin:0, from:0, to:patTicks(song.patterns[0])}];
    for (const q of parts) for (const [cid, arr] of Object.entries(q.P.notes)) for (const n of arr) if (n.s >= q.from && n.s < q.to) notes.push({s:n.s + q.origin, l:n.l, p:n.p, c:cix[cid] || 0, drum:(song.channels[cix[cid]] || {}).kind === 'drum'});
  });
  if (!notes.length) { x.fillStyle = CS.mute; x.font = '12px sans-serif'; x.fillText('빈 곡', 10, 20); return; }
  const end = Math.max(...notes.map(n => n.s + n.l)), mel = notes.filter(n => !n.drum), lo = mel.length ? Math.min(...mel.map(n => n.p)) : 48, hi = mel.length ? Math.max(...mel.map(n => n.p)) : 72, sp = Math.max(12, hi - lo + 1);
  for (const n of notes) { const X = n.s / end * W, w = Math.max(1, n.l / end * W);
    if (n.drum) { x.fillStyle = CS.line2; x.fillRect(X, H - 8, Math.max(1, w * 0.6), 5); continue; }
    x.fillStyle = PAT_COLORS[1 + n.c % 7]; x.fillRect(X, (H - 14) - (n.p - lo + 1) / sp * (H - 20), w, 2.5); }
}
async function openMyPage() {
  const a = authInfo(); if (!a) { cloudRefresh(); openDlg($('cloudDlg')); return; }
  $('myPage').hidden = false; document.body.style.overflow = 'hidden'; $('mpBack').focus();
  $('mpAvatar').textContent = a.username[0].toUpperCase(); $('mpName').textContent = a.username; $('mpAuto').checked = lsGet(CA) === '1';
  $('mpLocal').textContent = Object.keys(lib.list).length; $('mpMsg').textContent = '';
  try {
    const me = await authCall('me', null, a.token);
    $('mpMeta').textContent = me.created ? `${new Date(me.created).toLocaleDateString('ko-KR')}에 가입` : '';
    $('mpSongs').textContent = me.songs; $('mpSize').textContent = fmtSize(me.bytes);
    $('mpUse').textContent = `곡 하나는 ${fmtSize(me.limitBytes)}까지 올릴 수 있어요 · 가장 큰 곡 기준`;
  } catch (e) { if (e.status === 401) { setAuth(null); closeMyPage(); status('로그인이 만료됐어요. 다시 로그인해 주세요.'); return; } $('mpMeta').textContent = '서버에 연결하지 못했어요: ' + e.message; }
  mpLoadSongs();
}
async function mpLoadSongs() {
  const g = $('mpGrid'); g.innerHTML = '<p class="dsub">불러오는 중…</p>';
  let songs = []; try { songs = (await (await cloudFetch('')).json()).songs; } catch (e) { g.innerHTML = `<p class="dsub">곡 목록을 못 불러왔어요: ${e.message}</p>`; return; }
  g.innerHTML = songs.length ? '' : '<p class="dsub">아직 서버에 올린 곡이 없어요. "지금 곡 올리기"를 눌러 보세요.</p>';
  const biggest = songs.reduce((m, s) => Math.max(m, s.size), 0); $('mpBarFill').style.width = Math.min(100, biggest / (4 * 1024 * 1024) * 100) + '%';
  for (const s of songs) {
    const card = document.createElement('div'); card.className = 'mp-song'; card.setAttribute('role', 'group'); card.setAttribute('aria-label', s.name);
    const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
    const info = document.createElement('div'); info.className = 'mp-info'; info.innerHTML = `<b></b><small>${fmtSize(s.size)} · ${new Date(s.uploadedAt).toLocaleString('ko-KR', {dateStyle:'medium', timeStyle:'short'})}</small><small class="mp-sub"></small>`; info.querySelector('b').textContent = s.name;
    const act = document.createElement('div'); act.className = 'mp-act';
    const op = document.createElement('button'); op.className = 'tbtn xs solid'; op.textContent = '열기'; op.setAttribute('aria-label', s.name + ' 열기');
    const dl = document.createElement('button'); dl.className = 'tbtn xs'; dl.textContent = '지우기'; dl.setAttribute('aria-label', s.name + ' 서버에서 지우기');
    act.append(op, dl); card.append(cv, info, act); g.appendChild(card);
    let loaded = null;
    const load = async () => loaded || (loaded = (async () => { const u = new Uint8Array(await (await cloudFetch('?id=' + encodeURIComponent(s.id))).arrayBuffer()); return {u, r:await decodeMSK(u)}; })());
    load().then(({r}) => { drawThumb(cv, r.song); const sg = r.song; info.querySelector('.mp-sub').textContent = `${sg.bpm} BPM · 채널 ${sg.channels.length} · ${sg.playlist.clips.length ? '마디 ' + withSong(sg, () => songBars()) : '패턴 ' + sg.patterns.length}`; }).catch(() => {});
    op.onclick = async () => { try { const {r} = await load(); closeMyPage(); await openLoaded({song:r.song, name:r.name || s.name, from:'서버', samples:r.samples, warnings:[]}); status(`서버에서 "${s.name}"을 열었어요.`); } catch (e) { $('mpMsg').textContent = '열지 못했어요: ' + e.message; } };
    dl.onclick = async () => { if (!confirm(`서버에서 "${s.name}"을 지울까요? 내 컴퓨터의 곡은 그대로예요.`)) return; try { await cloudFetch('?id=' + encodeURIComponent(s.id), {method:'DELETE'}); openMyPage(); } catch (e) { $('mpMsg').textContent = '지우지 못했어요: ' + e.message; } };
  }
}
function closeMyPage() { $('myPage').hidden = true; document.body.style.overflow = ''; }
$('mpBack').onclick = closeMyPage;
$('myPage').addEventListener('keydown', e => { if (e.key === 'Escape') closeMyPage(); });
$('mpAuto').onchange = () => lsSet(CA, $('mpAuto').checked ? '1' : '0');
$('mpUp').onclick = async () => { try { await cloudUpload(false); openMyPage(); } catch (e) { $('mpMsg').textContent = '올리지 못했어요: ' + e.message; } };
$('mpPw').onclick = async () => {
  try { const j = await authCall('password', {old:$('mpOld').value, password:$('mpNew').value}, authInfo().token); setAuth({...authInfo(), token:j.token}); $('mpOld').value = $('mpNew').value = ''; $('mpMsg').textContent = '비밀번호를 바꿨어요.'; }
  catch (e) { $('mpMsg').textContent = '바꾸지 못했어요: ' + e.message; }
};
$('mpKeys').onclick = () => { closeMyPage(); cloudRefresh(); openDlg($('cloudDlg')); };
$('mpLogout').onclick = () => { closeMyPage(); $('authLogout').click(); };
$('mpDelete').onclick = () => { closeMyPage(); $('authDelete').click(); };
$('authPage').onclick = () => { $('cloudDlg').close(); openMyPage(); };
$('cloudBtn').onclick = () => authInfo() ? openMyPage() : (cloudRefresh(), openDlg($('cloudDlg')));

/* 26-ai.js — AI: 작곡 · 코드 추천 · 피드백
   엔진 두 가지: 기본 AI(앱 안에서 음악 규칙으로 계산, 바로 동작) / Claude(서버 /api/ai, 로그인 + Vercel 결제 카드 필요)
   Claude가 막히면 기본 AI로 자동 전환해요. 두 엔진 모두 같은 JSON 모양을 돌려줘서 곡에 넣는 코드는 하나예요. */
const AI_API = (window.MSK_SERVER || '') + '/api/ai', NN = 'C C# D D# E F F# G G# A A# B'.split(' ');
const pName = p => NN[p % 12] + (Math.floor(p / 12) - 1), pitchOf = s => { const m = /^([A-G])(#?)(-?\d)$/.exec(String(s).trim()); return m ? (+m[3] + 1) * 12 + NN.indexOf(m[1] + m[2]) : null; };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const aiPick = (r, a) => a[Math.floor(r() * a.length)];
// 음계의 d번째 음 위에 3화음 → {r, q, pcs}
function triad(root, scale, d, seven) {
  const pc = i => (root + scale[((d + i) % 7 + 7) % 7] + 12 * Math.floor((d + i) / 7)) % 12, r = pc(0), t = (pc(2) - r + 12) % 12, f = (pc(4) - r + 12) % 12;
  let q = t === 4 && f === 7 ? '' : t === 3 && f === 6 ? 'dim' : t === 4 && f === 8 ? 'aug' : 'm';
  if (seven && q === '') q = '7';
  return {r, q, pcs:[r, (r + t) % 12, (r + f) % 12, ...(q === '7' ? [(r + 10) % 12] : [])]};
}
// ── 기본 AI: 작곡 ──
function localCompose({prompt = '', bars = 4, seed = 1, degs:degsIn = null}) {
  const r = rng(seed), t = prompt.toLowerCase(), has = re => re.test(t);
  const sad = has(/슬프|잔잔|어두|우울|밤|쓸쓸|minor|단조/), hi = has(/신나|빠르|댄스|edm|강하|파워|여름|축제|드럼/), calm = !hi && has(/잔잔|피아노|발라드|느리|조용|꿈|lofi|로파이/);
  const minor = sad || (S.mode === 'minor' && !has(/밝|행복|신나|여름|축제|장조|major/));
  const root = minor && S.mode === 'major' ? (S.root + 9) % 12 : !minor && S.mode === 'minor' ? (S.root + 3) % 12 : S.root, scale = minor ? MIN : MAJ;
  const lead = has(/피아노/) ? 'piano' : has(/신스|synth/) ? 'synth' : has(/벨|종/) ? 'bell' : has(/칩|8비트|게임/) ? 'chip' : has(/플럭/) ? 'pluck' : hi ? 'pluck' : calm ? 'piano' : 'epiano';
  const drums = hi || has(/드럼|비트/), SPB = BEATS * 4;
  const prog = aiPick(r, minor ? [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 4], [5, 6, 0, 0], [0, 3, 6, 2]] : [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 4, 2, 5], [0, 3, 1, 4]]);
  const degs = degsIn ? Array.from({length:bars}, (_, b) => degsIn[b % degsIn.length]) : Array.from({length:bars}, (_, b) => b === bars - 1 && bars > 2 ? 0 : b === bars - 2 && bars > 2 ? 4 : prog[b % 4]);
  const chords = degs.map(d => triad(root, scale, d, d === 4 && minor));
  const out = {title:(prompt || '기본 AI').slice(0, 24), key:{root, minor}, channels:[], chords:degs.map((d, b) => [b + 1, 1, NN[chords[b].r], chords[b].q])};
  const put = (arr, b, st, p, len, v) => arr.push([b + 1, Math.floor(st / 4) + 1, st % 4 + 1, pName(p), len, v]);
  // 멜로디: 리듬 틀(홀수 마디 A, 짝수 마디 변형) + 센박엔 코드음, 여린박엔 음계 이웃음, 활 모양 윤곽, 끝은 으뜸음
  const rhythms = hi ? [[[0,2],[2,2],[4,2],[6,2],[8,3],[11,1],[12,4]], [[0,3],[3,3],[6,2],[8,2],[10,2],[12,4]], [[0,2],[2,1],[3,3],[6,2],[8,4],[12,2],[14,2]]]
    : calm ? [[[0,6],[6,2],[8,8]], [[0,4],[4,4],[8,8]], [[0,8],[8,4],[12,4]]] : [[[0,4],[4,2],[6,2],[8,4],[12,4]], [[0,3],[3,1],[4,4],[8,6],[14,2]], [[0,2],[2,2],[4,4],[8,4],[12,4]]];
  const A = aiPick(r, rhythms), Bv = aiPick(r, rhythms), scalePs = []; for (let p = 60; p <= 88; p++) if (scale.includes((p - root + 12) % 12)) scalePs.push(p);
  const mel = []; let cur = scalePs.reduce((a, p) => Math.abs(p - 72) < Math.abs(a - 72) ? p : a, scalePs[0]);
  for (let b = 0; b < bars; b++) {
    const rh = (b === bars - 1 ? [[0, Math.min(SPB, 8)], [Math.min(SPB, 8), SPB - Math.min(SPB, 8)]] : (b % 2 ? Bv : A)).filter(([s]) => s < SPB), goal = 67 + Math.round(10 * Math.sin(Math.PI * (b + .5) / bars));
    rh.forEach(([st, len], i) => {
      const last = b === bars - 1 && i === rh.length - 1, strong = st % 4 === 0;
      if (last) { const tonic = scalePs.filter(p => p % 12 === root); cur = tonic.reduce((a, p) => Math.abs(p - cur) < Math.abs(a - cur) ? p : a, tonic[0]); }
      else if (strong) { const ct = scalePs.filter(p => chords[b].pcs.includes(p % 12)); cur = ct.reduce((a, p) => Math.abs(p - (cur + (goal - cur) * .4)) + r() * 2 < Math.abs(a - (cur + (goal - cur) * .4)) ? p : a, ct[0]); }
      else { const k = scalePs.indexOf(cur), dir = goal > cur ? 1 : goal < cur ? -1 : (r() < .5 ? -1 : 1); cur = scalePs[Math.max(0, Math.min(scalePs.length - 1, k + (r() < .8 ? dir : -dir)))]; }
      put(mel, b, st, cur, Math.min(len, SPB - st), strong ? .85 : .7);
    });
  }
  out.channels.push({name:'AI 멜로디', inst:lead, notes:mel});
  // 베이스 · 반주 · 드럼
  const bass = [], acc = [], pad = [];
  for (let b = 0; b < bars; b++) {
    const c = chords[b], br = 36 + ((c.r - 36) % 12 + 12) % 12, fifth = br + 7;
    if (calm) put(bass, b, 0, br, SPB, .75); else if (hi) for (let s = 0; s < SPB; s += 2) put(bass, b, s, s % 8 === 6 ? fifth : br, 2, s % 4 ? .6 : .85);
    else for (let s = 0; s < SPB; s += 4) put(bass, b, s, s % 8 ? fifth : br, 4, .75);
    const vo = c.pcs.slice(0, 3).map(pc => 60 + ((pc - 60) % 12 + 12) % 12).sort((x, y) => x - y);
    if (calm) { const arp = [vo[0] - 12, vo[1] - 12, vo[2] - 12, vo[0], vo[2] - 12, vo[1] - 12]; for (let s = 0, i = 0; s < SPB; s += 2, i++) put(acc, b, s, arp[i % arp.length], 2, .55); vo.forEach(p => put(pad, b, 0, p, SPB, .45)); }
    else if (hi) for (let s = 2; s < SPB; s += 4) vo.forEach(p => put(acc, b, s, p, 2, .6));
    else for (let s = 0; s < SPB; s += 8) vo.forEach(p => put(acc, b, s, p, Math.min(6, SPB - s), .55));
  }
  out.channels.push({name:'AI 베이스', inst:'bass', notes:bass}, {name:'AI 반주', inst:calm ? 'piano' : hi ? 'supersaw' : 'epiano', notes:acc});
  if (pad.length) out.channels.push({name:'AI 패드', inst:'strings', notes:pad});
  if (drums) { const k = [], sn = [], h = [], cr = []; for (let b = 0; b < bars; b++) { for (let s = 0; s < SPB; s += 2) put(h, b, s, 72, 1, s % 4 ? .45 : .6); for (let s = 0; s < SPB; s += 8) put(k, b, s, 72, 1, .95); if (hi && r() < .5) put(k, b, 10, 72, 1, .7); for (let s = 4; s < SPB; s += 8) put(sn, b, s, 72, 1, .85); } put(cr, 0, 0, 72, 1, .8);
    out.channels.push({name:'킥', inst:'drum:kick', notes:k}, {name:'스네어', inst:'drum:snare', notes:sn}, {name:'하이햇', inst:'drum:hat', notes:h}, {name:'크래시', inst:'drum:crash', notes:cr}); }
  return out;
}
// ── 기본 AI: 코드 추천 (마디 조각마다 음 무게 → 코드 점수 + 진행 규칙, 비터비로 가장 좋은 길) ──
function localChords(melody, bars, perBar) {
  const scale = S.mode === 'minor' ? MIN : MAJ, cands = [0, 1, 2, 3, 4, 5, 6].map(d => ({d, ...triad(S.root, scale, d, false)}));
  if (S.mode === 'minor') cands.push({d:4.5, ...triad(S.root, scale, 4, true), pcs:[(S.root + 7) % 12, (S.root + 11) % 12, (S.root + 2) % 12], q:'', r:(S.root + 7) % 12});   // 화성 단음계의 V
  const nSeg = bars * perBar, segT = BAR_T / perBar, H = Array.from({length:nSeg}, () => Array(12).fill(0));
  for (const n of melody) for (let k = Math.floor(n.s / segT); k < nSeg && k * segT < n.s + n.l; k++) { const a = Math.max(n.s, k * segT), e = Math.min(n.s + n.l, (k + 1) * segT); if (e > a) H[k][n.p % 12] += (e - a) * (n.s === k * segT || n.s % PPQ === 0 ? 1.5 : 1); }
  const fit = (h, c) => { const tot = h.reduce((x, y) => x + y, 0) || 1; let s = 0; h.forEach((w, pc) => s += c.pcs.includes(pc) ? w : -.45 * w); return s / tot; };
  const move = (a, b) => { const A = Math.floor(a.d), B = Math.floor(b.d); if (A === B) return -.25; if ((B - A + 7) % 7 === 3) return .35; if (A === 4 && B === 0) return .6; if (A === 3 && B === 4) return .35; if (A === 1 && B === 4) return .45; if (A === 5 && B === 3) return .25; if (A === 0) return .15; return 0; };
  let dp = cands.map(c => ({s:fit(H[0], c) + (Math.floor(c.d) === 0 ? .3 : 0), path:[c]}));
  for (let k = 1; k < nSeg; k++) dp = cands.map(c => { let best = null; for (const p of dp) { const v = p.s + move(p.path[p.path.length - 1], c); if (!best || v > best.s) best = {s:v, path:p.path}; } return {s:best.s + fit(H[k], c) + (k === nSeg - 1 && Math.floor(c.d) === 0 ? .5 : 0), path:[...best.path, c]}; });
  const bestPath = dp.reduce((a, b) => b.s > a.s ? b : a).path;
  return bestPath.map((c, k) => { const t = k * segT; return [Math.floor(t / BAR_T) + 1, Math.floor(t % BAR_T / PPQ) + 1, NN[c.r], c.q]; });
}
// ── 기본 AI: 피드백 (곡을 재서 조언) ──
function localFeedback() {
  const all = [], byCh = {}; S.channels.forEach(c => byCh[c.id] = {c, notes:[]});
  S.patterns.forEach(P => Object.entries(P.notes).forEach(([id, a]) => a.forEach(n => { if (byCh[id]) { byCh[id].notes.push(n); all.push({...n, c:byCh[id].c}); } })));
  if (!all.length) return '• 아직 음이 없어요. AI → 작곡으로 시작해 보거나 피아노 롤에 몇 음 찍어 보세요.';
  const inst = Object.values(byCh).filter(x => x.c.kind !== 'drum' && x.notes.length), melo = inst.sort((a, b) => b.notes.reduce((s, n) => s + n.p, 0) / b.notes.length - a.notes.reduce((s, n) => s + n.p, 0) / a.notes.length)[0];
  const good = [], tip = [], melN = (melo ? melo.notes : []).slice().sort((a, b) => a.s - b.s);
  const out = all.filter(n => n.c.kind !== 'drum' && !inKey(n.p % 12)).length / Math.max(1, all.filter(n => n.c.kind !== 'drum').length);
  const vs = all.map(n => n.v), vm = vs.reduce((a, b) => a + b, 0) / vs.length, vsd = Math.sqrt(vs.reduce((a, b) => a + (b - vm) ** 2, 0) / vs.length);
  const chordsN = S.patterns.reduce((a, P) => a + P.chords.filter(c => c && !c.x).length, 0), drums = Object.values(byCh).some(x => x.c.kind === 'drum' && x.notes.length);
  if (melN.length) { const ps = melN.map(n => n.p), range = Math.max(...ps) - Math.min(...ps), leaps = melN.slice(1).filter((n, i) => Math.abs(n.p - melN[i].p) > 7).length / Math.max(1, melN.length - 1), uniq = new Set(ps).size;
    if (range >= 10 && range <= 19) good.push(`멜로디("${melo.c.name}") 음역이 ${range}반음으로 노래하기 좋은 넓이예요`); else if (range < 7) tip.push(`멜로디 음역이 ${range}반음으로 좁아요 — 후렴에서 3~5도 위로 올라가 보면 귀에 잘 들어와요`); else if (range > 24) tip.push(`멜로디 음역이 ${range}반음으로 넓어요 — 부르거나 따라가기 어려울 수 있어요`);
    if (leaps > .25) tip.push(`멜로디 도약(5도 넘게 뛰는 곳)이 ${Math.round(leaps * 100)}%예요 — 뛴 다음엔 반대 방향으로 한 걸음 돌아오면 자연스러워요`); else good.push('멜로디가 주로 계단식으로 움직여서 매끄러워요');
    if (uniq <= 3 && melN.length > 12) tip.push(`멜로디에 쓴 음이 ${uniq}가지뿐이에요 — 경과음을 넣어 보세요`); }
  if (out > .15) tip.push(`조(${names()[S.root]} ${S.mode === 'minor' ? '단조' : '장조'}) 밖의 음이 ${Math.round(out * 100)}%예요 — 일부러가 아니라면 조를 다시 확인해 보세요`); else good.push(`음 대부분(${Math.round((1 - out) * 100)}%)이 조 안에 있어서 안정적이에요`);
  if (vsd < .03) tip.push('모든 음의 세기가 거의 같아요 — 센박을 조금 세게, 여린박을 약하게 하면 사람이 친 것처럼 들려요'); else good.push('음 세기에 변화가 있어서 살아 있게 들려요');
  if (!chordsN) tip.push('코드 줄이 비어 있어요 — AI → 코드 추천으로 멜로디에 맞는 코드를 넣어 보세요');
  if (!drums && S.bpm >= 110) tip.push(`${S.bpm} BPM인데 드럼이 없어요 — 킥·스네어만 넣어도 힘이 생겨요`);
  if (!S.playlist.clips.length) tip.push('플레이리스트가 비어 있어요 — 패턴을 인트로·벌스·후렴으로 나눠 배치하면 곡이 돼요');
  else { const b = songBars(); if (b < 16) tip.push(`곡이 ${b}마디로 짧아요 — 후렴을 한 번 더 반복하고 끝맺음을 붙여 보세요`); else good.push(`곡 길이 ${b}마디, 조각 ${S.playlist.clips.length}개로 구조가 있어요`); }
  if (inst.length >= 3) good.push(`악기 채널 ${inst.length}개로 소리가 풍성해요`);
  return [...good.slice(0, 2).map(s => '• 좋은 점: ' + s), ...tip.slice(0, 5).map(s => '• 해 볼 것: ' + s)].join('\n');
}
// ── AI 답(JSON)을 곡에 넣기 ──
function applyCompose(data, label) {
  const specs = (data.channels || []).filter(c => Array.isArray(c.notes) && c.notes.length).slice(0, 8); if (!specs.length) throw new Error('AI 답에 음이 없어요');
  const maxBar = Math.max(1, ...specs.flatMap(c => c.notes.map(n => n[0] | 0))), bars = [1, 2, 4, 8].find(b => b >= Math.min(8, maxBar)) || 8;
  pushUndo(); const P = newPattern(('AI: ' + (data.title || label || '패턴')).slice(0, 30), bars); P.chords = Array(bars * BEATS).fill(null);
  let skipped = 0; const used = new Set();   // 이번에 이미 쓴 채널은 다른 파트에 다시 주지 않음 (멜로디·반주가 섞이지 않게)
  for (const sp of specs) {
    const [kind, inst] = /^drum:/.test(sp.inst) ? ['drum', sp.inst.slice(5)] : ['inst', INSTS[sp.inst] ? sp.inst : 'piano'];
    if (kind === 'drum' && !DRUM_NAME[inst]) continue;
    const free = c => !used.has(c.id) && c.kind === kind && c.inst === inst && !(curPat().notes[c.id] || []).length;
    let ch = S.channels.find(c => free(c) && (kind === 'drum' || c.name === sp.name)) || S.channels.find(free);
    if (!ch) { if (S.channels.length >= 16) { skipped++; continue; } ch = newChannel(kind, inst, kind === 'drum' ? undefined : String(sp.name || '').slice(0, 24) || undefined); S.channels.push(ch); fillMix(S); if (E) applyMix(E, S.mix); }
    used.add(ch.id); const arr = P.notes[ch.id] = P.notes[ch.id] || [];
    for (const n of sp.notes) { if (!Array.isArray(n)) { if (n.s >= 0 && n.s < bars * BAR_T) arr.push({s:Math.round(n.s), l:Math.max(3, Math.min(bars * BAR_T - n.s, Math.round(n.l))), p:kind === 'drum' ? 72 : Math.max(LOW, Math.min(HIGH, n.p)), v:Math.max(.05, Math.min(1, n.v))}); continue; }
      const [b, bt, st, pn, len, vel] = n, p = kind === 'drum' ? 72 : pitchOf(pn); if (p == null) continue;
      const s = ((b | 0) - 1) * BAR_T + ((bt | 0) - 1) * PPQ + ((st | 0) - 1) * 12; if (s < 0 || s >= bars * BAR_T) continue;
      arr.push({s, l:Math.max(3, Math.min(bars * BAR_T - s, (len | 0 || 1) * 12)), p:Math.max(LOW, Math.min(HIGH, p)), v:Math.max(.05, Math.min(1, vel > 1 ? vel / 127 : vel || .8))}); }
  }
  for (const [b, bt, rn, q] of data.chords || []) { const i = ((b | 0) - 1) * BEATS + ((bt | 0) - 1), rr = NN.indexOf(String(rn)); if (i >= 0 && i < P.chords.length && rr >= 0) P.chords[i] = {r:rr, q:MSK_Q.includes(q) ? q : ''}; }
  S.patterns.push(P); S.pat = S.patterns.length - 1; save(); refreshAll();
  return {P, skipped, notes:Object.values(P.notes).reduce((a, x) => a + x.length, 0)};
}
function applyChords(list, clearAll) {
  pushUndo(); const P = curPat(); if (clearAll) P.chords = P.chords.map(() => null); let n = 0;
  for (const [b, bt, rn, q] of list) { const i = (b - 1) * BEATS + (bt - 1), rr = NN.indexOf(String(rn)); if (i >= 0 && i < P.chords.length && rr >= 0) { P.chords[i] = {r:rr, q:MSK_Q.includes(q) ? q : ''}; n++; } }
  save(); drawChordRow(); drawPlaylist(); return n;
}
// ── 화면 ──
let aiTab = 'compose', aiSeed = 1;
const aiMsg = t => $('aiMsg').textContent = t, curMelody = () => { const c = S.channels[S.ch]; return c && c.kind !== 'drum' ? (curPat().notes[c.id] || []) : []; };
async function askClaude(body) {
  const a = authInfo(); if (!a) throw Object.assign(new Error('Claude는 로그인해야 쓸 수 있어요'), {fallback:true});
  const r = await fetch(AI_API, {method:'POST', headers:{'content-type':'application/json', authorization:'Bearer ' + a.token}, body:JSON.stringify({...body, root:S.root, mode:S.mode, bpm:S.bpm, meter:BEATS + '/4'})});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.message || 'HTTP ' + r.status), {fallback:true}); return j;
}
async function runAI(again) {
  const claude = $('aiEngine').value === 'claude', t0 = performance.now(); aiMsg(claude ? 'Claude에게 묻는 중…' : '계산 중…'); $('aiOut').textContent = '';
  const local = async why => { if (why) aiMsg(`Claude를 쓸 수 없어서 기본 AI로 했어요 (${why})`); return null; };
  try {
    if (aiTab === 'compose') {
      if (again) aiSeed++; else aiSeed = (Date.now() & 0xffff) || 1;
      const bars = +$('aiBars').value, prompt = $('aiPrompt').value.trim();
      let data = null, from = '기본 AI', note = '';
      if (claude) try { const j = await askClaude({task:'compose', prompt:prompt || '밝고 기억하기 쉬운 멜로디와 반주', bars}); data = j.data; from = 'Claude'; note = ` · 오늘 ${j.left}번 남음`; } catch (e) { if (!e.fallback) throw e; await local(e.message); }
      if (!data) data = localCompose({prompt, bars, seed:aiSeed});
      const res = applyCompose(data, prompt);
      const m = `${from}: 새 패턴 "${res.P.name}" · ${res.P.bars}마디 · 음 ${res.notes}개${res.skipped ? ` · 채널 16개가 꽉 차서 ${res.skipped}개 파트는 뺐어요` : ''}${note} (${Math.round(performance.now() - t0)}ms)`;
      status(m); if (!/기본 AI로 했어요/.test($('aiMsg').textContent)) aiMsg(m); else aiMsg($('aiMsg').textContent + ' → ' + m);
    } else if (aiTab === 'chords') {
      const mel = curMelody(); if (!mel.length) { aiMsg(`지금 채널("${(S.channels[S.ch] || {}).name || '-'}")에 음이 없어요. 멜로디 채널을 고르고 다시 눌러 주세요.`); return; }
      const P = curPat(), per = +$('aiRate').value; let list = null, from = '기본 AI';
      if (claude) try { const j = await askClaude({task:'chords', bars:P.bars, melody:mel.slice().sort((a, b) => a.s - b.s).map(n => [Math.floor(n.s / BAR_T) + 1, Math.floor(n.s % BAR_T / PPQ) + 1, Math.floor(n.s % PPQ / 12) + 1, pName(n.p), Math.max(1, Math.round(n.l / 12))])}); list = j.data.chords; from = 'Claude'; } catch (e) { if (!e.fallback) throw e; await local(e.message); }
      if (!list) list = localChords(mel, P.bars, per);
      const n = applyChords(list, true), names2 = list.slice(0, 8).map(c => c[2] + c[3]).join(' – ');
      const m = `${from}: 코드 ${n}개를 넣었어요 — ${names2}${list.length > 8 ? ' …' : ''} (되돌리기 Ctrl+Z)`; status(m); aiMsg(($('aiMsg').textContent.includes('기본 AI로 했어요') ? $('aiMsg').textContent + ' → ' : '') + m);
    } else {
      let text = null, from = '기본 AI';
      if (claude) try { const song = {bpm:S.bpm, key:names()[S.root] + ' ' + S.mode, meter:BEATS + '/4', bars:S.playlist.clips.length ? songBars() : null,
          channels:S.channels.map(c => { const ns = S.patterns.flatMap(P => P.notes[c.id] || []); return {name:c.name, inst:c.kind === 'drum' ? 'drum:' + c.inst : c.inst, notes:ns.length, low:ns.length ? pName(Math.min(...ns.map(n => n.p))) : null, high:ns.length ? pName(Math.max(...ns.map(n => n.p))) : null}; }),
          patterns:S.patterns.map(P => ({name:P.name, bars:P.bars, chords:P.chords.filter(c => c && !c.x).map(chordName).slice(0, 32)})), playlist:S.playlist.clips.slice(0, 60).map(c => [(S.patterns.find(P => P.id === c.pat) || {}).name, c.bar + 1])};
        const j = await askClaude({task:'feedback', song}); text = j.text; from = 'Claude'; } catch (e) { if (!e.fallback) throw e; await local(e.message); }
      if (!text) text = localFeedback();
      $('aiOut').textContent = text; const m = `${from}의 피드백이에요.`; aiMsg(($('aiMsg').textContent.includes('기본 AI로 했어요') ? $('aiMsg').textContent + ' → ' : '') + m);
    }
  } catch (e) { aiMsg('AI 오류: ' + e.message); }
}
function aiShowTab(t) { aiTab = t; document.querySelectorAll('#aiTabs button').forEach(b => { b.classList.toggle('solid', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t); }); document.querySelectorAll('#aiDlg [data-p]').forEach(s => s.hidden = s.dataset.p !== t);
  $('aiRun').textContent = t === 'compose' ? '만들기' : t === 'chords' ? '추천해서 넣기' : '지금 곡 분석'; $('aiAgain').hidden = t !== 'compose'; $('aiChName').textContent = (S.channels[S.ch] || {}).name || '-'; }
document.querySelectorAll('#aiTabs button').forEach(b => b.onclick = () => aiShowTab(b.dataset.t));
$('aiBtn').onclick = () => { aiShowTab(aiTab); aiMsg(authInfo() ? '' : 'Claude 엔진은 로그인해야 쓸 수 있어요. 기본 AI는 바로 돼요.'); openDlg($('aiDlg')); };
$('aiRun').onclick = () => runAI(false); $('aiAgain').onclick = () => runAI(true); $('aiClose').onclick = () => $('aiDlg').close();
$('aiEngine').value = lsGet('msk-ai-engine') || 'music'; $('aiEngine').onchange = () => lsSet('msk-ai-engine', $('aiEngine').value);

/* 27-community.js — 커뮤니티 (디스코드식 옆 패널)
   채널 4개 · 메시지 · 이모지 반응 · 곡 붙이기 · 메시지 안에서 바로 재생
   새 메시지는 4초마다 서버에 물어본다 (열려 있을 때만). */
const CHAT_API = (window.MSK_SERVER || '') + '/api/chat';
const CM_DEFAULT_CH = [{id:'songs',name:'공개곡',desc:'만든 곡을 올려요'},{id:'help',name:'질문',desc:'막히는 것을 물어봐요'},
  {id:'show',name:'자랑',desc:'잘된 것을 보여줘요'},{id:'talk',name:'잡담',desc:'아무 이야기나'}];
const CM_DEFAULT_EMOJI = ['\u2764','\uD83D\uDD25','\uD83D\uDC4F','\uD83C\uDFB5','\uD83D\uDE2E','\uD83D\uDE02'];
const CM = {ch:'songs', last:0, timer:null, open:false, chans:[], emoji:[], me:null,
            attach:null, audio:new Map(), playing:null, busy:false};

async function cmCall(path, opt = {}) {
  const a = typeof authInfo === 'function' && authInfo();
  const h = {...(opt.headers || {})};
  if (a && a.token) h.authorization = 'Bearer ' + a.token;
  if (opt.body) h['content-type'] = 'application/json';
  const r = await fetch(CHAT_API + path, {...opt, headers:h, body:opt.body ? JSON.stringify(opt.body) : undefined});
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error((j && j.message) || '잠시 뒤에 다시 해 주세요'), {status:r.status, data:j});
  return j;
}
const cmEsc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cmTime = d => { const x = new Date(d), n = new Date();
  const hm = `${x.getHours() < 12 ? '오전' : '오후'} ${x.getHours() % 12 || 12}:${String(x.getMinutes()).padStart(2,'0')}`;
  return x.toDateString() === n.toDateString() ? hm : `${x.getMonth()+1}/${x.getDate()} ${hm}`; };

/* ── 열고 닫기 ── */
async function openCommunity() {
  const p = $('commPanel'); if (!p) return;
  p.hidden = false; document.body.classList.add('has-cmp'); CM.open = true;
  if (!CM.chans.length) {
    CM.chans = CM_DEFAULT_CH; CM.emoji = CM_DEFAULT_EMOJI;      // 서버를 못 만나도 채널은 보이게
    cmTabs();
    try { const j = await cmCall('?action=channels'); if (j.channels?.length) { CM.chans = j.channels; CM.emoji = j.emoji; cmTabs(); } } catch (e) {}
  }
  cmLoginHint();
  await cmLoad(true);
  if (CM.timer) clearInterval(CM.timer);
  CM.timer = setInterval(() => { if (CM.open && !document.hidden) cmLoad(false); }, 4000);
}
function closeCommunity() {
  const p = $('commPanel'); if (p) p.hidden = true;
  document.body.classList.remove('has-cmp'); CM.open = false;
  if (CM.timer) { clearInterval(CM.timer); CM.timer = null; }
  cmStop();
}
const cmLoginHint = () => { const a = typeof authInfo === 'function' && authInfo();
  $('cmHint').hidden = !!a; $('cmText').disabled = !a; $('cmSend').disabled = !a; $('cmSong').disabled = !a; };

/* ── 채널 ── */
function cmTabs() {
  const n = $('cmTabs'); if (!n) return;
  n.innerHTML = CM.chans.map(c => `<button class="tbtn xs${c.id === CM.ch ? ' solid' : ''}" role="tab" data-ch="${c.id}" title="${cmEsc(c.desc)}">${cmEsc(c.name)}</button>`).join('');
  for (const b of n.querySelectorAll('button')) b.onclick = () => {
    CM.ch = b.dataset.ch; CM.last = 0; $('cmFeed').innerHTML = ''; cmTabs(); cmLoad(true);
    $('cmText').placeholder = (CM.chans.find(c => c.id === CM.ch) || {}).desc || '메시지 보내기';
  };
}

/* ── 메시지 받아오기 ── */
async function cmLoad(reset) {
  if (CM.busy) return; CM.busy = true;
  try {
    const j = await cmCall(`?channel=${CM.ch}${!reset && CM.last ? '&after=' + CM.last : ''}`);
    CM.me = j.me;
    const f = $('cmFeed'); if (reset) f.innerHTML = '';
    const bottom = f.scrollHeight - f.scrollTop - f.clientHeight < 60;
    for (const m of j.messages) { f.appendChild(cmMsg(m)); CM.last = Math.max(CM.last, Number(m.id)); }
    if (reset && !j.messages.length) f.innerHTML = `<p class="cmp-empty">아직 메시지가 없어요.<br>첫 메시지를 남겨 보세요.</p>`;
    if (reset || bottom) f.scrollTop = f.scrollHeight;
    cmPeople(j.online || [], j.me);
  } catch (e) {
    if (reset) $('cmFeed').innerHTML = `<p class="cmp-empty">${cmEsc(e.message)}</p>`;
  } finally { CM.busy = false; }
}

/* ── 사람 목록 ── */
function cmPeople(online, me) {
  const n = online.length;
  $('cmWho').textContent = n ? `접속 중 ${n}명` : '';
  const box = $('cmPpl'); if (!box) return;
  const here = online.filter(o => o.channel === CM.ch), away = online.filter(o => o.channel !== CM.ch);
  const row = o => `<div${o.username === me ? ' class="me"' : ''}><span class="cmp-dot${o.channel === CM.ch ? '' : ' off'}"></span>${cmEsc(o.username)}</div>`;
  box.innerHTML = (here.length ? `<h5>이 채널 — ${here.length}</h5>` + here.map(row).join('') : '<h5>이 채널 — 0</h5>')
    + (away.length ? `<h5>다른 채널 — ${away.length}</h5>` + away.map(row).join('') : '');
}

/* ── 메시지 한 개 그리기 ── */
function cmMsg(m) {
  const el = document.createElement('div'); el.className = 'cmm'; el.dataset.id = m.id;
  if (m.deleted) { el.innerHTML = `<div class="cmm-bd"><p class="cmm-del">지워진 메시지</p></div>`; return el; }
  const mine = CM.me && m.username === CM.me;
  const rx = (m.reactions || []).map(r =>
    `<button class="cmm-rx${CM.me && r.who.includes(CM.me) ? ' on' : ''}" data-e="${cmEsc(r.emoji)}">${cmEsc(r.emoji)} ${r.n}</button>`).join('');
  el.innerHTML = `
    <div class="cmm-av">${cmEsc(m.username.slice(0, 1))}</div>
    <div class="cmm-bd">
      <div class="cmm-who">${cmEsc(m.username)}<em>${cmTime(m.created)}</em>${mine
        ? '<button class="cmm-x" title="지우기">✕</button>'
        : '<button class="cmm-rep" title="신고">신고</button>'}</div>
      ${m.text ? `<p class="cmm-tx">${cmEsc(m.text)}</p>` : ''}
      ${m.song_url ? `<div class="cmm-song">
          <button class="cmm-play" title="듣기">▶</button>
          <div class="cmm-si"><b>${cmEsc(m.song_name || '곡')}</b><span>${m.song_bars ? m.song_bars + '마디 · ' : ''}${m.song_bpm || ''}${m.song_bpm ? ' BPM' : ''}</span>
            <div class="cmm-bar"><i></i></div></div>
          <button class="tbtn xs cmm-open" title="이 곡을 열기">열기</button></div>` : ''}
      <div class="cmm-rxs">${rx}<button class="cmm-rx add" title="반응 더하기">＋</button></div>
    </div>`;
  el.querySelector('.cmm-x')?.addEventListener('click', () => cmDelete(m.id));
  el.querySelector('.cmm-rep')?.addEventListener('click', () => cmReport(m.id));
  for (const b of el.querySelectorAll('.cmm-rx:not(.add)')) b.onclick = () => cmReact(m.id, b.dataset.e);
  el.querySelector('.cmm-rx.add')?.addEventListener('click', e => cmPickEmoji(e.target, m.id));
  el.querySelector('.cmm-play')?.addEventListener('click', () => cmPlay(m, el));
  el.querySelector('.cmm-open')?.addEventListener('click', () => cmOpenSong(m));
  return el;
}

/* ── 반응 ── */
function cmPickEmoji(anchor, id) {
  document.querySelector('.cmp-pick')?.remove();
  const box = document.createElement('div'); box.className = 'cmp-pick';
  box.innerHTML = CM.emoji.map(e => `<button data-e="${cmEsc(e)}">${cmEsc(e)}</button>`).join('');
  anchor.parentNode.appendChild(box);
  for (const b of box.querySelectorAll('button')) b.onclick = () => { box.remove(); cmReact(id, b.dataset.e); };
  setTimeout(() => document.addEventListener('click', function h(ev) {
    if (!box.contains(ev.target)) { box.remove(); document.removeEventListener('click', h); } }), 0);
}
async function cmReact(id, emoji) {
  if (!authInfo()) return status('반응하려면 로그인해 주세요.');
  try { await cmCall('?action=react', {method:'POST', body:{id:Number(id), emoji}}); CM.last = 0; await cmLoad(true); }
  catch (e) { status(e.message); }
}
async function cmReport(id) {
  if (!authInfo()) return status('신고하려면 로그인해 주세요.');
  const why = prompt('무엇이 문제인가요? (욕설·광고·도배 등. 비워 두어도 돼요)');
  if (why === null) return;
  try {
    const r = await cmCall('?action=report', {method:'POST', body:{id:Number(id), reason:String(why || '').slice(0, 200)}});
    status(r.hidden ? '신고했어요 · 여러 명이 신고해 가려졌어요' : `신고했어요 (${r.n}번째)`);
    if (r.hidden) { CM.last = 0; await cmLoad(true); }
  } catch (e) { status(e.message); }
}
async function cmDelete(id) {
  if (!confirm('이 메시지를 지울까요?')) return;
  try { await cmCall('?action=delete', {method:'POST', body:{id:Number(id)}}); CM.last = 0; await cmLoad(true); }
  catch (e) { status(e.message); }
}

/* ── 곡 듣기: 누를 때 그 자리에서 소리로 바꾸고, 한 번 만든 건 기억해 둔다 ── */
function cmStop() {
  if (CM.playing) { try { CM.playing.el.pause(); } catch (e) {} CM.playing.row?.classList.remove('on'); CM.playing = null; }
  document.querySelectorAll('.cmm-play').forEach(b => b.textContent = '▶');
}
async function cmPlay(m, row) {
  const btn = row.querySelector('.cmm-play'), bar = row.querySelector('.cmm-bar i');
  if (CM.playing && CM.playing.id === m.id) { cmStop(); return; }
  cmStop();
  let url = CM.audio.get(m.id);
  if (!url) {
    btn.textContent = '…'; btn.disabled = true;
    try {
      const u = new Uint8Array(await (await fetch(m.song_url)).arrayBuffer());
      const got = await decodeMSK(u);                      // 곡 파일은 바이너리 (MSK)
      const snap = JSON.stringify(S), mode = S.playMode;
      S = normalize(got.song); S.playMode = 'song';
      const buf = await renderWav();
      S = normalize(JSON.parse(snap)); S.playMode = mode;
      url = URL.createObjectURL(new Blob([buf instanceof Uint8Array ? buf : new Uint8Array(buf)], {type:'audio/wav'}));
      CM.audio.set(m.id, url);
    } catch (e) { btn.textContent = '▶'; btn.disabled = false; return status('이 곡을 들을 수 없어요: ' + (e.message || e)); }
    btn.disabled = false;
  }
  const a = new Audio(url); btn.textContent = '■'; row.classList.add('on');
  CM.playing = {id:m.id, el:a, row};
  a.ontimeupdate = () => { if (bar && a.duration) bar.style.width = (a.currentTime / a.duration * 100) + '%'; };
  a.onended = () => { if (bar) bar.style.width = '0%'; cmStop(); };
  a.play().catch(() => { btn.textContent = '▶'; cmStop(); });
}
async function cmOpenSong(m) {
  if (!confirm('지금 곡을 두고 이 곡을 열까요?')) return;
  try {
    const u = new Uint8Array(await (await fetch(m.song_url)).arrayBuffer());
    const got = await decodeMSK(u);
    if (typeof openLoaded === 'function') { await openLoaded({song:got.song, name:got.name || m.song_name}); }
    else { S = normalize(got.song); save(); refreshAll(); }
    closeCommunity(); status(`"${m.song_name || '곡'}"을 열었어요`);
  } catch (e) { status('이 곡을 열 수 없어요'); }
}

/* ── 보내기 ── */
async function cmSend() {
  const t = $('cmText').value.trim();
  if (!t && !CM.attach) return;
  try {
    await cmCall('?action=send', {method:'POST', body:{channel:CM.ch, text:t, song:CM.attach}});
    $('cmText').value = ''; CM.attach = null; $('cmAttach').hidden = true;
    await cmLoad(false); $('cmFeed').scrollTop = $('cmFeed').scrollHeight;
  } catch (e) { status(e.message); }
}

/* ── 지금 곡 붙이기: 서버에 올리고 그 주소를 메시지에 붙인다 ── */
async function cmAttachSong() {
  if (!authInfo()) return status('곡을 올리려면 로그인해 주세요.');
  const b = $('cmSong'); const old = b.textContent;
  b.textContent = '…'; b.disabled = true;
  try {
    const r = await cloudUpload(true);                       // 지금 곡을 서버에 저장
    const url = r && r.url;
    if (!url) throw new Error('서버가 곡 주소를 주지 않았어요');
    const name = (lib.list[lib.current] || {}).name || '내 곡';
    const bars = Math.max(1, Math.ceil((curPat()?.len || 48) / 48));
    CM.attach = {url, name, bars, bpm:S.bpm};
    $('cmAttachName').textContent = `♪ ${name} · ${bars}마디 · ${S.bpm} BPM`;
    $('cmAttach').hidden = false; $('cmText').focus();
  } catch (e) { status('곡을 붙이지 못했어요: ' + e.message); }
  finally { b.textContent = old; b.disabled = false; }
}

/* ── 버튼 연결 ── */
(() => {
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
  on('commBtn', 'click', () => CM.open ? closeCommunity() : openCommunity());
  on('cmClose', 'click', closeCommunity);
  on('cmSend', 'click', cmSend);
  on('cmSong', 'click', cmAttachSong);
  on('cmAttachX', 'click', () => { CM.attach = null; $('cmAttach').hidden = true; });
  on('cmText', 'keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cmSend(); } });
  on('cmWide', 'click', () => { document.body.classList.toggle('cmp-wide'); });
  on('cmPplBtn', 'click', e => { const on2 = document.body.classList.toggle('cmp-ppl-on');
    e.currentTarget.setAttribute('aria-pressed', String(on2)); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CM.open) cmLoad(false); });
})();

/* 28-music-ai.js — 음악 AI: Magenta(Google)의 음악 전용 신경망을 브라우저에서 실행
   ImprovRNN(코드 위 멜로디) · MelodyRNN(멜로디 이어 쓰기) · DrumsRNN(드럼) — 처음 쓸 때만 모델을 받아요.
   한 번에 여러 개(후보)를 짓고 음악 점수가 가장 높은 것을 골라요. */
const MM_LIB = 'https://cdn.jsdelivr.net/npm/@magenta/music@1.23.1/dist/magentamusic.min.js', MM_CK = 'https://storage.googleapis.com/magentadata/js/checkpoints/';
let mmLib = null; const mmModels = {};
function mmLoad() { return mmLib || (mmLib = new Promise((ok, bad) => { if (window.mm) return ok(); const s = document.createElement('script'); s.src = MM_LIB; s.onload = ok; s.onerror = () => { mmLib = null; bad(new Error('음악 AI 라이브러리를 받지 못했어요 (인터넷 연결 확인)')); }; document.head.appendChild(s); })); }
async function mmModel(name) {
  await mmLoad();
  if (!mmModels[name]) mmModels[name] = (async () => { const m = new mm.MusicRNN(MM_CK + 'music_rnn/' + name); await m.initialize(); return m; })().catch(e => { delete mmModels[name]; throw e; });
  return mmModels[name];
}
// 멜로디 신경망이 받는 음역(48~83) 안으로 옥타브 이동 — 벗어나면 모델이 멈춤
const mmFit = p => { while (p > 83) p -= 12; while (p < 48) p += 12; return p; };
const mmSeq = (notes, steps, drum) => ({notes:notes.map(([p, s, e]) => ({pitch:drum ? p : mmFit(p), quantizedStartStep:s, quantizedEndStep:e, isDrum:!!drum})), quantizationInfo:{stepsPerQuarter:4}, totalQuantizedSteps:steps});
const MM_Q = {'':'', m:'m', '7':'7', maj7:'maj7', m7:'m7', sus4:'sus4', dim:'dim', aug:'aug'};
// 멜로디 점수 — 높을수록 좋음 (조 안 · 센박 코드음 · 알맞은 음역 · 계단 진행 · 밀도 · 끝음)
function melScore(notes, {root, minor, chordAt, steps, dens}) {
  if (notes.length < 3) return -9;
  const sc = minor ? MIN : MAJ, inKey = notes.filter(n => sc.includes((n.p - root + 120) % 12)).length / notes.length;
  const strong = notes.filter(n => n.s % 4 === 0), ct = chordAt ? strong.filter(n => chordAt(n.s).includes(n.p % 12)).length / Math.max(1, strong.length) : .5;
  const ps = notes.map(n => n.p), range = Math.max(...ps) - Math.min(...ps), iv = notes.slice(1).map((n, i) => Math.abs(n.p - notes[i].p));
  const step = iv.filter(x => x <= 2).length / Math.max(1, iv.length), big = iv.filter(x => x > 9).length / Math.max(1, iv.length), d = notes.length / steps;
  const last = notes[notes.length - 1], end = chordAt ? (chordAt(steps - 1)[0] === last.p % 12 ? 1 : chordAt(steps - 1).includes(last.p % 12) ? .5 : 0) : .5;
  return 3 * inKey + 2 * ct + (range >= 7 && range <= 16 ? 1 : range < 5 ? -1 : 0) + 1.2 * Math.min(step, .7) - 2 * big - 3 * Math.max(0, Math.abs(d - dens) - .12) + end;
}
// 길거나(8분음표 이상) 센박에 오는 조 밖 음만 가장 가까운 조 안 음으로 (짧은 경과음은 멜로디의 색이라 그대로)
function fixKey(notes, root, minor) { const sc = minor ? MIN : MAJ, ok = p => sc.includes((p - root + 120) % 12); let fixed = 0;
  for (const n of notes) if (!ok(n.p) && (n.e - n.s >= 2 || n.s % 4 === 0)) { const up = n.p + 1, dn = n.p - 1; n.p = ok(dn) ? dn : up; fixed++; } return fixed; }
const fromMM = (seq, off = 0) => seq.notes.map(n => ({p:n.pitch, s:n.quantizedStartStep + off, e:n.quantizedEndStep + off})).sort((a, b) => a.s - b.s);
const DRUM_MAP = {35:'kick', 36:'kick', 37:'snare', 38:'snare', 40:'snare', 39:'clap', 42:'hat', 44:'hat', 46:'hat', 49:'crash', 57:'crash', 55:'crash'};
// 작곡: 규칙 AI로 조·코드·반주 틀을 잡고, 멜로디(곡 구조 A–A′–B–A)·베이스·드럼을 신경망이 지음
const pcsOfChord = (rn, q) => { const r0 = NN.indexOf(rn), iv = {'':[0,4,7], m:[0,3,7], '7':[0,4,7,10], maj7:[0,4,7,11], m7:[0,3,7,10], sus4:[0,5,7], dim:[0,3,6], aug:[0,4,8]}[q] || [0,4,7]; return iv.map(x => (r0 + x) % 12); };
const mmClip = (notes, end) => notes.filter(n => n.s < end).map(n => ({...n, e:Math.min(end, Math.max(n.s + 1, n.e))}));
// ImprovRNN으로 후보 tries개를 짓고 점수가 가장 높은 것을 돌려줌 (위치는 off부터의 절대 스텝)
async function genBest(imp, {seed, seedLen, gen, chords, off, temp, tries, score, fix}) {
  let best = null;
  for (let k = 0; k < tries; k++) {
    const g = await imp.continueSequence(mmSeq(seed, seedLen), gen, temp, chords);
    const notes = mmClip([...seed.map(([p, s0, e]) => ({p, s:s0 + off, e:e + off})), ...fromMM(g, off + seedLen)], off + seedLen + gen);
    if (fix) fix(notes); const sc = score(notes); if (!best || sc > best.score) best = {notes, score:sc};
  }
  return best;
}
async function musicCompose({prompt, bars, seed, tries, degs = null, lift = 0, form:formKind = 'song', noMelody = false, bassTries = tries}) {
  const base = localCompose({prompt, bars, seed, degs}), {root, minor} = base.key, SPB = BEATS * 4, steps = bars * SPB;
  const t = prompt.toLowerCase(), hi = /신나|빠르|댄스|edm|강하|파워|여름|축제|드럼/.test(t), calm = !hi && /잔잔|피아노|발라드|느리|조용|꿈|lofi|로파이/.test(t);
  const barPcs = base.chords.map(([, , rn, q]) => pcsOfChord(rn, q)), chordAt = s => barPcs[Math.max(0, Math.min(bars - 1, Math.floor(s / SPB)))];
  const perStep = Array.from({length:steps}, (_, s) => { const [, , rn, q] = base.chords[Math.min(bars - 1, Math.floor(s / SPB))]; return rn + MM_Q[q]; });
  const imp = await mmModel('chord_pitches_improv'), temp = calm ? .9 : hi ? 1.1 : 1.0, dens = calm ? .22 : hi ? .45 : .32, fix = n => fixKey(n, root, minor);
  const scoreSec = (off, len, extra = () => 0) => notes => { const rel = notes.filter(n => n.s >= off).map(n => ({...n, s:n.s - off, e:n.e - off})); return melScore(rel, {root, minor, chordAt:s => chordAt(s + off), steps:len, dens}) + extra(rel); };
  const seedP = 60 + ((barPcs[0][0] - 60) % 12 + 12) % 12 + 12 + lift, mean = ns => ns.reduce((a, n) => a + n.p, 0) / Math.max(1, ns.length);
  let mel, form = '';
  if (noMelody) { mel = []; mel.score = 0; }
  else if (bars >= 4) {
    // 곡 구조 A–A′–B–A″ (구간 = 전체의 1/4)
    const L = bars / 4 * SPB, H = L / 2, chordsFrom = (a, n) => perStep.slice(a, a + n), copy = (ns, from, to, shift) => ns.filter(n => n.s >= from && n.s < to).map(n => ({p:n.p, s:n.s + shift, e:Math.min(n.e, to) + shift}));
    const A = await genBest(imp, {seed:[[seedP, 0, 2]], seedLen:2, gen:L - 2, chords:chordsFrom(2, L - 2), off:0, temp, tries, fix, score:scoreSec(0, L)});
    const aHead = copy(A.notes, 0, H, 0), rel = (ns, sh) => ns.map(n => [n.p, n.s - sh, n.e - sh]);
    const A2 = formKind === 'chorus' ? {notes:copy(A.notes, 0, L, L), score:A.score}   // 후렴: 훅을 그대로 한 번 더
      : await genBest(imp, {seed:rel(copy(A.notes, 0, H, L), L), seedLen:H, gen:H, chords:chordsFrom(L + H, H), off:L, temp, tries, fix, score:scoreSec(L, L)});
    const aM = mean(A.notes), bSeed = seedP + (hi ? 5 : 3) + ((chordAt(2 * L)[0] - seedP) % 12 + 12) % 12 % 5;
    const B = await genBest(imp, {seed:[[Math.min(88, bSeed), 0, 2]], seedLen:2, gen:L - 2, chords:chordsFrom(2 * L + 2, L - 2), off:2 * L, temp:temp + .05, tries, fix, score:scoreSec(2 * L, L, r => mean(r) > aM + 1.5 ? 1.5 : -3)});   // B는 A보다 높아야 대비가 생김 — 어기면 크게 감점
    const A3 = await genBest(imp, {seed:rel(copy(A.notes, 0, H, 3 * L), 3 * L), seedLen:H, gen:H, chords:chordsFrom(3 * L + H, H), off:3 * L, temp:temp - .05, tries, fix, score:scoreSec(3 * L, L)});
    mel = [...A.notes, ...A2.notes, ...B.notes, ...A3.notes].sort((a, b) => a.s - b.s); form = formKind === 'chorus' ? ' · 구조 A–A–B–A′' : ' · 구조 A–A′–B–A';
    const last = mel[mel.length - 1], ton = [-24, -12, 0, 12, 24].map(k => last.p - ((last.p - root) % 12 + 12) % 12 + k).filter(p => p >= 55 && p <= 90).sort((x, y) => Math.abs(x - last.p) - Math.abs(y - last.p))[0]; if (ton != null) last.p = ton;   // 끝음은 으뜸음 (마침)
    mel.score = (A.score + A2.score + B.score + A3.score) / 4; void aHead;
  } else {
    const r = await genBest(imp, {seed:[[seedP, 0, 2]], seedLen:2, gen:steps - 2, chords:perStep.slice(2), off:0, temp, tries, fix, score:scoreSec(0, steps)});
    mel = r.notes; mel.score = r.score;
  }
  if (!noMelody) base.channels[0].notes = mel.map(n => [Math.floor(n.s / SPB) + 1, Math.floor(n.s % SPB / 4) + 1, n.s % 4 + 1, pName(Math.max(48, Math.min(96, n.p))), n.e - n.s, n.s % 4 === 0 ? .85 : .7]);
  base.channels[0].name = 'AI 멜로디';
  // 베이스: 코드 위에서 ImprovRNN이 짓고 → 낮은 음역으로 → 마디 첫 박은 코드 뿌리음
  const bi = base.channels.findIndex(c => c.inst === 'bass');
  if (bi >= 0) {
    const bd = calm ? .12 : hi ? .32 : .2, rootNear = (pc, near) => { let best = 0; for (let p = 28; p <= 55; p++) if (p % 12 === pc && (!best || Math.abs(p - near) < Math.abs(best - near))) best = p; return best; };
    const bassScore = ns => { const q = ns.filter(n => n.s % 4 === 0), ct = q.filter(n => chordAt(n.s).includes(n.p % 12)).length / Math.max(1, q.length), iv = ns.slice(1).map((n, i) => Math.abs(n.p - ns[i].p)); return 2 * ct + (iv.filter(x => x <= 5).length / Math.max(1, iv.length)) - 3 * Math.abs(ns.length / steps - bd) - (ns.length < bars ? 2 : 0); };
    const bs = 48 + ((barPcs[0][0] - 48) % 12 + 12) % 12;
    const r = await genBest(imp, {seed:[[bs, 0, 4]], seedLen:4, gen:steps - 4, chords:perStep.slice(4), off:0, temp:.9, tries:bassTries, fix, score:bassScore});
    let ns = r.notes; const shift = Math.round((40 - mean(ns)) / 12) * 12; ns = ns.map(n => ({...n, p:n.p + shift}));
    for (let b = 0; b < bars; b++) { const at = b * SPB, pc = barPcs[b][0], hit = ns.find(n => n.s === at), prev = ns.filter(n => n.s < at).pop();
      if (hit) hit.p = rootNear(pc, hit.p); else { const nxt = ns.find(n => n.s > at); ns.push({p:rootNear(pc, prev ? prev.p : 40), s:at, e:Math.min(at + 4, nxt ? nxt.s : at + 4)}); if (prev && prev.e > at) prev.e = at; } }
    ns.sort((a, b) => a.s - b.s);
    base.channels[bi].notes = ns.map(n => [Math.floor(n.s / SPB) + 1, Math.floor(n.s % SPB / 4) + 1, n.s % 4 + 1, pName(Math.max(28, Math.min(60, n.p))), n.e - n.s, n.s % SPB === 0 ? .85 : .7]);
  }
  // 드럼: 첫 마디(규칙 비트)를 DrumsRNN이 이어서
  const dIdx = base.channels.map((c, i) => /^drum:/.test(c.inst) ? i : -1).filter(i => i >= 0);
  if (dIdx.length && bars > 1) {
    const dr = await mmModel('drum_kit_rnn'), PIT = {kick:36, snare:38, hat:42, clap:39, crash:49}, seedN = [];
    for (const i of dIdx) for (const [b, bt, st] of base.channels[i].notes) if (b === 1) { const s0 = (bt - 1) * 4 + st - 1; seedN.push([PIT[base.channels[i].inst.slice(5)], s0, s0 + 1]); }
    const g = await dr.continueSequence(mmSeq(seedN, SPB, true), steps - SPB, temp), byInst = {};
    for (const i of dIdx) { const inst = base.channels[i].inst.slice(5); byInst[inst] = base.channels[i]; base.channels[i].notes = base.channels[i].notes.filter(n => n[0] === 1); }
    for (const n of fromMM(g, SPB)) { const inst = DRUM_MAP[n.p]; if (!inst || n.s >= steps) continue; const ch = byInst[inst] || (byInst[inst] = (base.channels.push({name:DRUM_NAME[inst], inst:'drum:' + inst, notes:[]}), base.channels[base.channels.length - 1]));
      ch.notes.push([Math.floor(n.s / SPB) + 1, Math.floor(n.s % SPB / 4) + 1, n.s % 4 + 1, 'C5', 1, inst === 'hat' ? .5 : .85]); }
  }
  base.title = (prompt || '음악 AI').slice(0, 24);
  if (noMelody) base.channels[0].notes = [];
  return {data:base, info:`후보 ${tries}개씩 골라 점수 ${mel.score.toFixed(2)}${form}${bi >= 0 ? ' · 베이스도 음악 AI' : ''}`};
}
// 이어 쓰기: 지금 채널 멜로디의 끝 2마디를 MelodyRNN에 주고 뒤를 지음
async function musicContinue({addBars, tries}) {
  const c = S.channels[S.ch]; if (!c || c.kind === 'drum') throw new Error('멜로디 채널(악기)을 골라 주세요');
  const P = curPat(), src = (P.notes[c.id] || []).slice().sort((a, b) => a.s - b.s); if (src.length < 2) throw new Error(`"${c.name}" 채널에 음이 2개 이상 있어야 해요`);
  const SPB = BEATS * 4, top = new Map(); for (const n of src) { const s = Math.round(n.s / 12); if (!top.has(s) || top.get(s).p < n.p) top.set(s, {p:n.p, s, e:Math.max(s + 1, Math.round((n.s + n.l) / 12))}); }
  const mono = [...top.values()].sort((a, b) => a.s - b.s); for (let i = 0; i < mono.length - 1; i++) mono[i].e = Math.min(mono[i].e, mono[i + 1].s);
  const endStep = Math.max(...mono.map(n => n.e)), from = Math.max(0, endStep - 2 * SPB), seedN = mono.filter(n => n.s >= from).map(n => [n.p, n.s - from, n.e - from]);
  const gen = addBars * SPB, needBars = Math.ceil((endStep + gen) / SPB); if (needBars > 8) throw new Error(`패턴이 8마디를 넘어요 (지금 음이 ${Math.ceil(endStep / SPB)}마디까지) — 이어 쓸 길이를 줄이거나 새 패턴에서 해 주세요`);
  const rnn = await mmModel('melody_rnn'), ps = mono.map(n => n.p), lo = Math.min(...ps), hi = Math.max(...ps), dens = Math.min(.6, Math.max(.12, mono.length / Math.max(SPB, endStep))), cands = [];
  for (let k = 0; k < tries; k++) {
    const g = await rnn.continueSequence(mmSeq(seedN, endStep - from), gen, 1.0), notes = fromMM(g, endStep).filter(n => n.s < endStep + gen).map(n => ({...n, e:Math.min(endStep + gen, Math.max(n.s + 1, n.e))})); fixKey(notes, S.root, S.mode === 'minor');
    const sc = melScore(notes.map(n => ({...n, s:n.s - endStep})), {root:S.root, minor:S.mode === 'minor', chordAt:null, steps:gen, dens}) - .15 * notes.filter(n => n.p < lo - 5 || n.p > hi + 5).length;
    cands.push({notes, score:sc});
  }
  cands.sort((a, b) => b.score - a.score); const best = cands[0]; if (!best.notes.length) throw new Error('AI가 음을 짓지 못했어요. 다시 해 보세요');
  pushUndo(); if (needBars > P.bars) { P.bars = [1, 2, 4, 8].find(b => b >= needBars); P.chords = Array.from({length:P.bars * BEATS}, (_, i) => P.chords[i] || null); }
  const arr = P.notes[c.id] = P.notes[c.id] || []; for (const n of best.notes) arr.push({s:n.s * 12, l:(n.e - n.s) * 12, p:Math.max(LOW, Math.min(HIGH, n.p)), v:n.s % 4 === 0 ? .85 : .7});
  save(); refreshAll(); return {n:best.notes.length, from:Math.floor(endStep / SPB) + 1, bars:addBars, info:`후보 ${tries}개 중 점수 ${best.score.toFixed(2)}`};
}
// 대화상자 연결: 음악 AI 엔진이면 작곡·이어 쓰기를 여기서
const ruleRunAI = runAI, ruleShowTab = aiShowTab;
runAI = async function (again) {
  const eng = $('aiEngine').value;
  if (aiTab === 'continue' || (eng === 'music' && aiTab === 'compose')) {
    const t0 = performance.now(), tries = +$('aiTries').value, first = !mmModels.chord_pitches_improv && !mmModels.melody_rnn;
    aiMsg(first ? '음악 AI 모델을 받는 중… (처음 한 번, 몇 초)' : `음악 AI가 후보 ${tries}개를 짓는 중…`);
    try {
      if (aiTab === 'compose') { if (again) aiSeed++; else aiSeed = (Date.now() & 0xffff) || 1;
        const prompt = $('aiPrompt').value.trim(), {data, info} = await musicCompose({prompt, bars:+$('aiBars').value, seed:aiSeed, tries});
        const res = applyCompose(data, prompt), m = `음악 AI: 새 패턴 "${res.P.name}" · ${res.P.bars}마디 · 음 ${res.notes}개 · ${info} (${((performance.now() - t0) / 1000).toFixed(1)}초)`; aiMsg(m); status(m);
      } else { const r = await musicContinue({addBars:+$('aiAdd').value, tries}); const m = `음악 AI: ${r.from}마디부터 ${r.bars}마디를 이어 썼어요 · 음 ${r.n}개 · ${r.info} (${((performance.now() - t0) / 1000).toFixed(1)}초, 되돌리기 Ctrl+Z)`; aiMsg(m); status(m); }
    } catch (e) { if (aiTab === 'compose' && /라이브러리|fetch|network|Failed/i.test(e.message)) { aiMsg('음악 AI를 쓸 수 없어서 규칙 AI로 했어요 (' + e.message + ')'); $('aiEngine').value = 'local'; await ruleRunAI(again); $('aiEngine').value = 'music'; } else aiMsg('음악 AI 오류: ' + e.message); }
    return;
  }
  return ruleRunAI(again);
};
aiShowTab = function (t) { ruleShowTab(t); if (t === 'continue') { $('aiRun').textContent = '이어 쓰기'; $('aiAgain').hidden = true; } $('aiTriesRow').hidden = !(t === 'continue' || (t === 'compose' && $('aiEngine').value === 'music')); document.querySelectorAll('.aiChName').forEach(x => x.textContent = (S.channels[S.ch] || {}).name || '-'); };
$('aiEngine').addEventListener('change', () => aiShowTab(aiTab));
document.querySelectorAll('#aiTabs button').forEach(b => b.onclick = () => aiShowTab(b.dataset.t));

/* 29-music-ai2.js — 음악 AI 2: 신경망 반주(MusicVAE multitrack_chords) · 사람처럼 치는 드럼(GrooVAE) · 곡 전체 편곡
   모델은 처음 쓸 때만 받고, 사용자 컴퓨터에 그래픽카드(WebGL)가 있으면 자동으로 씀. */
const MV_CK = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/', mvModels = {};
let mmBackendP = null;
function mmBackend() { return mmBackendP || (mmBackendP = (async () => { try { if (mm.tf.getBackend() !== 'webgl') { await mm.tf.setBackend('webgl'); await mm.tf.ready(); } } catch (e) { try { await mm.tf.setBackend('cpu'); } catch (_) {} } return mm.tf.getBackend(); })()); }
const rnnModel = mmModel; mmModel = async name => { await mmLoad(); await mmBackend(); return rnnModel(name); };
async function mvModel(name) { await mmLoad(); await mmBackend(); if (!mvModels[name]) mvModels[name] = (async () => { const m = new mm.MusicVAE(MV_CK + name); await m.initialize(); return m; })().catch(e => { delete mvModels[name]; throw e; }); return mvModels[name]; }
// GM 악기 번호 → 이 앱의 악기 (베이스·효과음·민속 악기는 버림: 베이스는 따로 신경망이 만들고, 나머지는 반주에 어울리지 않음)
function progInst(p) {
  if (p <= 5) return 'piano'; if (p <= 7) return 'pluck'; if (p === 8) return 'celesta'; if (p <= 15) return 'bell';
  if (p <= 23) return 'strings'; if (p <= 31) return 'pluck'; if (p <= 39) return null; if (p === 46) return 'harp';
  if (p <= 55) return 'strings'; if (p <= 79) return 'synth'; if (p <= 87) return 'synth'; if (p <= 95) return 'strings'; return null;
}
const chordSym = ([rn, q]) => rn + ({'':'', m:'m', '7':'7', maj7:'maj7', m7:'m7', sus4:'', dim:'dim', aug:'aug'}[q] ?? '');
// 신경망 반주: 후보(스타일 값) K개를 코드마다 한 번에 풀어 보고, 코드음·악기·음역 점수가 가장 좋은 스타일을 고름
async function neuralComp(barChords, {K = 3, temp = .5, melTop = 76, energy = 1, avoid = [], cache = null, key = null} = {}) {
  const mc = await mvModel('multitrack_chords'), zDims = (mc.decoder && mc.decoder.zDims) || 256;
  // 곡 하나 = 반주 스타일 하나: 스타일 값(z)과 코드별 결과를 곡 전체에서 공유 → 같은 코드는 한 번만 계산, 구간이 바뀌어도 같은 악기
  const C = cache || {}; if (!C.z) { C.z = mm.tf.randomNormal([K, zDims]); C.byChord = {}; C.K = K; }
  const uniq = [...new Set(barChords.map(chordSym))], byChord = C.byChord; K = C.K;
  try { for (const c of uniq) if (!byChord[c]) byChord[c] = await mc.decode(C.z, temp, {chordProgression:[c]}); } finally { if (!cache) { C.z.dispose(); } }
  const cands = [];
  for (let k = 0; k < K; k++) {
    const parts = {}; let tot = 0, ct = 0, good = 0, all = 0, high = 0;
    barChords.forEach((ch, b) => {
      const ns = byChord[chordSym(ch)][k], pcs = pcsOfChord(ch[0], ch[1]);
      for (const n of ns.notes) {
        all++; if (n.isDrum) continue; const inst = progInst(n.program || 0); if (!inst) continue; good++;
        const s = n.quantizedStartStep * 2, e = Math.max(s + 3, n.quantizedEndStep * 2); if (s >= BAR_T) continue;   // 24칸/박 × 2 = 48틱/박
        (parts[inst] = parts[inst] || []).push({s:b * BAR_T + s, l:Math.min(e, BAR_T) - s, p:n.pitch, v:Math.min(1, (n.velocity || 80) / 127 * (.65 + .35 * energy))});
        tot++; if (pcs.includes(n.pitch % 12)) ct++; if (n.pitch > melTop) high++;
      }
    });
    const kinds = Object.keys(parts).filter(i => !avoid.includes(i)); if (!tot || !kinds.length) continue;
    const score = 3 * ct / tot + 1.5 * good / Math.max(1, all) - 2 * high / tot - (kinds.length > 3 ? .5 : 0) + (tot / barChords.length >= 2 ? .5 : -1) + (C.k === k ? 2 : 0);
    cands.push({parts, kinds, score, ct:ct / tot, k});
  }
  cands.sort((a, b) => b.score - a.score); const best = cands[0]; if (!best) return null; if (cache && C.k == null) C.k = best.k;
  // 에너지를 음 수로: 약한 구간은 박마다(인트로·아웃트로) 또는 8분음표 칸만(벌스) 남김 → 후렴이 가장 빽빽해짐
  const grid = energy < .5 ? PPQ : energy < .8 ? PPQ / 2 : 0;
  for (const i of best.kinds) { let ns = best.parts[i]; if (grid) ns = ns.filter(n => n.s % grid === 0).map(n => ({...n, l:Math.max(n.l, grid)}));
    if (key) { const sc = key.minor ? MIN : MAJ, ok = p => sc.includes((p - key.root + 120) % 12); ns.forEach(n => { if (!ok(n.p) && n.l >= PPQ / 2) n.p = ok(n.p - 1) ? n.p - 1 : n.p + 1; }); }   // 조 밖 긴 음 보정
    best.parts[i] = ns; }
  const NAME = {piano:'AI 반주 피아노', pluck:'AI 반주 기타', strings:'AI 반주 현악', synth:'AI 반주 신스', bell:'AI 반주 벨', celesta:'AI 반주 첼레스타', harp:'AI 반주 하프'};
  return {channels:best.kinds.slice(0, energy < .8 ? 1 : 3).map(i =>   // 약한 구간(벌스·브리지·인트로·아웃트로)은 반주 악기 하나, 후렴만 전부
 ({name:NAME[i] || 'AI 반주', inst:i, notes:best.parts[i]})), chordTone:best.ct, score:best.score, K:cands.length};
}
// 사람처럼: 2마디씩 GrooVAE에 넣어 나온 박자 흔들림·세기만 가져옴 (새 타격은 더하지 않음)
async function humanizeDrums(chs, bars, bpm) {
  const gv = await mvModel('groovae_2bar_humanize'), SPB = BEATS * 4, PIT = {kick:36, snare:38, hat:42, clap:39, crash:49};
  const hits = []; chs.forEach((c, ci) => c.notes.forEach((n, ni) => { const s = Array.isArray(n) ? (n[0] - 1) * SPB + (n[1] - 1) * 4 + n[2] - 1 : Math.round(n.s / 12); hits.push({ci, ni, s, p:PIT[c.inst.slice(5)] || 42, v:Array.isArray(n) ? n[5] : n.v}); }));
  const secTick = 60 / bpm / PPQ, out = new Map(); let moved = 0, dev = 0;
  for (let c0 = 0; c0 < bars * SPB; c0 += 32) {
    const chunk = hits.filter(h => h.s >= c0 && h.s < c0 + 32); if (!chunk.length) continue;
    const q = {notes:chunk.map(h => ({pitch:h.p, quantizedStartStep:h.s - c0, quantizedEndStep:h.s - c0 + 1, isDrum:true, velocity:Math.round(h.v * 127)})), quantizationInfo:{stepsPerQuarter:4}, totalQuantizedSteps:32, tempos:[{time:0, qpm:bpm}]};
    const zz = await gv.encode([q]); const h = (await gv.decode(zz, .001, undefined, undefined, bpm))[0]; zz.dispose();
    for (const o of chunk) {
      const want = (o.s - c0) * 12 * secTick; let best = null;
      for (const n of h.notes) if (n.pitch === o.p && Math.abs(n.startTime - want) < 12 * secTick * .75 && (!best || Math.abs(n.startTime - want) < Math.abs(best.startTime - want))) best = n;
      if (!best) continue; const off = Math.max(-6, Math.min(6, Math.round((best.startTime - want) / secTick)));
      out.set(o.ci + ':' + o.ni, {off, v:Math.max(.08, Math.min(1, .35 * o.v + .65 * (best.velocity || 80) / 127))}); moved++; dev += (off * secTick * 1000) ** 2;
    }
  }
  chs.forEach((c, ci) => { c.notes = c.notes.map((n, ni) => { const s = Array.isArray(n) ? ((n[0] - 1) * SPB + (n[1] - 1) * 4 + n[2] - 1) * 12 : n.s, m = out.get(ci + ':' + ni); return {s:Math.max(0, s + (m ? m.off : 0)), l:6, p:72, v:m ? m.v : (Array.isArray(n) ? n[5] : n.v)}; }); });
  return {moved, rmsMs:moved ? Math.sqrt(dev / moved) : 0};
}
// 드럼 필인: 구간 마지막 마디를 DrumsRNN이 앞 마디를 듣고 더 세게(온도 높게) 다시 침
async function drumFill(chs, bars) {
  if (bars < 2) return false; const SPB = BEATS * 4, PIT = {kick:36, snare:38, hat:42, clap:39, crash:49}, back = {36:'kick', 38:'snare', 40:'snare', 42:'hat', 44:'hat', 46:'hat', 39:'clap', 49:'crash', 57:'crash', 45:'snare', 47:'snare', 48:'snare', 50:'snare'};
  const tick = n => Array.isArray(n) ? ((n[0] - 1) * SPB + (n[1] - 1) * 4 + n[2] - 1) * 12 : n.s, lastS = (bars - 1) * SPB * 12, prevS = (bars - 2) * SPB * 12;
  const seedN = []; chs.forEach(c => c.notes.forEach(n => { const t = tick(n); if (t >= prevS && t < lastS) { const s = Math.round((t - prevS) / 12); seedN.push([PIT[c.inst.slice(5)] || 42, s, s + 1]); } }));
  if (!seedN.length) return false;
  const dr = await mmModel('drum_kit_rnn'), g = await dr.continueSequence(mmSeq(seedN, SPB, true), SPB, 1.3);
  chs.forEach(c => { c.notes = c.notes.filter(n => tick(n) < lastS); });
  for (const n of g.notes) { const inst = back[n.pitch]; const c = chs.find(x => x.inst === 'drum:' + inst); if (!c || n.quantizedStartStep >= SPB) continue; c.notes.push({s:lastS + n.quantizedStartStep * 12, l:6, p:72, v:inst === 'hat' ? .5 : .9}); }
  return true;
}
// 한 구간(또는 한 패턴) 만들기: 멜로디·베이스(음악 AI 1) + 신경망 반주 + 필인 + 사람처럼
async function musicSection({prompt, bars, seed, tries, degs, lift = 0, form = 'song', noMelody = false, energy = 1, drums = 'auto', fill = false, pad = true, neural = true, compCache = null}) {
  const {data, info} = await musicCompose({prompt, bars, seed, tries, degs, lift, form, noMelody, bassTries:compCache ? Math.max(1, tries >> 1) : tries}), notes = [];
  const drumCh = data.channels.filter(c => /^drum:/.test(c.inst));
  if (drums === 'none') data.channels = data.channels.filter(c => !/^drum:/.test(c.inst));
  else if (drums === 'light') data.channels = data.channels.filter(c => !['drum:snare', 'drum:crash'].includes(c.inst));
  if (!pad) data.channels = data.channels.filter(c => c.name !== 'AI 패드');
  let comp = null;
  if (neural) {
    const melTop = Math.max(64, ...data.channels[0].notes.map(n => Array.isArray(n) ? pitchOf(n[3]) : n.p)) - 2;
    comp = await neuralComp(data.chords.map(c => [c[2], c[3]]), {K:tries >= 8 ? 4 : 3, melTop:noMelody ? 84 : melTop, energy, cache:compCache, key:data.key}).catch(() => null);
    if (comp && comp.chordTone >= .6) { data.channels = data.channels.filter(c => c.name !== 'AI 반주'); data.channels.push(...comp.channels); } else comp = null;   // 코드와 안 맞으면 규칙 반주 유지
  }
  let fillDone = false, hum = null; const dch = data.channels.filter(c => /^drum:/.test(c.inst));
  if (dch.length) { if (fill) fillDone = await drumFill(dch, bars).catch(() => false); hum = await humanizeDrums(dch, bars, S.bpm).catch(() => null); }
  // 세기: 구간 에너지에 맞춰 (드럼·반주 제외 나머지)
  if (energy < 1) data.channels.forEach(c => { if (/^drum:/.test(c.inst)) return; c.notes = c.notes.map(n => Array.isArray(n) ? [...n.slice(0, 5), n[5] * (.55 + .45 * energy)] : {...n, v:n.v * (.55 + .45 * energy)}); });
  void notes; void drumCh;
  return {data, info:info + (comp ? ` · 신경망 반주(코드음 ${Math.round(comp.chordTone * 100)}%)` : ' · 규칙 반주') + (fillDone ? ' · 필인' : '') + (hum ? ` · 사람처럼(±${hum.rmsMs.toFixed(0)}ms)` : '')};
}
// 곡 전체 편곡: 구간마다 패턴을 만들고 지금 곡 뒤에 플레이리스트로 이어 붙임
async function musicArrange({prompt, seed, tries, onStep = () => {}}) {
  const key = localCompose({prompt, bars:4, seed}).key, minor = key.minor, t = prompt.toLowerCase(), hasDrums = /신나|빠르|댄스|edm|강하|파워|여름|축제|드럼|비트/.test(t);
  const D = minor ? {verse:[0, 5, 2, 6], chorus:[5, 6, 0, 4, 5, 6, 0, 0], bridge:[3, 6, 2, 4], intro:[5, 6, 0, 0], outro:[5, 6, 0, 0]}
                  : {verse:[0, 5, 3, 4], chorus:[3, 4, 0, 5, 3, 4, 0, 0], bridge:[5, 3, 0, 4], intro:[3, 4, 0, 5], outro:[3, 4, 0, 0]};
  const SECS = [
    {id:'intro', name:'인트로', bars:4, degs:D.intro, noMelody:true, energy:.35, drums:hasDrums ? 'light' : 'none', pad:true},
    {id:'verse', name:'벌스', bars:8, degs:D.verse, energy:.65, drums:hasDrums ? 'light' : 'none', pad:false, fill:hasDrums},
    {id:'chorus', name:'후렴', bars:8, degs:D.chorus, lift:4, form:'chorus', energy:1, drums:'auto', pad:true},
    {id:'bridge', name:'브리지', bars:4, degs:D.bridge, lift:2, energy:.55, drums:hasDrums ? 'light' : 'none', pad:true, fill:hasDrums},
    {id:'outro', name:'아웃트로', bars:4, degs:D.outro, noMelody:true, energy:.3, drums:'none', pad:true}];
  const ORDER = ['intro', 'verse', 'chorus', 'bridge', 'chorus', 'outro'], made = {}, infos = [], compCache = {};
  const ORD = ['chorus', 'verse', 'bridge', 'intro', 'outro'];   // 후렴을 먼저 만들어 곡의 반주 스타일을 후렴 기준으로 정함
  for (let j = 0; j < ORD.length; j++) {
    const i = SECS.findIndex(x => x.id === ORD[j]), s = SECS[i]; onStep(`${s.name} 만드는 중 (${j + 1}/${SECS.length})`);
    const {data, info} = await musicSection({prompt, bars:s.bars, seed:seed + i * 7, tries, degs:s.degs, lift:s.lift || 0, form:s.form || 'song', noMelody:!!s.noMelody, energy:s.energy, drums:s.drums, fill:!!s.fill, pad:s.pad, compCache});
    data.title = s.name; made[s.id] = data; infos.push(`${s.name}: ${info.split(' · ').slice(1).join(' · ')}`);
  }
  if (compCache.z) compCache.z.dispose();
  pushUndo(); const start = S.playlist.clips.length ? songBars() : 0, pats = {};
  for (const s of SECS) { const res = applyCompose(made[s.id], s.name); res.P.name = `AI 편곡: ${s.name}`; pats[s.id] = res.P; }
  let bar = start; const clips = [];
  for (const id of ORDER) { const P = pats[id]; S.playlist.clips.push({id:newId(), pat:P.id, t:0, bar}); clips.push([id, bar]); bar += P.bars; }
  S.playMode = 'song'; save(); refreshAll();
  return {bars:bar - start, start, sections:ORDER.length, patterns:SECS.length, infos, pats};
}
// 대화상자 연결: 작곡은 음악 AI 2로, "곡 전체"는 편곡으로. 대화상자를 열면 모델을 미리 받아 둠
const ai1Run = runAI;
runAI = async function (again) {
  if ($('aiEngine').value === 'music' && aiTab === 'compose') {
    const t0 = performance.now(), tries = +$('aiTries').value, song = $('aiBars').value === 'song', prompt = $('aiPrompt').value.trim();
    if (again) aiSeed++; else aiSeed = (Date.now() & 0xffff) || 1;
    const tick = msg => aiMsg(`${msg} · ${((performance.now() - t0) / 1000).toFixed(0)}초`);
    try {
      tick(mvModels.multitrack_chords ? '음악 AI 2가 짓는 중' : '음악 AI 2 모델을 받는 중 (처음 한 번)');
      if (song) { const r = await musicArrange({prompt, seed:aiSeed, tries, onStep:tick}); const m = `음악 AI 2: 곡 전체 편곡 ${r.bars}마디 (인트로·벌스·후렴·브리지·후렴·아웃트로)를 ${r.start + 1}마디부터 붙였어요 · ${((performance.now() - t0) / 1000).toFixed(1)}초 (되돌리기 Ctrl+Z)`; aiMsg(m); status(m); }
      else { const bars = +$('aiBars').value, {data, info} = await musicSection({prompt, bars, seed:aiSeed, tries, fill:false, neural:tries > 1});
        const res = applyCompose(data, prompt), m = `음악 AI 2: 새 패턴 "${res.P.name}" · ${res.P.bars}마디 · 음 ${res.notes}개 · ${info} (${((performance.now() - t0) / 1000).toFixed(1)}초)`; aiMsg(m); status(m); }
    } catch (e) { aiMsg('음악 AI 2 오류: ' + e.message); }
    return;
  }
  return ai1Run(again);
};
$('aiBtn').addEventListener('click', () => setTimeout(() => { if ($('aiEngine').value !== 'music') return; mmLoad().then(() => Promise.all([mmModel('chord_pitches_improv'), mvModel('multitrack_chords')])).catch(() => {}); }, 400));

/* 30-composer.js — 스케치패드 AI 작곡기 (가족 앱). 주소 /composer (= /?app=composer)
   스케치패드와 같은 엔진(음악 AI 2)을 쓰고, 화면만 "글 → 곡" 하나로 단순하게. 만든 곡은 내 프로젝트에 저장됨. */
const CP = new URLSearchParams(location.search).get('app') === 'composer';
if (CP) {
  document.body.classList.add('composer'); $('composerApp').hidden = false; document.title = '스케치패드 AI 작곡기';
  let len = 'song', busy = false, lastWav = null, lastName = '', t0 = 0, n = 0;
  const say = m => { $('czStatus').textContent = m; };
  document.querySelectorAll('.cz-chips button').forEach(b => b.onclick = () => { $('czPrompt').value = b.dataset.p; $('czPrompt').focus(); });
  document.querySelectorAll('.cz-seg button').forEach(b => b.onclick = () => { len = b.dataset.len; document.querySelectorAll('.cz-seg button').forEach(x => x.setAttribute('aria-checked', x === b)); });
  // 분위기에 맞는 빠르기
  const bpmFor = t => /잔잔|밤|발라드|느리|조용|꿈|로파이|lofi|슬픈/.test(t) ? (/로파이|lofi|꿈/.test(t) ? 80 : 76) : /신나|축제|댄스|edm|빠르|파워/.test(t) ? 124 : 104;
  async function make(again) {
    if (busy) return; busy = true; $('czGo').disabled = $('czAgain').disabled = true; $('czBar').hidden = false; t0 = performance.now();
    const prompt = $('czPrompt').value.trim() || '밝은 팝, 드럼', tick = m => say(`${m} · ${((performance.now() - t0) / 1000).toFixed(0)}초`);
    try {
      tick(mvModels.multitrack_chords ? '음악 AI가 짓는 중' : '음악 AI 모델을 받는 중 (처음 한 번)');
      newProject(false); n = Object.keys(lib.list).length; lastName = ('AI 작곡기 · ' + prompt).slice(0, 40); lib.list[lib.current].name = lastName;
      S.bpm = bpmFor(prompt.toLowerCase()); S.root = [0, 2, 5, 7, 9][Math.floor(Math.random() * 5)]; S.mode = 'major'; S.playlist.clips = [];
      const seed = (Date.now() & 0xffff) || 1; let info = '';
      try {
        if (len === 'song') { const r = await musicArrange({prompt, seed, tries:4, onStep:tick}); info = `곡 전체 ${r.bars}마디 · 인트로·벌스·후렴·브리지·후렴·아웃트로`; }
        else { const {data} = await musicSection({prompt, bars:8, seed, tries:4, fill:false}); const res = applyCompose(data, prompt); S.playlist.clips.push({id:newId(), pat:res.P.id, t:0, bar:0}); S.playMode = 'song'; save(); info = '8마디'; }
      } catch (e) {   // 인터넷이 없거나 모델을 못 받으면 규칙 AI로
        const d = localCompose({prompt, bars:8, seed}), res = applyCompose(d, prompt); S.playlist.clips = [{id:newId(), pat:res.P.id, t:0, bar:0}]; S.playMode = 'song'; save(); info = '8마디 · 규칙 AI (음악 AI를 쓸 수 없어서)';
      }
      tick('소리 만드는 중');
      const buf = await renderWav(); lastWav = buf instanceof Uint8Array ? buf : wavBytes(buf);
      const url = URL.createObjectURL(new Blob([lastWav], {type:'audio/wav'})), a = $('czAudio'); if (a.src) URL.revokeObjectURL(a.src); a.src = url;
      $('czName').textContent = lastName; $('czInfo').textContent = `${info} · ${S.bpm} BPM · ${((performance.now() - t0) / 1000).toFixed(0)}초 걸림`;
      $('czResult').hidden = false; { const keep = {...CS}; Object.assign(CS, {bg:'#0b0b0d', mute:'#777', line2:'#3a3a40'}); drawThumb($('czThumb'), S); Object.assign(CS, keep); } say('완성했습니다.'); a.play().catch(() => {});
      $('czResult').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'nearest'});
    } catch (e) { say('만들지 못했습니다: ' + e.message); }
    busy = false; $('czGo').disabled = $('czAgain').disabled = false; $('czBar').hidden = true; void again; void n;
  }
  $('czGo').onclick = () => make(false); $('czAgain').onclick = () => make(true);
  $('czPrompt').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); make(false); } };
  $('czMp3').onclick = async () => { if (!lastWav) return; say('MP3로 바꾸는 중'); try { const m = await wavToMp3(lastWav); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([m], {type:'audio/mpeg'})); a.download = lastName.replace(/[\\/:*?"<>|]/g, '') + '.mp3'; a.click(); say('MP3를 저장했습니다.'); } catch (e) { say('MP3로 바꾸지 못했습니다: ' + e.message); } };
  $('czOpen').onclick = e => { e.preventDefault(); save(); location.href = '/'; };   // 같은 프로젝트 목록이라 스케치패드가 이 곡을 열어 둠
  setTimeout(() => mmLoad().then(() => Promise.all([mmModel('chord_pitches_improv'), mvModel('multitrack_chords')])).catch(() => {}), 600);   // 미리 받기
  setTimeout(() => $('czPrompt').focus(), 100);
}

/* 31-ui6.js — 6 화면: 아래 줄의 파일 메뉴 (열기·닫기, 바깥 누르기·Esc, 위아래 화살표) */
(() => {
  const btn = $('fileMenuBtn'), pop = $('fileMenu');
  const items = () => [...pop.querySelectorAll('button, a')].filter(e => !e.hidden);
  const open = focus => { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); if (focus) (items()[0] || pop).focus(); };
  const close = back => { if (pop.hidden) return; pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (back) btn.focus(); };
  btn.addEventListener('click', () => pop.hidden ? open(false) : close(false));
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); open(true); } });
  pop.addEventListener('click', e => { if (e.target.closest('button, a')) setTimeout(() => close(false), 0); });   // 항목의 원래 동작이 먼저 실행된 뒤 닫힘
  pop.addEventListener('keydown', e => { const l = items(), i = l.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); l[(i + 1) % l.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); l[(i - 1 + l.length) % l.length].focus(); } });
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !e.target.closest('.fm')) close(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); close(true); } }, true);   // 버튼에 초점이 있어도 Esc로 닫힘
  items().forEach(e => e.setAttribute('role', 'menuitem'));
})();

/* 소리 출처 · 라이선스 (CC-BY 표기 의무) */
(() => {
  const btn = $('creditBtn'), dlg = $('creditDlg');
  if (!btn || !dlg) return;
  btn.addEventListener('click', () => dlg.showModal());
  $('creditClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();

/* 32-kit.js — 6: 드럼 키트. 드럼을 피아노 롤에서 음처럼 찍음 (줄 = 표준 GM 드럼 번호)
   줄은 36~49 빈틈없이, 저장·MIDI는 GM 번호. 킥·스네어·박수·닫힌 햇·크래시는 기존 드럼 소리, 나머지 9개는 여기서 합성. 뒤에 실제 녹음 샘플로 바꿀 자리. */
// 드럼 키트 줄: 피아노 롤에서는 36~49의 14줄을 빈틈없이 쓰고 (아래부터 킥 → 셰이커), 소리·MIDI에서는 표준 GM 드럼 번호로 바꿈
const KIT = [[36, 36, 'kick', '킥'], [37, 37, 'rim', '림'], [38, 38, 'snare', '스네어'], [39, 39, 'clap', '박수'],
  [40, 42, 'hatC', '닫힌 햇'], [41, 44, 'hatP', '페달 햇'], [42, 46, 'hatO', '열린 햇'],
  [43, 41, 'tomL', '로우 탐'], [44, 45, 'tomM', '미드 탐'], [45, 48, 'tomH', '하이 탐'],
  [46, 49, 'crash', '크래시'], [47, 51, 'ride', '라이드'], [48, 56, 'bell', '카우벨'], [49, 70, 'shaker', '셰이커']];
const KIT_ROW = {}, KIT_BY_GM = {}; KIT.forEach(([p, gm, id, nm], i) => { KIT_ROW[p] = {gm, id, nm, i}; KIT_BY_GM[gm] = p; });
// 다른 GM 번호도 비슷한 드럼 줄로 (MIDI 파일·건반에서 들어올 때)
const KIT_ALIAS = {35:36, 40:38, 43:41, 47:45, 50:48, 52:49, 55:49, 57:49, 53:51, 59:51, 54:70, 69:70, 82:70, 31:37, 33:37};
const kitFromGm = gm => KIT_BY_GM[KIT_ALIAS[gm] || gm];
const kitToGm = p => KIT_ROW[p] ? KIT_ROW[p].gm : 36;
const kitSnap = p => Math.max(36, Math.min(49, Math.round(p)));   // 줄이 빈틈없으니 범위 안으로만
function kitNoise(ac) { if (ac._kitNoise) return ac._kitNoise; const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return ac._kitNoise = b; }
function kitHit(p, t, EE, vel, key) {
  EE = EE || E; vel = vel == null ? 1 : vel; const row = KIT_ROW[p]; if (!row) return;
  const id = row.id, ac = EE.ac, dest = getCh(EE, key).inp;
  if (id === 'kick' || id === 'snare' || id === 'clap' || id === 'crash') { drumHit(id, t, EE, vel, key); return; }
  if (id === 'hatC' || id === 'hatP') { chokeOpenHat(EE, t); drumHit('hat', t, EE, vel * (id === 'hatP' ? .6 : 1), key); return; }
  const out = ac.createGain(); out.connect(dest);
  const env = (g, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  const noise = (dec, type, f, q, peak) => { const s = ac.createBufferSource(); s.buffer = kitNoise(ac); const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); env(g, 0.002, peak * vel, dec); s.connect(fl).connect(g).connect(out); s.start(t); s.stop(t + dec + 0.05); return g; };
  const osc = (type, f0, f1, dec, peak, glide) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dec)); const g = ac.createGain(); env(g, 0.002, peak * vel, dec); o.connect(g).connect(out); o.start(t); o.stop(t + dec + 0.05); return g; };
  if (id === 'rim') { osc('square', 1700, 0, 0.025, .35); noise(0.03, 'bandpass', 3200, 2.5, .5); }
  else if (id === 'tomL' || id === 'tomM' || id === 'tomH') { const f = {tomL:105, tomM:145, tomH:195}[id]; osc('sine', f, f * .62, 0.38, .95, .28); noise(0.02, 'lowpass', 2500, .7, .25); }
  else if (id === 'hatO') { chokeOpenHat(EE, t); const g = noise(0.5, 'highpass', 7200, .8, .42); EE._openHat = {g, t}; }
  else if (id === 'ride') { [311, 457, 603, 785, 1041, 1254].forEach(f => osc('square', f * 2.2, 0, 1.1, .035)); noise(1.0, 'bandpass', 8000, 1.2, .16); }
  else if (id === 'bell') { const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 800; fl.Q.value = 3; fl.connect(out);
    [540, 800].forEach(f => { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = ac.createGain(); env(g, 0.002, .5 * vel, 0.32); o.connect(g).connect(fl); o.start(t); o.stop(t + 0.4); }); }
  else if (id === 'shaker') noise(0.09, 'bandpass', 6200, 1.1, .45);
}
function chokeOpenHat(EE, t) { const o = EE._openHat; if (o && t > o.t) { try { o.g.gain.cancelScheduledValues(t); o.g.gain.setTargetAtTime(0.0001, t, 0.012); } catch (e) {} EE._openHat = null; } }   // 닫힌 햇이 열린 햇을 끊음
// 건반 칸: 드럼 키트면 건반 대신 드럼 이름
const kitDrawKeys0 = drawKeys;
drawKeys = function () {
  kitDrawKeys0();
  if (!curCh() || curCh().inst !== 'kit') return;
  const x = kc.getContext('2d'), d = devicePixelRatio || 1; x.save(); x.setTransform(d, 0, 0, d, 0, 0);
  const ink = getComputedStyle(document.body).color; x.fillStyle = CS['row-out']; x.fillRect(0, 0, KEYW, (HIGH - LOW + 1) * ROWH);
  x.font = `600 ${Math.max(9, Math.min(11, ROWH - 3))}px ${getComputedStyle(document.body).fontFamily}`; x.textBaseline = 'middle'; x.textAlign = 'left';
  for (let p = HIGH; p >= LOW; p--) { const y = (HIGH - p) * ROWH, r = KIT_ROW[p];
    if (r) { x.fillStyle = r.i % 2 ? CS['row-in'] : CS['row-root']; x.fillRect(0, y, KEYW, ROWH); x.fillStyle = ink; x.fillText(r.nm, 6, y + ROWH / 2 + .5); }
    x.fillStyle = CS['key-line']; x.fillRect(0, y + ROWH - .5, KEYW, 1); }
  x.restore();
};
// 지금 채널이 드럼 키트로 바뀌면 (고르기·추가·불러오기 어떤 길이든) 드럼 줄(36~70)의 가운데로 스크롤
let kitSeen = null;
const kitDrawRoll0 = drawRoll;
drawRoll = function () {
  const c = curCh();
  if (c && c.inst === 'kit' && kitSeen !== c.id) { kitSeen = c.id; const top = Math.max(0, Math.round((HIGH - 42.5) * ROWH - wrap.clientHeight / 2)); if (Math.abs(wrap.scrollTop - top) > 1) { wrap.scrollTop = top; drawKeys(); } }
  else if (!c || c.inst !== 'kit') kitSeen = null;
  kitDrawRoll0();
};
// 드럼 채널(킥·스네어…)들을 드럼 키트 하나로 합치기 — 모든 패턴의 음을 옮기고 원래 채널은 지움 (되돌리기 가능)
const KIT_FROM = {kick:36, snare:38, hat:40, clap:39, crash:46};
function mergeToKit() {
  const drums = S.channels.filter(c => c.kind === 'drum'); if (!drums.length) { status('합칠 드럼 채널이 없어요.'); return; }
  pushUndo(); let kit = S.channels.find(c => c.inst === 'kit'); if (!kit) { kit = newChannel('synth', 'kit'); S.channels.push(kit); }
  let moved = 0;
  for (const P of S.patterns) { const into = P.notes[kit.id] = P.notes[kit.id] || [];
    for (const c of drums) { for (const n of P.notes[c.id] || []) { into.push({p:KIT_FROM[c.inst] || 36, s:n.s, l:Math.max(6, n.l || 6), v:n.v}); moved++; } delete P.notes[c.id]; if (P.auto) delete P.auto[c.id]; }
    into.sort((a, b) => a.s - b.s || a.p - b.p); }
  for (const c of drums) { S.channels.splice(S.channels.indexOf(c), 1); delete S.mix[chKey(c)]; }
  S.ch = Math.max(0, S.channels.indexOf(kit)); fillMix(S); save(); refreshAll(); if (E) applyMix(E, S.mix);
  status(`드럼 채널 ${drums.length}개를 드럼 키트로 합쳤어요 · 음 ${moved}개 (되돌리기 Ctrl+Z)`);
  return {channels:drums.length, notes:moved};
}

/* 33-samples.js — 6: 실제 녹음 샘플로 소리 내기
   처음 그 악기를 쓸 때만 내려받고, 없거나 인터넷이 끊기면 지금까지의 합성 소리로 그대로 감. */
const SMP = {index:null, load:{}, ready:{}, off:false};
// 앱이 /app 과 /app/ 어느 쪽으로 열려도 샘플을 찾도록 바탕 주소를 정해 둔다.
// (/app 으로 열면 상대 주소가 /samples/ 로 풀려 404 → 오케스트라 악기가 안 나왔음)
const SMP_BASE = (() => {
  const p = location.pathname;
  if (/\/app(\/|$)/.test(p)) return p.replace(/\/app\/?$/, '/app/').replace(/[^/]+$/, '');
  return p.endsWith('/') ? p : p.replace(/[^/]+$/, '');
})();

async function smpIndex() {
  if (SMP.index || SMP.off) return SMP.index;
  try { SMP.index = await (await fetch(SMP_BASE + 'samples/index.json')).json(); }
  catch (e) { SMP.off = true; }                      // 인터넷이 없으면 합성으로
  return SMP.index;
}
// 악기 하나 받아 두기 (같은 악기를 두 번 받지 않음)
function smpLoad(inst) {
  if (SMP.ready[inst] || SMP.off) return SMP.ready[inst] ? Promise.resolve(SMP.ready[inst]) : Promise.resolve(null);
  if (SMP.load[inst]) return SMP.load[inst];
  SMP.load[inst] = (async () => {
    const idx = await smpIndex(); if (!idx || !idx[inst]) return null;
    const dir = SMP_BASE + 'samples/' + idx[inst].dir;
    try {
      const meta = await (await fetch(dir + '/inst.json')).json();
      ensureCtx();
      const bufs = {};
      // 한꺼번에 다 받으면 샘플이 많은 악기(피아노 122개)에서 실패하므로 8개씩 나눠 받는다
      for (let i = 0; i < meta.samples.length; i += 8) {
        await Promise.all(meta.samples.slice(i, i + 8).map(async s => {
          const ab = await (await fetch(`${dir}/${s.i}.opus`)).arrayBuffer();
          bufs[s.i] = await ctx.decodeAudioData(ab);
        }));
      }
      // 두 가지 정보 형식을 모두 받음:
      //   살라만더·VSCO → vs: [[세기 위끝, 소리 번호], …]
      //   GeneralUser GS → s: 소리 번호 하나 + va: [[세기 위끝, 음량 깎기(0.1dB)], …]
      const rows = meta.zones.map(z => z.vs
        ? {lo:z.k[0], hi:z.k[1], root:z.r, vs:z.vs}
        : {lo:z.k[0], hi:z.k[1], root:z.r, one:z.s, va:z.va || null,
           ct:z.ct || 0, ft:z.ft || 0, lp:z.lp || 0});
      // 샘플마다 잰 미세 음정 (센트). 녹음마다 몇 센트씩 어긋나 있어 그만큼 되돌린다
      const sft = {}; for (const s of meta.samples) if (s.ft) sft[s.i] = s.ft;
      return SMP.ready[inst] = {meta, bufs, rows, sft, gain:Math.pow(10, (meta.gain || 0) / 20)};
    } catch (e) {
      // 한 번 실패해도 다시 받아 볼 수 있게 기록을 지운다 (안 그러면 영원히 합성음)
      delete SMP.load[inst];
      console.warn('샘플을 받지 못했어요:', inst, e && e.message);
      return null;
    }
  })();
  return SMP.load[inst];
}
// 건반·세기에 맞는 소리 고르기
// 한 건반에 구역이 여러 개면 모두 겹쳐서 낸다 (악기 하나가 여러 소리를 합쳐 두껍게 만드는 경우)
/* 악기별 음량 고르기
   같은 세기로 한 음씩 재 보니 바이올린 0.08 · 플루트 0.75 로 9배 차이가 났다.
   그래서 합주하면 선율 악기가 저음에 묻힌다.
   한 번에 맞추려다 소리가 찢어진 적이 있어, 최대 2.5배까지만 조심스럽게 올린다.
   (여러 음이 겹치면 세기가 합쳐지므로 과하게 올리면 안 됨) */
const INST_GAIN = {
  'violin': 2.5, 'viola': 1.6, 'glock': 1.8, 'strings': 1.6, 'contrabass': 1.3,
  'trombone': 1.3, 'flute': 0.55, 'horn': 0.75, 'bassoon': 0.8, 'bass': 0.5,
};

/* 샘플 음높이 바로잡기 — 이제 비어 있음
   예전에는 오케스트라 inst.json 의 원음(r)과 건반 구역(k)이 모두 12 낮게 적혀 있어서
   재생할 때 -12 로 땜질했다. 그러면 음높이는 맞아도 한 옥타브 위 녹음을 끌어내려 써서 소리가 둔했다.
   지금은 원본(VSCO 2 CE FLAC)의 실제 기본 주파수를 재서 r·k 를 고쳤으므로 보정이 필요 없다.
   (마림바·실로폰은 예전 땜질에서도 빠져 1옥타브 높게 울렸음 — 같이 고쳐짐)
   다른 샘플 묶음을 붙였는데 음이 어긋나면 여기에 악기별 반음 값을 넣을 수 있다. */
const PITCH_FIX = {};

function smpPickAll(pack, p, v) {
  const vel = Math.max(1, Math.round((v == null ? 0.9 : v) * 127)), out = [];
  for (const z of pack.rows) {
    if (p < z.lo || p > z.hi) continue;
    if (z.vs) {                                   // 세기마다 다른 소리 (VSCO·살라만더)
      const hit = z.vs.find(([top]) => vel <= top) || z.vs[z.vs.length - 1];
      if (hit && pack.bufs[hit[1]]) out.push({buf:pack.bufs[hit[1]], root:z.root, att:0, ft:(pack.sft && pack.sft[hit[1]]) || 0});
      continue;
    }
    let att = 0;                                  // 소리 하나 + 세기별 음량 깎기 (GeneralUser GS)
    if (z.va) { const hit = z.va.find(([top]) => vel <= top); att = hit ? hit[1] : z.va[z.va.length - 1][1]; }
    if (att >= 960) continue;                     // 96dB 넘게 깎이면 사실상 무음
    const buf = pack.bufs[z.one];
    if (buf) out.push({buf, root:z.root, att, ct:z.ct, ft:z.ft});
  }
  return out;
}
function smpPick(pack, p, v) {                     // 가장 크게 들릴 하나 (음 고르기 확인용)
  const all = smpPickAll(pack, p, v);
  if (!all.length) return null;
  return all.reduce((a, b) => (b.att || 0) < (a.att || 0) ? b : a);
}
// 샘플로 한 음 재생. 낼 수 있으면 true (못 내면 부르는 쪽이 합성으로)
function smpPlay(EE, ch, p, t, d, v, dest) {
  const inst = typeof playInst === 'function' ? playInst(ch.inst) : ch.inst;   // 등급에 따라 대신할 악기
  const pack = SMP.ready[inst]; if (!pack) { smpLoad(inst); return false; }
  const hits = smpPickAll(pack, p, v); if (!hits.length) return false;
  for (const hit of hits) {
    const src = EE.ac.createBufferSource(); src.buffer = hit.buf;
    src.playbackRate.value = Math.pow(2, (p - hit.root + (PITCH_FIX[inst] || 0)) / 12 + (hit.ct || 0) / 12 + (hit.ft || 0) / 1200);
    const g = EE.ac.createGain(), vol = pack.gain * (INST_GAIN[inst] || 1) * (v == null ? 0.9 : v) * Math.pow(10, -(hit.att || 0) / 200);   // att는 0.1dB 단위로 깎기
    const dur = d != null ? d : hit.buf.duration;
    const rel = Math.min(0.25, dur * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
    src.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.08);
  }
  return true;
}
// 지금 곡이 쓰는 악기를 미리 받아 두기
function smpPreload() { if (SMP.off || !S) return; for (const c of S.channels) if (c.kind === 'synth') smpLoad(c.inst); }

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

/* 35-tier.js — 6: 등급별 악기
   SE(무료) 합성 12개 · 6 +표준 128개 · Pro +오케스트라 실제 녹음 15종 · Max +그랜드 피아노 Max
   지금은 브라우저에 저장된 값으로 확인해요 (개발용). 판매를 시작하면 서버에서 확인하도록 바꿔야 해요. */
// 출시(결제 시작) 전까지 표준 악기 128개를 무료로 열어 둔다. 결제가 열리면 false로.
const FREE_GM = true;
// 오케스트라 실제 녹음 15종도 출시 전까지 열어 둔다. 결제를 열 때 false로.
const FREE_ORCH = true;
const TIERS = ['se', 'six', 'pro', 'max'];
const TIER_NAME = {se:'SE', six:'스케치패드 6', pro:'6 Pro', max:'6 Max'};
const TIER_RANK = {se:0, six:1, pro:2, max:3};

// 악기 → 필요한 등급 (없으면 SE)
function instTier(inst) {
  if (inst === 'pianoMax') return 'max';
  if (inst === 'pianoPro') return 'pro';
  if (/^gm\d+$/.test(inst)) return FREE_GM ? 'se' : 'six';   // 출시 전에는 표준 악기 128개도 무료
  if (['violin','viola','cello','contrabass','flute','clarinet','oboe','bassoon',
       'trumpet','horn','trombone','tuba','marimba','glock','xylo'].includes(inst))
    return FREE_ORCH ? 'se' : 'pro';
  return 'se';                                  // 기존 합성 악기·드럼·드럼 키트
}
let serverTier = null;                            // 서버가 알려 준 등급 (이게 있으면 이걸 씀)
function myTier() {
  if (serverTier) return serverTier;
  try { const t = localStorage.getItem('msk.tier'); if (TIERS.includes(t)) return t; } catch (e) {}
  return 'se';
}
// 서버에 내 등급을 물어본다 (로그인했고 DB가 켜져 있을 때만 값이 옴)
async function fetchTier() {
  try {
    const a = typeof authInfo === 'function' ? authInfo() : null;
    const tok = a && a.token;
    if (!tok) return null;                        // 로그인 안 했으면 물어볼 것도 없음
    const r = await fetch((window.MSK_SERVER || '') + '/api/license', {headers:{authorization:'Bearer ' + tok}});
    if (!r.ok) return null;
    const j = await r.json();
    if (j && TIERS.includes(j.tier) && j.signedIn && !j.note) { serverTier = j.tier; applyTier(); return j.tier; }
  } catch (e) {}
  return null;
}
function setTier(t) {
  if (!TIERS.includes(t)) return false;
  if (serverTier) { status(`등급은 서버에서 정해져요 (지금 ${TIER_NAME[serverTier]})`); return false; }   // 서버가 정한 뒤에는 못 바꿈
  try { localStorage.setItem('msk.tier', t); } catch (e) {}
  applyTier(); status(`${TIER_NAME[t]} 등급으로 바꿨어요 · 악기 ${countUnlocked()}개 (개발용)`);
  return true;
}
const canUse = inst => TIER_RANK[instTier(inst)] <= TIER_RANK[myTier()];
const countUnlocked = () => Object.keys(INSTS).filter(canUse).length;

// 채널 추가 목록에서 잠긴 악기를 숨긴다 (분류가 통째로 비면 분류도 숨김)
function applyTier() {
  const sel = $('chAdd'); if (!sel) return;
  for (const o of sel.querySelectorAll('option[value^="synth:"]')) {
    const inst = o.value.slice(6);
    o.hidden = !canUse(inst);
  }
  for (const g of sel.querySelectorAll('optgroup')) {
    g.hidden = ![...g.querySelectorAll('option')].some(o => !o.hidden);
  }
}
// 잠긴 악기를 쓰는 곡을 불러올 때: 소리는 가장 가까운 열린 악기로 대신 (곡은 그대로 보존)
const TIER_FALLBACK = {violin:'strings', viola:'strings', cello:'strings', contrabass:'bass',
  flute:'synth', clarinet:'synth', oboe:'synth', bassoon:'bass',
  trumpet:'supersaw', horn:'supersaw', trombone:'supersaw', tuba:'bass',
  marimba:'celesta', glock:'bell', xylo:'bell', pianoPro:'piano', pianoMax:'piano'};
function playInst(inst) {                         // 소리 낼 때 쓸 실제 악기
  if (canUse(inst)) return inst;
  if (TIER_FALLBACK[inst]) return TIER_FALLBACK[inst];
  if (/^gm\d+$/.test(inst)) return 'piano';
  return 'piano';
}
// 곡을 불러온 뒤 잠긴 악기가 있으면 한 번 알려 줌
function tierNotice() {
  if (!S || !S.channels) return;
  const locked = [...new Set(S.channels.filter(c => c.kind === 'synth' && !canUse(c.inst)).map(c => c.inst))];
  if (!locked.length) return;
  const need = locked.map(instTier).sort((a, b) => TIER_RANK[b] - TIER_RANK[a])[0];
  status(`이 곡의 악기 ${locked.length}종은 ${TIER_NAME[need]}부터 쓸 수 있어요 · 지금은 비슷한 소리로 들려요`);
}

/* 첫 실행 때와 곡을 불러온 뒤 */
(() => {
  const go = async () => { applyTier(); await fetchTier(); applyTier(); tierNotice(); };   // 서버 등급을 받은 뒤 목록을 그림
  if (document.readyState === 'complete') setTimeout(go, 300);
  else window.addEventListener('load', () => setTimeout(go, 300), {once:true});
})();

/* 36-i18n.js — 언어 (한국어 · English)
   고른 언어를 기억하고, 없으면 브라우저 언어를 본다.
   화면 글자는 data-i18n 표시가 붙은 곳을 바꾸고, 코드 안 문구는 t() 로 꺼낸다. */
const I18N_LANGS = {ko:'한국어', en:'English'};
let LANG = 'ko';

function pickLang() {
  try { const v = localStorage.getItem('msk.lang'); if (I18N_LANGS[v]) return v; } catch (e) {}
  const n = (navigator.languages || [navigator.language || 'en']).map(x => String(x).toLowerCase());
  for (const x of n) { if (x.startsWith('ko')) return 'ko'; if (x.startsWith('en')) return 'en'; }
  return 'en';                                   // 한국어도 영어도 아니면 영어가 더 널리 통함
}
// 글자 하나 꺼내기. 없으면 한국어 원문을 그대로 (번역이 덜 돼도 앱이 멀쩡하게)
function t(key, vars) {
  const tb = (window.I18N && window.I18N[LANG]) || {};
  let s = tb[key];
  if (s == null) s = ((window.I18N && window.I18N.ko) || {})[key];
  if (s == null) s = key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
// 화면 전체 바꿔치기
function applyLang() {
  document.documentElement.lang = LANG;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const v = t(el.dataset.i18n);
    if (el.dataset.i18nAttr) el.setAttribute(el.dataset.i18nAttr, v);
    else el.textContent = v;
  }
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  const b = document.getElementById('langBtn');
  if (b) { b.textContent = LANG === 'ko' ? 'EN' : '한국어'; b.title = LANG === 'ko' ? 'Switch to English' : '한국어로 바꾸기'; }
  document.dispatchEvent(new CustomEvent('langchange', {detail:{lang:LANG}}));
  // 아직 한 번도 이름을 안 바꾼 곡은 기본 이름도 언어에 맞춘다 (사용자가 지은 이름은 그대로)
  try {
    const DEF = ['새 곡', 'New song', '내 첫 곡', 'My first song'];
    if (typeof lib !== 'undefined' && lib && lib.list) {
      for (const id in lib.list) {
        const cur = lib.list[id].name;
        if (!DEF.includes(cur)) continue;                       // 직접 지은 이름은 건드리지 않음
        const ko = (cur === '내 첫 곡' || cur === 'My first song') ? '내 첫 곡' : '새 곡';
        lib.list[id].name = tMsg(ko);
      }
      if (typeof saveLib === 'function') saveLib();
      const inp = document.getElementById('projName');
      if (inp && lib.list[lib.current]) inp.value = lib.list[lib.current].name;
    }
  } catch (e) {}
  if (typeof refreshAll === 'function' && typeof S !== 'undefined' && S) try { refreshAll(); } catch (e) {}   // 코드가 만드는 이름도 다시 그리기
}
function setLang(v) {
  if (!I18N_LANGS[v]) return false;
  LANG = v;
  try { localStorage.setItem('msk.lang', v); } catch (e) {}
  applyLang();
  return true;
}
const toggleLang = () => setLang(LANG === 'ko' ? 'en' : 'ko');

/* 알림 문구 번역 — 코드를 거의 안 건드리고 출력할 때 바꾼다.
   통째로 맞으면 그대로, 아니면 "…했어요"처럼 섞인 문장을 조각으로 나눠 아는 것만 바꾼다. */
function tMsg(s) {
  if (LANG === 'ko' || typeof s !== 'string' || !/[가-힣]/.test(s)) return s;
  const tb = (window.I18N && window.I18N.en) || {};
  if (tb[s]) return tb[s];
  // 숫자·따옴표 안 이름이 섞인 문장: 그 부분을 자리표시로 바꿔 맞춰 본다
  // 코드의 `"${name}"` 같은 자리는 번역표에 따옴표가 남아 있으므로, 두 가지 모양으로 찾아본다
  const makers = [
    str => str.replace(/(?<=")[^"]*(?=")/g, '\u0000').replace(/(?<=“)[^“”]*(?=”)/g, '\u0000').replace(/\d+(?:\.\d+)?/g, '\u0000'),
    str => str.replace(/"[^"]*"|[“”][^“”]*[“”]|\d+(?:\.\d+)?/g, '\u0000'),
  ];
  const grabbers = [
    str => (str.match(/(?<=")[^"]*(?=")|(?<=“)[^“”]*(?=”)|\d+(?:\.\d+)?/g) || []),
    str => (str.match(/"[^"]*"|[“”][^“”]*[“”]|\d+(?:\.\d+)?/g) || []),
  ];
  for (let i = 0; i < makers.length; i++) {
    const shape = makers[i](s), got = grabbers[i](s);
    if (tb[shape]) { let j = 0; return tb[shape].replace(/\u0000/g, () => got[j++] ?? ''); }
  }
  // 끝내 모르면 한국어 그대로 (영어 사용자에겐 아쉽지만 앱은 멀쩡히 돌아감)
  return s;
}


(() => {
  LANG = pickLang();
  const go = () => { applyLang(); const b = document.getElementById('langBtn'); if (b) b.onclick = toggleLang; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, {once:true});
  else go();
})();

/* 99-app.js — 패턴 · 설정 · 단축키 · 확대 · 시작 (가장 마지막에 실행) */

// ---- 설정 ----
const rootSel = $('root'), barsSel = $('bars');
for (let i = 0; i < 12; i++) { const o = document.createElement('option'); o.value = i; o.textContent = NAMES_F[i] === NAMES_S[i] ? NAMES_S[i] : NAMES_F[i] + ' / ' + NAMES_S[i]; rootSel.appendChild(o); }
for (const b of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32]) { const o = document.createElement('option'); o.value = b; o.textContent = b; barsSel.appendChild(o); }
function fillBarSelects() {
  const n = curPat().bars;
  for (const id of ['cpFrom', 'cpTo', 'cpDest']) {
    const el = $(id), v = el.value; el.innerHTML = '';
    for (let b = 1; b <= n; b++) { const o = document.createElement('option'); o.value = b; o.textContent = b; el.appendChild(o); }
    el.value = Math.min(+v || (id === 'cpTo' ? Math.min(2, n) : id === 'cpDest' ? Math.min(3, n) : 1), n);
  }
}
function fillPatSel() {
  const s = $('patSel'); s.innerHTML = '';
  S.patterns.forEach((P, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${nameOf(P.name)} (${P.bars}${typeof t === 'function' ? t('마디단위') : '마디'})`; s.appendChild(o); });
  s.value = S.pat;
}
function refreshTitles() {
  const P = curPat(), c = curCh();
  $('rollTitle').textContent = `${tMsg(P.name)} · ${tMsg(c.name)} (${c.kind === 'drum' ? tMsg('드럼') : tMsg(INSTS[c.inst])})`;
  fillPatSel();
}
function syncControls() {
  fillBarSelects(); fillPatSel();
  $('bpm').value = S.bpm; rootSel.value = S.root; $('mode').value = S.mode; $('snap').value = S.snap; $('len').value = S.len;
  const n = curPat().bars; if (![...barsSel.options].some(o => +o.value === n)) { const o = document.createElement('option'); o.value = n; o.textContent = n; barsSel.appendChild(o); }
  barsSel.value = n;
  $('modePat').setAttribute('aria-checked', S.playMode === 'pat'); $('modeSong').setAttribute('aria-checked', S.playMode === 'song');
}
// 화면 전체를 곡 데이터에 맞춰 다시 그림
// ---- 박자표 · 스윙 ----
const buildMeterSel = () => { $('meterSel').innerHTML = METERS.map(m => `<option value="${m.join('/')}">${tMsg(m.join('/') + '박자')}</option>`).join(''); };
buildMeterSel();
function syncMeterUI() { buildMeterSel(); $('meterSel').value = meterOf(S).join('/'); $('swingSel').value = String(Math.round((S.swing || 0) * 5) / 5); }
// 박자를 바꿔도 음·자동화·템포 위치(틱)는 그대로. 패턴 마디 수와 조각 위치만 새 마디 길이로 다시 계산
function setMeter(m) {
  const old = BAR_T, nb = barTicksOf(m); if (meterOf(S).join('/') === m.join('/')) return; pushUndo();
  for (const P of S.patterns) P.bars = clamp(Math.ceil(P.bars * old / nb), 1, MAX_BARS);
  for (const c of S.playlist.clips) { c.bar = clamp(Math.round(c.bar * old / nb), 0, MAX_BARS - 1); if (c.len) c.len = Math.max(1, Math.round(c.len * old / nb)); if (c.off) c.off = Math.round(c.off * old / nb); }
  S.meter = m.slice(); S = normalize(S); save(); refreshAll(); status(`${m.join('/')}박자로 바꿨어요. 음 위치는 그대로이고 마디 수만 다시 셌어요.`);
}
$('meterSel').onchange = () => setMeter($('meterSel').value.split('/').map(Number));
$('swingSel').onchange = () => { pushUndo(); S.swing = +$('swingSel').value; save(); announce('스윙 ' + Math.round(S.swing * 100) + '%'); };
function refreshAll() {
  syncMeterUI();
  const ns = new Set(curNotes()); for (const n of [...sel]) if (!ns.has(n)) sel.delete(n);
  $('selBar').hidden = sel.size === 0;
  syncControls(); refreshTitles(); drawAll(); buildRack(); buildMixer(); drawPlaylist(); buildBrowser();
  if (typeof applyTier === 'function') applyTier();   // 6: 등급에 맞는 악기만 목록에
}
$('bpm').onchange = () => { S.bpm = clamp(Math.round((+$('bpm').value || 150) * 100) / 100, 60, 300); $('bpm').value = S.bpm; save(); if (E) applyMix(E, S.mix); };
rootSel.onchange = () => { S.root = +rootSel.value; save(); drawAll(); };
$('mode').onchange = () => { S.mode = $('mode').value; save(); drawAll(); };
$('snap').onchange = () => { S.snap = +$('snap').value; save(); drawRoll(); drawRuler(); };
$('len').onchange = () => { S.len = +$('len').value; save(); };
barsSel.onchange = () => {
  pushUndo(); const P = curPat(), nb = +barsSel.value, lim = nb * BAR_T; P.bars = nb;
  P.chords = Array.from({length:nb * 4}, (_, i) => P.chords[i] || null);
  for (const cid of Object.keys(P.notes)) P.notes[cid] = P.notes[cid].filter(n => n.s < lim).map(n => ({...n, l:Math.min(n.l, lim - n.s)}));
  for (const cl of S.playlist.clips) if (cl.pat === P.id) cl.bar = Math.min(cl.bar, MAX_BARS - nb);
  startTick = Math.min(startTick, (nb - 1) * BAR_T); save(); refreshAll();
};
// 되돌리기 ↔ 다시하기: 지금 상태를 반대쪽 기록으로 옮기고, 꺼낸 상태로 바꾼다
function histStep(from, to) {
  const s = from.pop(); if (!s) return false;
  to.push(JSON.stringify(S)); if (to.length > 60) to.shift(); redoKeep = null;
  S = normalize(JSON.parse(s)); sel.clear(); save(); refreshAll(); if (E) applyMix(E, S.mix); undoBtns(); return true;
}
$('undo').onclick = () => histStep(undoStack, redoStack);
$('redo').onclick = () => histStep(redoStack, undoStack);
undoBtns();

// ---- 패턴 ----
function selectPattern(i) {
  if (i < 0 || i >= S.patterns.length) return;
  S.pat = i; sel.clear(); startTick = 0; if (playing && S.playMode === 'pat') { stop(); play(); }
  save(); refreshAll(); announce(`${curPat().name}을 편집해요.`);
}
function renamePattern(i) { const P = S.patterns[i], v = prompt('패턴 이름', P.name); if (v == null) return; pushUndo(); P.name = (v.trim() || P.name).slice(0, 24); save(); refreshAll(); }
function deletePattern(i) {
  if (S.patterns.length < 2) { status('패턴은 적어도 하나 있어야 해요.'); return; }
  const P = S.patterns[i], uses = S.playlist.clips.filter(c => c.pat === P.id).length;
  if (!confirm(`"${P.name}"을 지울까요?` + (uses ? ` 플레이리스트의 조각 ${uses}개도 함께 지워져요.` : '') + ' (되돌리기로 되살릴 수 있어요)')) return;
  pushUndo(); S.patterns.splice(i, 1); S.playlist.clips = S.playlist.clips.filter(c => c.pat !== P.id); S.pat = clamp(S.pat >= i ? S.pat - 1 : S.pat, 0, S.patterns.length - 1);
  save(); refreshAll(); status(`"${P.name}"을 지웠어요.`);
}
function nextPatName() { let k = S.patterns.length + 1; while (S.patterns.some(p => p.name === 'Pattern ' + k)) k++; return 'Pattern ' + k; }
$('patSel').onchange = () => selectPattern(+$('patSel').value);
$('patNew').onclick = () => { if (S.patterns.length >= 64) return; pushUndo(); S.patterns.push(newPattern(nextPatName(), curPat().bars)); selectPattern(S.patterns.length - 1); status(`${curPat().name}을 만들었어요. 플레이리스트 빈칸을 누르면 놓여요.`); };
$('patClone').onclick = () => {
  if (S.patterns.length >= 64) return; pushUndo(); const P = curPat(), n = JSON.parse(JSON.stringify(P)); n.id = newId(); n.name = (P.name + ' 복사').slice(0, 24);
  S.patterns.splice(S.pat + 1, 0, n); selectPattern(S.pat + 1); status(`${P.name}을 복제했어요.`);
};

// ---- 확대 / 축소 ----
function zoom(ax, dir) {
  const v = view();
  if (ax === 'x') { const ni = clamp(zxi + dir, 0, ZX_LEVELS.length - 1); if (ni === zxi) return; const ct = (v.sl + v.vw / 2) / TICKPX; zxi = ni; TICKPX = ZX_LEVELS[zxi]; drawAll(); wrap.scrollLeft = Math.max(0, ct * TICKPX - v.vw / 2); }
  else { const ni = clamp(rhi + dir, 0, RH_LEVELS.length - 1); if (ni === rhi) return; const cr = (v.st + v.vh / 2) / ROWH; rhi = ni; ROWH = RH_LEVELS[rhi]; drawAll(); wrap.scrollTop = Math.max(0, cr * ROWH - v.vh / 2); }
  $('zxOut').disabled = zxi === 0; $('zxIn').disabled = zxi === ZX_LEVELS.length - 1; $('zyOut').disabled = rhi === 0; $('zyIn').disabled = rhi === RH_LEVELS.length - 1;
  drawAll();
}
$('zxIn').onclick = () => zoom('x', 1); $('zxOut').onclick = () => zoom('x', -1); $('zyIn').onclick = () => zoom('y', 1); $('zyOut').onclick = () => zoom('y', -1);
wrap.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom('x', e.deltaY < 0 ? 1 : -1); } }, {passive:false});
$('moreBtn').onclick = () => { const o = $('more').classList.toggle('open'); $('moreBtn').setAttribute('aria-expanded', o); $('moreBtn').setAttribute('aria-label', o ? '설정 접기' : '설정 펼치기'); };

// ---- 전체 단축키 ----
const FKEYS = {F5:'playlist', F6:'rack', F7:'roll', F8:'browser', F9:'mixer'};
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;   // 창(대화상자)이 열려 있으면 단축키 쉬기
  if (FKEYS[e.key]) { e.preventDefault(); toggleWin(FKEYS[e.key]); return; }
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const k = e.key, mod = e.ctrlKey || e.metaKey, inRoll = !e.target.closest || !e.target.closest('#win-rack,#win-playlist,#win-browser,#win-mixer,dialog');
  if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); playing ? stop() : play(); }
  else if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); }
  else if (!mod && (k === 'l' || k === 'L')) setPlayMode(S.playMode === 'pat' ? 'song' : 'pat');
  else if (!mod && (k === 'r' || k === 'R')) setRec(!recOn);
  else if (!mod && (k === 'q' || k === 'Q')) quantizeNotes();
  else if (mod && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); $('redo').click(); }
  else if (mod && k.toLowerCase() === 'z') { e.preventDefault(); $('undo').click(); }
  else if (!inRoll) return;
  else if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setTool('select'); sel = new Set(curNotes()); selChanged(); }
  else if (mod && k.toLowerCase() === 'c') { const ns = selNotes(); if (ns.length) { const m = Math.min(...ns.map(n => n.s)); clip = ns.map(n => ({p:n.p, s:n.s - m, l:n.l, v:n.v})); status(ns.length + '개를 복사했어요. 눈금자의 시작 위치에 붙여요.'); } }
  else if (mod && k.toLowerCase() === 'v') { if (clip) { e.preventDefault(); setTool('select'); const c = pasteNotes(clip, startTick); if (c) status(c + '개를 붙였어요.'); } }
  else if (mod && k.toLowerCase() === 'd') { e.preventDefault(); dupSel(); }
  else if ((k === 'Delete' || k === 'Backspace') && sel.size) { e.preventDefault(); delSel(); }
  else if (k === 'ArrowUp' && sel.size) { e.preventDefault(); transpose(e.shiftKey ? 12 : 1); }
  else if (k === 'ArrowDown' && sel.size) { e.preventDefault(); transpose(e.shiftKey ? -12 : -1); }
  else if (k === 'ArrowLeft' && sel.size) { e.preventDefault(); shiftSel(-S.snap); }
  else if (k === 'ArrowRight' && sel.size) { e.preventDefault(); shiftSel(S.snap); }
  else if (k === 'Escape' && sel.size) { sel.clear(); selChanged(); }
  else if (!mod && (k === 'p' || k === 'P')) setTool('draw');
  else if (!mod && (k === 'd' || k === 'D')) setTool('erase');
  else if (!mod && (k === 'e' || k === 'E')) setTool('select');
  else if (!mod && (k === 'h' || k === 'H')) setTool('hand');
});

// ---- 시작 ----
setTool('draw');
$('projName').value = lib.list[lib.current].name;
readCss(); initWindows(); initAudioClips(); initSongAuto(); refreshAll(); updatePos(0); loadSamples().then(buildBrowser); watchPiano();
wrap.scrollTop = (HIGH - 79) * ROWH - 40;
const boot = $('boot'); if (boot) boot.remove();
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { DPR = clamp(window.devicePixelRatio || 1, 1, 3); drawAll(); drawPlaylist(); }, 80); });
const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)'); if (mq && mq.addEventListener) mq.addEventListener('change', () => { drawAll(); buildRack(); drawPlaylist(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawAll(); drawPlaylist(); });


/* 공유 페이지(/s/<id>)가 곡을 들려줄 때 쓰는 창구.
   ?render=1 로 열렸을 때만 켜지고, 곡 주소를 받아 소리를 만들어 Blob 주소로 돌려준다. */
(() => {
  if (!/[?&]render=1/.test(location.search)) return;
  window.addEventListener('message', async ev => {
    const d = ev.data;
    if (!d || d.type !== 'msk-render' || typeof d.url !== 'string') return;
    const reply = o => ev.source && ev.source.postMessage({type:'msk-rendered', id:d.id, ...o}, '*');
    try {
      const u = new Uint8Array(await (await fetch(d.url)).arrayBuffer());
      const got = await decodeMSK(u);
      S = normalize(got.song); S.playMode = 'song';
      const buf = await renderWav();
      const blob = new Blob([buf instanceof Uint8Array ? buf : new Uint8Array(buf)], {type:'audio/wav'});
      reply({ok:true, audio:URL.createObjectURL(blob), name:got.name || ''});
    } catch (e) { reply({ok:false, error:String(e && e.message || e).slice(0, 120)}); }
  });
  try { parent.postMessage({type:'msk-render-ready'}, '*'); } catch (e) {}
})();

