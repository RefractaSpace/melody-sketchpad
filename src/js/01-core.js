/* 01-core.js — 공통 상수 · 곡 데이터 · 저장
   곡 데이터 S (버전 3)
   - tracks: [{id, name, inst, notes:[{p,s,l,v}], tone:{br,atk,rel}}], cur: 편집 중인 트랙 번호
   - chords: 박마다 한 칸 (bars*4), 코드는 다음 코드가 나올 때까지 이어짐
   - drums: {kick,snare,hat,clap} → 16분마다 0(꺼짐) ~ 1(가장 셈)
   - mix: 채널 키('trk:<id>', 'chords', 'bass', 'kick'…)마다 설정 + master */
const $ = id => document.getElementById(id);
const PPQ = 48, LOW = 48, HIGH = 96;                 // 한 박 = 48틱, 건반 C3~C7
const KEYW = 64, RULER = 24;
const ZX_LEVELS = [0.75, 1, 1.5, 2, 3, 4], RH_LEVELS = [14, 17, 20, 24, 28];
let zxi = 3, rhi = 2, TICKPX = ZX_LEVELS[zxi], ROWH = RH_LEVELS[rhi];
const LANE_H = 28, CHORD_H = 34, VEL_H = 60, LANES_H = CHORD_H + LANE_H * 4 + VEL_H;
const MAX_BARS = 128;
const NAMES_S = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NAMES_F = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const MAJ = [0,2,4,5,7,9,11], MIN = [0,2,3,5,7,8,10];
const QUAL = {'':[0,4,7], 'm':[0,3,7], '7':[0,4,7,10], 'maj7':[0,4,7,11], 'm7':[0,3,7,10], 'sus4':[0,5,7], 'dim':[0,3,6], 'aug':[0,4,8]};
const QNAME = {'':'장', 'm':'단', '7':'7', 'maj7':'maj7', 'm7':'m7', 'sus4':'sus4', 'dim':'dim', 'aug':'aug'};
const DRUMS = ['kick', 'snare', 'hat', 'clap'];
const DRUM_NAME = {kick:'킥', snare:'스네어', hat:'하이햇', clap:'박수'};
const INSTS = {piano:'피아노', epiano:'일렉트릭 피아노', supersaw:'슈퍼소', pluck:'플럭', chip:'칩튠', bell:'벨', sample:'내 샘플'};
const KITS_OK = ['edm', '808', 'hard', 'acoustic'];
const FIXED_CH = ['chords', 'bass', 'kick', 'snare', 'hat', 'clap'];
const CH_NAME = {chords:'코드', bass:'베이스', kick:'킥', snare:'스네어', hat:'하이햇', clap:'박수'};
const MIX_DEF = {chords:{v:.85,pan:0,rev:.3,dly:0,sc:true}, bass:{v:.45,pan:0,rev:0,dly:0,sc:true},
  kick:{v:.6,pan:0,rev:0,dly:0,sc:false}, snare:{v:.7,pan:0,rev:.18,dly:0,sc:false}, hat:{v:.45,pan:.15,rev:.05,dly:0,sc:false}, clap:{v:.6,pan:-.1,rev:.25,dly:0,sc:false}};
const TRACK_MIX_DEF = {v:1, pan:0, rev:.22, dly:.18, sc:true};
const MASTER_DEF = {v:.85, sc:.5, size:2};
const STORE = 'melody-sketchpad-v1', LIB = 'melody-sketchpad-library', PK = id => 'melody-sketchpad-proj-' + id;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const toneDefault = () => ({br:1, atk:0, rel:0.25});
const trackKey = t => 'trk:' + t.id;
function newTrack(name, inst) { return {id:newId(), name, inst:inst || 'piano', notes:[], tone:toneDefault()}; }
function chDefault(key) { const d = key.startsWith('trk:') ? TRACK_MIX_DEF : MIX_DEF[key]; return {...d, lo:0, mid:0, hi:0, mute:0, solo:0}; }

function blank() {
  const bars = 8;
  const s = {v:3, bpm:150, root:5, mode:'minor', bars, snap:12, len:24,
    tracks:[newTrack('멜로디 1', 'piano')], cur:0,
    chords:Array(bars * 4).fill(null), chordInst:'pad', chordTone:{br:1, atk:0.15, rel:0.5},
    bassMode:'off', bassInst:'reese', kit:'edm',
    drums:Object.fromEntries(DRUMS.map(d => [d, Array(bars * 16).fill(0)])), mix:{}};
  fillMix(s); return s;
}
function fillMix(s) {
  const m = s.mix || {}, out = {};
  for (const t of s.tracks) out[trackKey(t)] = {...chDefault(trackKey(t)), ...(m[trackKey(t)] || {})};
  for (const k of FIXED_CH) out[k] = {...chDefault(k), ...(m[k] || {})};
  out.master = {...MASTER_DEF, ...(m.master || {})};
  s.mix = out;
}
const normNote = n => ({p:n.p | 0, s:n.s | 0, l:n.l | 0, v:clamp(n.v == null ? 0.8 : +n.v, 0.05, 1)});
const okNote = n => n && n.p >= LOW && n.p <= HIGH && n.s >= 0 && n.l > 0;

