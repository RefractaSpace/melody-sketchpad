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
Object.defineProperty(window, 'BAR_T', {get:() => barTicksOf(METER_OV || meterOf(typeof S !== 'undefined' ? S : null))});
Object.defineProperty(window, 'BEATS', {get:() => BAR_T / PPQ});
Object.defineProperty(window, 'STEPS', {get:() => BAR_T / 12});
const SA_PARAMS = ['vol', 'cut', 'pan', 'rev', 'dly', 'fx1', 'fx2', 'fx3', 'fx4', 'fx5'];
const PAT_COLORS = ['', '#7b95e0', '#e08476', '#72c79f', '#dcb65e', '#b287e0', '#62bccd', '#dc86b4'];   // 0 = 색 없음
const NAMES_S = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NAMES_F = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const MAJ = [0,2,4,5,7,9,11], MIN = [0,2,3,5,7,8,10];
const QUAL = {'':[0,4,7], 'm':[0,3,7], '7':[0,4,7,10], 'maj7':[0,4,7,11], 'm7':[0,3,7,10], 'sus4':[0,5,7], 'dim':[0,3,6], 'aug':[0,4,8]};
const QNAME = {'':'장', 'm':'단', '7':'7', 'maj7':'maj7', 'm7':'m7', 'sus4':'sus4', 'dim':'dim', 'aug':'aug'};
const DRUMS = ['kick', 'snare', 'hat', 'clap', 'crash'];   // 뒤에만 덧붙이기 (MSK 번호표)
const DRUM_NAME = {kick:'킥', snare:'스네어', hat:'하이햇', clap:'박수', crash:'크래시'};
const INSTS = {piano:'피아노', synth:'신스', epiano:'일렉트릭 피아노', strings:'스트링 패드', celesta:'첼레스타', harp:'하프', bass:'서브 베이스', timpani:'팀파니', supersaw:'슈퍼소', pluck:'플럭', chip:'칩튠', bell:'벨', sample:'내 샘플'};
const KITS_OK = ['edm', '808', 'hard', 'acoustic'];
const FIXED_CH = ['chords', 'bass', 'audio', 'bus1', 'bus2'];
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
  const normFx = fx => (Array.isArray(fx) ? fx : []).filter(f => f && ['comp', 'dist', 'lpf', 'hpf', 'chorus', 'reverb', 'delay', 'eq', 'width'].includes(f.type)).slice(0, 5).map(f => ({type:f.type, a:clamp(+f.a || 0, 0, 1), b:clamp(+f.b || 0, 0, 1)}));
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
    return {id, kind, inst:kind === 'drum' ? c.inst : (INSTS[c.inst] ? c.inst : 'piano'), name:(c.name || (kind === 'drum' ? DRUM_NAME[c.inst] : INSTS[c.inst]) || '채널').slice(0, 24), tone:{...toneDefault(), ...(c.tone || {})}, ...(c.syn || (INSTS[c.inst] && c.inst === 'synth') ? {syn:normSyn(c.syn)} : {})};
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
let S = loadSong(), undoStack = [], saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (!lsSet(PK(lib.current), songToStore(S))) status('저장 공간이 가득 찼어요. 안 쓰는 프로젝트를 지워 주세요.');
    lib.list[lib.current].updated = Date.now(); saveLib();
  }, 200);
}
function pushUndo() { undoStack.push(JSON.stringify(S)); if (undoStack.length > 60) undoStack.shift(); }

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
function status(s) { const el = $('status'); if (!el) return; el.textContent = s; clearTimeout(status.t); status.t = setTimeout(() => el.textContent = '', 4000); }
function announce(m) { const el = $('sr'); if (el) { el.textContent = ''; setTimeout(() => el.textContent = m, 30); } }