// 옛 버전(트랙 하나·마디 코드) 데이터를 버전 3으로 바꾸고, 값이 이상하면 바로잡음
function normalize(s) {
  s = {...s};
  if (!Array.isArray(s.tracks)) {
    const t = newTrack('멜로디 1', s.inst === 'lead' ? 'supersaw' : (s.inst || 'piano'));
    t.notes = s.notes || [];
    if (s.tone && s.tone.melody) t.tone = {...toneDefault(), ...s.tone.melody};
    s.tracks = [t]; s.cur = 0;
    if (s.mix && s.mix.melody) { s.mix = {...s.mix, [trackKey(t)]: s.mix.melody}; delete s.mix.melody; }
    if (s.tone && s.tone.chords) s.chordTone = s.tone.chords;
  }
  const oldBarChords = !s.v || s.v < 3;
  const b = blank();
  s = {...b, ...s, v:3};
  s.bars = clamp(s.bars | 0 || 8, 1, MAX_BARS);
  const lim = s.bars * 4 * PPQ;
  const seen = new Set();
  s.tracks = s.tracks.map((t, i) => {
    let id = t.id || newId(); if (seen.has(id)) id = newId(); seen.add(id);
    return {id, name:(t.name || '멜로디 ' + (i + 1)).slice(0, 30), inst:INSTS[t.inst] ? t.inst : 'piano',
      notes:(t.notes || []).filter(okNote).map(normNote).filter(n => n.s < lim).map(n => ({...n, l:Math.min(n.l, lim - n.s)})),
      tone:{...toneDefault(), ...(t.tone || {})}};
  });
  if (!s.tracks.length) s.tracks = [newTrack('멜로디 1', 'piano')];
  s.cur = clamp(s.cur | 0, 0, s.tracks.length - 1);
  const ch = s.chords || [];
  s.chords = Array.from({length:s.bars * 4}, (_, i) => oldBarChords ? (i % 4 === 0 ? ch[i / 4] || null : null) : (ch[i] || null));
  const dr = {};
  for (const d of DRUMS) { const a = (s.drums && s.drums[d]) || []; dr[d] = Array.from({length:s.bars * 16}, (_, i) => a[i] === true ? 1 : clamp(+a[i] || 0, 0, 1)); }
  s.drums = dr;
  if (![12, 16, 24, 48].includes(+s.snap)) s.snap = 12;
  if (!KITS_OK.includes(s.kit)) s.kit = 'edm';
  s.chordTone = {br:1, atk:0.15, rel:0.5, ...(s.chordTone || {})};
  delete s.notes; delete s.inst; delete s.tone;
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
    lsSet(PK(id), JSON.stringify(first || blank())); saveLib();
  }
  try { const d = JSON.parse(lsGet(PK(lib.current)) || 'null'); if (d) return normalize(d); } catch (e) {}
  return blank();
}
let S = loadSong(), undoStack = [], saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (!lsSet(PK(lib.current), JSON.stringify(S))) status('저장 공간이 가득 찼어요. 안 쓰는 프로젝트를 지워 주세요.');
    lib.list[lib.current].updated = Date.now(); saveLib();
  }, 200);
}
function pushUndo() { undoStack.push(JSON.stringify(S)); if (undoStack.length > 60) undoStack.shift(); }

// ---- 편집 상태 (여러 모듈이 함께 씀) ----
let sel = new Set(), clip = null, drag = null, lastVel = 0.8, lastDrumVel = 1;
let kb = {t:0, p:72}, kbLane = 0, kbStep = 0, playTick = -1, startTick = 0, keyDown = -1;
let playing = false;
const curTrack = () => S.tracks[S.cur];
const curNotes = () => S.tracks[S.cur].notes;
const totalTicks = () => S.bars * 4 * PPQ;

// ---- 음 이름 ----
function names() { const f = S.mode === 'major' ? [5,10,3,8,1,6].includes(S.root) : [2,7,0,5,10,3].includes(S.root); return f ? NAMES_F : NAMES_S; }
const nn = p => names()[p % 12] + (Math.floor(p / 12) - 1);
const inKey = pc => (S.mode === 'major' ? MAJ : MIN).includes((pc - S.root + 12) % 12);
const chordName = c => c ? names()[c.r] + (c.q === 'm' ? 'm' : c.q === '' ? '' : c.q) : '';
const chordVoices = c => { const base = 48 + c.r; return QUAL[c.q].map(i => base + i + (base + i < 52 ? 12 : 0)); };
function chordAtBeat(i) { for (let k = i; k >= 0; k--) if (S.chords[k]) return S.chords[k]; return null; }

// ---- 알림 ----
function status(s) { const el = $('status'); if (!el) return; el.textContent = s; clearTimeout(status.t); status.t = setTimeout(() => el.textContent = '', 4000); }
function announce(m) { const el = $('sr'); if (el) { el.textContent = ''; setTimeout(() => el.textContent = m, 30); } }
